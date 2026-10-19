import {
  DEFAULT_PREFERENCES,
  isQuietTime,
  maskPhone,
  normalizePhone,
  retryDelayMs,
  shouldDeliver,
  whatsappWindowOpen,
} from './delivery-policy.js';

/** 23:30 in Guatemala (UTC-6). */
const NIGHT = new Date('2026-10-20T05:30:00Z');
/** 14:00 in Guatemala. */
const AFTERNOON = new Date('2026-10-19T20:00:00Z');
const quiet = { ...DEFAULT_PREFERENCES, quietStart: '22:00', quietEnd: '05:00' };

describe('isQuietTime', () => {
  it('handles ranges that cross midnight', () => {
    expect(isQuietTime(quiet, NIGHT)).toBe(true);
    expect(isQuietTime(quiet, AFTERNOON)).toBe(false);
    expect(isQuietTime(quiet, new Date('2026-10-20T10:59:00Z'))).toBe(true); // 04:59
    expect(isQuietTime(quiet, new Date('2026-10-20T11:00:00Z'))).toBe(false); // 05:00
  });

  it('handles ranges within the day', () => {
    const siesta = { quietStart: '13:00', quietEnd: '15:00' };
    expect(isQuietTime(siesta, AFTERNOON)).toBe(true);
    expect(isQuietTime(siesta, NIGHT)).toBe(false);
  });

  it('is off without both ends', () => {
    expect(isQuietTime({ quietStart: '22:00', quietEnd: null }, NIGHT)).toBe(false);
  });
});

describe('shouldDeliver', () => {
  const warning = { kind: 'alert_opened' as const, alertSeverity: 'warning' as const };
  const critical = { kind: 'alert_opened' as const, alertSeverity: 'critical' as const };

  it('respects the channel switch', () => {
    expect(
      shouldDeliver({ ...DEFAULT_PREFERENCES, telegram: false }, 'telegram', critical, AFTERNOON),
    ).toBe(false);
    expect(
      shouldDeliver({ ...DEFAULT_PREFERENCES, telegram: false }, 'whatsapp', critical, AFTERNOON),
    ).toBe(true);
  });

  it('holds warnings during quiet hours but never critical alerts', () => {
    expect(shouldDeliver(quiet, 'telegram', warning, NIGHT)).toBe(false);
    expect(shouldDeliver(quiet, 'telegram', critical, NIGHT)).toBe(true);
    expect(shouldDeliver(quiet, 'telegram', warning, AFTERNOON)).toBe(true);
  });

  it('can limit channels to critical alerts', () => {
    const prefs = { ...DEFAULT_PREFERENCES, includeWarnings: false };
    expect(shouldDeliver(prefs, 'whatsapp', warning, AFTERNOON)).toBe(false);
    expect(
      shouldDeliver(
        prefs,
        'whatsapp',
        { kind: 'alert_resolved', alertSeverity: 'warning' },
        AFTERNOON,
      ),
    ).toBe(false);
    expect(shouldDeliver(prefs, 'whatsapp', critical, AFTERNOON)).toBe(true);
  });

  it('follows the daily summary switch and always sends tests', () => {
    const off = { ...DEFAULT_PREFERENCES, dailySummary: false };
    expect(shouldDeliver(off, 'telegram', { kind: 'daily_summary' }, AFTERNOON)).toBe(false);
    expect(shouldDeliver(off, 'telegram', { kind: 'test' }, NIGHT)).toBe(true);
  });
});

describe('helpers', () => {
  it('tracks the WhatsApp 24-hour window', () => {
    expect(whatsappWindowOpen(null, AFTERNOON)).toBe(false);
    expect(whatsappWindowOpen(new Date(AFTERNOON.getTime() - 23 * 3_600_000), AFTERNOON)).toBe(
      true,
    );
    expect(whatsappWindowOpen(new Date(AFTERNOON.getTime() - 24 * 3_600_000), AFTERNOON)).toBe(
      false,
    );
  });

  it('backs off between attempts', () => {
    expect([1, 2, 3, 4, 9].map(retryDelayMs)).toEqual([
      30_000, 120_000, 600_000, 1_800_000, 1_800_000,
    ]);
  });

  it('normalizes phone numbers', () => {
    expect(normalizePhone('5555 1234')).toBe('+50255551234');
    expect(normalizePhone('+502 5555-1234')).toBe('+50255551234');
    expect(normalizePhone('0050255551234')).toBe('+50255551234');
    expect(normalizePhone('+1 (415) 523-8886')).toBe('+14155238886');
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('hola')).toBeNull();
    expect(maskPhone('+50255551234')).toBe('+502 •••• 1234');
  });
});
