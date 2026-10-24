import type { LanguageModelV4 } from "@ai-sdk/provider";
import { createHash } from "node:crypto";
import sharp from "sharp";

import type { PhotoType } from "@/config/consultations";

import {
  type FakeScenarioStyleIcon,
  type FakeStylistRequest,
  type FakeStylistScenario,
  fakeStylistModel,
  fakeStylistTurn,
  type FakeStylistTurn,
} from "./fake-stylist";
import type {
  AiProvider,
  FirstDrawToJudge,
  FirstDrawVerdict,
  Photo,
  PhotoCheckInput,
  PhotoCheckReport,
  PhotoCheckResult,
  PhotoMediaType,
  PhotoVisibility,
  PreviewInput,
  PreviewPiece,
  PreviewResult,
  RedrawToJudge,
  RedrawVerdict,
  VerdictResult,
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
 * - `style-icon-passed-over`: the Stylist passes over the first Style Icon it may use, saying why,
 *   once it has fetched its Brands for a body photo, and builds on the rest as usual.
 * - `second-brand`: each Outfit takes each Category's second Brand still in play, where it has one,
 *   rather than the first.
 * - `preview-redrawn`: the Stylist finds its first Outfit's Preview wrong, redraws it with a
 *   correction, and keeps the redraw, its banner saying so.
 * - `preview-unfixable`: the Stylist finds its first Outfit's Preview wrong, redraws it, and finds
 *   the redraw wrong too, so it keeps neither, leaving that Outfit with no Preview.
 *
 * A Preview is the user's own photo with a "Fake Preview" banner across its foot, or "Fake Preview,
 * redrawn" for a redraw. Its scenarios pass every photo and style as usual:
 * - `preview-refused`: the image model refuses every Preview, for image safety.
 * - `preview-fails`: every Preview throws, as a model that keeps erroring without refusing does.
 *
 * Every Preview's verdict judges it right, unless a test scripts the verdicts (`previewVerdicts`).
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
  "style-icon-passed-over",
  "second-brand",
  "preview-redrawn",
  "preview-unfixable",
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

/** What a Preview the fake was asked to judge was drawn from, with every photo as its fingerprint. */
interface FakeDrawnFrom {
  photo: PhotoFingerprint;
  pieces: FakePreviewPiece[];
}

/** A verdict the fake was asked for, with every image as its fingerprint. */
export type FakeVerdictRequest =
  | (Omit<FirstDrawToJudge, keyof FakeDrawnFrom | "preview"> & FakeDrawnFrom & { preview: PhotoFingerprint })
  | (Omit<RedrawToJudge, keyof FakeDrawnFrom | "first" | "redraw"> & FakeDrawnFrom & { first: PhotoFingerprint; redraw: PhotoFingerprint });

/** A verdict a test scripts: a first draw's, a redraw's, or the model refusing to judge the Preview. */
export type FakeScriptedVerdict = FirstDrawVerdict | RedrawVerdict | { refused: true };

export interface FakeAiOptions {
  scenario?: FakeAiScenario;
  /** How long each call waits. Tests use 0. */
  delayMs?: number;
  /**
   * Where the fakes of a local development server keep the scenario each photo was checked under, by
   * its fingerprint, so its Stylings play it too, whatever `scenario` says: a browser's cookie picks
   * the scenario of its photo checks alone (`aiForBrowser`), and its Stylings run on the app's own
   * fake, in the Workflow. None in tests, whose fake plays `scenario`.
   */
  photoScenarios?: Map<string, FakeAiScenario>;
}

/**
 * The AI provider in local development and tests: no network, no cost. Tests set `scenario` in
 * code; local development picks it with the FAKE_AI_SCENARIO environment variable, or a browser's
 * cookie (`aiForBrowser`).
 */
export class FakeAiProvider implements AiProvider {
  scenario: FakeAiScenario;
  delayMs: number;
  readonly photoScenarios?: Map<string, FakeAiScenario>;
  /** How many photo checks it has been asked for. Only a count: it never keeps a photo. */
  photoCheckCount = 0;
  /** Scenarios for the Stylist's Outfits of particular Style Icons, by name, in place of `scenario`. */
  styleIconScenarios: Partial<Record<string, FakeStylistScenario>> = {};
  /** Scenarios for the next Previews, in the order they're asked for, in place of `scenario`. */
  previewScenarios: FakePreviewScenario[] = [];
  /** Every Preview it has been asked for, oldest first. */
  readonly previewRequests: FakePreviewRequest[] = [];
  /** Verdicts for the next Previews judged, in the order they're asked for. Once they run out, every Preview is judged right. */
  previewVerdicts: FakeScriptedVerdict[] = [];
  /** Every verdict it has been asked for, oldest first, with what each was sent. */
  readonly verdictRequests: FakeVerdictRequest[] = [];
  /** Every turn its Stylist has been asked for, oldest first, with what each was sent. */
  readonly stylistRequests: FakeStylistRequest[] = [];
  /**
   * Whether its Stylist reads an image sent by its link as the link, as Claude could, rather than
   * being sent the image itself. Claude's adapter takes every image inline, as a test may make it.
   */
  stylistReadsLinks = true;
  /** Plays the Stylist's turns a test scripts, in place of `scenario`'s: any it leaves undefined play as usual. */
  stylistTurn?: (request: FakeStylistRequest) => FakeStylistTurn | undefined;
  /** Runs during every call, as if the model were still working, so a test can look at a Styling part-way. */
  duringCall?: (call: keyof AiProvider) => Promise<void>;

  constructor({ scenario = "pass", delayMs = DEFAULT_FAKE_AI_DELAY_MS, photoScenarios }: FakeAiOptions = {}) {
    this.scenario = scenario;
    this.delayMs = delayMs;
    this.photoScenarios = photoScenarios;
  }

  async checkPhoto(input: PhotoCheckInput): Promise<PhotoCheckResult> {
    this.photoCheckCount += 1;
    this.photoScenarios?.set(fingerprint(input.photo).sha256, this.scenario);
    await this.wait("checkPhoto");
    if (this.scenario === "check-errors") throw new Error("The fake photo check errored, as its scenario asks.");
    if (this.scenario === "blocked") return { blocked: true };
    return { blocked: false, report: reportFor(this.scenario, input.photoType) };
  }

  stylistModel(): LanguageModelV4 {
    return fakeStylistModel(async (request) => {
      this.stylistRequests.push(request);
      await this.wait("stylistModel");
      // The conversation's first image is the photo.
      const scenario = this.scenarioOf(request.images[0]?.sha256);
      return this.stylistTurn?.(request) ?? fakeStylistTurn(request, (styleIcon) => this.styleIconScenarios[styleIcon.name] ?? stylistScenario(scenario, styleIcon));
    }, { readsLinks: this.stylistReadsLinks });
  }

  async renderPreview(input: PreviewInput): Promise<PreviewResult> {
    const { photo, pieces, ...rest } = input;
    const photoFingerprint = fingerprint(photo);
    this.previewRequests.push({ ...rest, photo: photoFingerprint, pieces: pieces.map(fingerprintedPiece) });
    const scenario = this.previewScenarios.shift() ?? this.scenarioOf(photoFingerprint.sha256);
    await this.wait("renderPreview");
    if (scenario === "preview-fails") throw new Error("The fake Preview failed, as its scenario asks.");
    if (scenario === "preview-refused") return { refused: true, reason: "image_safety" };
    return { refused: false, image: await withFakePreviewBanner(photo, input.correction ? "Fake Preview, redrawn" : "Fake Preview") };
  }

  judgePreview(input: FirstDrawToJudge): Promise<VerdictResult<FirstDrawVerdict>>;
  judgePreview(input: RedrawToJudge): Promise<VerdictResult<RedrawVerdict>>;
  async judgePreview(input: FirstDrawToJudge | RedrawToJudge): Promise<VerdictResult<FirstDrawVerdict | RedrawVerdict>> {
    this.verdictRequests.push(fingerprintedVerdict(input));
    const scripted = this.previewVerdicts.shift();
    await this.wait("judgePreview");
    if (!scripted) return { refused: false, verdict: input.draw === "first" ? { right: true } : UNSCRIPTED_REDRAW_VERDICT };
    if ("refused" in scripted) return scripted;
    const scriptedFor = "better" in scripted ? "redraw" : "first";
    if (scriptedFor !== input.draw) throw new Error(`The test scripted a ${scriptedFor} draw's verdict, but a ${input.draw} draw's was asked for.`);
    return { refused: false, verdict: scripted };
  }

  /** The scenario a Styling of the photo with this fingerprint plays: the one it was checked under, if kept, or `scenario`. */
  private scenarioOf(photoSha256: string | undefined): FakeAiScenario {
    return (photoSha256 && this.photoScenarios?.get(photoSha256)) || this.scenario;
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

function fingerprintedVerdict(input: FirstDrawToJudge | RedrawToJudge): FakeVerdictRequest {
  const drawnFrom: FakeDrawnFrom = { photo: fingerprint(input.photo), pieces: input.pieces.map(fingerprintedPiece) };
  if (input.draw === "first") return { ...input, ...drawnFrom, preview: fingerprint(input.preview) };
  return { ...input, ...drawnFrom, first: fingerprint(input.first), redraw: fingerprint(input.redraw) };
}

/** The fake's verdict on a redraw nothing scripted: it breaks no hard rule, and shows the Outfit better than the first. */
const UNSCRIPTED_REDRAW_VERDICT: RedrawVerdict = { breaksHardRule: false, better: "redraw", note: "The redraw shows your Outfit as it should." };

/** The photo with a banner across its foot saying it's a fake Preview, as a PNG, as image models send. */
async function withFakePreviewBanner(photo: Photo, label: string): Promise<Uint8Array> {
  const image = sharp(photo.bytes);
  const { width, height } = await image.metadata();
  const bannerHeight = Math.max(Math.round(height * 0.1), 12);
  const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${bannerHeight}">
    <rect width="100%" height="100%" fill="#1c1917" fill-opacity="0.75"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="sans-serif"
      font-size="${Math.round(bannerHeight * 0.5)}" font-weight="600" fill="#ffffff">${label}</text>
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
    case "style-icon-passed-over":
    case "second-brand":
    case "preview-redrawn":
    case "preview-unfixable":
    case "preview-refused":
    case "preview-fails":
      return passing;
  }
}

/** How the fake's Stylist plays a scenario for a Style Icon: its own scenarios, and the fixed pipeline's choices for any other. */
function stylistScenario(scenario: FakeAiScenario, styleIcon: FakeScenarioStyleIcon): FakeStylistScenario {
  switch (scenario) {
    case "one-piece":
    case "unknown-cut":
    case "tailoring-fails":
    case "second-brand":
      return scenario;
    case "style-icon-passed-over":
      return styleIcon.first ? "passed-over" : "pass";
    case "preview-redrawn":
    case "preview-unfixable":
      return styleIcon.first ? scenario : "pass";
    default:
      return "pass";
  }
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
  // Only local development's browsers pick scenarios of their own.
  return new FakeAiProvider({ scenario, delayMs, photoScenarios: env.NODE_ENV === "development" ? devServerPhotoScenarios() : undefined });
}

/**
 * The scenario each photo was checked under in this local development server, by its fingerprint.
 * Kept on globalThis, as the app's services are, so the browsers' fakes and the app's own share it.
 */
function devServerPhotoScenarios(): Map<string, FakeAiScenario> {
  const store = globalThis as typeof globalThis & { fakeAiPhotoScenarios?: Map<string, FakeAiScenario> };
  store.fakeAiPhotoScenarios ??= new Map();
  return store.fakeAiPhotoScenarios;
}

/**
 * In local development a browser can pick its own scenario with this cookie, so the browser smoke
 * tests can play several scenarios against one dev server. It plays in the browser's photo checks,
 * and in the Stylings of each photo it checked. Deployments ignore it.
 */
export const FAKE_AI_SCENARIO_COOKIE = "fake_ai_scenario";

/**
 * `ai`, or in local development a fake playing the scenario the browser's cookie names, which it
 * keeps for each photo it checks, so their Stylings, on `ai` in the Workflow, play it too.
 */
export function aiForBrowser(ai: AiProvider, cookieScenario: string | undefined): AiProvider {
  if (process.env.NODE_ENV !== "development" || !(ai instanceof FakeAiProvider)) return ai;
  if (!cookieScenario || !isFakeAiScenario(cookieScenario)) return ai;
  return new FakeAiProvider({ scenario: cookieScenario, delayMs: ai.delayMs, photoScenarios: ai.photoScenarios });
}

function isFakeAiScenario(value: string): value is FakeAiScenario {
  return (FAKE_AI_SCENARIOS as readonly string[]).includes(value);
}
