import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { ChannelError } from './channel-error.js';

/** Subset of the Telegram Bot API types this app uses. */
export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  migrate_to_chat_id?: number;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  my_chat_member?: {
    chat: TelegramChat;
    from: TelegramUser;
    new_chat_member: { status: string; user: TelegramUser };
  };
}

export type InlineButton = { text: string; callback_data: string } | { text: string; url: string };

export interface TelegramSendOptions {
  buttons?: InlineButton[][];
  replyTo?: number;
}

const API = 'https://api.telegram.org';

/**
 * Thin wrapper over the Telegram Bot API (plain fetch, no SDK).
 * Without TELEGRAM_BOT_TOKEN every method reports "not configured".
 */
@Injectable()
export class TelegramClient {
  private readonly logger = new Logger(TelegramClient.name);
  private readonly token?: string;
  private username?: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.token = config.get('TELEGRAM_BOT_TOKEN', { infer: true }) || undefined;
  }

  get configured(): boolean {
    return Boolean(this.token);
  }

  /** @username of the bot, read once from getMe. */
  async botUsername(): Promise<string | null> {
    if (!this.configured) return null;
    if (!this.username) {
      try {
        const me = await this.call<TelegramUser>('getMe', {});
        this.username = me.username;
      } catch (error) {
        this.logger.warn(`getMe failed: ${(error as Error).message}`);
        return null;
      }
    }
    return this.username ?? null;
  }

  async sendMessage(chatId: string | number, html: string, options: TelegramSendOptions = {}) {
    const message = await this.call<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: options.buttons ? { inline_keyboard: options.buttons } : undefined,
      reply_parameters: options.replyTo ? { message_id: options.replyTo } : undefined,
    });
    return { id: String(message.message_id) };
  }

  async sendDocument(chatId: string | number, file: Buffer, fileName: string, captionHtml: string) {
    const form = new FormData();
    form.set('chat_id', String(chatId));
    form.set('caption', captionHtml);
    form.set('parse_mode', 'HTML');
    form.set('document', new Blob([new Uint8Array(file)], { type: 'application/pdf' }), fileName);
    const message = await this.call<TelegramMessage>('sendDocument', form);
    return { id: String(message.message_id) };
  }

  answerCallback(callbackId: string, text: string) {
    return this.call('answerCallbackQuery', { callback_query_id: callbackId, text });
  }

  editButtons(chatId: string | number, messageId: number, buttons: InlineButton[][]) {
    return this.call('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: buttons },
    });
  }

  getUpdates(offset: number, timeoutSeconds: number, signal: AbortSignal) {
    return this.call<TelegramUpdate[]>(
      'getUpdates',
      {
        offset,
        timeout: timeoutSeconds,
        allowed_updates: ['message', 'callback_query', 'my_chat_member'],
      },
      signal,
    );
  }

  setWebhook(url: string, secret?: string) {
    return this.call('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query', 'my_chat_member'],
      drop_pending_updates: false,
    });
  }

  deleteWebhook() {
    return this.call('deleteWebhook', { drop_pending_updates: false });
  }

  setCommands(commands: { command: string; description: string }[]) {
    return this.call('setMyCommands', { commands });
  }

  private async call<T = unknown>(
    method: string,
    payload: Record<string, unknown> | FormData,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!this.token) throw new ChannelError('Telegram no está configurado', { retryable: false });
    let response: Response;
    try {
      response = await fetch(`${API}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: payload instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
        body: payload instanceof FormData ? payload : JSON.stringify(payload),
        signal: signal ?? AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError' && signal?.aborted) throw error;
      throw new ChannelError(`Sin conexión con Telegram: ${(error as Error).message}`, {
        retryable: true,
      });
    }

    const body = (await response.json().catch(() => null)) as {
      ok: boolean;
      result?: T;
      description?: string;
      parameters?: { retry_after?: number; migrate_to_chat_id?: number };
    } | null;
    if (response.ok && body?.ok) return body.result as T;

    const description = body?.description ?? `HTTP ${response.status}`;
    throw new ChannelError(`Telegram: ${description}`, {
      // 429 and 5xx are temporary; 400/403 (chat not found, bot blocked) are not.
      retryable: response.status === 429 || response.status >= 500,
      retryAfterSeconds: body?.parameters?.retry_after,
      // 403: the person blocked the bot or removed it from the group.
      disableChannel: response.status === 403,
    });
  }
}

/** Escapes text for Telegram's HTML parse mode. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
