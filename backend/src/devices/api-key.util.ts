import { createHash } from 'node:crypto';

export const API_KEY_HEADER = 'x-api-key';
export const API_KEY_SECURITY_NAME = 'api-key';

/** API keys are never stored in plain text: only their SHA-256 hex digest. */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf8').digest('hex');
}
