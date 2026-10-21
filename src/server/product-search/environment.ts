import { channel3FromEnvironment } from "./channel3";
import { FakeProductSearch } from "./fake";
import type { ProductSearch } from "./provider";

/** Each product search PRODUCT_SEARCH can name, as the environment configures it. */
const PRODUCT_SEARCHES: Record<string, () => ProductSearch> = {
  fake: () => new FakeProductSearch(),
  channel3: channel3FromEnvironment,
};

/**
 * The product search PRODUCT_SEARCH names: the fake unless it says channel3, so Channel3, which
 * costs credits, runs only when explicitly switched on.
 */
export function productSearchFromEnvironment(): ProductSearch {
  const name = process.env.PRODUCT_SEARCH || "fake";
  const fromEnvironment = Object.hasOwn(PRODUCT_SEARCHES, name) ? PRODUCT_SEARCHES[name] : undefined;
  if (!fromEnvironment) throw new Error(`PRODUCT_SEARCH must be one of: ${Object.keys(PRODUCT_SEARCHES).join(", ")}.`);
  return fromEnvironment();
}
