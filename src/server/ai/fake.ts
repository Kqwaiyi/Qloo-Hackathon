import type { PhotoType } from "@/config/consultations";

import type { AiProvider, PhotoCheckInput, PhotoCheckReport, PhotoVisibility } from "./provider";

/**
 * Which outcome the fake adapter plays. `pass` passes every photo with Photo Style casual. Later
 * tickets add a scenario for every other outcome (rejections, covered hair, errors…).
 */
export const FAKE_AI_SCENARIOS = ["pass"] as const;
export type FakeAiScenario = (typeof FAKE_AI_SCENARIOS)[number];

/** About as long as a real photo check, so local development feels like the real thing. */
export const DEFAULT_FAKE_AI_DELAY_MS = 1000;

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

  constructor({ scenario = "pass", delayMs = DEFAULT_FAKE_AI_DELAY_MS }: FakeAiOptions = {}) {
    this.scenario = scenario;
    this.delayMs = delayMs;
  }

  async checkPhoto(input: PhotoCheckInput): Promise<PhotoCheckReport> {
    this.photoCheckCount += 1;
    await this.wait();
    return {
      peopleCount: 1,
      visible: VISIBLE_BY_PHOTO_TYPE[input.photoType],
      hairCovered: false,
      clearEnough: true,
      explicit: false,
      photoStyle: ["casual"],
    };
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

function isFakeAiScenario(value: string): value is FakeAiScenario {
  return (FAKE_AI_SCENARIOS as readonly string[]).includes(value);
}
