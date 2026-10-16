import type { PhotoStyleWords, PhotoType } from "@/config/consultations";

// Our own AI provider interface (spec: "AI provider interface"). The domain depends only on this,
// never on the AI SDK or Gemini. It has nothing for age, ethnicity, skin tone, body measurements or
// health (ADR-0005).

export const PHOTO_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoMediaType = (typeof PHOTO_MEDIA_TYPES)[number];

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
  visible: PhotoVisibility;
  /** Yes or no only: what covers the hair is never returned or stored. */
  hairCovered: boolean;
  clearEnough: boolean;
  explicit: boolean;
  photoStyle: PhotoStyleWords;
}

export interface AiProvider {
  /** Checks a photo and reads its Photo Style. */
  checkPhoto(input: PhotoCheckInput): Promise<PhotoCheckReport>;
}
