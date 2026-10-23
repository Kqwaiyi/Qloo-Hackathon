import type { LanguageModelV4 } from "@ai-sdk/provider";
import { createHash } from "node:crypto";
import sharp from "sharp";

import type { PhotoType } from "@/config/consultations";

import { type FakeStylistRequest, type FakeStylistScenario, fakeStylistModel, fakeStylistTurn, type FakeStylistTurn } from "./fake-stylist";
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
} from "./provider";

/**
 * Which outcome the fake adapter plays. `pass` passes every photo with Photo Style casual: the photo
 * shows just what the chosen Photo Type asks for. The others:
 * - `not-appropriate`: an explicit photo.
 * - `blocked`: the model refuses to look at the photo.
 * - `no-person`: nobody in the photo.
 * - `unclear-main-person`: two people in the photo, and no clear Main Person.
 * - `clear-main-person`: two people in the photo, one of them clearly its Main Person. It passes the
 *   photo, styles and draws Previews as `pass` does.
 * - `too-unclear`: a photo that isn't clear enough.
 * - `wrong-photo-type`: just a face and hair, whatever Photo Type was chosen, so it looks like a Face
 *   Photo to the other two, and switching to Face Photo passes it.
 * - `hair-not-visible`: just a face, with the hair out of frame, whatever Photo Type was chosen.
 * - `hair-covered`: the whole person, head to feet, with their hair covered, whatever Photo Type was
 *   chosen.
 * - `check-errors`: the photo check throws, as a real one does when it still errors after the AI
 *   SDK's own retries.
 *
 * Every Styling runs on the fake's Stylist, a scripted fake model that makes the fixed pipeline's
 * choices: Qloo's order, each Category's first Brand still in play, each Piece's first candidate
 * Product, and the Hairstyle's cut known, each `why` naming the Style Icon (see `fakeStylistTurn`).
 * Its scenarios pass every photo:
 * - `one-piece`: each Outfit is the Top Brand's first One-Piece in place of the Top and Bottom, when
 *   the Top Brand has any.
 * - `unknown-cut`: the Hairstyle's cut is marked unknown, based on the Outfit and Photo Style, and
 *   its `why` doesn't name the Style Icon.
 * - `tailoring-fails`: every Outfit the Stylist saves breaks a rule, a different one each turn, as a
 *   broken model's would, so it saves until the turn cap.
 *
 * A Preview is the user's own photo with a "Fake Preview" banner across its foot. Its scenarios
 * pass every photo and style as usual:
 * - `preview-refused`: the image model refuses every Preview, for image safety.
 * - `preview-fails`: every Preview throws, as a model that keeps erroring without refusing does.
 */
export const FAKE_AI_SCENARIOS = [
  "pass",
  "not-appropriate",
  "blocked",
  "no-person",
  "unclear-main-person",
  "clear-main-person",
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
export type FakePreviewScenario = Extract<FakeAiScenario, "pass" | "preview-refused" | "preview-fails">;

/** About as long as a real photo check, so local development feels like the real thing. */
export const DEFAULT_FAKE_AI_DELAY_MS = 1000;

/** A photo's fingerprint: the fake never keeps a photo. */
export interface PhotoFingerprint {
  mediaType: PhotoMediaType;
  sha256: string;
}

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
  /** Scenarios for the Stylist's Outfits of particular Style Icons, by name, in place of `scenario`. */
  styleIconScenarios: Partial<Record<string, FakeStylistScenario>> = {};
  /** Scenarios for the next Previews, in the order they're asked for, in place of `scenario`. */
  previewScenarios: FakePreviewScenario[] = [];
  /** Every Preview it has been asked for, oldest first. */
  readonly previewRequests: FakePreviewRequest[] = [];
  /** Every turn its Stylist has been asked for, oldest first, with what each was sent. */
  readonly stylistRequests: FakeStylistRequest[] = [];
  /** Plays the Stylist's turns a test scripts, in place of `scenario`'s: any it leaves undefined play as usual. */
  stylistTurn?: (request: FakeStylistRequest) => FakeStylistTurn | undefined;
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

  stylistModel(): LanguageModelV4 {
    return fakeStylistModel(async (request) => {
      this.stylistRequests.push(request);
      await this.wait("stylistModel");
      return this.stylistTurn?.(request) ?? fakeStylistTurn(request, (styleIconName) => this.styleIconScenarios[styleIconName] ?? stylistScenario(this.scenario));
    });
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
    clearMainPerson: true,
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
      return { ...passing, peopleCount: 0, clearMainPerson: false, visible: NOTHING_VISIBLE };
    case "unclear-main-person":
      return { ...passing, peopleCount: 2, clearMainPerson: false };
    case "clear-main-person":
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

/** How the fake's Stylist plays a scenario: its own scenarios, and the fixed pipeline's choices for any other. */
function stylistScenario(scenario: FakeAiScenario): FakeStylistScenario {
  return scenario === "one-piece" || scenario === "unknown-cut" || scenario === "tailoring-fails" ? scenario : "pass";
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
