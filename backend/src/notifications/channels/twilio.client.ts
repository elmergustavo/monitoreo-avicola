import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { ChannelError } from './channel-error.js';

/**
 * Twilio's signature for a webhook: base64(HMAC-SHA1(authToken, url + each
 * POST parameter name and value, sorted by name)).
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

/** WhatsApp messages through Twilio's REST API (plain fetch, no SDK). */
@Injectable()
export class TwilioClient {
  private readonly accountSid?: string;
  private readonly authToken?: string;
  readonly from: string;
  readonly sandboxJoinCode?: string;
  readonly webhookUrl?: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.accountSid = config.get('TWILIO_ACCOUNT_SID', { infer: true }) || undefined;
    this.authToken = config.get('TWILIO_AUTH_TOKEN', { infer: true }) || undefined;
    this.from = config.get('TWILIO_WHATSAPP_FROM', { infer: true });
    this.sandboxJoinCode = config.get('TWILIO_SANDBOX_JOIN_CODE', { infer: true }) || undefined;
    this.webhookUrl = config.get('TWILIO_WEBHOOK_URL', { infer: true }) || undefined;
  }

  get configured(): boolean {
    return Boolean(this.accountSid && this.authToken);
  }

  /** "+14155238886": the number people write to. */
  get senderNumber(): string {
    return this.from.replace(/^whatsapp:/, '');
  }

  /** True when the request really comes from Twilio. */
  validateSignature(signature: string | undefined, params: Record<string, string>): boolean {
    if (!this.authToken || !this.webhookUrl || !signature) return false;
    const expected = Buffer.from(twilioSignature(this.authToken, this.webhookUrl, params));
    const received = Buffer.from(signature);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  async sendWhatsApp(to: string, body: string): Promise<{ id: string }> {
    if (!this.accountSid || !this.authToken) {
      throw new ChannelError('WhatsApp no está configurado', { retryable: false });
    }
    let response: Response;
    try {
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ From: this.from, To: `whatsapp:${to}`, Body: body }),
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch (error) {
      throw new ChannelError(`Sin conexión con Twilio: ${(error as Error).message}`, {
        retryable: true,
      });
    }

    const result = (await response.json().catch(() => null)) as {
      sid?: string;
      message?: string;
      code?: number;
    } | null;
    if (response.ok && result?.sid) return { id: result.sid };
    throw new ChannelError(
      `Twilio: ${result?.message ?? `HTTP ${response.status}`}${result?.code ? ` (${result.code})` : ''}`,
      { retryable: response.status === 429 || response.status >= 500 },
    );
  }
}
