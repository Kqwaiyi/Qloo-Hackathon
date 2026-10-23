import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultOutput,
} from "@ai-sdk/provider";
import { createHash } from "node:crypto";

import type { PhotoStyleWords } from "@/config/consultations";
import type { FoundStyleIcons, RenderPreviewInput, SavedOutfit, SaveOutfitInput } from "@/server/stylings/stylist";
import { readStylistBrief, type StylistBrief, type StylistStyleIcon } from "@/server/stylings/stylist-brief";

// The fake AI's Stylist: a scripted fake model the Workflow agent calls in place of Claude. It
// keeps nothing between turns: each turn it reads the conversation it's sent, as a real model
// would, and plays the turn its scenario says, unless a test scripts that turn itself.

/** An image the fake was sent, by its fingerprint: the fake never keeps one. */
export interface FakeImage {
  mediaType: string;
  sha256: string;
}

/** One tool call the Stylist made in an earlier turn, and what came back: its output, or the error it read. */
export interface FakeStylistToolResult {
  toolName: string;
  input: unknown;
  output: unknown;
  /** The error the tool gave instead of an output, such as a refusal, or null. */
  error: string | null;
}

/** One turn the fake was asked for: what it was sent. */
export interface FakeStylistRequest {
  /** The turn's number, from 1. */
  turn: number;
  /** The brief in the conversation's first message, or null when there's none. */
  brief: StylistBrief | null;
  /** Every image in the conversation, in order. */
  images: FakeImage[];
  /** The tools offered this turn, by name. */
  tools: string[];
  /** Every earlier tool call and what came back, in order. */
  toolResults: FakeStylistToolResult[];
}

/** One tool call the fake makes. */
export interface FakeStylistCall {
  tool: string;
  input: unknown;
}

/** What the fake does with a turn: call some tools, at once, or write text and stop. */
export type FakeStylistTurn = { calls: FakeStylistCall[] } | { text: string };

/** How the fake's scenario plays the Stylist: making the fixed pipeline's choices, or one of its tailoring scenarios. */
export type FakeStylistScenario = "pass" | "unknown-cut" | "tailoring-fails";

/** A fake model whose every turn is what `play` makes of what it was sent. */
export function fakeStylistModel(play: (request: FakeStylistRequest) => Promise<FakeStylistTurn>): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "fake",
    modelId: "fake-stylist",
    supportedUrls: {},
    async doGenerate(options) {
      const request = requestOf(options);
      return resultOf(request.turn, await play(request));
    },
    async doStream() {
      throw new Error("The fake Stylist only answers whole turns.");
    },
  };
}

/**
 * The turn the fake plays by default, which makes the fixed pipeline's choices: it finds Style
 * Icons when it's offered the tool, saves an Outfit for each of the Style Icons in Qloo's order until
 * it has made as many as its brief allows, starts the Previews, draws each saved Outfit's, then
 * finishes. Every Hairstyle is the one the fake's tailoring makes. Its scenarios:
 * - `unknown-cut`: every Hairstyle's cut is marked unknown, based on the Photo Style, and its `why`
 *   doesn't name the Style Icon.
 * - `tailoring-fails`: every Outfit it saves breaks a rule, a different one each turn, so it keeps
 *   saving until the turn cap.
 */
export function fakeStylistTurn(request: FakeStylistRequest, scenario: FakeStylistScenario): FakeStylistTurn {
  const succeeded = (toolName: string) => request.toolResults.filter((result) => result.toolName === toolName && result.error === null);
  if (request.tools.includes("findStyleIcons") && succeeded("findStyleIcons").length === 0) return { calls: [{ tool: "findStyleIcons", input: {} }] };
  const saved = succeeded("saveOutfit");
  if (succeeded("startPreviews").length === 0) {
    const found = succeeded("findStyleIcons").at(-1)?.output as FoundStyleIcons | undefined;
    const styleIcons = found?.styleIcons ?? request.brief?.styleIcons ?? [];
    const savedFor = new Set(saved.map((result) => (result.input as SaveOutfitInput).styleIcon));
    const toSave = styleIcons.filter((icon) => !savedFor.has(icon.number)).slice(0, Math.max((request.brief?.outfits ?? 0) - saved.length, 0));
    if (toSave.length > 0) {
      const photoStyle = request.brief?.photoStyle ?? ["casual"];
      return { calls: toSave.map((icon) => ({ tool: "saveOutfit", input: fakeOutfit(icon, photoStyle, scenario, request.turn) })) };
    }
    return { calls: [{ tool: saved.length > 0 ? "startPreviews" : "finish", input: {} }] };
  }
  const drawn = new Set(succeeded("renderPreview").map((result) => (result.input as RenderPreviewInput).outfit));
  const toDraw = saved.map((result) => (result.output as SavedOutfit).outfit).filter((outfit) => !drawn.has(outfit));
  if (toDraw.length > 0) return { calls: toDraw.map((outfit) => ({ tool: "renderPreview", input: { outfit } })) };
  return { calls: [{ tool: "finish", input: {} }] };
}

/** The Outfit the fake saves for a Style Icon: the fake's Hairstyle, or in `tailoring-fails`, one that breaks a rule. */
function fakeOutfit(icon: StylistStyleIcon, photoStyle: PhotoStyleWords, scenario: FakeStylistScenario, turn: number): unknown {
  const { item, details, why, unknownCut } = fakeHairstyle(icon.name, photoStyle, scenario !== "unknown-cut");
  const outfit: SaveOutfitInput = { styleIcon: icon.number, hairstyle: { cut: item, details, cutKnown: !unknownCut, why } };
  if (scenario !== "tailoring-fails") return outfit;
  return BROKEN_OUTFITS[turn % BROKEN_OUTFITS.length]!(outfit);
}

/** Ways a broken model's Outfit breaks our rules, each made from a good one. */
const BROKEN_OUTFITS: ((outfit: SaveOutfitInput) => unknown)[] = [
  (outfit) => ({ ...outfit, hairstyle: { ...outfit.hairstyle, why: `${outfit.hairstyle.why} Yours for about $40.` } }),
  (outfit) => ({ ...outfit, hairstyle: { ...outfit.hairstyle, why: " " } }),
  (outfit) => ({ ...outfit, hairstyle: { ...outfit.hairstyle, cut: "" } }),
  (outfit) => ({ ...outfit, hairstyle: { ...outfit.hairstyle, details: `${outfit.hairstyle.details} About £25 at most salons.` } }),
  ({ styleIcon, hairstyle: { details: _, ...hairstyle } }) => ({ styleIcon, hairstyle }),
  ({ hairstyle }) => ({ hairstyle }),
];

/** A Hairstyle as the fake makes it: the Style Icon's signature cut, or when the cut isn't known, one based on the Photo Style. */
export function fakeHairstyle(
  styleIconName: string,
  photoStyle: PhotoStyleWords,
  cutKnown: boolean,
): { item: string; details: string; why: string; unknownCut: boolean } {
  const style = photoStyle[0];
  const styleWords = photoStyle.join(" and ");
  return cutKnown
    ? {
        item: `${capitalised(style)} textured cut with soft layers`,
        details: `A ${style} textured cut with soft layers, a little shorter at the sides, in your own hair colour.`,
        why: `${styleIconName}'s signature cut, reworked so your current hair carries it with your ${styleWords} Photo Style.`,
        unknownCut: false,
      }
    : {
        item: `${capitalised(style)} soft layered cut`,
        details: `A ${style} soft layered cut, trimmed to shape from your current length, in your own hair colour.`,
        why: `A ${styleWords} cut picked to go with this Outfit, and easy to reach from the hair you have now.`,
        unknownCut: true,
      };
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** What a turn's call sends the model, as a test reads it. */
function requestOf({ prompt, tools = [] }: LanguageModelV4CallOptions): FakeStylistRequest {
  const firstText = prompt.flatMap((message) => (message.role === "user" ? message.content : [])).find((part) => part.type === "text");
  return {
    turn: prompt.filter((message) => message.role === "assistant").length + 1,
    brief: firstText?.type === "text" ? readStylistBrief(firstText.text) : null,
    images: imagesIn(prompt),
    tools: tools.map((offered) => offered.name),
    toolResults: toolResultsIn(prompt),
  };
}

function imagesIn(prompt: LanguageModelV4Prompt): FakeImage[] {
  return prompt.flatMap((message) =>
    message.role === "user"
      ? message.content.flatMap((part) => {
          if (part.type !== "file" || part.data.type !== "data") return [];
          const bytes = typeof part.data.data === "string" ? Buffer.from(part.data.data, "base64") : part.data.data;
          return [{ mediaType: part.mediaType, sha256: createHash("sha256").update(bytes).digest("hex") }];
        })
      : [],
  );
}

function toolResultsIn(prompt: LanguageModelV4Prompt): FakeStylistToolResult[] {
  const calls = new Map<string, { toolName: string; input: unknown }>();
  const results: FakeStylistToolResult[] = [];
  for (const message of prompt) {
    if (message.role === "assistant") {
      for (const part of message.content) if (part.type === "tool-call") calls.set(part.toolCallId, { toolName: part.toolName, input: part.input });
    }
    if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type !== "tool-result") continue;
        const call = calls.get(part.toolCallId);
        results.push({ toolName: part.toolName, input: call?.input, ...outputOf(part.output) });
      }
    }
  }
  return results;
}

function outputOf(output: LanguageModelV4ToolResultOutput): { output: unknown; error: string | null } {
  switch (output.type) {
    case "json":
      return { output: output.value, error: null };
    case "text":
      return { output: output.value, error: null };
    case "error-text":
      return { output: null, error: output.value };
    case "error-json":
      return { output: null, error: JSON.stringify(output.value) };
    case "execution-denied":
      return { output: null, error: output.reason ?? "denied" };
    case "content":
      return { output: output.value, error: null };
  }
}

/** The fake's turn as the model's result: its tool calls, or its text. */
function resultOf(turn: number, played: FakeStylistTurn): LanguageModelV4GenerateResult {
  const usage = { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } };
  if ("text" in played) return { content: [{ type: "text", text: played.text }], finishReason: { unified: "stop", raw: "end_turn" }, usage, warnings: [] };
  return {
    content: played.calls.map(({ tool, input }, index) => ({ type: "tool-call", toolCallId: `turn-${turn}-call-${index + 1}`, toolName: tool, input: JSON.stringify(input) })),
    finishReason: { unified: "tool-calls", raw: "tool_use" },
    usage,
    warnings: [],
  };
}
