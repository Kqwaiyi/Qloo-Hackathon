import { APICallError, type FilePart, RetryError } from "ai";

import { type Photo, UnretryableAiError } from "./provider";

// What the adapters share, most of it on the Vercel AI SDK, which appears nowhere but the adapters.

/** The photo as the request's own bytes, which the AI SDK sends inline. */
export function photoPart({ bytes, mediaType }: Photo): FilePart {
  return { type: "file", mediaType, data: bytes };
}

/** Text from a seller or a model, its line breaks and runs of spaces made single spaces. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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

/**
 * A failed AI call as `withoutRequest` makes it, for a call the AI SDK still retries around it: one
 * worth retrying stays the AI SDK's own API call error, so its retries still see it, keeping only
 * the status and the response's headers, which say how long to wait.
 */
export function withoutRequestStillRetryable(call: string, error: unknown): Error {
  if (!APICallError.isInstance(error) || !error.isRetryable) return withoutRequest(call, error);
  return new APICallError({
    message: `${call} failed: ${error.message}`,
    url: error.url,
    requestBodyValues: undefined,
    statusCode: error.statusCode,
    responseHeaders: error.responseHeaders,
    isRetryable: true,
  });
}
