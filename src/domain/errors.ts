export type ErrorCode =
  | "INVALID_STATE"
  | "INVALID_SETTINGS"
  | "ENVIRONMENT_INVALID"
  | "PATH_OUTSIDE_REPOSITORY"
  | "PATH_COLLISION"
  | "UNSUPPORTED_SYNTAX"
  | "METADATA_INVALID"
  | "ASSET_FAILED"
  | "PROCESS_FAILED"
  | "PROCESS_TIMEOUT"
  | "CANCELLED"
  | "HEXO_VALIDATION_FAILED"
  | "GIT_UNSAFE"
  | "GIT_COMMIT_FAILED"
  | "PUSH_CONTEXT_CHANGED"
  | "PUSH_FAILED"
  | "RECOVERY_CONFLICT";

export class HexoSendError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "HexoSendError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function redact(value: string, secrets: readonly string[] = []): string {
  let result = value
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:api[_-]?key|token|access_token)=)[^&\s]+/gi, "$1[REDACTED]");
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join("[REDACTED]");
  }
  return result;
}
