/** Guatemala does not observe DST: it is always UTC-6. */
export const GT_OFFSET_MS = -6 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the Guatemala calendar day that contains `at`. */
export function startOfDayGt(at: Date): Date {
  const ms = at.getTime();
  return new Date(Math.floor((ms + GT_OFFSET_MS) / DAY_MS) * DAY_MS - GT_OFFSET_MS);
}

/** YYYY-MM-DD in Guatemala time. */
export function dateKeyGt(at: Date): string {
  return new Date(at.getTime() + GT_OFFSET_MS).toISOString().slice(0, 10);
}
