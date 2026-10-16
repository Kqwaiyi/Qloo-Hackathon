import { createHash } from "node:crypto";

import type { Category, PhotoType } from "@/config/consultations";

import type {
  AiProvider,
  PhotoCheckInput,
  PhotoCheckReport,
  PhotoCheckResult,
  PhotoMediaType,
  PhotoVisibility,
  TailoredPieces,
  TailoringInput,
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
 * Tailoring makes generic items in the right Categories, each `why` naming the Style Icon, and the
 * cut known. Its scenarios pass every photo:
 * - `unknown-cut`: the Hairstyle's cut is marked unknown, based on the Outfit and Photo Style, and
 *   its `why` doesn't name the Style Icon.
 * - `tailoring-fails`: every reply breaks a rule, as a broken model's would: a price, an empty
 *   field, a missing Category, a Category twice, or not the schema at all, in turn.
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
  "unknown-cut",
  "tailoring-fails",
] as const;
export type FakeAiScenario = (typeof FAKE_AI_SCENARIOS)[number];
export type FakeTailoringScenario = Extract<FakeAiScenario, "pass" | "unknown-cut" | "tailoring-fails">;

/** About as long as a real photo check, so local development feels like the real thing. */
export const DEFAULT_FAKE_AI_DELAY_MS = 1000;

/** A tailoring the fake was asked for, with the photo as its fingerprint: it never keeps a photo. */
export type FakeTailoringRequest = Omit<TailoringInput, "photo"> & { photo: { mediaType: PhotoMediaType; sha256: string } };

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

  constructor({ scenario = "pass", delayMs = DEFAULT_FAKE_AI_DELAY_MS }: FakeAiOptions = {}) {
    this.scenario = scenario;
    this.delayMs = delayMs;
  }

  async checkPhoto(input: PhotoCheckInput): Promise<PhotoCheckResult> {
    this.photoCheckCount += 1;
    await this.wait();
    if (this.scenario === "check-errors") throw new Error("The fake photo check errored, as its scenario asks.");
    if (this.scenario === "blocked") return { blocked: true };
    return { blocked: false, report: reportFor(this.scenario, input.photoType) };
  }

  async tailorPieces(input: TailoringInput): Promise<unknown> {
    const { photo, ...rest } = input;
    this.tailoringRequests.push({ ...rest, photo: { mediaType: photo.mediaType, sha256: createHash("sha256").update(photo.bytes).digest("hex") } });
    await this.wait();
    const scenario = this.styleIconScenarios[input.styleIconName] ?? this.scenario;
    const tailored = { pieces: input.pieces.map(({ category }) => fakePiece(category, input, scenario !== "unknown-cut")) };
    if (scenario !== "tailoring-fails") return tailored;
    const breakRule = BROKEN_TAILORING[(this.tailoringRequests.length - 1) % BROKEN_TAILORING.length]!;
    return breakRule(tailored);
  }

  private async wait(): Promise<void> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }
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
    case "unknown-cut":
    case "tailoring-fails":
      return passing;
  }
}

/** A generic Piece, built from the tailoring's inputs. */
function fakePiece(category: Category, { photoStyle, styleIconName }: TailoringInput, cutKnown: boolean): TailoredPieces["pieces"][number] {
  const style = photoStyle[0];
  const styleWords = photoStyle.join(" and ");
  switch (category) {
    case "hairstyle":
      return cutKnown
        ? {
            category,
            item: `${capitalised(style)} textured cut with soft layers`,
            details: `A ${style} textured cut with soft layers, a little shorter at the sides, in your own hair colour.`,
            why: `${styleIconName}'s signature cut, reworked so your current hair carries it with your ${styleWords} Photo Style.`,
            unknownCut: false,
          }
        : {
            category,
            item: `${capitalised(style)} soft layered cut`,
            details: `A ${style} soft layered cut, trimmed to shape from your current length, in your own hair colour.`,
            why: `A ${styleWords} cut picked to go with this Outfit, and easy to reach from the hair you have now.`,
            unknownCut: true,
          };
    case "top":
      return {
        category,
        item: "Navy relaxed cotton overshirt",
        details: "A navy cotton overshirt with a relaxed fit, a straight hem and two chest pockets.",
        why: `An easy layer in the spirit of ${styleIconName}, at home with your ${styleWords} Photo Style.`,
      };
    case "bottom":
      return {
        category,
        item: "Charcoal straight-leg cotton chinos",
        details: "Charcoal cotton chinos with a straight leg, a mid rise and a clean, pressed finish.",
        why: `Straight-leg chinos ${styleIconName} would reach for, keeping your ${styleWords} Outfit grounded.`,
      };
    case "shoes":
      return {
        category,
        item: "White low-top leather trainers",
        details: "White leather low-top trainers with a slim gum sole and tonal laces.",
        why: `Clean trainers that finish the Outfit the way ${styleIconName} does, and suit your ${styleWords} style.`,
      };
  }
}

/** Ways a broken model's reply breaks our rules, each made from a good reply. */
const BROKEN_TAILORING: ((tailored: TailoredPieces) => unknown)[] = [
  ({ pieces }) => ({ pieces: pieces.map((tailored) => ({ ...tailored, why: `${tailored.why} Yours for about $40.` })) }),
  ({ pieces }) => ({ pieces: pieces.map((tailored) => ({ ...tailored, item: " " })) }),
  ({ pieces }) => ({ pieces: pieces.slice(0, -1) }),
  ({ pieces }) => ({ pieces: [...pieces, pieces[0]] }),
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
