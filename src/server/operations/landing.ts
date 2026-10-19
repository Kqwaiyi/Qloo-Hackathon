import type { StylePreference } from "@/config/accounts";
import type { AgeGroup, BudgetTier, PhotoStyleWords, PhotoType } from "@/config/consultations";
import { findCountry } from "@/config/countries";
import type { OutfitCardContent, PieceView } from "@/server/operations/consultations";
import type { OperationContext } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";
import { outfitPriceRange } from "@/server/outfit-assembly/brands";

// The public landing page, which walks visitors through frozen sample Consultations. Visitors
// never trigger a Qloo or AI call: the page shows only text and images that ship with it.

/**
 * A frozen sample Consultation: the text of a real one made on the Demo Account, which ships with
 * the page as static data, and where the page's copies of its images are.
 */
export interface LandingSample {
  photoType: PhotoType;
  /** The profile it was made with. */
  stylePreference: StylePreference;
  ageGroup: AgeGroup;
  countryCode: string;
  /** Null for a Face Photo, which has none. */
  budgetTier: BudgetTier | null;
  photoStyle: PhotoStyleWords;
  /** The first Style Icons Qloo ranked, best first: by name, never with a picture. */
  styleIcons: string[];
  /** The Outfit it shows (its first, unless the team picked another), whose Style Icon is one of `styleIcons`. */
  outfit: { styleIconName: string; pieces: PieceView[] };
  /**
   * The page's own copies of its photo and that Outfit's Preview, which ship with it in `public/`,
   * as paths from the site's root (`/landing/samples/full_body/photo.jpg`). Null for a placeholder
   * whose images haven't been captured yet.
   */
  images: { photoPath: string; previewPath: string } | null;
}

/** The landing page's frozen samples, one of each Photo Type: the walkthrough's Full-Body Photo, then a Face Photo and a Body-Only Photo. */
export type LandingSamples = Record<PhotoType, LandingSample>;

export interface LandingPageView {
  /** Whether the visitor is signed in: the header then offers "Open the app" in place of "Sign in". */
  signedIn: boolean;
  samples: Record<PhotoType, LandingSampleView>;
}

export interface LandingSampleView extends Omit<LandingSample, "countryCode" | "outfit" | "images"> {
  countryName: string;
  /** The Outfit it shows, as its card shows it. */
  outfit: OutfitCardContent;
  /** The photo's path, or null when there's none to show. */
  photoUrl: string | null;
  /** The Preview's path, likewise. */
  previewUrl: string | null;
}

/** The landing page: its frozen samples, and whether the visitor is signed in. */
export async function readLandingPage(ctx: Pick<OperationContext, "auth" | "requestHeaders">, samples: LandingSamples): Promise<LandingPageView> {
  const sampleView = ({ countryCode, outfit, images, ...text }: LandingSample): LandingSampleView => ({
    ...text,
    countryName: findCountry(countryCode)?.name ?? countryCode,
    outfit: {
      position: 1,
      styleIconName: outfit.styleIconName,
      priceRange: outfitPriceRange(outfit.pieces.map((pieceView) => pieceView.brand?.priceRange ?? null)),
      pieces: outfit.pieces,
    },
    photoUrl: images?.photoPath ?? null,
    previewUrl: images?.previewPath ?? null,
  });
  const user = await readSignedInUser(ctx);
  return {
    signedIn: user !== null,
    samples: { full_body: sampleView(samples.full_body), face: sampleView(samples.face), body_only: sampleView(samples.body_only) },
  };
}
