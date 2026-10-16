import { PHOTO_TYPES, type PhotoType } from "@/config/consultations";
import type { PhotoCheckReport, PhotoCheckResult } from "@/server/ai/provider";

/** Why a photo was rejected. Each reason has its own message at the photo step. */
export type PhotoRejection =
  | { reason: "not-appropriate" | "no-person" | "more-than-one-person" | "too-unclear" | "hair-not-visible" }
  | { reason: "wrong-photo-type"; looksLike: PhotoType };

export type PhotoCheckVerdict = { accepted: true; report: PhotoCheckReport } | { accepted: false; rejection: PhotoRejection };

/** Our code, not the model, decides whether a photo is accepted, checking in the spec's order. */
export function judgePhotoCheck(result: PhotoCheckResult, photoType: PhotoType): PhotoCheckVerdict {
  if (result.blocked || result.report.explicit) return rejected({ reason: "not-appropriate" });
  const { report } = result;
  if (report.peopleCount === 0) return rejected({ reason: "no-person" });
  if (report.peopleCount > 1) return rejected({ reason: "more-than-one-person" });
  if (!report.clearEnough) return rejected({ reason: "too-unclear" });
  if (PHOTO_TYPE_RULES[photoType](report)) return { accepted: true, report };
  const looksLike = PHOTO_TYPES.find((type) => PHOTO_TYPE_RULES[type](report));
  if (looksLike) return rejected({ reason: "wrong-photo-type", looksLike });
  if (photoType === "face" && report.visible.face && (!report.visible.hair || report.hairCovered)) {
    return rejected({ reason: "hair-not-visible" });
  }
  return rejected({ reason: "too-unclear" });
}

/** What each Photo Type needs the photo to show. Showing more is fine. */
const PHOTO_TYPE_RULES: Record<PhotoType, (report: PhotoCheckReport) => boolean> = {
  face: ({ visible, hairCovered }) => visible.face && visible.hair && !hairCovered,
  // Head to feet, face included. Covered hair is fine: its Outfits just have no Hairstyle.
  full_body: ({ visible }) => visible.face && visible.upperBody && visible.legs && visible.feet,
  // Shoulders to feet. A face that shows is fine too.
  body_only: ({ visible }) => visible.upperBody && visible.legs && visible.feet,
};

function rejected(rejection: PhotoRejection): PhotoCheckVerdict {
  return { accepted: false, rejection };
}
