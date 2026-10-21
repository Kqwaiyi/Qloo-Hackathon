import "server-only";

import { aiFromEnvironment } from "@/server/ai/environment";
import type { AiProvider } from "@/server/ai/provider";
import { type BaseServices, createBaseServices } from "@/server/app/environment";
import { productSearchFromEnvironment } from "@/server/product-search/environment";
import type { ProductSearch } from "@/server/product-search/provider";
import { type QlooClient, qlooClientFromEnvironment } from "@/server/qloo/client";
import { workflowStylingRunner } from "@/server/stylings/workflow-runner";

export interface Services extends BaseServices {
  ai: AiProvider;
  /** Real Qloo everywhere, local development included, through the cache. */
  qloo: QlooClient;
  productSearch: ProductSearch;
}

// One set per server process. Kept on globalThis so Next.js's module reloading in development
// doesn't open the database twice.
const globalStore = globalThis as typeof globalThis & { outfitRecommenderServices?: Promise<Services> };

export function getServices(): Promise<Services> {
  globalStore.outfitRecommenderServices ??= createServices().catch((error: unknown) => {
    globalStore.outfitRecommenderServices = undefined;
    throw error;
  });
  return globalStore.outfitRecommenderServices;
}

async function createServices(): Promise<Services> {
  const base = await createBaseServices(workflowStylingRunner);
  // The fake adapter unless AI_PROVIDER switches Gemini on.
  const ai = aiFromEnvironment();
  const qloo = qlooClientFromEnvironment(base);
  // The fake unless PRODUCT_SEARCH switches Channel3 on, which refuses to start without its key.
  const productSearch = productSearchFromEnvironment();
  return { ...base, ai, qloo, productSearch };
}
