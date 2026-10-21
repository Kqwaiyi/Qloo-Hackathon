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
 * costs credits, runs only when explicitly switched on. A team script running live names its own.
 */
export function productSearchFromEnvironment(name = productSearchName()): ProductSearch {
  return productSearchSetup(name).search();
}

/** Where Previews fetch Product photos: wherever the product search PRODUCT_SEARCH (or a live team script) names gets them. */
export function productPhotosFromEnvironment(name = productSearchName()): ProductPhotos {
  return new ProductPhotos({ transport: productSearchSetup(name).photos });
}

function productSearchName(): string {
  return process.env.PRODUCT_SEARCH || "fake";
}

function productSearchSetup(name: string): ProductSearchSetup {
  const setup = Object.hasOwn(PRODUCT_SEARCHES, name) ? PRODUCT_SEARCHES[name] : undefined;
  if (!setup) throw new Error(`PRODUCT_SEARCH must be one of: ${Object.keys(PRODUCT_SEARCHES).join(", ")}.`);
  return setup;
}
