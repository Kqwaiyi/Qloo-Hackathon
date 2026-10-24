import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import {
  AGE_GROUP_LABELS,
  BRAND_CATEGORIES,
  type BrandCategory,
  BUDGET_TIER_LABELS,
  CATEGORY_LABELS,
  PHOTO_TYPE_LABELS,
  type ProductCategory,
} from "@/config/consultations";
import { addsToCurrentOutfits, HAIR_LENGTH_PASS_OVERS_PER_STYLING, type StylingKind } from "@/config/stylings";
import { consultation, outfit, piece, styleIcon, styling } from "@/server/db/schema";
import { brandCategoryOf, needsBrands } from "@/server/outfit-assembly/brands";
import { outfitCategories } from "@/server/outfit-assembly/categories";
import type { Candidate } from "@/server/outfit-assembly/products";
import type { QlooBrand } from "@/server/qloo/client";

import { type BrandState, brandSteps, cantTakeRefusal, firstInPlay, listsOf, readBrandState, readBuilding, searchFor } from "./brand-steps";
import { type ListedStyleIcon, readBuildingBeside, readCurrentBrandNames, readStyleIconList } from "./current-outfits";
import { statesAPrice } from "./prices-in-text";
import {
  moveStage,
  readPhoto,
  readRunningStyling,
  refused,
  type StepTry,
  type StylingContext,
  StylingNotRunningError,
  stylingMarket,
  stylingSteps,
  whileRunning,
} from "./steps";
import {
  type PassOverReasonKind,
  passOverStyleIconInputSchema,
  type SaveOutfitInput,
  saveOutfitInputSchema,
  type StylistSteps,
  writeNoteInputSchema,
} from "./stylist";
import type { StylistBrief, StylistStyleIcon } from "./stylist-brief";
import { addSteps, addStylistNotes, asOneNote, hasNoteFromTurn, hasNotesFromTurn, type NoteFault, noteFault, notesIn, STEPS } from "./stylist-notes";

/** Every Styling step, on `ctx`, as this try of them. */
export function allStylingSteps(ctx: StylingContext, stepTry: StepTry = {}): StylistSteps {
  return { ...stylingSteps(ctx, stepTry), ...brandSteps(ctx, stepTry), ...stylistSteps(ctx) };
}

/** What each kind of Styling is called in the Stylist's brief. */
const STYLING_KINDS_BRIEFED: Record<StylingKind, string> = {
  first: "First Styling",
  more: "Show 2 more Outfits",
  budget_tier_change: "Budget Tier change",
  photo_style_change: "Photo Style change",
  try_again: "Try again",
};

/** The Stylist's own steps for its Style Icons, its Outfits and its notes, running on `ctx`. */
function stylistSteps(
  ctx: StylingContext,
): Pick<
  StylistSteps,
  | "readBrief"
  | "readTurnCap"
  | "readPhoto"
  | "readStyleIcons"
  | "passOverStyleIcon"
  | "saveOutfit"
  | "saveNotes"
  | "writeNote"
> {
  return {
    async saveNotes(stylingId, turn, texts) {
      const notes = notesIn(texts);
      await whileRunning(ctx.db, stylingId, async (tx) => {
        // A retry after the save went through has nothing left to do.
        if (await hasNotesFromTurn(tx, stylingId, turn)) return;
        await addStylistNotes(tx, stylingId, notes.map((text) => ({ kind: "note" as const, text, turn })));
      });
    },

    // A note the Stylist wrote with writeNote is checked like one in its text, but refused rather
    // than dropped, so it can write it again, as the reason for passing over a Style Icon is.
    async writeNote(stylingId, turn, input) {
      const parsed = writeNoteInputSchema.safeParse(input);
      if (!parsed.success) return refused("Give your note's text.");
      const note = asOneNote(parsed.data.text);
      const fault = noteFault(note);
      if (fault) return refused(NOTE_REFUSALS[fault]);
      return whileRunning(ctx.db, stylingId, async (tx) => {
        // A retry after the note went through, or a note the turn gave already, has nothing left to do.
        if (!(await hasNoteFromTurn(tx, stylingId, turn, note))) await addStylistNotes(tx, stylingId, [{ kind: "note", text: note, turn }]);
        return { ok: true, shown: true };
      });
    },

    // A Styling that ranks its own Style Icons finds them; any other is given its list, as it
    // stands: "Show 2 more Outfits" the current one, with the current Outfits' Brands, and Try again
    // the copy of the broken one's. A Budget Tier change is told its new Budget Tier.
    async readBrief(stylingId) {
      const running = await readRunningStyling(ctx.db, stylingId);
      const categories = outfitCategories(running);
      const brief: StylistBrief = {
        styling: STYLING_KINDS_BRIEFED[running.kind],
        photo: PHOTO_TYPE_LABELS[running.photoType],
        pieces: categories.map((category) => CATEGORY_LABELS[category]),
        photoStyle: running.photoStyle,
        ageGroup: AGE_GROUP_LABELS[running.ageGroup],
        outfits: running.outfitsWanted,
        ...(running.kind === "budget_tier_change" && running.budgetTier && { budgetTier: BUDGET_TIER_LABELS[running.budgetTier] }),
        ...(addsToCurrentOutfits(running.kind) && needsBrands(categories) && { brandsInUse: await readCurrentBrandNames(ctx.db, running.consultationId) }),
      };
      if (running.stage === "style_icons") return brief;
      const list = await readStyleIconList(ctx.db, (await readBuildingBeside(ctx.db, { stylingId, ...running })).styleIconList);
      const used = withStatus(list, "used");
      const passedOver = withStatus(list, "skipped");
      return {
        ...brief,
        styleIcons: withStatus(list, "unused"),
        ...(used.length > 0 && { styleIconsUsed: used }),
        ...(passedOver.length > 0 && { styleIconsPassedOver: passedOver }),
      };
    },

    async readTurnCap(stylingId) {
      const { limits } = await readRunningStyling(ctx.db, stylingId);
      return limits.turns;
    },

    async readPhoto(stylingId) {
      const [row] = await ctx.db
        .select({ photoPathname: consultation.photoPathname })
        .from(styling)
        .innerJoin(consultation, eq(consultation.id, styling.consultationId))
        .where(and(eq(styling.id, stylingId), eq(styling.status, "running")));
      if (!row) throw new StylingNotRunningError(stylingId);
      return readPhoto(ctx.blob, row.photoPathname);
    },

    async readStyleIcons(stylingId) {
      const running = await readRunningStyling(ctx.db, stylingId);
      const { styleIconList } = await readBuildingBeside(ctx.db, { stylingId, ...running });
      return withStatus(await readStyleIconList(ctx.db, styleIconList), "unused");
    },

    // Qloo's order binds the Stylist, but it may pass over a Style Icon (ADR-0010), saying why, in
    // style terms, in a note to the user. On a Face Photo, whose Hairstyle is the whole Outfit, it
    // may also pass over a few whose signature cut needs much more length than the user's hair has:
    // the tool, not the Stylist's judgement, keeps that to a Face Photo, and to a few a Styling.
    async passOverStyleIcon(stylingId, turn, input) {
      const parsed = passOverStyleIconInputSchema.safeParse(input);
      if (!parsed.success) return refused("Give the number of the Style Icon to pass over, the kind of your reason, style or hairLength, and your reason.");
      const asked = parsed.data;
      return whileRunning(ctx.db, stylingId, async (tx) => {
        const building = await readBuilding(tx, stylingId);
        if (building.stage === "style_icons") return refused("Find this Styling's Style Icons first, with findStyleIcons.");
        const icon = (await readStyleIconList(tx, building.styleIconList)).find((listed) => listed.number === asked.styleIcon);
        if (!icon) return refused(`There's no Style Icon ${asked.styleIcon} on your list.`);
        if (icon.status === "used") return refused(`${icon.name} has already inspired an Outfit.`);
        // A retry after the pass-over went through has nothing left to do.
        if (icon.status === "skipped") return { ok: true, styleIcon: icon.number };
        const forHairLength = asked.reasonKind === "hairLength";
        const adaptInstead = `adapt ${icon.name}'s signature cut to what the person's hair can do instead.`;
        if (forHairLength && building.photoType !== "face") return refused(`Only a Face Photo's Style Icons are passed over for hair length: ${adaptInstead}`);
        if (forHairLength && building.hairLengthPassOvers >= HAIR_LENGTH_PASS_OVERS_PER_STYLING) {
          return refused(`You've passed over ${HAIR_LENGTH_PASS_OVERS_PER_STYLING} Style Icons for hair length, the most a Styling may: ${adaptInstead}`);
        }
        // Checked like a note, but refused rather than dropped, so the Stylist can say it again.
        const reason = asOneNote(asked.reason);
        const fault = noteFault(reason);
        if (fault) return refused(REASON_REFUSALS[fault](icon.name, asked.reasonKind));
        await tx.update(styleIcon).set({ status: "skipped" }).where(eq(styleIcon.id, icon.id));
        if (forHairLength) {
          await tx
            .update(styling)
            .set({ hairLengthPassOvers: sql`${styling.hairLengthPassOvers} + 1` })
            .where(eq(styling.id, stylingId));
        }
        // A reason the turn wrote as a note already isn't shown twice.
        const noted = await hasNoteFromTurn(tx, stylingId, turn, reason);
        await addStylistNotes(tx, stylingId, [
          { kind: "step", text: STEPS.passedOverByStylist(icon.name) },
          ...(noted ? [] : [{ kind: "note" as const, text: reason, turn }]),
        ]);
        return { ok: true, styleIcon: icon.number };
      });
    },

    async saveOutfit(stylingId, input) {
      const parsed = saveOutfitInputSchema.safeParse(input);
      if (!parsed.success) return refused("That isn't an Outfit: give the Style Icon's number and each of its Pieces, as saveOutfit describes them.");
      const asked = parsed.data;
      return whileRunning(ctx.db, stylingId, async (tx, running) => {
        const saving = await readBuilding(tx, stylingId);
        if (saving.stage === "style_icons") return refused("Find this Styling's Style Icons first, with findStyleIcons.");
        const made = await tx.select({ id: outfit.id }).from(outfit).where(eq(outfit.stylingId, stylingId));
        if (made.length >= running.outfitsWanted) {
          return refused(`This Styling makes at most ${running.outfitsWanted} Outfits, and you've saved them all: finish.`);
        }
        const categories = outfitCategories(saving);
        const onBrands = needsBrands(categories);
        const beside = await readBuildingBeside(tx, { stylingId, ...saving });
        const state = onBrands ? await readBrandState(tx, ctx.clock, { stylingId, ...saving }) : null;
        const list = state?.list ?? (await readStyleIconList(tx, saving.styleIconList));
        const icon = list.find((listed) => listed.number === asked.styleIcon);
        if (!icon) return refused(`There's no Style Icon ${asked.styleIcon} on your list.`);
        if (icon.status !== "unused") {
          return refused(`${icon.name} has already ${icon.status === "used" ? "inspired an Outfit" : "been passed over"}: save the next Style Icon's.`);
        }
        // Qloo decides the order Style Icons are offered in (ADR-0010). For a body photo, one before
        // it whose Brands can't complete an Outfit still in play is passed over as this one saves.
        const passedOver: ListedStyleIcon[] = [];
        for (const before of list.filter((listed) => listed.status === "unused" && listed.number < icon.number)) {
          if (state?.pools.get(before.id) && !firstInPlay(state, before)) {
            passedOver.push(before);
            continue;
          }
          const fetchFirst = state && !state.pools.get(before.id) ? " fetch their Brands and" : "";
          return refused(`${before.name}, Style Icon ${before.number}, comes first:${fetchFirst} save their Outfit before ${icon.name}'s.`);
        }
        const hairstyle = categories.includes("hairstyle") ? checkedHairstyle(asked.hairstyle) : null;
        if (hairstyle && "refusal" in hairstyle) return refused(hairstyle.refusal);
        if (!categories.includes("hairstyle") && asked.hairstyle) return refused("This photo's Outfits have no Hairstyle: leave it out.");
        const products = state ? checkedProducts(state, icon, asked) : null;
        if (products && "refusal" in products) return refused(products.refusal);
        if (!state && (asked.brands || asked.top || asked.bottom || asked.onePiece || asked.shoes)) {
          return refused("A Face Photo's Outfits are a Hairstyle alone: give no Brands or Products.");
        }

        const outfitId = randomUUID();
        const position = beside.firstPosition + made.length;
        await tx.insert(outfit).values({
          id: outfitId,
          consultationId: running.consultationId,
          stylingId,
          position,
          styleIconId: icon.id,
          current: false,
          previewState: "pending",
          ...(products && {
            topBrandEntityId: products.brands.top.entityId,
            bottomBrandEntityId: products.brands.bottom.entityId,
            shoesBrandEntityId: products.brands.shoes.entityId,
            topBrandName: products.brands.top.name,
            bottomBrandName: products.brands.bottom.name,
            shoesBrandName: products.brands.shoes.name,
          }),
        });
        const market = stylingMarket(saving);
        await tx.insert(piece).values([
          ...(hairstyle ? [{ id: randomUUID(), outfitId, category: "hairstyle" as const, ...hairstyle }] : []),
          ...(products?.pieces ?? []).map(({ category, brand, product, why, pricedAt }) => ({
            id: randomUUID(),
            outfitId,
            category,
            item: product.title,
            why,
            brandEntityId: brand.entityId,
            brandName: brand.name,
            brandOfficialSite: brand.officialSite,
            brandPriceUsdMin: brand.priceRangeUsdMin,
            brandPriceUsdMax: brand.priceRangeUsdMax,
            productId: product.id,
            productPhotoUrl: product.photoUrl,
            offerUrl: product.offer.url,
            offerShopDomain: product.offer.shopDomain,
            price: product.offer.price,
            currency: product.offer.currency,
            market,
            pricedAt,
            available: true,
          })),
        ]);
        await tx.update(styleIcon).set({ status: "used" }).where(eq(styleIcon.id, icon.id));
        if (passedOver.length > 0) {
          await tx
            .update(styleIcon)
            .set({ status: "skipped" })
            .where(inArray(styleIcon.id, passedOver.map(({ id }) => id)));
        }
        await tx
          .update(styling)
          .set({ outfitsMade: sql`${styling.outfitsMade} + 1` })
          .where(eq(styling.id, stylingId));
        // A body photo's first Outfit moves it on from its Brands, both shown as Building Outfits.
        if (saving.stage === "brands") await moveStage(tx, ctx.clock, stylingId, "building_outfits");
        await addSteps(tx, stylingId, ...passedOver.map(({ name }) => STEPS.passedOver(name)), STEPS.outfitSaved(position, icon.name));
        return { ok: true, outfit: position };
      });
    },
  };
}

/** What a reason for passing over a Style Icon is about, by its kind, as a refusal asks for it. */
const REASON_ABOUT: Record<PassOverReasonKind, string> = {
  style: "about style",
  hairLength: "about the length their signature cut needs",
};

/** Why a reason of this kind for passing over a Style Icon is refused, by what's wrong with it as a note. */
const REASON_REFUSALS: Record<NoteFault, (styleIconName: string, kind: PassOverReasonKind) => string> = {
  empty: (name, kind) => `Say why you're passing over ${name}, ${REASON_ABOUT[kind]}.`,
  "states a price": (name) => `Your reason for passing over ${name} must not state a price.`,
  "too long": (name) => `Your reason for passing over ${name} is too long: keep it to a sentence.`,
};

/** Why a note written with writeNote is refused, by what's wrong with it. */
const NOTE_REFUSALS: Record<NoteFault, string> = {
  empty: "Your note is empty, so it wasn't shown.",
  "states a price": "Your note states a price, so it wasn't shown: nothing you write states a price.",
  "too long": "Your note is too long, so it wasn't shown: keep each note to one or two short sentences.",
};

/** The Style Icons with this status, as the Stylist is told them. */
function withStatus(list: readonly ListedStyleIcon[], status: ListedStyleIcon["status"]): StylistStyleIcon[] {
  return list.filter((icon) => icon.status === status).map(({ number, name, line }) => ({ number, name, line }));
}

/**
 * The Hairstyle as it's saved, trimmed, when every field is there and none states a price, or why
 * it's refused.
 */
function checkedHairstyle(hairstyle: SaveOutfitInput["hairstyle"]): { item: string; details: string; why: string; unknownCut: boolean } | { refusal: string } {
  if (!hairstyle) return { refusal: "The Outfit needs its Hairstyle: give its cut, details, cutKnown and why." };
  const { cut, details, cutKnown, why } = hairstyle;
  const fields = { cut: cut.trim(), details: details.trim(), why: why.trim() };
  const missing = Object.entries(fields).flatMap(([name, text]) => (text ? [] : [name]));
  if (missing.length > 0) return { refusal: `The Hairstyle's ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} empty.` };
  const priced = Object.entries(fields).flatMap(([name, text]) => (statesAPrice(text) ? [name] : []));
  if (priced.length > 0) return { refusal: `The Hairstyle's ${priced.join(" and ")} must not state a price.` };
  return { item: fields.cut, details: fields.details, why: fields.why, unknownCut: !cutKnown };
}

/** One Product Piece as it's saved: its Category, its Brand, the candidate picked, its why, and when its price was found. */
interface CheckedProduct {
  category: ProductCategory;
  brand: QlooBrand;
  product: Candidate;
  why: string;
  pricedAt: Date;
}

/** What the input calls each Product Piece. */
const PRODUCT_FIELDS: Record<ProductCategory, "top" | "bottom" | "onePiece" | "shoes"> = {
  top: "top",
  bottom: "bottom",
  one_piece: "onePiece",
  shoes: "shoes",
};

/**
 * A body photo's Outfit's Brands and Product Pieces, when they keep every rule, or why they're
 * refused: each Category's Brand is one of the Style Icon's, repeats no Outfit's Brand in the
 * Category, isn't out of play there, and is whichever of its top few still in play the Stylist chose
 * (ADR-0010), the Shoes' never the Top's or Bottom's; each Brand's search found Products; and each
 * Piece is one of its own search's candidates, or a One-Piece, one of the Top Brand's, takes the
 * place of the Top and the Bottom (ADR-0003), each "why" non-empty and stating no price.
 */
function checkedProducts(
  state: BrandState,
  icon: ListedStyleIcon,
  asked: SaveOutfitInput,
): { brands: Record<BrandCategory, QlooBrand>; pieces: CheckedProduct[] } | { refusal: string } {
  if (!state.pools.get(icon.id)) return { refusal: `Fetch ${icon.name}'s Brands first, with fetchBrands.` };
  if (!asked.brands) return { refusal: "Name the Outfit's Brands: its top, bottom and shoes, each by its name as fetchBrands listed it." };
  const lists = listsOf(state, icon);
  const brands = {} as Record<BrandCategory, QlooBrand>;
  for (const category of BRAND_CATEGORIES) {
    const named = asked.brands[category];
    const label = CATEGORY_LABELS[category];
    const brand = lists[category].find(({ name }) => name === named);
    if (!brand) return { refusal: `${named} isn't one of ${icon.name}'s ${label} Brands that the product search knows.` };
    const cantTake = cantTakeRefusal(state, icon, category, brand);
    if (cantTake) return { refusal: cantTake };
    brands[category] = brand;
  }
  if (brands.shoes.entityId === brands.top.entityId || brands.shoes.entityId === brands.bottom.entityId) {
    return { refusal: "An Outfit's Shoes never share their Brand with its Top or Bottom." };
  }
  // Each Brand is the Outfit's only once its search has found Products, which fixes it, even the
  // Bottom's when a One-Piece leaves it out.
  for (const category of BRAND_CATEGORIES) {
    if (!searchFor(state, icon, category, brands[category])?.candidates?.length) {
      return { refusal: `Search ${brands[category].name}'s ${CATEGORY_LABELS[category]}s for ${icon.name}'s Outfit first, with searchProducts.` };
    }
  }
  if (asked.onePiece && (asked.top || asked.bottom)) return { refusal: "A One-Piece takes the place of the Top and the Bottom: give no top or bottom with it." };
  const pieceCategories: ProductCategory[] = asked.onePiece ? ["one_piece", "shoes"] : ["top", "bottom", "shoes"];
  const pieces: CheckedProduct[] = [];
  for (const category of pieceCategories) {
    const label = CATEGORY_LABELS[category];
    const given = asked[PRODUCT_FIELDS[category]];
    if (!given) return { refusal: category === "shoes" ? "The Outfit needs its shoes." : "The Outfit needs its top and bottom, or a One-Piece in their place." };
    const brand = brands[brandCategoryOf(category)];
    const search = searchFor(state, icon, category, brand);
    if (category === "one_piece" && !search?.candidates?.length) {
      return { refusal: `${brand.name} has no One-Pieces found for ${icon.name}'s Outfit: search for them first, or give a top and a bottom.` };
    }
    const product = search?.candidates?.find(({ id }) => id === given.product.trim());
    if (!product) return { refusal: `${given.product} isn't one of the ${label}s searchProducts found for ${brand.name} and ${icon.name}'s Outfit.` };
    const why = given.why.trim();
    // "The Shoes' why", but "The Top's why".
    const whose = label.endsWith("s") ? `${label}'` : `${label}'s`;
    if (!why) return { refusal: `The ${whose} why is empty.` };
    if (statesAPrice(why)) return { refusal: `The ${whose} why must not state a price.` };
    pieces.push({ category, brand, product, why, pricedAt: search!.searchedAt });
  }
  return { brands, pieces };
}
