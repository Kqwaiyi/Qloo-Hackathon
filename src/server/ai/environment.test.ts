import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aiFromEnvironment } from "./environment";
import { FakeAiProvider } from "./fake";
import { anthropicJson, FakeAnthropic } from "./fake-anthropic";
import { FakeGemini, geminiJson } from "./fake-gemini";
import type { Photo, PhotoCheckReport, TailoredPieces, TailoringInput } from "./provider";

// Which AI the environment switches on. Real AI is two adapters together: the photo check on
// Claude, tailoring and Previews on Gemini (ADR-0011). Every request goes to a fake API.

const PHOTO: Photo = { bytes: new TextEncoder().encode("the bytes of a photo of someone's face"), mediaType: "image/jpeg" };

const REPORT: PhotoCheckReport = {
  peopleCount: 1,
  clearMainPerson: true,
  visible: { face: true, hair: true, upperBody: false, legs: false, feet: false },
  hairCovered: false,
  clearEnough: true,
  explicit: false,
  photoStyle: ["classic"],
};

/** A Face Photo's Outfit: its Hairstyle alone. */
const TAILORING: TailoringInput = {
  photo: PHOTO,
  photoType: "face",
  ageGroup: "25_29",
  photoStyle: ["classic"],
  line: "menswear",
  styleIconName: "Theo Marsh",
  pieces: [{ category: "hairstyle" }],
};

const TAILORED: TailoredPieces = {
  pieces: [
    {
      category: "hairstyle",
      item: "Short textured crop",
      details: "A short textured crop with a low fade, in your own hair colour.",
      why: "Theo Marsh's signature crop, cut from the length you have now to sharpen your classic style.",
      unknownCut: false,
    },
  ],
};

let anthropic: FakeAnthropic;
let gemini: FakeGemini;

beforeEach(() => {
  anthropic = new FakeAnthropic();
  gemini = new FakeGemini();
  // Each provider's requests to its own fake, by where they're sent.
  vi.stubGlobal("fetch", ((input, init) => {
    const { hostname } = new URL(input instanceof Request ? input.url : input);
    return hostname === "api.anthropic.com" ? anthropic.fetch(input, init) : gemini.fetch(input, init);
  }) satisfies typeof globalThis.fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("switching real AI on", () => {
  it("runs the fake AI unless AI_PROVIDER says real, even with both keys set", () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key-from-the-environment");
    vi.stubEnv("GEMINI_API_KEY", "gemini-key-from-the-environment");

    expect(aiFromEnvironment()).toBeInstanceOf(FakeAiProvider);
  });

  it("runs the photo check on Claude, with ANTHROPIC_API_KEY, and tailoring on Gemini, with GEMINI_API_KEY, when AI_PROVIDER says real", async () => {
    vi.stubEnv("AI_PROVIDER", "real");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key-from-the-environment");
    vi.stubEnv("GEMINI_API_KEY", "gemini-key-from-the-environment");
    anthropic.respond = () => anthropicJson(REPORT);
    gemini.respond = () => geminiJson(TAILORED);
    const ai = aiFromEnvironment();

    expect(await ai.checkPhoto({ photo: PHOTO, photoType: "face" })).toEqual({ blocked: false, report: REPORT });
    expect(await ai.tailorPieces(TAILORING)).toEqual(TAILORED);

    expect(anthropic.requests.map(({ headers }) => headers.get("x-api-key"))).toEqual(["anthropic-key-from-the-environment"]);
    expect(gemini.requests.map(({ headers }) => headers.get("x-goog-api-key"))).toEqual(["gemini-key-from-the-environment"]);
  });

  it.each([
    ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"],
    ["GEMINI_API_KEY", "ANTHROPIC_API_KEY"],
  ])("can't run real AI without %s, even with %s set", (missing, set) => {
    vi.stubEnv("AI_PROVIDER", "real");
    vi.stubEnv(missing, "");
    vi.stubEnv(set, "key-from-the-environment");

    expect(() => aiFromEnvironment()).toThrow(`${missing} must be set when AI_PROVIDER is real.`);
  });

  it.each(["gemini", "openai"])("refuses an AI_PROVIDER it doesn't know, such as %s", (name) => {
    vi.stubEnv("AI_PROVIDER", name);

    expect(() => aiFromEnvironment()).toThrow("AI_PROVIDER must be one of: fake, real.");
  });
});
