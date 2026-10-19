import { validateEnv } from './env.validation.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(40),
};

describe('validateEnv', () => {
  it('treats empty optional variables as not set', () => {
    const env = validateEnv({
      ...base,
      DASHBOARD_URL: '',
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_WEBHOOK_SECRET: '',
      TWILIO_ACCOUNT_SID: '',
      TWILIO_WEBHOOK_URL: '',
    });
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(env.TELEGRAM_MODE).toBe('polling');
    expect(env.TWILIO_WHATSAPP_FROM).toBe('whatsapp:+14155238886');
  });

  it('rejects malformed channel settings', () => {
    expect(() => validateEnv({ ...base, TWILIO_ACCOUNT_SID: 'nope' })).toThrow(
      /TWILIO_ACCOUNT_SID/,
    );
    expect(() => validateEnv({ ...base, TELEGRAM_MODE: 'push' })).toThrow(/TELEGRAM_MODE/);
    expect(() =>
      validateEnv({ ...base, TELEGRAM_WEBHOOK_URL: 'http://plain.example.com' }),
    ).toThrow(/TELEGRAM_WEBHOOK_URL/);
  });
});
