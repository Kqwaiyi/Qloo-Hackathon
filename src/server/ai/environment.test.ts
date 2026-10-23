import { generateText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aiFromEnvironment } from "./environment";
import { FakeAiProvider } from "./fake";
import { anthropicJson, anthropicText, FakeAnthropic } from "./fake-anthropic";
import { FakeGemini, geminiImage } from "./fake-gemini";
import type { Photo, PhotoCheckReport } from "./provider";

// Which AI the environment switches on. Real AI is two adapters together: the photo check and the
// Stylist on Claude, and Previews on Gemini (ADR-0011). Every request goes to a fake API.

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

/** The bytes stand in for the image Gemini drew. */
const DRAWN = new TextEncoder().encode("the bytes of the photo with a new haircut drawn on");

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

  it("runs the photo check on Claude, with ANTHROPIC_API_KEY, and Previews on Gemini, with GEMINI_API_KEY, when AI_PROVIDER says real", async () => {
    vi.stubEnv("AI_PROVIDER", "real");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key-from-the-environment");
    vi.stubEnv("GEMINI_API_KEY", "gemini-key-from-the-environment");
    anthropic.respond = () => anthropicJson(REPORT);
    gemini.respond = () => geminiImage(DRAWN);
    const ai = aiFromEnvironment();

    expect(await ai.checkPhoto({ photo: PHOTO, photoType: "face" })).toEqual({ blocked: false, report: REPORT });
    expect(await ai.renderPreview({ photo: PHOTO, photoType: "face", pieces: [{ category: "hairstyle", details: "A short textured crop." }] })).toEqual({
      refused: false,
      image: DRAWN,
    });

    expect(anthropic.requests.map(({ headers }) => headers.get("x-api-key"))).toEqual(["anthropic-key-from-the-environment"]);
    expect(gemini.requests.map(({ headers }) => headers.get("x-goog-api-key"))).toEqual(["gemini-key-from-the-environment"]);
  });

  it("runs the Stylist on Claude, with ANTHROPIC_API_KEY, when AI_PROVIDER says real", async () => {
    vi.stubEnv("AI_PROVIDER", "real");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key-from-the-environment");
    vi.stubEnv("GEMINI_API_KEY", "gemini-key-from-the-environment");
    anthropic.respond = () => anthropicText("Finding your Style Icons first.");
    const ai = aiFromEnvironment();

    const { text } = await generateText({ model: ai.stylistModel(), prompt: "This Styling's brief." });

    expect(text).toBe("Finding your Style Icons first.");
    expect(anthropic.requests.map(({ headers, body }) => [headers.get("x-api-key"), body.model])).toEqual([["anthropic-key-from-the-environment", "claude-haiku-5-5"]]);
    expect(gemini.requests).toEqual([]);
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
