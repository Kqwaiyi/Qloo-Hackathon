import { type Category, type PieceCategory, withOnePiece } from "@/config/consultations";

import { type TailoredPieces, tailoredPiecesSchema } from "./provider";

// Checking a tailoring reply (spec: "AI provider interface", Bad output). The caller asks again
// once when it's bad, then reports "tailoring failed".

/** One tailored Piece, as it is stored. */
export interface TailoredPiece {
  category: PieceCategory;
  item: string;
  details: string;
  why: string;
  /** The Hairstyle's unknown-cut flag; null for every other Piece. */
  unknownCut: boolean | null;
}

// A price: a currency sign or code beside a number, or a number of dollars, euros, pounds…
const PRICE = /[$€£¥₹]\s?\d|\b(?:usd|eur|gbp)\s?\d|\d\s?(?:[$€£¥₹]|(?:usd|eur|gbp|dollars?|euros?|pounds?|bucks)\b)/i;

/**
 * The reply's Pieces, trimmed, when it matches the schema and our rules: exactly one Piece per
 * Category asked for, or one One-Piece in place of the Top and Bottom (ADR-0003), no empty field,
 * no price anywhere, and the Hairstyle saying whether its cut is unknown. Null otherwise.
 */
export function checkTailoredPieces(reply: unknown, categories: readonly Category[]): TailoredPiece[] | null {
  const parsed = tailoredPiecesSchema.safeParse(reply);
  if (!parsed.success) return null;
  const replied = parsed.data.pieces;
  const onePiece = withOnePiece(categories);
  // Neither list has a Category twice, so a reply as long as one, with all its Categories, has each once.
  const expected = [categories, ...(onePiece ? [onePiece] : [])].find(
    (pieceCategories: readonly PieceCategory[]) =>
      replied.length === pieceCategories.length && pieceCategories.every((category) => replied.some((candidate) => candidate.category === category)),
  );
  if (!expected) return null;
  const pieces: TailoredPiece[] = [];
  for (const category of expected) {
    const checked = checkPiece(replied.find((candidate) => candidate.category === category)!);
    if (!checked) return null;
    pieces.push(checked);
  }
  return pieces;
}

function checkPiece(replied: TailoredPieces["pieces"][number]): TailoredPiece | null {
  const item = replied.item.trim();
  const details = replied.details.trim();
  const why = replied.why.trim();
  if (!item || !details || !why) return null;
  if ([item, details, why].some((text) => PRICE.test(text))) return null;
  let unknownCut: boolean | null = null;
  if (replied.category === "hairstyle") {
    if (replied.unknownCut === undefined) return null;
    unknownCut = replied.unknownCut;
  }
  return { category: replied.category, item, details, why, unknownCut };
}
