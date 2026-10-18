import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aiFromEnvironment } from "./environment";
import { FakeAiProvider } from "./fake";
import { GeminiAiProvider } from "./gemini";
import { type Photo, type PhotoCheckInput, type PhotoCheckReport, type TailoredPieces, type TailoringInput, UnretryableAiError } from "./provider";

// The Gemini adapter against a fake Gemini API: no test calls Gemini. The fake answers each
// request with a small hand-written response shaped like Gemini's, and records what was sent.

/** A request as it left for Gemini. */
interface RecordedGeminiRequest {
  url: URL;
  headers: Headers;
  body: GeminiRequestBody;
}

interface GeminiRequestBody {
  contents: { role: string; parts: GeminiPart[] }[];
  systemInstruction?: { parts: GeminiPart[] };
}

type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string }; fileData?: unknown };

/** Gemini in tests: it answers every request with `respond`, and records each one. */
class FakeGemini {
  readonly requests: RecordedGeminiRequest[] = [];
  respond: (request: RecordedGeminiRequest) => Response = () => geminiError(500);

  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const body = JSON.parse(String(init?.body)) as GeminiRequestBody;
    const recorded = { url, headers: new Headers(init?.headers), body };
    this.requests.push(recorded);
    return this.respond(recorded);
  };
}

/** Gemini's reply carrying `text`, as a model that finished normally sends it. */
function geminiText(text: string): Response {
  return Response.json({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] });
}

/** Gemini's reply carrying `value` as JSON, as structured output sends it. */
function geminiJson(value: unknown): Response {
  return geminiText(JSON.stringify(value));
}

/** Google blocking the request itself, photo included: no candidates, only the block reason. */
function geminiPromptBlocked(blockReason: string): Response {
  return Response.json({ promptFeedback: { blockReason } });
}

/** Google stopping the reply part-way for safety. Whatever was written comes back with it. */
function geminiReplyBlocked(finishReason: string, writtenSoFar: string): Response {
  return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: writtenSoFar }] }, finishReason }] });
}

/** One of Gemini's errors, with no wait before the AI SDK retries it. */
function geminiError(status: number): Response {
  return Response.json({ error: { code: status, message: `Gemini error ${status}` } }, { status, headers: { "retry-after-ms": "0" } });
}

/** Every part of the request that isn't text: the photo, inline or as a file reference. */
function photoPartsOf({ body }: RecordedGeminiRequest): GeminiPart[] {
  return body.contents.flatMap(({ parts }) => parts).filter((part) => part.text === undefined);
}

/** All the request's text, the system instruction included. */
function textOf({ body }: RecordedGeminiRequest): string {
  const parts = [...(body.systemInstruction?.parts ?? []), ...body.contents.flatMap(({ parts }) => parts)];
  return parts.flatMap(({ text }) => (text === undefined ? [] : [text])).join("\n");
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** The photo's bytes stand in for a real photo: the adapter sends them as they are. */
const PHOTO: Photo = { bytes: new TextEncoder().encode("the bytes of a photo of someone standing in a park"), mediaType: "image/jpeg" };

const PHOTO_CHECK: PhotoCheckInput = { photo: PHOTO, photoType: "full_body" };

const REPORT: PhotoCheckReport = {
  peopleCount: 1,
  visible: { face: true, hair: true, upperBody: true, legs: true, feet: true },
  hairCovered: false,
  clearEnough: true,
  explicit: false,
  photoStyle: ["edgy", "chic"],
};

/** A Full-Body Photo's Outfit. The Style Icon and Brands are made up. */
const TAILORING: TailoringInput = {
  photo: PHOTO,
  photoType: "full_body",
  ageGroup: "25_29",
  photoStyle: ["edgy", "chic"],
  line: "womenswear",
  styleIconName: "Mira Vale",
  pieces: [
    { category: "hairstyle" },
    { category: "top", brand: { name: "Northbound", categoryTags: ["apparel", "footwear"], priceRangeUsd: { min: 30, max: 250 } } },
    { category: "bottom", brand: { name: "Field Denim", categoryTags: ["apparel", "denim"], priceRangeUsd: null } },
    { category: "shoes", brand: { name: "Stride Works", categoryTags: ["footwear"], priceRangeUsd: { min: 60, max: 140 } } },
  ],
};

const TAILORED: TailoredPieces = {
  pieces: [
    {
      category: "hairstyle",
      item: "Choppy chin-length bob",
      details: "A choppy chin-length bob with a soft side part, in your own hair colour.",
      why: "Mira Vale's signature bob, cut from the length you have now to sharpen your edgy, chic style.",
      unknownCut: false,
    },
    {
      category: "top",
      item: "Black cropped leather biker jacket",
      details: "A black leather biker jacket, cropped at the waist, with silver zips and a fitted cut.",
      why: "A biker jacket gives your edgy Photo Style its edge, worn the way Mira Vale layers hers.",
    },
    {
      category: "bottom",
      item: "Washed-black high-rise straight jeans",
      details: "Washed-black denim jeans with a high rise, a straight leg and a clean hem.",
      why: "Straight black jeans keep the Outfit sleek and easy, and go with what you're already wearing.",
    },
    {
      category: "shoes",
      item: "Black leather lace-up ankle boots",
      details: "Black leather ankle boots with a lace-up front and a chunky rubber sole.",
      why: "Chunky boots finish the Outfit with the attitude Mira Vale is known for.",
    },
  ],
};

let gemini: FakeGemini;
let ai: GeminiAiProvider;

beforeEach(() => {
  gemini = new FakeGemini();
  ai = new GeminiAiProvider({ apiKey: "test-api-key", fetch: gemini.fetch });
});

describe("the photo check", () => {
  it("reports what Gemini saw", async () => {
    gemini.respond = () => geminiJson(REPORT);

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: false, report: REPORT });
  });

  it("sends the photo inline to gemini-3.5-flash-lite, never through the Files API", async () => {
    gemini.respond = () => geminiJson(REPORT);

    await ai.checkPhoto(PHOTO_CHECK);

    expect(gemini.requests.map(({ url }) => url.pathname)).toEqual(["/v1beta/models/gemini-3.5-flash-lite:generateContent"]);
    expect(photoPartsOf(gemini.requests[0]!)).toEqual([{ inlineData: { mimeType: "image/jpeg", data: base64(PHOTO.bytes) } }]);
  });

  it.each([
    ["the request", () => geminiPromptBlocked("PROHIBITED_CONTENT")],
    ["the reply", () => geminiReplyBlocked("SAFETY", '{"peopleCount": 1, ')],
  ])("comes back blocked when Google blocks %s", async (_blocked, blockedResponse) => {
    gemini.respond = blockedResponse;

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: true });
  });

  it("gets past an error that the AI SDK's own retries clear", async () => {
    gemini.respond = () => (gemini.requests.length === 1 ? geminiError(503) : geminiJson(REPORT));

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: false, report: REPORT });
  });

  it("throws an error that outlasts the AI SDK's own retries, carrying nothing of the photo", async () => {
    gemini.respond = () => geminiError(503);

    const error = await ai.checkPhoto(PHOTO_CHECK).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect(inspect(error, { depth: Infinity })).not.toContain(base64(PHOTO.bytes));
  });

  it("throws when Gemini's reply isn't a report", async () => {
    gemini.respond = () => geminiJson({ ...REPORT, peopleCount: "one", photoStyle: ["cottagecore"] });

    await expect(ai.checkPhoto(PHOTO_CHECK)).rejects.toThrow();
  });

  it("keeps one word of a Photo Style Gemini read twice", async () => {
    gemini.respond = () => geminiJson({ ...REPORT, photoStyle: ["casual", "casual"] });

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: false, report: { ...REPORT, photoStyle: ["casual"] } });
  });
});

describe("tailoring", () => {
  it("returns Gemini's reply as it came", async () => {
    gemini.respond = () => geminiJson(TAILORED);

    const reply = await ai.tailorPieces(TAILORING);

    expect(reply).toEqual(TAILORED);
  });

  it("returns a reply that doesn't match the schema as it came, for our code to check", async () => {
    gemini.respond = () => geminiJson({ pieces: [{ category: "top", item: "Black cropped leather biker jacket" }] });

    const reply = await ai.tailorPieces(TAILORING);

    expect(reply).toEqual({ pieces: [{ category: "top", item: "Black cropped leather biker jacket" }] });
  });

  it("returns a reply that isn't JSON as its text, for our code to check", async () => {
    gemini.respond = () => geminiText("Here is your Outfit: a black biker jacket.");

    const reply = await ai.tailorPieces(TAILORING);

    expect(reply).toBe("Here is your Outfit: a black biker jacket.");
  });

  it("returns no reply when Google blocks the request, so it's asked again rather than retried", async () => {
    gemini.respond = () => geminiPromptBlocked("OTHER");

    const reply = await ai.tailorPieces(TAILORING);

    expect(reply).toBeNull();
  });

  it("returns what Gemini wrote before Google stopped the reply, for our code to check", async () => {
    gemini.respond = () => geminiReplyBlocked("SAFETY", '{"pieces": [{"category": "top", ');

    const reply = await ai.tailorPieces(TAILORING);

    expect(reply).toBe('{"pieces": [{"category": "top", ');
  });

  it("throws an error that outlasts the AI SDK's own retries, carrying nothing of the photo", async () => {
    gemini.respond = () => geminiError(503);

    const error = await ai.tailorPieces(TAILORING).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect(inspect(error, { depth: Infinity })).not.toContain(base64(PHOTO.bytes));
  });

  it("throws an error Gemini refuses the request with as one not worth retrying", async () => {
    gemini.respond = () => geminiError(400);

    const error = await ai.tailorPieces(TAILORING).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(UnretryableAiError);
    expect(gemini.requests).toHaveLength(1);
  });

  it("throws an error that outlasts the AI SDK's own retries as one still worth retrying", async () => {
    gemini.respond = () => geminiError(503);

    const error = await ai.tailorPieces(TAILORING).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnretryableAiError);
  });

  it("sends gemini-3.5-flash-lite the photo inline, with the Outfit's line, Style Icon and Brands", async () => {
    gemini.respond = () => geminiJson(TAILORED);

    await ai.tailorPieces(TAILORING);

    expect(gemini.requests.map(({ url }) => url.pathname)).toEqual(["/v1beta/models/gemini-3.5-flash-lite:generateContent"]);
    const [request] = gemini.requests;
    expect(photoPartsOf(request!)).toEqual([{ inlineData: { mimeType: "image/jpeg", data: base64(PHOTO.bytes) } }]);
    const text = textOf(request!);
    for (const sent of ["womenswear", "Mira Vale", "edgy and chic", "Northbound", "Field Denim", "Stride Works"]) {
      expect(text).toContain(sent);
    }
  });
});

describe("switching Gemini on", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("runs the fake adapter unless AI_PROVIDER says gemini, even with GEMINI_API_KEY set", () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "key-from-the-environment");

    expect(aiFromEnvironment()).toBeInstanceOf(FakeAiProvider);
  });

  it("runs Gemini when AI_PROVIDER says gemini, with GEMINI_API_KEY as its key", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "key-from-the-environment");
    vi.stubGlobal("fetch", gemini.fetch);
    gemini.respond = () => geminiJson(REPORT);

    const result = await aiFromEnvironment().checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: false, report: REPORT });
    expect(gemini.requests.map(({ headers }) => headers.get("x-goog-api-key"))).toEqual(["key-from-the-environment"]);
  });

  it("can't run Gemini without GEMINI_API_KEY", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");

    expect(() => aiFromEnvironment()).toThrow("GEMINI_API_KEY must be set when AI_PROVIDER is gemini.");
  });

  it("refuses an AI_PROVIDER it doesn't know", () => {
    vi.stubEnv("AI_PROVIDER", "openai");

    expect(() => aiFromEnvironment()).toThrow("AI_PROVIDER must be one of: fake, gemini.");
  });
});
