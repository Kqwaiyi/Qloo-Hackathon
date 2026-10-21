import type { BrandCategory } from "@/config/consultations";

import { type TailoredPieces, tailoredPiecesSchema, type TailoringPiece } from "./provider";

// Checking a tailoring reply (spec: "Tailoring contract"). The caller asks again once when it's
// bad, then reports "tailoring failed".

/**
 * One tailored Piece, as the reply gave it: the Hairstyle's cut, or the candidate Product a Brand
 * Piece is, by its ID.
 */
export type TailoredPiece =
  | {
      category: "hairstyle";
      /** The cut. */
      item: string;
      /** One sentence on the cut, for the Preview. */
      details: string;
      why: string;
      unknownCut: boolean;
    }
  | { category: BrandCategory; productId: string; why: string };

// A price: a currency sign or code beside a number, or a number of dollars, euros, pounds…
const PRICE = /[$€£¥₹]\s?\d|\b(?:usd|eur|gbp)\s?\d|\d\s?(?:[$€£¥₹]|(?:usd|eur|gbp|dollars?|euros?|pounds?|bucks)\b)/i;

/**
 * The reply's Pieces, trimmed and in the order asked, when it matches the schema and our rules:
 * exactly one Piece per Category asked for, each Brand Piece one of its own Category's candidates by
 * ID, every "why" non-empty and free of prices, and the Hairstyle a cut with its details, no price,
 * and whether its cut is unknown. Null otherwise.
 */
export function checkTailoredPieces(reply: unknown, asked: readonly TailoringPiece[]): TailoredPiece[] | null {
  const parsed = tailoredPiecesSchema.safeParse(reply);
  if (!parsed.success) return null;
  const replied = parsed.data.pieces;
  // As many as asked, each Category asked for once: so no other Category either.
  if (replied.length !== asked.length) return null;
  const pieces: TailoredPiece[] = [];
  for (const askedPiece of asked) {
    const inCategory = replied.filter((repliedPiece) => repliedPiece.category === askedPiece.category);
    const checked = inCategory.length === 1 ? checkPiece(inCategory[0]!, askedPiece) : null;
    if (!checked) return null;
    pieces.push(checked);
  }
  return pieces;
}

function checkPiece(replied: TailoredPieces["pieces"][number], asked: TailoringPiece): TailoredPiece | null {
  const why = replied.why.trim();
  if (!why || PRICE.test(why)) return null;
  if (asked.category === "hairstyle") {
    const item = replied.item?.trim();
    const details = replied.details?.trim();
    if (!item || !details || PRICE.test(item) || PRICE.test(details) || replied.unknownCut === undefined) return null;
    return { category: "hairstyle", item, details, why, unknownCut: replied.unknownCut };
  }
  const productId = replied.productId?.trim();
  if (!productId || !asked.candidates.some((candidate) => candidate.id === productId)) return null;
  return { category: asked.category, productId, why };
}
