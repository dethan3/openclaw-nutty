import { z } from "zod";

export const nuttyErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "DESTINATION_NOT_FOUND",
  "DESTINATION_UNAVAILABLE",
  "SCHEMA_MISMATCH",
  "CONTENT_TOO_LARGE",
  "SENSITIVE_CONTENT_CONFIRMATION_REQUIRED",
  "CONFLICT",
  "RATE_LIMITED",
  "PROVIDER_TIMEOUT",
  "PARTIAL_WRITE",
  "NOT_FOUND",
  "INTERNAL_ERROR",
]);

export const recoveryActionSchema = z.enum([
  "authenticate",
  "confirm_sensitive_content",
  "choose_destination",
  "fix_destination_schema",
  "reduce_content",
  "retry",
  "refresh_and_retry",
]);

export const nuttyErrorPayloadSchema = z
  .object({
    code: nuttyErrorCodeSchema,
    message: z.string().min(1).max(1_000),
    retryable: z.boolean(),
    requestId: z.string().min(1).max(128),
    recoveryAction: recoveryActionSchema.optional(),
    details: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type NuttyErrorCode = z.infer<typeof nuttyErrorCodeSchema>;
export type NuttyErrorPayload = z.infer<typeof nuttyErrorPayloadSchema>;

export class NuttyError extends Error {
  readonly code: NuttyErrorCode;
  readonly retryable: boolean;
  readonly recoveryAction: z.infer<typeof recoveryActionSchema> | undefined;
  readonly details: Readonly<Record<string, string>> | undefined;

  constructor(
    code: NuttyErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      recoveryAction?: z.infer<typeof recoveryActionSchema>;
      details?: Readonly<Record<string, string>>;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "NuttyError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.recoveryAction = options.recoveryAction;
    this.details = options.details;
  }
}
