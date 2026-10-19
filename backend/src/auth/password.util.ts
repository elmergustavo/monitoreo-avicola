import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export const PASSWORD_MIN_LENGTH = 8;

export function hashPassword(password: string): Promise<string> {
  // Argon2id with the library defaults (OWASP-recommended parameters).
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Readable temporary password, e.g. "Kp7m-Qx2r-Wb9t". Users must change it on first login. */
export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const group = () =>
    Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}
