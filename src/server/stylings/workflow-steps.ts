import "server-only";

import { FatalError, getStepMetadata, RetryableError } from "workflow";

import { UnretryableAiError } from "@/server/ai/provider";
import { getServices } from "@/server/app/services";
import { ProductSearchRateLimitedError, UnretryableProductSearchError } from "@/server/product-search/provider";
import { QlooError, QlooRateLimitedError } from "@/server/qloo/client";

import type { BuildOutfitsSteps } from "./build-outfits";
import { StylingNotRunningError, stylingSteps } from "./steps";

/**
 * Runs one "build Outfits" step for the Workflow: on the app's services, telling the Workflow which
 * failures to retry. A step given its `maxRetries` learns whether this try is its last.
 */
export async function runWorkflowStep<T>(step: (steps: BuildOutfitsSteps) => Promise<T>, { maxRetries }: { maxRetries?: number } = {}): Promise<T> {
  const lastTry = maxRetries === undefined ? undefined : getStepMetadata().attempt > maxRetries;
  const steps = stylingSteps(await getServices(), { lastTry });
  try {
    return await step(steps);
  } catch (error) {
    throw asWorkflowError(error);
  }
}

/** Other failures keep the Workflow's own retries. */
function asWorkflowError(error: unknown): unknown {
  // A Styling that has finished, or been cancelled, stops: retrying can't change that.
  if (error instanceof StylingNotRunningError) return new FatalError(error.message);
  // "Too many requests" from Qloo or the product search: wait as long as it asks, or back off
  // longer each time.
  if (error instanceof QlooRateLimitedError || error instanceof ProductSearchRateLimitedError) {
    const seconds = error.retryAfterSeconds ?? 2 ** getStepMetadata().attempt;
    return new RetryableError(error.message, { retryAfter: seconds * 1000 });
  }
  // Qloo refusing the request itself won't change on a retry either.
  if (error instanceof QlooError && error.status >= 400 && error.status < 500) return new FatalError(error.message);
  // Nor will an AI call that failed for good, such as a request Gemini rejects.
  if (error instanceof UnretryableAiError) return new FatalError(error.message);
  // Nor will the product search refusing the API key.
  if (error instanceof UnretryableProductSearchError) return new FatalError(error.message);
  return error;
}
