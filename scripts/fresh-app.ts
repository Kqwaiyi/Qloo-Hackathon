// What the team's live scripts that run real Stylings share: an app of their own that lives only
// while they run, its database and Blob store in memory, so it reads and writes no other database and
// sends no email, and its Qloo calls and product searches count towards no backstop but its own.

import { randomBytes } from "node:crypto";

import { PRODUCT_SEARCH_STEP_MAX_RETRIES } from "@/config/product-search";
import { PREVIEW_STEP_MAX_RETRIES } from "@/config/stylings";
import type { AiProvider } from "@/server/ai/provider";
import { createAuth } from "@/server/auth/create-auth";
import type { BlobStore } from "@/server/blob/store";
import { systemClock } from "@/server/clock";
import { openPgliteDatabase } from "@/server/db/pglite";
import { CapturingEmailTransport } from "@/server/email/capturing";
import { createEmailSender } from "@/server/email/send-email";
import type { OperationContextWithoutRequest } from "@/server/operations/context";
import { productPhotosFromEnvironment, productSearchFromEnvironment } from "@/server/product-search/environment";
import { qlooClientFromEnvironment } from "@/server/qloo/client";
import { InlineStylingRunner } from "@/server/stylings/inline-runner";

/** A fresh app on the AI and Blob store it was given, with Stylings run in this process. */
export type FreshApp<A extends AiProvider, B extends BlobStore> = Omit<OperationContextWithoutRequest, "stylings" | "ai" | "blob"> & {
  ai: A;
  blob: B;
  stylings: InlineStylingRunner;
};

/**
 * A fresh app: a database in memory, the live Qloo and Channel3, `ai` and `blob`, a Blob store that
 * keeps what it's given in memory too, and Stylings run in this process, their steps tried again as
 * often as the Workflow tries them. Its email goes nowhere. Close its database once done.
 */
export async function createFreshApp<A extends AiProvider, B extends BlobStore>({ ai, blob }: { ai: A; blob: B }): Promise<FreshApp<A, B>> {
  const db = await openPgliteDatabase();
  const clock = systemClock;
  const productSearch = productSearchFromEnvironment("channel3");
  const stylings = new InlineStylingRunner({
    db,
    clock,
    qloo: qlooClientFromEnvironment({ db, clock }),
    ai,
    blob,
    productSearch,
    productPhotos: productPhotosFromEnvironment("channel3"),
  });
  stylings.previewRetries = PREVIEW_STEP_MAX_RETRIES;
  stylings.searchRetries = PRODUCT_SEARCH_STEP_MAX_RETRIES;
  const emailSender = createEmailSender({ db, clock, transport: new CapturingEmailTransport() });
  const auth = createAuth({
    db,
    clock,
    baseURL: "http://localhost:3000",
    secret: randomBytes(32).toString("base64"),
    emailSender,
    teamEmail: "team@example.invalid",
    blob,
    stylings,
    rateLimit: false,
  });
  // No Guest Page: its scripts style only accounts' Consultations.
  return { db, auth, clock, ai, blob, stylings, productSearch, guestIpSalt: null };
}
