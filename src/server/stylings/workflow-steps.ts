import "server-only";

import { FatalError, getStepMetadata, RetryableError } from "workflow";

import { getServices } from "@/server/app/services";
import { QlooError, QlooRateLimitedError } from "@/server/qloo/client";

import type { BuildOutfitsSteps } from "./build-outfits";
import { StylingNotRunningError, stylingSteps } from "./steps";

/** Runs one "build Outfits" step for the Workflow: on the app's services, telling the Workflow which failures to retry. */
export async function runWorkflowStep<T>(step: (steps: BuildOutfitsSteps) => Promise<T>): Promise<T> {
  const steps = stylingSteps(await getServices());
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
  // "Too many requests": wait as long as Qloo asks, or back off longer each time.
  if (error instanceof QlooRateLimitedError) {
    const seconds = error.retryAfterSeconds ?? 2 ** getStepMetadata().attempt;
    return new RetryableError(error.message, { retryAfter: seconds * 1000 });
  }
  // Qloo refusing the request itself won't change on a retry either.
  if (error instanceof QlooError && error.status >= 400 && error.status < 500) return new FatalError(error.message);
  return error;
}
