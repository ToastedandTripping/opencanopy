/**
 * Shared error taxonomy for all WFS data-fetching clients.
 *
 * Unifies ForestCarbonFetchError, WatershedFetchError, and bare Errors
 * from wfs-client into a single discriminated error type. The `kind`
 * field lets callers branch on failure mode without parsing `.message`.
 */

export type FetchErrorKind = "network" | "http" | "rate-limit" | "timeout" | "abort";

export class DataFetchError extends Error {
  readonly kind: FetchErrorKind;
  readonly retryAfterSeconds?: number;

  constructor(kind: FetchErrorKind, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "DataFetchError";
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
