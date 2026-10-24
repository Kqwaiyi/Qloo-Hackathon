import { WorkflowAgent } from "@ai-sdk/workflow";
import { generateText, isStepCount, tool } from "ai";
import { inspect } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import * as z from "zod";

import { AnthropicAiProvider } from "./anthropic";
import { anthropicError, anthropicJson, anthropicRefusal, anthropicText, anthropicToolUse, FakeAnthropic, imagesOf, textOf } from "./fake-anthropic";
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

describe("the Stylist's model", () => {
  it("sends claude-haiku-5-5 one of the Stylist's calls with its prompt, its tools, the conversation so far and the photo, with the API key", async () => {
    anthropic.respond = saveThenDone;

    await runTurns();

    expect(anthropic.requests.map(({ url }) => url.href)).toEqual(["https://api.anthropic.com/v1/messages", "https://api.anthropic.com/v1/messages"]);
    const { headers, body } = anthropic.requests[1]!;
    expect(headers.get("x-api-key")).toBe("test-api-key");
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.system).toEqual([{ type: "text", text: PROMPT }]);
    expect(body.tools).toEqual([expect.objectContaining({ name: "saveOutfit", description: "Saves one Outfit." })]);
    // The brief and the photo, then Claude's turn, its thinking given back as it came, then what the tool gave.
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: BRIEF },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64(PHOTO.bytes) }, cache_control: { type: "ephemeral" } },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "", signature: "a-signature" },
          { type: "tool_use", id: SAVE_CALL.id, name: "saveOutfit", input: SAVE_CALL.input },
        ],
      },
      { role: "user", content: [expect.objectContaining({ type: "tool_result", tool_use_id: SAVE_CALL.id })] },
    ]);
  });

  it("caches the prompt, tools, brief and photo, and the conversation so far, so each turn reads them from cache", async () => {
    anthropic.respond = saveThenDone;

    await runTurns();

    for (const { body } of anthropic.requests) {
      expect(body.messages[0]!.content).toEqual([expect.not.objectContaining({ cache_control: expect.anything() }), expect.objectContaining({ cache_control: { type: "ephemeral" } })]);
      expect(body.cache_control).toEqual({ type: "ephemeral" });
    }
  });

  it("gives the Workflow agent back Claude's notes and tool calls, with no thinking text", async () => {
    const secondSave = { id: "toolu_save_2", name: "saveOutfit", input: { styleIcon: 2 } };
    anthropic.respond = () =>
      anthropic.requests.length === 1 ? anthropicToolUse([SAVE_CALL, secondSave], "Saving both Outfits.") : anthropicText("Both Outfits are saved.");

    const { steps } = await runTurns();

    expect(steps.map(({ text, toolCalls, toolResults, finishReason }) => ({ text, toolCalls, toolResults, finishReason }))).toEqual([
      {
        text: "Saving both Outfits.",
        toolCalls: [
          expect.objectContaining({ toolCallId: "toolu_save_1", toolName: "saveOutfit", input: { styleIcon: 1 } }),
          expect.objectContaining({ toolCallId: "toolu_save_2", toolName: "saveOutfit", input: { styleIcon: 2 } }),
        ],
        toolResults: [
          expect.objectContaining({ toolCallId: "toolu_save_1", output: { outfit: 1 } }),
          expect.objectContaining({ toolCallId: "toolu_save_2", output: { outfit: 2 } }),
        ],
        finishReason: "tool-calls",
      },
      { text: "Both Outfits are saved.", toolCalls: [], toolResults: [], finishReason: "stop" },
    ]);
    expect(steps.flatMap(({ reasoningText }) => reasoningText ?? [])).toEqual([]);
  });

  it.each([
    ["before writing anything", () => anthropicRefusal()],
    ["part-way, having written a note and a tool call", () => anthropicRefusal("Saving the first Outfit.", [SAVE_CALL])],
  ])("gives the Workflow agent back a turn Claude refuses %s as a refusal, with no tool call to run", async (_when, refusal) => {
    anthropic.respond = () => (anthropic.requests.length === 1 ? anthropicToolUse([SAVE_CALL]) : refusal());

    const { steps } = await runTurns();

    expect(steps.map(({ finishReason, toolCalls }) => ({ finishReason, toolCalls: toolCalls.length }))).toEqual([
      { finishReason: "tool-calls", toolCalls: 1 },
      { finishReason: "content-filter", toolCalls: 0 },
    ]);
    expect(steps.flatMap(({ toolResults }) => toolResults.map(({ output }) => output))).toEqual([{ outfit: 1 }]);
    expect(anthropic.requests).toHaveLength(2);
  });

  it("sends Claude every image inline, never by its link, so a seller photo is fetched before Claude is asked", async () => {
    anthropic.respond = () => anthropicText("All done.");
    const sellerPhoto = new TextEncoder().encode("the bytes of a seller's photo of a top");
    const asked: { url: string; isUrlSupportedByModel: boolean }[] = [];

    await generateText({
      model: ai.stylistModel(),
      messages: [{ role: "user", content: [{ type: "text", text: BRIEF }, { type: "file", mediaType: "image", data: new URL("https://cdn.seller.example/top.png") }] }],
      experimental_download: async (requests) =>
        requests.map(({ url, isUrlSupportedByModel }) => {
          asked.push({ url: url.toString(), isUrlSupportedByModel });
          return { data: sellerPhoto, mediaType: "image/png" };
        }),
    });

    expect(asked).toEqual([{ url: "https://cdn.seller.example/top.png", isUrlSupportedByModel: false }]);
    expect(imagesOf(anthropic.requests[0]!)).toEqual([{ type: "image", source: { type: "base64", media_type: "image/png", data: base64(sellerPhoto) }, cache_control: { type: "ephemeral" } }]);
  });

  it("answers whole turns only: a streamed one is refused before anything is sent", async () => {
    const error = await ai
      .stylistModel()
      .doStream({ prompt: [{ role: "user", content: [{ type: "text", text: BRIEF }, { type: "file", mediaType: PHOTO.mediaType, data: { type: "data", data: PHOTO.bytes } }] }] })
      .then(undefined, (thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(UnretryableAiError);
    expect(anthropic.requests).toEqual([]);
  });

  it("gets past an error that the AI SDK's own retries clear", async () => {
    anthropic.respond = () => (anthropic.requests.length === 1 ? anthropicError(529, "overloaded_error") : anthropicText("All done."));

    const { steps } = await runTurns();

    expect(steps.map(({ text }) => text)).toEqual(["All done."]);
    expect(anthropic.requests).toHaveLength(2);
  });

  it.each([
    [429, "rate_limit_error"],
    [500, "api_error"],
    [529, "overloaded_error"],
  ])(
    "fails the turn on Anthropic's %d %s once the AI SDK's own retries run out, as an error still worth retrying that carries nothing of the photo or the request",
    async (status, type) => {
      anthropic.respond = () => anthropicError(status, type);

      const error = await runTurns().catch((thrown: unknown) => thrown);

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
    "fails the turn on Anthropic's %d %s after one try, as an error not worth retrying that carries nothing of the photo or the request",
    async (status, type) => {
      anthropic.respond = () => anthropicError(status, type);

      const error = await runTurns().catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(UnretryableAiError);
      expectNothingOfTheRequest(error);
      expect(anthropic.requests).toHaveLength(1);
    },
  );

  it("fails a later turn carrying nothing of the conversation so far", async () => {
    anthropic.respond = () => (anthropic.requests.length === 1 ? anthropicToolUse([SAVE_CALL]) : anthropicError(400, "invalid_request_error"));

    const error = await runTurns().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(UnretryableAiError);
    expectNothingOfTheRequest(error);
    expect(inspect(error, { depth: Infinity })).not.toContain(SAVE_CALL.id);
  });

  it("asks at high effort, with thinking display omitted, never forcing a tool, with no temperature and no prefill", async () => {
    anthropic.respond = saveThenDone;

    await runTurns();

    for (const { body } of anthropic.requests) {
      expect(body.output_config).toEqual({ effort: "high" });
      expect(body.thinking).toEqual({ type: "adaptive", display: "omitted" });
      expect(body.tool_choice).toEqual({ type: "auto" });
      expect(body).not.toHaveProperty("temperature");
      expect(body.messages.at(-1)!.role).toBe("user");
    }
  });
});

/** A Stylist's prompt as a test gives it: the adapter sends whatever the Workflow agent is given. */
const PROMPT = "You are the AI Stylist in a styling app.";

/** The brief as a test gives it, in the conversation's first message beside the photo. */
const BRIEF = 'This Styling\'s brief, as JSON:\n{"styling":"First Styling","outfits":2}';

const SAVE_CALL = { id: "toolu_save_1", name: "saveOutfit", input: { styleIcon: 1 } };

/** Claude saving an Outfit on its first turn, then saying it's done on its second. */
function saveThenDone(): Response {
  return anthropic.requests.length === 1 ? anthropicToolUse([SAVE_CALL]) : anthropicText("All done.");
}

/**
 * Runs a Stylist on Claude as the Stylist's Workflow agent does: its prompt, its tools, and a
 * first message carrying the brief and the photo. Its one tool saves an Outfit, numbering them.
 */
async function runTurns() {
  let saved = 0;
  const agent = new WorkflowAgent({
    model: ai.stylistModel(),
    instructions: PROMPT,
    tools: {
      saveOutfit: tool({
        description: "Saves one Outfit.",
        inputSchema: z.object({ styleIcon: z.number().int() }),
        execute: async () => ({ outfit: (saved += 1) }),
      }),
    },
    stopWhen: isStepCount(5),
  });
  return agent.generate({
    messages: [{ role: "user", content: [{ type: "text", text: BRIEF }, { type: "file", mediaType: PHOTO.mediaType, data: PHOTO.bytes }] }],
  });
}

/** The error, however deeply it's looked into, holds neither the photo nor anything else of the request. */
function expectNothingOfTheRequest(error: unknown): void {
  const inspected = inspect(error, { depth: Infinity });
  expect(inspected).not.toContain(base64(PHOTO.bytes));
  expect(inspected).not.toContain("You check one photo for a styling app");
  expect(inspected).not.toContain(PROMPT);
  expect(inspected).not.toContain("First Styling");
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
