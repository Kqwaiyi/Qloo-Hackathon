import { type AnthropicLanguageModelOptions, createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV4, LanguageModelV4GenerateResult, LanguageModelV4Prompt, SharedV4ProviderOptions } from "@ai-sdk/provider";
import { generateText, type LanguageModel, type LanguageModelMiddleware, NoObjectGeneratedError, Output, wrapLanguageModel } from "ai";
import * as z from "zod";

import {
  CLAUDE_PHOTO_CHECK_EFFORT,
  CLAUDE_PHOTO_CHECK_MODEL,
  CLAUDE_STYLIST_EFFORT,
  CLAUDE_STYLIST_MAX_OUTPUT_TOKENS,
  CLAUDE_STYLIST_MODEL,
} from "@/config/ai";
import { PHOTO_STYLES, type PhotoStyle, type PhotoStyleWords } from "@/config/consultations";

import { photoPart, withoutRequest, withoutRequestStillRetryable } from "./ai-sdk";
import { type AiProvider, type PhotoCheckInput, type PhotoCheckResult, UnretryableAiError } from "./provider";

// The Anthropic adapter (ADR-0011): the photo check and the Stylist's model on Claude, through the
// AI SDK's Anthropic provider. It owns the photo check's prompt; the Stylist's comes from the
// Stylist, with its tools and its brief. Photos are always sent inline, as the request's own bytes.

export interface AnthropicAiOptions {
  apiKey: string;
  /** Tests send Anthropic's requests to a fake. */
  fetch?: typeof globalThis.fetch;
}

/**
 * The photo check and the Stylist on real Claude, which costs money: they run only when AI_PROVIDER
 * switches real AI on. Both rely on the AI SDK's own retries, 2 by default: the photo check's around
 * its whole call, and the Stylist's, the Workflow agent's around each turn.
 */
export class AnthropicAiProvider implements Pick<AiProvider, "checkPhoto" | "stylistModel"> {
  private readonly photoCheckModel: LanguageModel;
  private readonly claudeStylistModel: LanguageModelV4;

  constructor({ apiKey, fetch }: AnthropicAiOptions) {
    const anthropic = createAnthropic({ apiKey, fetch });
    this.photoCheckModel = anthropic(CLAUDE_PHOTO_CHECK_MODEL);
    this.claudeStylistModel = wrapLanguageModel({ model: anthropic(CLAUDE_STYLIST_MODEL), middleware: STYLIST_MIDDLEWARE });
  }

  stylistModel(): LanguageModelV4 {
    return this.claudeStylistModel;
  }

  // The model isn't told which Photo Type was chosen, so it can't lean towards it: it reports what
  // it sees, and our code judges the photo against the Photo Type.
  async checkPhoto({ photo }: PhotoCheckInput): Promise<PhotoCheckResult> {
    try {
      const reply = await generateText({
        model: this.photoCheckModel,
        system: PHOTO_CHECK_PROMPT,
        messages: [{ role: "user", content: [photoPart(photo)] }],
        output: Output.object({ schema: photoCheckReplySchema }),
        providerOptions: { anthropic: PHOTO_CHECK_OPTIONS },
      });
      // Claude refused to look at the photo, so it wrote no report.
      if (reply.finishReason === "content-filter") return { blocked: true };
      const { output } = reply;
      return { blocked: false, report: { ...output, photoStyle: photoStyleWords(output.photoStyle) } };
    } catch (error) {
      // Claude can refuse part-way, leaving what it wrote so far, which isn't the report.
      if (NoObjectGeneratedError.isInstance(error) && error.finishReason === "content-filter") return { blocked: true };
      throw withoutRequest("The photo check", error);
    }
  }
}

/**
 * How the photo check is asked for: at its effort, thinking as Claude sees fit, with no thinking
 * text sent back, since nothing shows or stores it. No temperature and no prefill, which Claude rejects.
 */
const PHOTO_CHECK_OPTIONS = {
  effort: CLAUDE_PHOTO_CHECK_EFFORT,
  thinking: { type: "adaptive", display: "omitted" },
} satisfies AnthropicLanguageModelOptions;

/**
 * How each of the Stylist's turns is asked for: at its effort, thinking as Claude sees fit, with no
 * thinking text sent back, since nothing shows or stores it, and the conversation so far cached, so
 * the next turn reads it from cache. No temperature and no prefill, which Claude rejects. Nothing
 * here forces a tool call, which would make Claude skip its thinking.
 */
const STYLIST_OPTIONS = {
  effort: CLAUDE_STYLIST_EFFORT,
  thinking: { type: "adaptive", display: "omitted" },
  cacheControl: { type: "ephemeral" },
} satisfies AnthropicLanguageModelOptions;

/**
 * What makes Claude's model the Stylist's: each turn asked for as STYLIST_OPTIONS says, with its
 * stable prefix cached. A turn that fails throws an error with nothing of its request, the whole
 * conversation and the photo, before the Workflow agent's retries, its step's stored error or a
 * log can see it: one worth retrying still is, for those retries, and one Anthropic will give again
 * is an UnretryableAiError. A turn Claude refuses comes back as a refusal, its finish reason
 * content-filter, with none of the tool calls it had written so far, so nothing it asked for runs.
 * Turns are whole: nothing streams one, which couldn't take back a refused turn's tool calls.
 */
const STYLIST_MIDDLEWARE: LanguageModelMiddleware = {
  transformParams: async ({ params }) => ({
    ...params,
    prompt: withStablePrefixCached(params.prompt),
    maxOutputTokens: params.maxOutputTokens ?? CLAUDE_STYLIST_MAX_OUTPUT_TOKENS,
    providerOptions: withAnthropicOptions(params.providerOptions, STYLIST_OPTIONS),
  }),
  wrapGenerate: async ({ doGenerate }) => {
    let turn: LanguageModelV4GenerateResult;
    try {
      turn = await doGenerate();
    } catch (error) {
      throw withoutRequestStillRetryable("The Stylist's turn", error);
    }
    if (turn.finishReason.unified !== "content-filter") return turn;
    return { ...turn, content: turn.content.filter(({ type }) => type !== "tool-call") };
  },
  wrapStream: async () => {
    throw new UnretryableAiError("The Stylist's model answers whole turns only.");
  },
};

/**
 * The prompt with a cache breakpoint at the end of its first message, the brief and the photo,
 * which never change. Claude caches everything up to it, the Stylist's tools and prompt included,
 * so every turn reads the photo from cache, whatever happens later in the conversation.
 */
function withStablePrefixCached(prompt: LanguageModelV4Prompt): LanguageModelV4Prompt {
  const first = prompt.findIndex(({ role }) => role === "user");
  return prompt.map((message, index) => {
    if (index !== first || message.role !== "user" || message.content.length === 0) return message;
    const content = [...message.content];
    const last = content.at(-1)!;
    content[content.length - 1] = { ...last, providerOptions: withAnthropicOptions(last.providerOptions, { cacheControl: { type: "ephemeral" } }) };
    return { ...message, content };
  });
}

/** `providerOptions` with `options` added to Anthropic's, keeping everything else. */
function withAnthropicOptions(providerOptions: SharedV4ProviderOptions | undefined, options: SharedV4ProviderOptions[string]): SharedV4ProviderOptions {
  return { ...providerOptions, anthropic: { ...providerOptions?.anthropic, ...options } };
}

/**
 * What the photo check asks Claude for: just what the interface's report holds. The Photo Style
 * is a plain list here, which structured output handles better than a choice of two tuples.
 */
const photoCheckReplySchema = z.object({
  peopleCount: z.number().int().min(0),
  clearMainPerson: z.boolean(),
  visible: z.object({ face: z.boolean(), hair: z.boolean(), upperBody: z.boolean(), legs: z.boolean(), feet: z.boolean() }),
  hairCovered: z.boolean(),
  clearEnough: z.boolean(),
  explicit: z.boolean(),
  photoStyle: z.array(z.enum(PHOTO_STYLES)).min(1).max(2),
});

/** One or two words, strongest first, each once. */
function photoStyleWords([strongest, second]: PhotoStyle[]): PhotoStyleWords {
  return second && second !== strongest ? [strongest!, second] : [strongest!];
}

// The prompt asks only for what the interface returns, and never for age, ethnicity, skin tone,
// body measurements or health (ADR-0005).

const PHOTO_CHECK_PROMPT = `You check one photo for a styling app, which suggests clothes and a haircut to the main person in it. Report only what you can see in the photo. Never guess anything you can't see.

Reply with:
- peopleCount: how many people are in the photo. Count only real people, not people in pictures, posters or screens.
- clearMainPerson: whether one person is clearly the photo's subject, its main person: noticeably closer or larger than everyone else, and in focus, while anyone else is in the background, much smaller, blurred or partly cut off. Two or more people of similar prominence mean there is no clear main person: a couple's selfie, friends side by side, a group photo, or two people of the same size where one faces away. When in doubt, clearMainPerson is false. With one person in the photo, it is true; with nobody, it is false. As for peopleCount, people in pictures, posters or screens don't count.
- visible: whether each of these shows in the photo, for the main person:
  - face: their face, seen from the front or the side, not turned away or cut off.
  - hair: their hair. False when it is hidden, cut off by the frame or covered.
  - upperBody: their shoulders, chest and waist.
  - legs: their legs, from the hips to the ankles.
  - feet: both feet, with whatever they're wearing on them.
- hairCovered: true or false only: whether something covers most of their hair, such as a hijab, a turban or a cap. Never say what covers it.
- clearEnough: whether the photo is sharp, well lit and unfiltered enough to see the main person and what they're wearing.
- explicit: whether the photo shows nudity or sexual content, on anyone in it.
- photoStyle: one or two words for the style of what they're wearing, strongest first, from this list only: ${PHOTO_STYLES.join(", ")}. A plain photo with no clear style is casual.

Everything else you report, except explicit, is about the main person alone, never anyone else in the photo. When there is nobody in the photo, every part of visible is false and photoStyle is casual.

Never guess the person's age. Never infer their ethnicity, skin tone, body measurements or health, and never mention them.`;
