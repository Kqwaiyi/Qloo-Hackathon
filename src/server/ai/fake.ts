import { createHash } from "node:crypto";
import sharp from "sharp";

import type { PhotoType, ProductCategory } from "@/config/consultations";

import type {
  AiProvider,
  Photo,
  PhotoCheckInput,
  PhotoCheckReport,
  PhotoCheckResult,
  PhotoMediaType,
  PhotoVisibility,
  PreviewInput,
  PreviewPiece,
  PreviewResult,
  TailoredPieces,
  TailoringInput,
  TailoringPiece,
} from "./provider";

/**
 * Which outcome the fake adapter plays. `pass` passes every photo with Photo Style casual: the photo
 * shows just what the chosen Photo Type asks for. The others:
 * - `not-appropriate`: an explicit photo.
 * - `blocked`: Google blocks the photo.
 * - `no-person`: nobody in the photo.
 * - `more-than-one-person`: two people in the photo.
 * - `too-unclear`: a photo that isn't clear enough.
 * - `wrong-photo-type`: just a face and hair, whatever Photo Type was chosen, so it looks like a Face
 *   Photo to the other two, and switching to Face Photo passes it.
 * - `hair-not-visible`: just a face, with the hair out of frame, whatever Photo Type was chosen.
 * - `hair-covered`: the whole person, head to feet, with their hair covered, whatever Photo Type was
 *   chosen.
 * - `check-errors`: the photo check throws, as a real one does when it still errors after the AI
 *   SDK's own retries.
 *
 * Tailoring picks each Brand Piece's first candidate Product and makes the Hairstyle's cut known,
 * each `why` naming the Style Icon. Its scenarios pass every photo:
 * - `one-piece`: the Top and Bottom become the Top Brand's first One-Piece, when it has any.
 * - `unknown-cut`: the Hairstyle's cut is marked unknown, based on the Outfit and Photo Style, and
 *   its `why` doesn't name the Style Icon.
 * - `tailoring-fails`: every reply breaks a rule, as a broken model's would: a price, an empty
 *   "why", a missing Category, a Category twice, an extra One-Piece, or not the schema at all, in
 *   turn.
 *
 * A Preview is the user's own photo with a "Fake Preview" banner across its foot. Its scenarios
 * pass every photo and tailor as usual:
 * - `preview-refused`: the image model refuses every Preview, for image safety.
 * - `preview-fails`: every Preview throws, as a model that keeps erroring without refusing does.
 */
export const FAKE_AI_SCENARIOS = [
  "pass",
  "not-appropriate",
  "blocked",
  "no-person",
  "more-than-one-person",
  "too-unclear",
  "wrong-photo-type",
  "hair-not-visible",
  "hair-covered",
  "check-errors",
  "one-piece",
  "unknown-cut",
  "tailoring-fails",
  "preview-refused",
  "preview-fails",
] as const;
export type FakeAiScenario = (typeof FAKE_AI_SCENARIOS)[number];
export type FakeTailoringScenario = Extract<FakeAiScenario, "pass" | "one-piece" | "unknown-cut" | "tailoring-fails">;
export type FakePreviewScenario = Extract<FakeAiScenario, "pass" | "preview-refused" | "preview-fails">;

/** About as long as a real photo check, so local development feels like the real thing. */
export const DEFAULT_FAKE_AI_DELAY_MS = 1000;

/** A photo's fingerprint: the fake never keeps a photo. */
export interface PhotoFingerprint {
  mediaType: PhotoMediaType;
  sha256: string;
}

/** A tailoring the fake was asked for, with the photo as its fingerprint. */
export type FakeTailoringRequest = Omit<TailoringInput, "photo"> & { photo: PhotoFingerprint };

/** A Piece of a Preview the fake was asked for, with any Product photo as its fingerprint. */
export type FakePreviewPiece =
  | Extract<PreviewPiece, { category: "hairstyle" }>
  | (Omit<Exclude<PreviewPiece, { category: "hairstyle" }>, "photo"> & { photo: PhotoFingerprint | null });

/** A Preview the fake was asked for, with every photo as its fingerprint. */
export type FakePreviewRequest = Omit<PreviewInput, "photo" | "pieces"> & { photo: PhotoFingerprint; pieces: FakePreviewPiece[] };

export interface FakeAiOptions {
  scenario?: FakeAiScenario;
  /** How long each call waits. Tests use 0. */
  delayMs?: number;
}

/**
 * The AI provider in local development and tests: no network, no cost. Tests set `scenario` in
 * code; local development picks it with the FAKE_AI_SCENARIO environment variable.
 */
export class FakeAiProvider implements AiProvider {
  scenario: FakeAiScenario;
  delayMs: number;
  /** How many photo checks it has been asked for. Only a count: it never keeps a photo. */
  photoCheckCount = 0;
  /** Scenarios for tailoring particular Style Icons' Outfits, by name, in place of `scenario`. */
  styleIconScenarios: Partial<Record<string, FakeTailoringScenario>> = {};
  /** Every tailoring it has been asked for, oldest first. */
  readonly tailoringRequests: FakeTailoringRequest[] = [];
  /** Scenarios for the next Previews, in the order they're asked for, in place of `scenario`. */
  previewScenarios: FakePreviewScenario[] = [];
  /** Every Preview it has been asked for, oldest first. */
  readonly previewRequests: FakePreviewRequest[] = [];
  /** Runs during every call, as if the model were still working, so a test can look at a Styling part-way. */
  duringCall?: (call: keyof AiProvider) => Promise<void>;

  constructor({ scenario = "pass", delayMs = DEFAULT_FAKE_AI_DELAY_MS }: FakeAiOptions = {}) {
    this.scenario = scenario;
    this.delayMs = delayMs;
  }

  async checkPhoto(input: PhotoCheckInput): Promise<PhotoCheckResult> {
    this.photoCheckCount += 1;
    await this.wait("checkPhoto");
    if (this.scenario === "check-errors") throw new Error("The fake photo check errored, as its scenario asks.");
    if (this.scenario === "blocked") return { blocked: true };
    return { blocked: false, report: reportFor(this.scenario, input.photoType) };
  }

  async tailorPieces(input: TailoringInput): Promise<unknown> {
    const { photo, ...rest } = input;
    this.tailoringRequests.push({ ...rest, photo: fingerprint(photo) });
    await this.wait("tailorPieces");
    const scenario = this.styleIconScenarios[input.styleIconName] ?? this.scenario;
    const tailored = { pieces: fakePieces(input, scenario) };
    if (scenario !== "tailoring-fails") return tailored;
    const breakRule = BROKEN_TAILORING[(this.tailoringRequests.length - 1) % BROKEN_TAILORING.length]!;
    return breakRule(tailored);
  }

  async renderPreview(input: PreviewInput): Promise<PreviewResult> {
    const { photo, pieces, ...rest } = input;
    this.previewRequests.push({ ...rest, photo: fingerprint(photo), pieces: pieces.map(fingerprintedPiece) });
    const scenario = this.previewScenarios.shift() ?? this.scenario;
    await this.wait("renderPreview");
    if (scenario === "preview-fails") throw new Error("The fake Preview failed, as its scenario asks.");
    if (scenario === "preview-refused") return { refused: true, reason: "image_safety" };
    return { refused: false, image: await withFakePreviewBanner(photo) };
  }

  private async wait(call: keyof AiProvider): Promise<void> {
    await this.duringCall?.(call);
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }
}

function fingerprint(photo: Photo): PhotoFingerprint {
  return { mediaType: photo.mediaType, sha256: createHash("sha256").update(photo.bytes).digest("hex") };
}

function fingerprintedPiece(piece: PreviewPiece): FakePreviewPiece {
  if (piece.category === "hairstyle") return piece;
  return { ...piece, photo: piece.photo && fingerprint(piece.photo) };
}

/** The photo with a "Fake Preview" banner across its foot, as a PNG, as image models send. */
async function withFakePreviewBanner(photo: Photo): Promise<Uint8Array> {
  const image = sharp(photo.bytes);
  const { width, height } = await image.metadata();
  const bannerHeight = Math.max(Math.round(height * 0.1), 12);
  const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${bannerHeight}">
    <rect width="100%" height="100%" fill="#1c1917" fill-opacity="0.75"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="sans-serif"
      font-size="${Math.round(bannerHeight * 0.5)}" font-weight="600" fill="#ffffff">Fake Preview</text>
  </svg>`;
  return new Uint8Array(await image.composite([{ input: Buffer.from(banner), gravity: "south" }]).png().toBuffer());
}

/** A passing photo shows what its Photo Type asks for. */
const VISIBLE_BY_PHOTO_TYPE: Record<PhotoType, PhotoVisibility> = {
  face: { face: true, hair: true, upperBody: false, legs: false, feet: false },
  full_body: { face: true, hair: true, upperBody: true, legs: true, feet: true },
  body_only: { face: false, hair: false, upperBody: true, legs: true, feet: true },
};

const NOTHING_VISIBLE: PhotoVisibility = { face: false, hair: false, upperBody: false, legs: false, feet: false };

/** What the model reports seeing in the scenario's photo. */
function reportFor(scenario: Exclude<FakeAiScenario, "blocked" | "check-errors">, photoType: PhotoType): PhotoCheckReport {
  const passing: PhotoCheckReport = {
    peopleCount: 1,
    visible: VISIBLE_BY_PHOTO_TYPE[photoType],
    hairCovered: false,
    clearEnough: true,
    explicit: false,
    photoStyle: ["casual"],
  };
  switch (scenario) {
    case "pass":
      return passing;
    case "not-appropriate":
      return { ...passing, explicit: true };
    case "no-person":
      return { ...passing, peopleCount: 0, visible: NOTHING_VISIBLE };
    case "more-than-one-person":
      return { ...passing, peopleCount: 2 };
    case "too-unclear":
      return { ...passing, clearEnough: false };
    case "wrong-photo-type":
      return { ...passing, visible: VISIBLE_BY_PHOTO_TYPE.face };
    case "hair-not-visible":
      return { ...passing, visible: { ...NOTHING_VISIBLE, face: true } };
    case "hair-covered":
      return { ...passing, visible: { ...VISIBLE_BY_PHOTO_TYPE.full_body, hair: false }, hairCovered: true };
    case "one-piece":
    case "unknown-cut":
    case "tailoring-fails":
    case "preview-refused":
    case "preview-fails":
      return passing;
  }
}

/**
 * The Pieces as the fake tailors them, one per Piece asked for, or in the `one-piece` scenario, with
 * the Top Brand's first One-Piece in place of the Top and Bottom, when it has any.
 */
function fakePieces(input: TailoringInput, scenario: FakeAiScenario): TailoredPieces["pieces"] {
  const onePiece = scenario === "one-piece" ? input.pieces.flatMap((piece) => (piece.category === "top" ? (piece.onePieceCandidates ?? []) : []))[0] : undefined;
  return input.pieces.flatMap((piece) => {
    if (!onePiece || (piece.category !== "top" && piece.category !== "bottom")) return [fakePiece(piece, input, scenario !== "unknown-cut")];
    return piece.category === "top" ? [{ category: "one_piece", productId: onePiece.id, why: fakeWhy("one_piece", input) }] : [];
  });
}

/** A Piece as the fake tailors it: a Brand Piece's first candidate Product, or the Hairstyle's cut. */
function fakePiece(piece: TailoringPiece, input: TailoringInput, cutKnown: boolean): TailoredPieces["pieces"][number] {
  const { photoStyle, styleIconName } = input;
  const style = photoStyle[0];
  const styleWords = photoStyle.join(" and ");
  if (piece.category !== "hairstyle") return { category: piece.category, productId: piece.candidates[0]?.id, why: fakeWhy(piece.category, input) };
  return cutKnown
    ? {
        category: "hairstyle",
        item: `${capitalised(style)} textured cut with soft layers`,
        details: `A ${style} textured cut with soft layers, a little shorter at the sides, in your own hair colour.`,
        why: `${styleIconName}'s signature cut, reworked so your current hair carries it with your ${styleWords} Photo Style.`,
        unknownCut: false,
      }
    : {
        category: "hairstyle",
        item: `${capitalised(style)} soft layered cut`,
        details: `A ${style} soft layered cut, trimmed to shape from your current length, in your own hair colour.`,
        why: `A ${styleWords} cut picked to go with this Outfit, and easy to reach from the hair you have now.`,
        unknownCut: true,
      };
}

/** The fake's "why" for a Product Piece, naming the Style Icon. */
function fakeWhy(category: ProductCategory, { photoStyle, styleIconName }: TailoringInput): string {
  return `${FAKE_WHY_OPENINGS[category]} in the spirit of ${styleIconName}, at home with your ${photoStyle.join(" and ")} Photo Style.`;
}

/** How the fake's "why" for each Product Piece begins. */
const FAKE_WHY_OPENINGS: Record<ProductCategory, string> = {
  top: "An easy top layer",
  bottom: "A grounding Bottom",
  one_piece: "A one-and-done One-Piece",
  shoes: "Shoes that finish the Outfit",
};

/** Ways a broken model's reply breaks our rules, each made from a good reply. */
const BROKEN_TAILORING: ((tailored: TailoredPieces) => unknown)[] = [
  ({ pieces }) => ({ pieces: pieces.map((tailored) => ({ ...tailored, why: `${tailored.why} Yours for about $40.` })) }),
  ({ pieces }) => ({ pieces: pieces.map((tailored) => ({ ...tailored, why: " " })) }),
  ({ pieces }) => ({ pieces: pieces.slice(0, -1) }),
  ({ pieces }) => ({ pieces: [...pieces, pieces[0]] }),
  ({ pieces }) => ({ pieces: [...pieces, { ...pieces[0]!, category: "one_piece" }] }),
  ({ pieces }) => ({ pieces: pieces.map(({ category, item }) => ({ category, item })) }),
];

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The fake adapter as local development configures it: FAKE_AI_SCENARIO and FAKE_AI_DELAY_MS. */
export function fakeAiFromEnvironment(): FakeAiProvider {
  const env = process.env;
  const scenario = env.FAKE_AI_SCENARIO || "pass";
  if (!isFakeAiScenario(scenario)) {
    throw new Error(`FAKE_AI_SCENARIO must be one of: ${FAKE_AI_SCENARIOS.join(", ")}.`);
  }
  const delayMs = env.FAKE_AI_DELAY_MS ? Number(env.FAKE_AI_DELAY_MS) : DEFAULT_FAKE_AI_DELAY_MS;
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error("FAKE_AI_DELAY_MS must be a number of milliseconds.");
  return new FakeAiProvider({ scenario, delayMs });
}

/**
 * In local development a browser can pick its own scenario with this cookie, so the browser smoke
 * tests can play several scenarios against one dev server. Deployments ignore it.
 */
export const FAKE_AI_SCENARIO_COOKIE = "fake_ai_scenario";

/** `ai`, or in local development a fake playing the scenario the browser's cookie names. */
export function aiForBrowser(ai: AiProvider, cookieScenario: string | undefined): AiProvider {
  if (process.env.NODE_ENV !== "development" || !(ai instanceof FakeAiProvider)) return ai;
  if (!cookieScenario || !isFakeAiScenario(cookieScenario)) return ai;
  return new FakeAiProvider({ scenario: cookieScenario, delayMs: ai.delayMs });
}

function isFakeAiScenario(value: string): value is FakeAiScenario {
  return (FAKE_AI_SCENARIOS as readonly string[]).includes(value);
}
