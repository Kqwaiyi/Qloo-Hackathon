import type { StylePreference } from "@/config/accounts";
import type { AgeGroup, BudgetTier, PhotoStyleWords, PhotoType } from "@/config/consultations";
import { findCountry } from "@/config/countries";
import { type OutfitCardContent, type PieceView, signedLinkValidUntil } from "@/server/operations/consultations";
import type { OperationContext } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";
import { outfitPriceRange } from "@/server/outfit-assembly/brands";

// The public landing page, which walks visitors through frozen sample Consultations. Visitors
// never trigger a Qloo or AI call: the page shows only text that ships with it and images already
// in the private Blob store.

/**
 * A frozen sample Consultation: the text of a real one made on the Demo Account, which ships with
 * the page as static data, and where the landing page keeps its copies of the images.
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
  /** Its first Outfit, whose Style Icon is one of `styleIcons`. */
  outfit: { styleIconName: string; pieces: PieceView[] };
  /**
   * The landing page's own copies of its photo and its first Outfit's Preview in the private Blob
   * store, or null for a placeholder whose images haven't been captured yet.
   */
  images: { photoPathname: string; previewPathname: string } | null;
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
  /** Its first Outfit, as its card shows it. */
  outfit: OutfitCardContent;
  /** A signed link to the photo, valid for 1 hour from now, or null when there's none to show. */
  photoUrl: string | null;
  /** A signed link to the Preview, likewise. */
  previewUrl: string | null;
}

/**
 * The landing page: its frozen samples, with fresh 1-hour links to their images. An image the Blob
 * store can't link shows as a placeholder rather than failing the public page: local development
 * holds none of the samples' images.
 */
export async function readLandingPage(
  ctx: Pick<OperationContext, "auth" | "blob" | "clock" | "requestHeaders">,
  samples: LandingSamples,
): Promise<LandingPageView> {
  const linkValidUntil = signedLinkValidUntil(ctx.clock);
  const link = async (pathname: string): Promise<string | null> => {
    try {
      return await ctx.blob.signedUrl(pathname, linkValidUntil);
    } catch (error) {
      console.error(`Couldn't link the landing page's image at ${pathname}:`, error instanceof Error ? error.message : "unknown error");
      return null;
    }
  };
  const sampleView = async ({ countryCode, outfit, images, ...text }: LandingSample): Promise<LandingSampleView> => ({
    ...text,
    countryName: findCountry(countryCode)?.name ?? countryCode,
    outfit: {
      position: 1,
      styleIconName: outfit.styleIconName,
      priceRange: outfitPriceRange(outfit.pieces.map((pieceView) => pieceView.brand?.priceRange ?? null)),
      pieces: outfit.pieces,
    },
    photoUrl: images && (await link(images.photoPathname)),
    previewUrl: images && (await link(images.previewPathname)),
  });
  const [user, fullBody, face, bodyOnly] = await Promise.all([
    readSignedInUser(ctx),
    sampleView(samples.full_body),
    sampleView(samples.face),
    sampleView(samples.body_only),
  ]);
  return { signedIn: user !== null, samples: { full_body: fullBody, face, body_only: bodyOnly } };
}
