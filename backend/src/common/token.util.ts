import { createHash, randomBytes } from 'node:crypto';

/** Random URL-safe secret (API keys, refresh tokens). */
export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Secrets are only stored as their SHA-256 hex digest. */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
