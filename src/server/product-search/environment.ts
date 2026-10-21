import { ProductPhotos, type ProductPhotoTransport } from "@/server/product-photos/photos";

import { channel3FromEnvironment } from "./channel3";
import { FakeProductSearch, fakeCatalogueProductPhotos } from "./fake";
import type { ProductSearch } from "./provider";

/** A product search PRODUCT_SEARCH can name: how the environment configures it, and where its Products' photos come from. */
interface ProductSearchSetup {
  search: () => ProductSearch;
  photos: ProductPhotoTransport;
}

const PRODUCT_SEARCHES: Record<string, ProductSearchSetup> = {
  // The fake serves its catalogue's photos itself, so local development fetches nothing.
  fake: { search: () => new FakeProductSearch(), photos: fakeCatalogueProductPhotos },
  // Channel3's Products' photos come from their sellers, over the web.
  channel3: { search: channel3FromEnvironment, photos: (request) => fetch(request) },
};

/**
 * The product search PRODUCT_SEARCH names: the fake unless it says channel3, so Channel3, which
 * costs credits, runs only when explicitly switched on.
 */
export function productSearchFromEnvironment(): ProductSearch {
  return productSearchSetup().search();
}

/** Where Previews fetch Product photos: wherever the product search PRODUCT_SEARCH names gets them. */
export function productPhotosFromEnvironment(): ProductPhotos {
  return new ProductPhotos({ transport: productSearchSetup().photos });
}

function productSearchSetup(): ProductSearchSetup {
  const name = process.env.PRODUCT_SEARCH || "fake";
  const setup = Object.hasOwn(PRODUCT_SEARCHES, name) ? PRODUCT_SEARCHES[name] : undefined;
  if (!setup) throw new Error(`PRODUCT_SEARCH must be one of: ${Object.keys(PRODUCT_SEARCHES).join(", ")}.`);
  return setup;
}
