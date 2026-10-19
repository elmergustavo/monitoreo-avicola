import type { Decimal } from '@prisma/client/runtime/client';

/** Converts a Prisma Decimal (or null) to a plain number for JSON responses. */
export function toNumber(value: Decimal): number;
export function toNumber(value: Decimal | null): number | null;
export function toNumber(value: Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}
