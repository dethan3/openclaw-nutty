import { createHmac, timingSafeEqual } from "node:crypto";

import { NuttyError } from "../errors/nutty-error.js";

const SENSITIVE_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk|rk|pk)-(?:live|test|proj)-[A-Za-z0-9_-]{12,}\b/,
  /\b(?:api[_ -]?key|access[_ -]?token|client[_ -]?secret|password)\s*[:=]\s*\S{8,}/i,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
] as const;

type ConfirmationClaims = {
  hash: string;
  principalId: string;
  destinationId: string;
  expiresAt: number;
};

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(encodedClaims: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedClaims).digest("base64url");
}

export function containsSensitiveContent(content: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(content));
}

export class SensitiveContentPolicy {
  constructor(
    private readonly secret: string,
    private readonly ttlMilliseconds = 5 * 60 * 1_000,
  ) {}

  requireConfirmation(
    claims: Omit<ConfirmationClaims, "expiresAt">,
    confirmationToken: string | undefined,
    now: Date,
  ): void {
    if (confirmationToken !== undefined && this.verify(confirmationToken, claims, now)) {
      return;
    }

    const expiresAt = now.getTime() + this.ttlMilliseconds;
    throw new NuttyError(
      "SENSITIVE_CONTENT_CONFIRMATION_REQUIRED",
      "The content may contain a credential or another sensitive value. Confirm before saving it.",
      {
        recoveryAction: "confirm_sensitive_content",
        details: {
          confirmationToken: this.issue({ ...claims, expiresAt }),
          expiresAt: new Date(expiresAt).toISOString(),
        },
      },
    );
  }

  private issue(claims: ConfirmationClaims): string {
    const encodedClaims = encode(JSON.stringify(claims));
    return `${encodedClaims}.${sign(encodedClaims, this.secret)}`;
  }

  private verify(
    token: string,
    expected: Omit<ConfirmationClaims, "expiresAt">,
    now: Date,
  ): boolean {
    const [encodedClaims, suppliedSignature, extra] = token.split(".");
    if (encodedClaims === undefined || suppliedSignature === undefined || extra !== undefined) {
      return false;
    }

    const expectedSignature = sign(encodedClaims, this.secret);
    const supplied = Buffer.from(suppliedSignature);
    const actual = Buffer.from(expectedSignature);
    if (supplied.length !== actual.length || !timingSafeEqual(supplied, actual)) {
      return false;
    }

    try {
      const claims = JSON.parse(
        Buffer.from(encodedClaims, "base64url").toString("utf8"),
      ) as Partial<ConfirmationClaims>;
      return (
        claims.hash === expected.hash &&
        claims.principalId === expected.principalId &&
        claims.destinationId === expected.destinationId &&
        typeof claims.expiresAt === "number" &&
        claims.expiresAt >= now.getTime()
      );
    } catch {
      return false;
    }
  }
}
