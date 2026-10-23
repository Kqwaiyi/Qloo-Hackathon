import { inspect } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";

import { AnthropicAiProvider } from "./anthropic";
import { anthropicError, anthropicJson, anthropicRefusal, FakeAnthropic, imagesOf, textOf } from "./fake-anthropic";
import { type Photo, type PhotoCheckInput, type PhotoCheckReport, UnretryableAiError } from "./provider";

// The Anthropic adapter against a fake Anthropic API: no test calls Anthropic. The fake answers
// each request with a small hand-written response shaped like Anthropic's, and records what was sent.

/** The photo's bytes stand in for a real photo: the adapter sends them as they are. */
const PHOTO: Photo = { bytes: new TextEncoder().encode("the bytes of a photo of someone standing in a park"), mediaType: "image/jpeg" };

const PHOTO_CHECK: PhotoCheckInput = { photo: PHOTO, photoType: "full_body" };

const REPORT: PhotoCheckReport = {
  peopleCount: 1,
  clearMainPerson: true,
  visible: { face: true, hair: true, upperBody: true, legs: true, feet: true },
  hairCovered: false,
  clearEnough: true,
  explicit: false,
  photoStyle: ["edgy", "chic"],
};

let anthropic: FakeAnthropic;
let ai: AnthropicAiProvider;

beforeEach(() => {
  anthropic = new FakeAnthropic();
  ai = new AnthropicAiProvider({ apiKey: "test-api-key", fetch: anthropic.fetch });
});

describe("the photo check", () => {
  it("reports what Claude saw", async () => {
    anthropic.respond = () => anthropicJson(REPORT);

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: false, report: REPORT });
  });

  it("sends claude-haiku-5-5 the photo inline, as its own bytes, with the API key", async () => {
    anthropic.respond = () => anthropicJson(REPORT);

    await ai.checkPhoto(PHOTO_CHECK);

    expect(anthropic.requests.map(({ url }) => url.href)).toEqual(["https://api.anthropic.com/v1/messages"]);
    const [request] = anthropic.requests;
    expect(request!.body.model).toBe("claude-haiku-5-5");
    expect(request!.headers.get("x-api-key")).toBe("test-api-key");
    expect(imagesOf(request!)).toEqual([{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64(PHOTO.bytes) } }]);
  });

  it("asks for the report as structured output, at medium effort, with thinking display omitted, no temperature and no prefill", async () => {
    anthropic.respond = () => anthropicJson(REPORT);

    await ai.checkPhoto(PHOTO_CHECK);

    const { body } = anthropic.requests[0]!;
    expect(body.output_config).toEqual({
      effort: "medium",
      format: {
        type: "json_schema",
        schema: expect.objectContaining({
          type: "object",
          required: ["peopleCount", "clearMainPerson", "visible", "hairCovered", "clearEnough", "explicit", "photoStyle"],
        }),
      },
    });
    expect(body.thinking).toEqual({ type: "adaptive", display: "omitted" });
    expect(body).not.toHaveProperty("temperature");
    // The conversation ends on the photo: nothing begins Claude's reply for it.
    expect(body.messages.map(({ role }) => role)).toEqual(["user"]);
  });

  it("asks Claude whether one person is clearly the Main Person, reporting the rest about them, and carries its answer", async () => {
    anthropic.respond = () => anthropicJson({ ...REPORT, peopleCount: 2, clearMainPerson: false });

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: false, report: { ...REPORT, peopleCount: 2, clearMainPerson: false } });
    const text = textOf(anthropic.requests[0]!);
    expect(text).toMatch(/clearMainPerson: whether one person is clearly the photo's subject/i);
    expect(text).toMatch(/noticeably closer or larger than everyone else, and in focus/i);
    expect(text).toMatch(/a couple's selfie, friends side by side, a group photo/i);
    expect(text).toMatch(/when in doubt, clearMainPerson is false/i);
    expect(text).toMatch(/everything else you report, except explicit, is about the main person/i);
  });

  it.each([
    ["before writing anything", () => anthropicRefusal()],
    ["part-way through the report", () => anthropicRefusal('{"peopleCount": 1, ')],
  ])("comes back blocked when Claude refuses %s, so the photo is rejected as not appropriate", async (_when, refusal) => {
    anthropic.respond = refusal;

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: true });
    expect(anthropic.requests).toHaveLength(1);
  });

  it("keeps one word of a Photo Style Claude read twice", async () => {
    anthropic.respond = () => anthropicJson({ ...REPORT, photoStyle: ["casual", "casual"] });

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: false, report: { ...REPORT, photoStyle: ["casual"] } });
  });

  it("throws when Claude's reply isn't a report, carrying nothing of the photo or the request", async () => {
    anthropic.respond = () => anthropicJson({ ...REPORT, peopleCount: "one", photoStyle: ["cottagecore"] });

    const error = await ai.checkPhoto(PHOTO_CHECK).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expectNothingOfTheRequest(error);
  });

  it("gets past an error that the AI SDK's own retries clear", async () => {
    anthropic.respond = () => (anthropic.requests.length === 1 ? anthropicError(529, "overloaded_error") : anthropicJson(REPORT));

    const result = await ai.checkPhoto(PHOTO_CHECK);

    expect(result).toEqual({ blocked: false, report: REPORT });
  });

  it.each([
    [429, "rate_limit_error"],
    [500, "api_error"],
    [529, "overloaded_error"],
  ])(
    "throws Anthropic's %d %s once the AI SDK's own retries run out, as an error still worth retrying that carries nothing of the photo or the request",
    async (status, type) => {
      anthropic.respond = () => anthropicError(status, type);

      const error = await ai.checkPhoto(PHOTO_CHECK).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(UnretryableAiError);
      expectNothingOfTheRequest(error);
      expect(anthropic.requests).toHaveLength(3);
    },
  );

  it.each([
    [400, "invalid_request_error"],
    [401, "authentication_error"],
    [403, "permission_error"],
    [413, "request_too_large"],
  ])(
    "throws Anthropic's %d %s after one try, as an error not worth retrying that carries nothing of the photo or the request",
    async (status, type) => {
      anthropic.respond = () => anthropicError(status, type);

      const error = await ai.checkPhoto(PHOTO_CHECK).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(UnretryableAiError);
      expectNothingOfTheRequest(error);
      expect(anthropic.requests).toHaveLength(1);
    },
  );

  it("never asks Claude to guess age or infer ethnicity, skin tone, body measurements or health", async () => {
    anthropic.respond = () => anthropicJson(REPORT);

    await ai.checkPhoto(PHOTO_CHECK);

    const text = textOf(anthropic.requests[0]!);
    expect(text).toContain("Never guess the person's age. Never infer their ethnicity, skin tone, body measurements or health, and never mention them.");
  });
});

/** The error, however deeply it's looked into, holds neither the photo nor anything else of the request. */
function expectNothingOfTheRequest(error: unknown): void {
  const inspected = inspect(error, { depth: Infinity });
  expect(inspected).not.toContain(base64(PHOTO.bytes));
  expect(inspected).not.toContain("You check one photo for a styling app");
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
