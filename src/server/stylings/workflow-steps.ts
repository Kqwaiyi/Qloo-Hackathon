import "server-only";

import type { LanguageModelV4 } from "@ai-sdk/provider";
import { FatalError, getStepMetadata, RetryableError } from "workflow";

import { UnretryableAiError } from "@/server/ai/provider";
import { getServices } from "@/server/app/services";
import { NoExchangeRateError } from "@/server/outfit-assembly/products";
import { ProductSearchRateLimitedError, UnretryableProductSearchError } from "@/server/product-search/provider";
import { QlooError, QlooRateLimitedError } from "@/server/qloo/client";

import type { StylingSteps } from "./run-styling";
import { ProductSearchDownError, StylingNotRunningError } from "./steps";
import { allStylingSteps } from "./stylist-steps";

/**
 * Runs one Styling step for the Workflow: on the app's services, telling the Workflow which
 * failures to retry. A step given its `maxRetries` learns whether this try is its last.
 */
export async function runWorkflowStep<T>(step: (steps: StylingSteps) => Promise<T>, { maxRetries }: { maxRetries?: number } = {}): Promise<T> {
  const lastTry = maxRetries === undefined ? undefined : getStepMetadata().attempt > maxRetries;
  const steps = allStylingSteps(await getServices(), { lastTry });
  try {
    return await step(steps);
  } catch (error) {
    throw asWorkflowError(error);
  }
}

/** Other failures keep the Workflow's own retries. */
function asWorkflowError(error: unknown): unknown {
  // A Styling that has finished, or been cancelled, stops: retrying can't change that. Nor can it
  // change that every product search it sent failed after their own retries.
  if (error instanceof StylingNotRunningError || error instanceof ProductSearchDownError) return new FatalError(error.message);
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
  // Nor will the product search refusing the API key, or a market's currency with no rate stored
  // until the next daily sweep.
  if (error instanceof UnretryableProductSearchError || error instanceof NoExchangeRateError) return new FatalError(error.message);
  return error;
}

/** The Stylist's model, as the app's AI supplies it, for one of the Workflow agent's model steps. */
export async function appStylistModel(): Promise<LanguageModelV4> {
  return (await getServices()).ai.stylistModel();
}
