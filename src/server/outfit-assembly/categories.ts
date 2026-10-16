import { type Category, PHOTO_TYPE_CATEGORIES, type PhotoType } from "@/config/consultations";

// Categories by photo (spec: "Outfit assembly"). Pure: the caller reads the Consultation.

/** What a Consultation's photo shows that decides its Categories. */
export interface PhotoCategoryFacts {
  photoType: PhotoType;
  hairCovered: boolean;
}

/** The Categories each of the Consultation's Outfits fills: its Photo Type's, with no Hairstyle when the hair is covered. */
export function outfitCategories({ photoType, hairCovered }: PhotoCategoryFacts): Category[] {
  return PHOTO_TYPE_CATEGORIES[photoType].filter((category) => !(hairCovered && category === "hairstyle"));
}
