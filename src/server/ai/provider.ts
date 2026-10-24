import type { LanguageModelV4 } from "@ai-sdk/provider";

import type { PhotoStyleWords, PhotoType, ProductCategory } from "@/config/consultations";
import type { ImageModelRefusalReason, KeptPreview } from "@/config/stylings";

// Our own AI provider interface (spec: "AI provider interface"). The domain depends only on this,
// never on a provider: only the Stylist's model is one of the AI SDK's own, since the AI SDK's
// Workflow agent calls it (ADR-0011). Nothing it returns guesses age, ethnicity, skin tone, body
// measurements or health (ADR-0005): the age group the Stylist receives comes from sign-up.

export const PHOTO_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoMediaType = (typeof PHOTO_MEDIA_TYPES)[number];

export function isPhotoMediaType(contentType: string): contentType is PhotoMediaType {
  return (PHOTO_MEDIA_TYPES as readonly string[]).includes(contentType);
}

/** A photo's bytes, exactly as the browser shrank them. */
export interface Photo {
  bytes: Uint8Array;
  mediaType: PhotoMediaType;
}

export interface PhotoCheckInput {
  photo: Photo;
  /** The Photo Type the user chose. */
  photoType: PhotoType;
}

/** Which parts of the person the photo shows. */
export interface PhotoVisibility {
  face: boolean;
  hair: boolean;
  upperBody: boolean;
  legs: boolean;
  feet: boolean;
}

/** What the model reports seeing. Our code, not the model, decides whether the photo is accepted. */
export interface PhotoCheckReport {
  peopleCount: number;
  /**
   * Whether one person is clearly the photo's Main Person, noticeably closer or larger than anyone
   * else. Everything else here, but `explicit`, is about them. Used only to judge the photo, never
   * stored.
   */
  clearMainPerson: boolean;
  visible: PhotoVisibility;
  /** Yes or no only: what covers the hair is never returned or stored. */
  hairCovered: boolean;
  clearEnough: boolean;
  explicit: boolean;
  photoStyle: PhotoStyleWords;
}

/** What the model reported, or that it refused to look at the photo, so it reported nothing. */
export type PhotoCheckResult = { blocked: true } | { blocked: false; report: PhotoCheckReport };

/**
 * One Piece a Preview draws: the Hairstyle by its details, or a Product by its seller's own photo
 * (ADR-0008), or by its title alone when its photo couldn't be fetched.
 */
export type PreviewPiece =
  | { category: "hairstyle"; details: string }
  | { category: ProductCategory; title: string; photo: Photo | null };

/** What one Preview is drawn from. Never the Style Icon's name or image. */
export interface PreviewInput {
  photo: Photo;
  /** A Face Photo's Preview changes only the hair; a Body-Only Preview never invents a face. */
  photoType: PhotoType;
  /** The Pieces the user is shown wearing, in Category order: only these change. */
  pieces: readonly PreviewPiece[];
  /**
   * A redraw's: the Stylist's one sentence on what an earlier try got wrong, added to the Preview's
   * own instruction, never in its place. None on a first try.
   */
  correction?: string;
}

/** The image the model drew, in whatever format it sent, or its refusal and why. */
export type PreviewResult = { refused: false; image: Uint8Array } | { refused: true; reason: ImageModelRefusalReason };

/** What every verdict on an Outfit's Preview is given: what its Preview was drawn from. */
interface PreviewDrawnFrom {
  photo: Photo;
  /** A Face Photo's Preview changes only the hair; a Body-Only Preview never adds a face or a head. */
  photoType: PhotoType;
  /** Yes or no only: what covers the hair is never given (ADR-0005). */
  hairCovered: boolean;
  /**
   * The Outfit's Pieces, in Category order, as its Preview was drawn from them: each Product by its
   * title and its seller's photo, which may be missing, and the Hairstyle by its cut's details.
   */
  pieces: readonly PreviewPiece[];
}

/** A Preview as first drawn, to judge. */
export interface FirstDrawToJudge extends PreviewDrawnFrom {
  draw: "first";
  preview: Photo;
}

/** A Preview's redraw, to judge beside its first image and that image's verdict, which found it wrong. */
export interface RedrawToJudge extends PreviewDrawnFrom {
  draw: "redraw";
  first: Photo;
  redraw: Photo;
  firstVerdict: WrongPreview;
}

/**
 * A first draw's verdict on a Preview that's wrong. Nothing in it describes the person beyond whether
 * the Preview changed their face, their head covering or anyone else (ADR-0005).
 */
export interface WrongPreview {
  right: false;
  /**
   * Whether it breaks a hard rule: a changed or invented face, which on a Body-Only Photo means any
   * face or head added; a removed or changed head covering; or anyone else in the photo changed.
   * Anything else wrong is a fault a redraw may put right.
   */
  breaksHardRule: boolean;
  /** One sentence for the image model on what to put right, added to the Preview's own instruction. */
  correction: string;
  /** One line for the user on what was wrong, in styling terms. */
  note: string;
}

/** A first draw's verdict: whether the Preview is right, and if it isn't, what's wrong. */
export type FirstDrawVerdict = { right: true } | WrongPreview;

/** A redraw's verdict, which our code keeps an image by. */
export interface RedrawVerdict {
  /** Whether the redraw breaks a hard rule, as `WrongPreview` names them. */
  breaksHardRule: boolean;
  /** Which of the two images shows the Outfit better. */
  better: Exclude<KeptPreview, "none">;
  /** One line for the user on how the redraw came out, in styling terms. */
  note: string;
}

/** The model's verdict, or that it refused to judge the Preview, so it gave none. */
export type VerdictResult<Verdict> = { refused: true } | { refused: false; verdict: Verdict };

/**
 * An AI call that failed in a way asking again can't change, such as a request the provider
 * rejects or an API key it refuses. Every other error a provider throws is worth retrying.
 */
export class UnretryableAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnretryableAiError";
  }
}

export interface AiProvider {
  /** Checks a photo and reads its Photo Style. Throws if the check still errors after the AI SDK's own retries. */
  checkPhoto(input: PhotoCheckInput): Promise<PhotoCheckResult>;
  /**
   * The model the Stylist runs on (ADR-0011): the AI SDK's Workflow agent calls it once per turn,
   * with the Stylist's prompt, the whole conversation so far, the photo included, and the Stylist's
   * tools. It acts only through those tools, which check every rule, so whatever it asks for is
   * checked by our code. Every Styling runs on it.
   *
   * It answers whole turns, through `doGenerate`, and is configured for the Stylist: the prompt,
   * the tools and the conversation's first message, the brief and the photo, never change within a
   * Styling, so a real model caches them. Each Preview the Stylist checks comes back from its tool as
   * its image, and its Products' seller photos by their links: a model whose `supportedUrls` don't
   * cover a link is sent the photo itself, fetched inside its model step (`stylistModelOn`).
   * Nothing of its thinking comes back but what the model needs given back. A turn it refuses comes
   * back with finish reason content-filter and no tool calls. A turn that fails throws an error with
   * nothing of the request in it: one worth retrying for the AI SDK's retries, or an
   * `UnretryableAiError`.
   */
  stylistModel(): LanguageModelV4;
  /**
   * Renders one Preview: the photo with only the Pieces changed. A refusal comes back, and is final:
   * nothing asks again. Throws only on errors worth retrying, or an `UnretryableAiError` for one
   * that isn't. There's no quality check.
   */
  renderPreview(input: PreviewInput): Promise<PreviewResult>;
  /**
   * Judges one Preview against the photo and its Pieces (ADR-0012): a first draw, or a redraw
   * beside its first image. Only the verdict comes back; our code keeps an image by it. A verdict
   * the model refuses comes back refused. Throws only on errors worth retrying, with nothing of the
   * request in them, or an `UnretryableAiError` for one that isn't.
   */
  judgePreview(input: FirstDrawToJudge): Promise<VerdictResult<FirstDrawVerdict>>;
  judgePreview(input: RedrawToJudge): Promise<VerdictResult<RedrawVerdict>>;
}
