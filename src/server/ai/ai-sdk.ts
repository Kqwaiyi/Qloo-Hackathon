import { APICallError, type FilePart, RetryError } from "ai";

import { type Photo, UnretryableAiError } from "./provider";

// What the adapters share on the Vercel AI SDK, which appears nowhere but the adapters.

/** The photo as the request's own bytes, which the AI SDK sends inline. */
export function photoPart({ bytes, mediaType }: Photo): FilePart {
  return { type: "file", mediaType, data: bytes };
}

/**
 * A failed AI call as an error with only its message. The AI SDK's own errors carry the request,
 * and with it the photo, which must never reach a log or a Workflow run's stored error. One that
 * the provider will refuse again, such as a bad request or key, is an UnretryableAiError.
 */
export function withoutRequest(call: string, error: unknown): Error {
  const message = `${call} failed: ${error instanceof Error ? error.message : "unknown error"}`;
  const last = RetryError.isInstance(error) ? error.lastError : error;
  return APICallError.isInstance(last) && !last.isRetryable ? new UnretryableAiError(message) : new Error(message);
}
