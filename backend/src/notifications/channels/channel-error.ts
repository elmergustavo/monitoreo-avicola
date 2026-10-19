/** Failure talking to Telegram or Twilio, with what the outbox should do next. */
export class ChannelError extends Error {
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  /** The chat is gone for good (bot blocked, removed from the group): stop using it. */
  readonly disableChannel: boolean;

  constructor(
    message: string,
    options: { retryable: boolean; retryAfterSeconds?: number; disableChannel?: boolean },
  ) {
    super(message);
    this.name = 'ChannelError';
    this.retryable = options.retryable;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.disableChannel = options.disableChannel ?? false;
  }
}
