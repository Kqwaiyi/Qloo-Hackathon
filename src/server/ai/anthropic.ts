import { type AnthropicLanguageModelOptions, createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV4, LanguageModelV4GenerateResult, LanguageModelV4Prompt, SharedV4ProviderOptions } from "@ai-sdk/provider";
import { type FilePart, generateText, type LanguageModel, type LanguageModelMiddleware, NoObjectGeneratedError, Output, type TextPart, wrapLanguageModel } from "ai";
import sharp from "sharp";
import * as z from "zod";

import {
  CLAUDE_PHOTO_CHECK_EFFORT,
  CLAUDE_PHOTO_CHECK_MODEL,
  CLAUDE_PREVIEW_MAX_LONG_SIDE_PX,
  CLAUDE_PREVIEW_VERDICT_EFFORT,
  CLAUDE_PREVIEW_VERDICT_MODEL,
  CLAUDE_SELLER_PHOTO_MAX_LONG_SIDE_PX,
  CLAUDE_STYLIST_EFFORT,
  CLAUDE_STYLIST_MAX_OUTPUT_TOKENS,
  CLAUDE_STYLIST_MODEL,
} from "@/config/ai";
import { CATEGORY_LABELS, PHOTO_STYLES, PHOTO_TYPE_LABELS, type PhotoStyle, type PhotoStyleWords } from "@/config/consultations";

import { oneLine, photoPart, withoutRequest, withoutRequestStillRetryable } from "./ai-sdk";
import {
  type AiProvider,
  type FirstDrawToJudge,
  type FirstDrawVerdict,
  type Photo,
  type PhotoCheckInput,
  type PhotoCheckResult,
  type PreviewPiece,
  type RedrawToJudge,
  type RedrawVerdict,
  UnretryableAiError,
  type VerdictResult,
  type WrongPreview,
} from "./provider";

// The Anthropic adapter (ADR-0011, ADR-0012): the photo check, the Stylist's model and each Preview's
// verdict on Claude, through the AI SDK's Anthropic provider. It owns the photo check's prompt and the
// verdict's; the Stylist's comes from the Stylist, with its tools and its brief. Images are always
// sent inline, as the request's own bytes.

export interface AnthropicAiOptions {
  apiKey: string;
  /** Tests send Anthropic's requests to a fake. */
  fetch?: typeof globalThis.fetch;
  /**
   * Wraps the model each Preview's verdict is asked of, as the Stylist check does to see the tokens
   * each call used. It must leave every call as it is.
   */
  verdictMiddleware?: LanguageModelMiddleware;
}

/**
 * The photo check, the Stylist and each Preview's verdict on real Claude, which costs money: they run
 * only when AI_PROVIDER switches real AI on. Each relies on the AI SDK's own retries, 2 by default:
 * the photo check's and the verdict's around their whole call, and the Stylist's, the Workflow
 * agent's around each turn.
 */
export class AnthropicAiProvider implements Pick<AiProvider, "checkPhoto" | "stylistModel" | "judgePreview"> {
  private readonly photoCheckModel: LanguageModel;
  private readonly claudeStylistModel: LanguageModelV4;
  private readonly previewVerdictModel: LanguageModel;

  constructor({ apiKey, fetch, verdictMiddleware }: AnthropicAiOptions) {
    const anthropic = createAnthropic({ apiKey, fetch });
    this.photoCheckModel = anthropic(CLAUDE_PHOTO_CHECK_MODEL);
    this.claudeStylistModel = wrapLanguageModel({ model: anthropic(CLAUDE_STYLIST_MODEL), middleware: STYLIST_MIDDLEWARE });
    const previewVerdictModel = anthropic(CLAUDE_PREVIEW_VERDICT_MODEL);
    this.previewVerdictModel = verdictMiddleware ? wrapLanguageModel({ model: previewVerdictModel, middleware: verdictMiddleware }) : previewVerdictModel;
  }

  judgePreview(input: FirstDrawToJudge): Promise<VerdictResult<FirstDrawVerdict>>;
  judgePreview(input: RedrawToJudge): Promise<VerdictResult<RedrawVerdict>>;
  async judgePreview(input: FirstDrawToJudge | RedrawToJudge): Promise<VerdictResult<FirstDrawVerdict | RedrawVerdict>> {
    try {
      const reply = await generateText({
        model: this.previewVerdictModel,
        system: PREVIEW_VERDICT_PROMPT,
        messages: [{ role: "user", content: await verdictRequest(input) }],
        output: Output.object({ schema: verdictReplySchema }),
        providerOptions: { anthropic: PREVIEW_VERDICT_OPTIONS },
      });
      // Claude refused to judge the Preview, so it gave no verdict.
      if (reply.finishReason === "content-filter") return { refused: true };
      const { verdict } = reply.output;
      if (verdict.judged !== JUDGED[input.draw]) throw new Error(`Claude gave a ${verdict.judged}'s verdict for a ${JUDGED[input.draw]}.`);
      if (verdict.judged === JUDGED.redraw) return { refused: false, verdict: { breaksHardRule: verdict.breaksHardRule, better: verdict.better, note: oneLine(verdict.note) } };
      if (verdict.right) return { refused: false, verdict: { right: true } };
      const correction = oneLine(verdict.correction);
      // A redraw is drawn with the correction, so a wrong Preview with none can't be put right.
      if (!correction) throw new Error("Claude found the Preview wrong, with no correction for its redraw.");
      return { refused: false, verdict: { right: false, breaksHardRule: verdict.breaksHardRule, correction, note: oneLine(verdict.note) } };
    } catch (error) {
      // Claude can refuse part-way, leaving what it wrote so far, which isn't the verdict.
      if (NoObjectGeneratedError.isInstance(error) && error.finishReason === "content-filter") return { refused: true };
      throw withoutRequest("The Preview's verdict", error);
    }
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
 * How each Preview's verdict is asked for: at its effort, thinking as Claude sees fit, with no
 * thinking text sent back, since nothing shows or stores it. No temperature and no prefill, which
 * Claude rejects.
 */
const PREVIEW_VERDICT_OPTIONS = {
  effort: CLAUDE_PREVIEW_VERDICT_EFFORT,
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
 * Turns are whole: nothing streams one, which couldn't take back a refused turn's tool calls. Every
 * image goes inline, as its own bytes: it reads none by its link.
 */
const STYLIST_MIDDLEWARE: LanguageModelMiddleware = {
  overrideSupportedUrls: () => ({}),
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

/**
 * What a Preview's verdict sends Claude, after its rules: the photo, with what Claude needs to judge
 * it by, and a cache breakpoint, then the Outfit's Pieces, their seller's photos and the images to
 * judge. Everything up to the breakpoint, the rules and the output format included, is the same for
 * every verdict of a Styling, of a first draw or a redraw, so its later verdicts read it from cache.
 */
async function verdictRequest(input: FirstDrawToJudge | RedrawToJudge): Promise<RequestPart[]> {
  const [sellerPhotos, toJudge] = await Promise.all([Promise.all(input.pieces.map(sellerPhotoOf)), imagesToJudge(input)]);
  return [
    text(`The photo, a ${PHOTO_TYPE_LABELS[input.photoType]}. ${input.hairCovered ? "The person's hair is covered." : "The person's hair isn't covered."}`),
    { ...photoPart(input.photo), providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
    text(["The Outfit's Pieces, in order:", ...input.pieces.map(pieceLine)].join("\n")),
    ...sellerPhotos.flat(),
    ...toJudge,
  ];
}

/** One part of a request: a line of text, or an image. */
type RequestPart = TextPart | FilePart;

/** A line of text in a request. */
function text(line: string): TextPart {
  return { type: "text", text: line };
}

/** A Product's seller's photo, after a line saying what it is: none for the Hairstyle, or a Product whose photo couldn't be fetched. */
async function sellerPhotoOf(piece: PreviewPiece): Promise<RequestPart[]> {
  if (piece.category === "hairstyle" || !piece.photo) return [];
  return [
    text(`The seller's own photo of the ${CATEGORY_LABELS[piece.category]}, "${oneLine(piece.title)}":`),
    await fitted(piece.photo, CLAUDE_SELLER_PHOTO_MAX_LONG_SIDE_PX),
  ];
}

/** The image to judge, and the verdict asked for: a first draw's, or a redraw's, beside the first image and that image's verdict. */
async function imagesToJudge(input: FirstDrawToJudge | RedrawToJudge): Promise<RequestPart[]> {
  if (input.draw === "first") {
    return [text("The Preview, as first drawn:"), await fitted(input.preview, CLAUDE_PREVIEW_MAX_LONG_SIDE_PX), text("Give a first draw's verdict on this Preview.")];
  }
  const [first, redraw] = await Promise.all([fitted(input.first, CLAUDE_PREVIEW_MAX_LONG_SIDE_PX), fitted(input.redraw, CLAUDE_PREVIEW_MAX_LONG_SIDE_PX)]);
  return [
    text("The Preview, as first drawn:"),
    first,
    text(firstVerdictText(input.firstVerdict)),
    text("The redraw, drawn again with that correction:"),
    redraw,
    text("Give a redraw's verdict on the redraw, beside the first image."),
  ];
}

/**
 * An image as Claude is sent it: scaled down to fit `maxLongSide` pixels on its long side, keeping
 * its proportions and format, or as it is when it already fits. Only Claude is sent the smaller one.
 */
async function fitted(image: Photo, maxLongSide: number): Promise<FilePart> {
  const { width, height } = await sharp(image.bytes).metadata();
  if (Math.max(width, height) <= maxLongSide) return photoPart(image);
  // Turned upright first, since the scaled image keeps none of the image's metadata, its orientation included.
  const scaled = await sharp(image.bytes).rotate().resize({ width: maxLongSide, height: maxLongSide, fit: "inside" }).toBuffer();
  return photoPart({ bytes: new Uint8Array(scaled), mediaType: image.mediaType });
}

/** One of the Outfit's Pieces, as the verdict's request lists it. */
function pieceLine(piece: PreviewPiece): string {
  const label = CATEGORY_LABELS[piece.category];
  if (piece.category === "hairstyle") return `- ${label}: ${oneLine(piece.details)}`;
  return `- ${label}: "${oneLine(piece.title)}", ${piece.photo ? "in its seller's photo below" : "with no seller's photo: check it against its title"}`;
}

/** What the first image's verdict found, as a redraw's verdict is told it. */
function firstVerdictText({ breaksHardRule, correction }: WrongPreview): string {
  return `Its verdict: it was wrong${breaksHardRule ? ", breaking a hard rule" : ""}. Its correction for the redraw: "${oneLine(correction)}"`;
}

/** What Claude calls the verdict on each draw of a Preview. */
const JUDGED = { first: "first draw", redraw: "redraw" } as const;

/**
 * What a Preview's verdict asks Claude for: a first draw's verdict, right or wrong, or a redraw's.
 * Every verdict is asked for in this one format, since a different one would miss the prompt cache.
 * Each form holds only its own fields, so a first draw judged right can't also break a hard rule.
 */
const verdictReplySchema = z.object({
  verdict: z.union([
    z.strictObject({ judged: z.literal(JUDGED.first), right: z.literal(true) }),
    z.strictObject({ judged: z.literal(JUDGED.first), right: z.literal(false), breaksHardRule: z.boolean(), correction: z.string(), note: z.string() }),
    z.strictObject({ judged: z.literal(JUDGED.redraw), breaksHardRule: z.boolean(), better: z.enum(["first", "redraw"]), note: z.string() }),
  ]),
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
- visible: whether each of these shows in the photo, for the main person. Be generous: everyday photos are rarely perfect. A part counts as visible when most of it shows, even if it is small in the frame, at an angle, partly in shadow, partly hidden behind something or slightly cut off at the edge. It is false only when it is mostly or entirely out of the photo or hidden.
  - face: their face, seen from the front, at an angle or from the side, even if small, a little blurred or partly covered by sunglasses, hair or a hand. False only when they face away or most of the face is out of the frame.
  - hair: their hair, even if only the top and sides show. False only when most of it is hidden, cut off by the frame or covered.
  - upperBody: their torso, roughly from the shoulders to the waist. True even if an arm, a bag or a hand covers part of it.
  - legs: their legs, roughly from the hips down towards the ankles. True even if one leg is partly behind the other or the ankles are slightly cut off.
  - feet: their feet or footwear. True if at least one foot or shoe shows, even partly, cut off a little at the frame's edge, or behind the other foot.
  A full-length photo of someone from head to feet shows face, hair, upperBody, legs and feet together; report every one of them as visible, not only the face.
- hairCovered: true or false only: whether something covers most of their hair, such as a hijab, a turban or a cap. Never say what covers it.
- clearEnough: whether the main person and what they're wearing can be made out. A slightly soft, dim, grainy or lightly filtered photo is still clear enough; only a photo too blurred, dark or distorted to make them out is not.
- explicit: whether the photo shows nudity or sexual content, on anyone in it.
- photoStyle: one or two words for the style of what they're wearing, strongest first, from this list only: ${PHOTO_STYLES.join(", ")}. A plain photo with no clear style is casual.

Everything else you report, except explicit, is about the main person alone, never anyone else in the photo. When there is nobody in the photo, every part of visible is false and photoStyle is casual.

Never guess the person's age. Never infer their ethnicity, skin tone, body measurements or health, and never mention them.`;

// The verdict's rules are the "Checking each Preview" rules and hard rules the Stylist's prompt
// carried before ADR-0012, with today's rules for corrections and notes. They ask for nothing that describes the
// person beyond whether a Preview changed their face, their head covering or anyone else
// (ADR-0005), and name only the most prominent person as the one styled (ADR-0009). They never
// change, so every verdict reads them from cache.

const PREVIEW_VERDICT_PROMPT = `You check Previews for a styling app, which suggests Outfits to its user. A Preview is the user's photo, edited by an image model to show them wearing an Outfit. Your verdict decides which Preview the user is shown, if any.

# What you're sent

The user is the most prominent person in the photo: "the person" always means them. Anyone else in the photo isn't styled. You're sent:
- the photo, with its Photo Type and whether the person's hair is covered;
- the Outfit's Pieces, in order: each garment by its title and its seller's own photo, when it has one, and the Hairstyle by a description of its cut;
- what to judge: a Preview as first drawn, or a redraw beside the first image and the first image's verdict.

# Checking a Preview

Check each Preview beside the photo and the seller's own photo of each of the Outfit's garments:
- Each Piece is the Outfit's: the same garment as its seller's photo, in its shape, colour and details, and the Hairstyle's cut as described. A seller's photo may show the garment on someone: compare only the garment. A garment with no seller's photo is checked against its title.
- On a Face Photo, only the hair changes.
- The person is still themselves: the same face, unchanged. On a Body-Only Photo, no face or head is added where the photo shows none.
- Any head covering is kept as it is, never removed or changed.
- Everyone else in the photo is left exactly as they are.

These are the hard rules: a changed or invented face, which on a Body-Only Photo means any face or head added; a removed or changed head covering; and anyone else in the photo changed. A Preview that breaks one must never reach the user. Anything else wrong, such as a wrong garment, a cut not as described or a changed pose, is a fault a redraw may put right.

# Your verdict

The request ends by asking for a first draw's verdict or a redraw's. Give that one.

A first draw's verdict, judged "first draw":
- right: whether the Preview is right. A Preview that's right needs nothing more.
- breaksHardRule: for a Preview that's wrong, whether it breaks a hard rule.
- correction: for a Preview that's wrong, one sentence for the image model on what to put right, which a redraw adds to its instruction, such as "Keep the face exactly as it is in the photo." or "The top should be the cropped denim jacket in its seller's photo." A Preview is redrawn only once, so put right what matters most: a hard rule first.
- note: for a Preview that's wrong, one short line to the user, as "you", on what was wrong, in styling terms, such as "The shoes should be the low-tops in their seller's photo." When it breaks a hard rule, say only that it didn't show them as they are, such as "This Preview didn't show you as you are."

A redraw's verdict, judged "redraw":
- breaksHardRule: whether the redraw breaks a hard rule.
- better: which of the two images, "first" or "redraw", shows the Outfit better. Judge the Outfit alone: the app weighs the hard rules itself.
- note: one short line to the user, as "you", on how the redraw came out, in styling terms, such as "The redraw shows the low-tops from their seller's photo." When it breaks a hard rule, say only that it didn't show them as they are.

# Corrections and notes

Never comment on the person's body, skin or face beyond whether the Preview changed them: not in a note, and not in a correction. Never say what covers their hair: call it their head covering. Never guess the person's age or gender. Never infer their ethnicity, skin tone, body measurements or health. Nothing you write mentions their body size or shape, weight, skin colour, ethnicity, gender or age, or what covers their hair. Nothing you write states a price, currency or cost. The user knows an AI checks their Previews: never claim to be a person.`;
