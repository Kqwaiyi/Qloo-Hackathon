import type { ProductCategory } from "@/config/consultations";

import { type TailoredPieces, tailoredPiecesSchema, type TailoringCandidate, type TailoringPiece } from "./provider";

// Checking a tailoring reply (spec: "Tailoring contract"). The caller asks again once when it's
// bad, then reports "tailoring failed".

/**
 * One tailored Piece, as the reply gave it: the Hairstyle's cut, or the candidate Product a Product
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
  | { category: ProductCategory; productId: string; why: string };

/** A Piece a reply may give: the Hairstyle, or a Product Piece, which is one of its own candidates. */
type ExpectedPiece = { category: "hairstyle" } | { category: ProductCategory; candidates: readonly TailoringCandidate[] };

// A price: a currency sign or code beside a number, or a number of dollars, euros, pounds…
const PRICE = /[$€£¥₹]\s?\d|\b(?:usd|eur|gbp)\s?\d|\d\s?(?:[$€£¥₹]|(?:usd|eur|gbp|dollars?|euros?|pounds?|bucks)\b)/i;

/** Whether `text` states a price, which nothing the AI writes may: tailoring's replies, or the Stylist's Outfits. */
export function statesAPrice(text: string): boolean {
  return PRICE.test(text);
}

/**
 * The reply's Pieces, trimmed and in the order asked, when it matches the schema and our rules:
 * exactly one Piece per Category asked for, or one One-Piece in place of the Top and Bottom when the
 * Top came with One-Piece candidates (ADR-0003); each Brand Piece one of its own Category's
 * candidates by ID, and a One-Piece one of the One-Piece candidates; every "why" non-empty and free
 * of prices; and the Hairstyle a cut with its details, no price, and whether its cut is unknown.
 * Null otherwise.
 */
export function checkTailoredPieces(reply: unknown, asked: readonly TailoringPiece[]): TailoredPiece[] | null {
  const parsed = tailoredPiecesSchema.safeParse(reply);
  if (!parsed.success) return null;
  const replied = parsed.data.pieces;
  const expected: readonly ExpectedPiece[] | null = replied.some((repliedPiece) => repliedPiece.category === "one_piece") ? withOnePiece(asked) : asked;
  // As many as expected, each Category expected once: so no other Category either.
  if (!expected || replied.length !== expected.length) return null;
  const pieces: TailoredPiece[] = [];
  for (const expectedPiece of expected) {
    const inCategory = replied.filter((repliedPiece) => repliedPiece.category === expectedPiece.category);
    const checked = inCategory.length === 1 ? checkPiece(inCategory[0]!, expectedPiece) : null;
    if (!checked) return null;
    pieces.push(checked);
  }
  return pieces;
}

/**
 * The Pieces asked for with one One-Piece, from the Top's One-Piece candidates, in place of the Top
 * and the Bottom. Null unless both were asked for and the Top came with One-Piece candidates.
 */
function withOnePiece(asked: readonly TailoringPiece[]): ExpectedPiece[] | null {
  const top = asked.find((piece) => piece.category === "top");
  const onePieces = top?.category === "top" ? (top.onePieceCandidates ?? []) : [];
  if (onePieces.length === 0 || !asked.some((piece) => piece.category === "bottom")) return null;
  return asked.flatMap((piece): ExpectedPiece[] => {
    if (piece.category === "bottom") return [];
    return piece.category === "top" ? [{ category: "one_piece", candidates: onePieces }] : [piece];
  });
}

function checkPiece(replied: TailoredPieces["pieces"][number], expected: ExpectedPiece): TailoredPiece | null {
  const why = replied.why.trim();
  if (!why || PRICE.test(why)) return null;
  if (expected.category === "hairstyle") {
    const item = replied.item?.trim();
    const details = replied.details?.trim();
    if (!item || !details || PRICE.test(item) || PRICE.test(details) || replied.unknownCut === undefined) return null;
    return { category: "hairstyle", item, details, why, unknownCut: replied.unknownCut };
  }
  const productId = replied.productId?.trim();
  if (!productId || !expected.candidates.some((candidate) => candidate.id === productId)) return null;
  return { category: expected.category, productId, why };
}
