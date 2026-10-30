import { WorkflowAgent } from "@ai-sdk/workflow";
import { generateText, isStepCount, tool } from "ai";
import { inspect } from "node:util";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import * as z from "zod";

import type { ProductCategory } from "@/config/consultations";

import { AnthropicAiProvider } from "./anthropic";
import {
  type AnthropicContentBlock,
  anthropicError,
  anthropicJson,
  anthropicRefusal,
  anthropicText,
  anthropicToolUse,
  FakeAnthropic,
  imagesOf,
  type RecordedAnthropicRequest,
  textOf,
} from "./fake-anthropic";
import {
  type FirstDrawToJudge,
  type FirstDrawVerdict,
  type Photo,
  type PhotoCheckInput,
  type PhotoCheckReport,
  type PreviewPiece,
  type RedrawToJudge,
  type RedrawVerdict,
  UnretryableAiError,
  type WrongPreview,
} from "./provider";

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

  it("sends claude-opus-5-5 the photo inline, as its own bytes, with the API key", async () => {
    anthropic.respond = () => anthropicJson(REPORT);

    await ai.checkPhoto(PHOTO_CHECK);

    expect(anthropic.requests.map(({ url }) => url.href)).toEqual(["https://api.anthropic.com/v1/messages"]);
    const [request] = anthropic.requests;
    expect(request!.body.model).toBe("claude-opus-5-5");
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

describe("a Preview's verdict", () => {
  it("comes back right when Claude judges a first draw right", async () => {
    anthropic.respond = () => anthropicJson(firstDrawReply({ right: true }));

    const result = await ai.judgePreview(await firstDraw());

    expect(result).toEqual({ refused: false, verdict: { right: true } });
  });

  it("asks claude-opus-5-5 at medium effort for the verdict as structured output, with thinking display omitted, no temperature and no prefill, with the API key", async () => {
    anthropic.respond = () => anthropicJson(firstDrawReply({ right: true }));

    await ai.judgePreview(await firstDraw());

    expect(anthropic.requests.map(({ url }) => url.href)).toEqual(["https://api.anthropic.com/v1/messages"]);
    const { headers, body } = anthropic.requests[0]!;
    expect(headers.get("x-api-key")).toBe("test-api-key");
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.output_config).toEqual({
      effort: "medium",
      format: { type: "json_schema", schema: expect.objectContaining({ type: "object", required: ["verdict"] }) },
    });
    expect(body.thinking).toEqual({ type: "adaptive", display: "omitted" });
    expect(body).not.toHaveProperty("temperature");
    // The conversation ends on what's to judge: nothing begins Claude's reply for it.
    expect(body.messages.map(({ role }) => role)).toEqual(["user"]);
  });

  it("sends the rules, then the photo, with a cache breakpoint after it, then the Outfit's Pieces, their seller's photos and the Preview, every image inline", async () => {
    anthropic.respond = () => anthropicJson(firstDrawReply({ right: true }));
    const toJudge = await firstDraw();

    await ai.judgePreview(toJudge);

    const { body } = anthropic.requests[0]!;
    expect(body.system).toEqual([{ type: "text", text: expect.stringContaining("hard rules") }]);
    const content = contentOf(anthropic.requests[0]!);
    const photoAt = content.findIndex(({ type }) => type === "image");
    expect(content.slice(0, photoAt).map(({ type }) => type)).not.toContain("image");
    expect(content[photoAt]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64(PHOTO.bytes) }, cache_control: { type: "ephemeral" } });
    expect(content.filter((block) => "cache_control" in block)).toHaveLength(1);
    const after = content.slice(photoAt + 1);
    expect(after.filter(({ type }) => type === "image")).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: base64(sellerPhotoOf(toJudge, "top").bytes) } },
      { type: "image", source: { type: "base64", media_type: "image/webp", data: base64(toJudge.preview.bytes) } },
    ]);
    const textAfter = after.flatMap(({ text }) => text ?? []).join("\n");
    expect(textAfter).toContain("A textured crop, short at the sides and longer on top.");
    expect(textAfter).toContain("Cropped Denim Jacket");
    expect(textAfter).toContain("Canvas Low-Top Trainers");
  });

  it("asks Claude to judge by the hard rules, and to write its correction and note about the Preview alone, never the person, their head covering or a price", async () => {
    anthropic.respond = () => anthropicJson(firstDrawReply({ right: true }));

    await ai.judgePreview(await firstDraw());

    const text = textOf(anthropic.requests[0]!);
    expect(text).toContain(
      "These are the hard rules: a changed or invented face, which on a Body-Only Photo means any face or head added; a removed or changed head covering; and anyone else in the photo changed.",
    );
    expect(text).toContain("Anything else wrong, such as a wrong garment, a cut not as described or a changed pose, is a fault a redraw may put right.");
    expect(text).toContain("Never comment on the person's body, skin or face beyond whether the Preview changed them: not in a note, and not in a correction.");
    expect(text).toContain("Never say what covers their hair: call it their head covering.");
    expect(text).toContain("Never infer their ethnicity, skin tone, body measurements or health.");
    expect(text).toContain("Nothing you write states a price, currency or cost.");
  });

  it.each([
    ["a Body-Only Photo whose hair is covered", { photoType: "body_only", hairCovered: true }, "The photo, a Body-Only Photo. The person's hair is covered."],
    ["a Face Photo", { photoType: "face", hairCovered: false }, "The photo, a Face Photo. The person's hair isn't covered."],
  ] as const)("tells Claude it's judging %s, before the photo", async (_photo, facts, told) => {
    anthropic.respond = () => anthropicJson(firstDrawReply({ right: true }));

    await ai.judgePreview({ ...(await firstDraw()), ...facts });

    const content = contentOf(anthropic.requests[0]!);
    expect(content.slice(0, content.findIndex(({ type }) => type === "image"))).toEqual([{ type: "text", text: told }]);
  });

  it("sends a first draw's verdict and a redraw's the same settings, rules and photo up to the breakpoint, so a Styling's later verdicts read them from cache", async () => {
    anthropic.respond = () =>
      anthropic.requests.length === 1
        ? anthropicJson(firstDrawReply({ right: false, breaksHardRule: false, correction: "Keep the pose as it is in the photo.", note: "Your pose changed." }))
        : anthropicJson(redrawReply({ breaksHardRule: false, better: "redraw", note: "The redraw keeps your pose." }));

    await ai.judgePreview(await firstDraw());
    await ai.judgePreview(await redraw());

    const [first, second] = anthropic.requests.map((request) => {
      const { messages: _messages, ...settings } = request.body;
      const content = contentOf(request);
      return { settings, upToBreakpoint: content.slice(0, content.findIndex((block) => "cache_control" in block) + 1) };
    });
    expect(first!.upToBreakpoint.at(-1)).toMatchObject({ type: "image", cache_control: { type: "ephemeral" } });
    expect(second).toEqual(first);
  });

  it("sends a seller's photo larger than 768 pixels on its long side, and a Preview larger than 1024, scaled down to fit, keeping its proportions and format", async () => {
    anthropic.respond = () => anthropicJson(redrawReply({ breaksHardRule: false, better: "redraw", note: "The redraw shows your Outfit." }));
    const toJudge: RedrawToJudge = {
      ...(await redraw()),
      pieces: [
        { category: "top", title: "Cropped Denim Jacket", photo: await image(2000, 1500, "image/jpeg") },
        { category: "bottom", title: "Wide-Leg Trousers", photo: await image(800, 600, "image/png") },
        { category: "shoes", title: "Canvas Low-Top Trainers", photo: await image(1200, 2400, "image/webp") },
      ],
      first: await image(1500, 2000, "image/png"),
      redraw: await image(2048, 1536, "image/webp"),
    };

    await ai.judgePreview(toJudge);

    // The photo, sent first, isn't a real image here: the adapter never reads it.
    const sizes = await Promise.all(imagesOf(anthropic.requests[0]!).slice(1).map(sizeOf));
    expect(sizes).toEqual([
      { mediaType: "image/jpeg", format: "jpeg", width: 768, height: 576 },
      { mediaType: "image/png", format: "png", width: 768, height: 576 },
      { mediaType: "image/webp", format: "webp", width: 384, height: 768 },
      { mediaType: "image/png", format: "png", width: 768, height: 1024 },
      { mediaType: "image/webp", format: "webp", width: 1024, height: 768 },
    ]);
  });

  it("sends a seller's photo and a Preview that already fit, and the photo whatever its size, as they are", async () => {
    anthropic.respond = () => anthropicJson(firstDrawReply({ right: true }));
    const photo = await image(1600, 2000, "image/jpeg");
    const sellerPhoto = await image(768, 500, "image/png");
    const preview = await image(1024, 1024, "image/webp");

    await ai.judgePreview({ ...(await firstDraw()), photo, pieces: [{ category: "top", title: "Cropped Denim Jacket", photo: sellerPhoto }], preview });

    expect(imagesOf(anthropic.requests[0]!).map(({ source }) => source!.data)).toEqual([base64(photo.bytes), base64(sellerPhoto.bytes), base64(preview.bytes)]);
  });

  it("comes back wrong when Claude judges a first draw wrong, with whether it breaks a hard rule, its correction and its note", async () => {
    const wrong: WrongPreview = {
      right: false,
      breaksHardRule: false,
      correction: "The shoes should be the canvas low-top trainers in their title.",
      note: "The shoes should be the low-tops your Outfit has.",
    };
    anthropic.respond = () => anthropicJson(firstDrawReply(wrong));

    const result = await ai.judgePreview(await firstDraw());

    expect(result).toEqual({ refused: false, verdict: wrong });
  });

  it("sends a redraw's verdict both images and the first's verdict, and brings back whether the redraw breaks a hard rule, which image shows the Outfit better, and its note", async () => {
    const verdict: RedrawVerdict = { breaksHardRule: false, better: "redraw", note: "The redraw shows the low-tops your Outfit has." };
    anthropic.respond = () => anthropicJson(redrawReply(verdict));
    const toJudge = await redraw();

    const result = await ai.judgePreview(toJudge);

    expect(result).toEqual({ refused: false, verdict });
    const content = contentOf(anthropic.requests[0]!);
    expect(imagesOf(anthropic.requests[0]!).map(({ source }) => source!.data)).toEqual([
      base64(PHOTO.bytes),
      base64(sellerPhotoOf(toJudge, "top").bytes),
      base64(toJudge.first.bytes),
      base64(toJudge.redraw.bytes),
    ]);
    const firstAt = content.findIndex(({ source }) => source?.data === base64(toJudge.first.bytes));
    const redrawAt = content.findIndex(({ source }) => source?.data === base64(toJudge.redraw.bytes));
    const between = content.slice(firstAt + 1, redrawAt).flatMap(({ text }) => text ?? []).join("\n");
    expect(between).toContain(toJudge.firstVerdict.correction);
    expect(between).toMatch(/breaking a hard rule/);
  });

  it.each([
    ["a first draw, before writing anything", firstDraw, () => anthropicRefusal()],
    ["a first draw, part-way through its verdict", firstDraw, () => anthropicRefusal('{"verdict": {"judged": "first draw", ')],
    ["a redraw, before writing anything", redraw, () => anthropicRefusal()],
  ])("comes back refused when Claude refuses to judge %s", async (_when, toJudge, refusal) => {
    anthropic.respond = refusal;

    const result = await judge(await toJudge());

    expect(result).toEqual({ refused: true });
    expect(anthropic.requests).toHaveLength(1);
  });

  it("gets past an error that the AI SDK's own retries clear", async () => {
    anthropic.respond = () => (anthropic.requests.length === 1 ? anthropicError(529, "overloaded_error") : anthropicJson(firstDrawReply({ right: true })));

    const result = await ai.judgePreview(await firstDraw());

    expect(result).toEqual({ refused: false, verdict: { right: true } });
  });

  it.each([
    [429, "rate_limit_error"],
    [500, "api_error"],
    [529, "overloaded_error"],
  ])(
    "throws Anthropic's %d %s once the AI SDK's own retries run out, as an error still worth retrying that carries nothing of the photo or the request",
    async (status, type) => {
      anthropic.respond = () => anthropicError(status, type);

      const error = await ai.judgePreview(await redraw()).catch((thrown: unknown) => thrown);

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
  ])("throws Anthropic's %d %s after one try, as an error not worth retrying that carries nothing of the photo or the request", async (status, type) => {
    anthropic.respond = () => anthropicError(status, type);

    const error = await ai.judgePreview(await firstDraw()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(UnretryableAiError);
    expectNothingOfTheRequest(error);
    expect(anthropic.requests).toHaveLength(1);
  });

  it.each([
    ["isn't a verdict", { judged: "first draw", right: "mostly" }],
    ["judges a first draw right, yet breaking a hard rule", { judged: "first draw", right: true, breaksHardRule: true, correction: "Keep the face exactly as it is.", note: "" }],
    ["judges a first draw wrong, with no correction for its redraw", { judged: "first draw", right: false, breaksHardRule: false, correction: " ", note: "Your shoes changed." }],
  ])("throws when Claude's reply %s, as an error worth retrying that carries nothing of the photo or the request", async (_reply, verdict) => {
    anthropic.respond = () => anthropicJson({ verdict });

    const error = await ai.judgePreview(await firstDraw()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnretryableAiError);
    expectNothingOfTheRequest(error);
  });

  it("brings back a correction and a note Claude wrote over several lines as one line each", async () => {
    anthropic.respond = () =>
      anthropicJson({
        verdict: { judged: "first draw", right: false, breaksHardRule: false, correction: "The top should be\n  the cropped denim jacket.", note: "Your top\nchanged." },
      });

    const result = await ai.judgePreview(await firstDraw());

    expect(result).toEqual({
      refused: false,
      verdict: { right: false, breaksHardRule: false, correction: "The top should be the cropped denim jacket.", note: "Your top changed." },
    });
  });

  it.each([
    ["a first draw's verdict, given a redraw's", () => anthropicJson(redrawReply({ breaksHardRule: false, better: "first", note: "The first image shows your Outfit better." })), firstDraw],
    ["a redraw's verdict, given a first draw's", () => anthropicJson(firstDrawReply({ right: true })), redraw],
  ])("throws when asked for %s, as an error worth retrying that carries nothing of the photo or the request", async (_asked, reply, toJudge) => {
    anthropic.respond = reply;

    const error = await judge(await toJudge()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnretryableAiError);
    expectNothingOfTheRequest(error);
  });
});

/** Asks for the verdict on a first draw or a redraw, whichever the test gives. */
function judge(input: FirstDrawToJudge | RedrawToJudge) {
  return input.draw === "first" ? ai.judgePreview(input) : ai.judgePreview(input);
}

/** Claude's verdict on a redraw, as structured output sends it. */
function redrawReply(verdict: RedrawVerdict) {
  return { verdict: { judged: "redraw", ...verdict } };
}

/** The first draw `firstDraw` gives, redrawn after a verdict that found it broke a hard rule. */
async function redraw(): Promise<RedrawToJudge> {
  const { preview, ...drawnFrom } = await firstDraw();
  return {
    ...drawnFrom,
    draw: "redraw",
    first: preview,
    redraw: await image(768, 1024, "image/png"),
    firstVerdict: {
      right: false,
      breaksHardRule: true,
      correction: "Keep the face exactly as it is in the photo.",
      note: "This Preview didn't show you as you are.",
    },
  };
}

/** An image as Anthropic received it: its media type, and the format and size its bytes really have. */
async function sizeOf({ source }: AnthropicContentBlock) {
  const { format, width, height } = await sharp(Buffer.from(source!.data!, "base64")).metadata();
  return { mediaType: source!.media_type, format, width, height };
}

/** The content of the request's one message, as Anthropic receives it. */
function contentOf({ body }: RecordedAnthropicRequest): AnthropicContentBlock[] {
  const [message] = body.messages;
  return typeof message!.content === "string" ? [{ type: "text", text: message!.content }] : message!.content;
}

/** The seller's photo of the Piece in `category`, which the test gave it. */
function sellerPhotoOf({ pieces }: { pieces: readonly PreviewPiece[] }, category: ProductCategory): Photo {
  const piece = pieces.find((each) => each.category === category);
  if (!piece || piece.category === "hairstyle" || !piece.photo) throw new Error(`The test gave no seller's photo of a ${category}.`);
  return piece.photo;
}

/** Claude's verdict on a first draw, as structured output sends it: right, or wrong with what's wrong. */
function firstDrawReply(verdict: FirstDrawVerdict) {
  return { verdict: { judged: "first draw", ...verdict } };
}

/** A real image of a plain colour, `width` by `height` pixels, as a seller or the image model sends one. */
async function image(width: number, height: number, mediaType: "image/png" | "image/webp" | "image/jpeg" = "image/png"): Promise<Photo> {
  const plain = sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } } });
  const format = mediaType === "image/png" ? plain.png() : mediaType === "image/webp" ? plain.webp() : plain.jpeg();
  return { bytes: new Uint8Array(await format.toBuffer()), mediaType };
}

/** A Full-Body Photo's first draw to judge: a Hairstyle, a Top with its seller's photo, and Shoes whose photo couldn't be fetched. */
async function firstDraw(): Promise<FirstDrawToJudge> {
  return {
    draw: "first",
    photo: PHOTO,
    photoType: "full_body",
    hairCovered: false,
    pieces: [
      { category: "hairstyle", details: "A textured crop, short at the sides and longer on top." },
      { category: "top", title: "Cropped Denim Jacket", photo: await image(576, 768) },
      { category: "shoes", title: "Canvas Low-Top Trainers", photo: null },
    ],
    preview: await image(768, 1024, "image/webp"),
  };
}

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
  expect(inspected).not.toContain("You check Previews for a styling app");
  expect(inspected).not.toContain(PROMPT);
  expect(inspected).not.toContain("First Styling");
  expect(inspected).not.toContain("Cropped Denim Jacket");
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
