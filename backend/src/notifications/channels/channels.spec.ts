import type { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import {
  publicDashboardUrl,
  telegramMessage,
  whatsappMessage,
  type ChannelMessage,
} from './channel-format.js';
import { TwilioClient, twilioSignature } from './twilio.client.js';

const opened: ChannelMessage = {
  kind: 'alert_opened',
  severity: 'critical',
  title: 'Calor sin riego · Galpón <1>',
  body: '32.6 °C & subiendo',
  alertId: 'a1',
  deviceId: 'd1',
};

describe('channel messages', () => {
  it('escapes HTML for Telegram and adds the buttons', () => {
    const message = telegramMessage(opened, 'https://lasierra.tavcode.com');
    expect(message.html).toBe(
      '🔴 <b>Calor sin riego · Galpón &lt;1&gt;</b>\n32.6 °C &amp; subiendo',
    );
    expect(message.buttons).toEqual([
      [
        { text: '✋ Lo atiendo', callback_data: 'ack:a1' },
        { text: '📊 Ver galpón', url: 'https://lasierra.tavcode.com/galpones/d1' },
      ],
    ]);
  });

  it('leaves out "Lo atiendo" once the alert is resolved', () => {
    const message = telegramMessage({ ...opened, kind: 'alert_resolved', severity: null }, null);
    expect(message.buttons).toBeUndefined();
    expect(message.html.startsWith('✅')).toBe(true);
  });

  it('asks to reply OK on WhatsApp', () => {
    expect(whatsappMessage(opened, null)).toBe(
      '🔴 *Calor sin riego · Galpón <1>*\n32.6 °C & subiendo\n\nResponde *OK* si tú la atiendes.',
    );
  });

  it('only links to a public https dashboard (Telegram rejects localhost)', () => {
    expect(publicDashboardUrl('http://localhost:5180')).toBeNull();
    expect(publicDashboardUrl('https://localhost')).toBeNull();
    expect(publicDashboardUrl('https://lasierra.tavcode.com/')).toBe(
      'https://lasierra.tavcode.com',
    );
    expect(publicDashboardUrl(undefined)).toBeNull();
  });
});

describe('Twilio webhook signature', () => {
  const env: Partial<EnvironmentVariables> = {
    TWILIO_ACCOUNT_SID: `AC${'0'.repeat(32)}`,
    TWILIO_AUTH_TOKEN: 'secret-token',
    TWILIO_WHATSAPP_FROM: 'whatsapp:+14155238886',
    TWILIO_WEBHOOK_URL: 'https://api.example.com/api/whatsapp/webhook',
  };
  const client = new TwilioClient({
    get: (key: keyof EnvironmentVariables) => env[key],
  } as unknown as ConfigService<EnvironmentVariables, true>);
  const params = { From: 'whatsapp:+50255551234', Body: 'OK', AccountSid: env.TWILIO_ACCOUNT_SID! };

  it('accepts requests signed with the auth token and rejects anything else', () => {
    const signature = twilioSignature('secret-token', env.TWILIO_WEBHOOK_URL!, params);
    expect(client.validateSignature(signature, params)).toBe(true);
    expect(client.validateSignature(signature, { ...params, Body: 'ESTADO' })).toBe(false);
    expect(
      client.validateSignature(twilioSignature('other', env.TWILIO_WEBHOOK_URL!, params), params),
    ).toBe(false);
    expect(client.validateSignature(undefined, params)).toBe(false);
  });

  it('signs the URL followed by the sorted parameters', () => {
    // Same as signing the URL with each name and value appended in name order.
    expect(twilioSignature('key', 'https://x.test/hook', { b: '2', a: '1' })).toBe(
      twilioSignature('key', 'https://x.test/hooka1b2', {}),
    );
  });
});
