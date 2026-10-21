// Matching a Qloo Brand to the product search's Brand (spec: "Brand matching"). Pure: the product
// search looks the Brands up, and only an exact match of the normalised names counts.

/**
 * A Brand name as matching compares it: lower case, accents removed, punctuation and symbols
 * removed, spaces collapsed, and a leading "the" dropped.
 */
export function normaliseBrandName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/**
 * The product search's Brands whose names are exactly the Qloo Brand's once both are normalised, in
 * the product search's order. There's no fuzzy matching: a Brand with a similar name is another Brand.
 */
export function sameNameBrands<Listed extends { name: string }>(qlooName: string, listed: readonly Listed[]): Listed[] {
  const wanted = normaliseBrandName(qlooName);
  return listed.filter((brand) => normaliseBrandName(brand.name) === wanted);
}

/**
 * The Brand a Qloo Brand is, from those with its name (`sameNameBrands`): the only one, or of
 * several, the only one tied to the Qloo Brand's official site. Otherwise none, and the Brand counts
 * as not found. Whether a Brand is tied to the official site is asked only when there are several.
 */
export function matchedBrand<Listed>(sameName: readonly Listed[], tiedToOfficialSite: (brand: Listed) => boolean): Listed | null {
  if (sameName.length <= 1) return sameName[0] ?? null;
  const tied = sameName.filter(tiedToOfficialSite);
  return tied.length === 1 ? (tied[0] ?? null) : null;
}
