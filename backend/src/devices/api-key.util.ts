import { generateSecret, sha256 } from '../common/token.util.js';

export const API_KEY_HEADER = 'x-api-key';
export const API_KEY_SECURITY_NAME = 'api-key';

/** API keys are never stored in plain text: only their SHA-256 hex digest. */
export const hashApiKey = (apiKey: string): string => sha256(apiKey);

/** New device API key (hex, easy to paste into the firmware). */
export const generateApiKey = (): string =>
  Buffer.from(generateSecret(32), 'base64url').toString('hex');
