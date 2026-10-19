import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Observable, ReplaySubject, Subject } from 'rxjs';

export interface ReadingMessage {
  type: 'reading';
  deviceId: string;
  reading: {
    id: string;
    temperature: number;
    humidity: number | null;
    irrigation: boolean;
    createdAt: Date;
  };
}

export interface EventMessage {
  type: 'event';
  deviceId: string;
  event: {
    id: string;
    type: string;
    temperature: number | null;
    durationMin: number | null;
    createdAt: Date;
  };
}

/** An alert was opened, acknowledged or resolved (sent to every viewer). */
export interface AlertMessage {
  type: 'alert';
  deviceId: string;
  alert: { id: string; kind: string; severity: string; status: string };
}

/** A new inbox entry; only its owner receives it. */
export interface NotificationMessage {
  type: 'notification';
  userId: string;
  notification: {
    id: string;
    kind: string;
    severity: string | null;
    title: string;
    body: string;
    alertId: string | null;
    deviceId: string | null;
    createdAt: Date;
  };
}

export type TelemetryMessage = ReadingMessage | EventMessage | AlertMessage | NotificationMessage;

/**
 * In-process pub/sub for live updates. Enough for a single API instance;
 * with several replicas this would move to Postgres LISTEN/NOTIFY or Redis.
 */
@Injectable()
export class TelemetryStreamService implements OnModuleDestroy {
  private readonly subject = new Subject<TelemetryMessage>();
  // Replays to late subscribers: a dashboard that reconnects while the
  // server is shutting down is closed right away too.
  private readonly closing = new ReplaySubject<void>(1);

  /** Emits once when the application starts shutting down. */
  readonly closing$ = this.closing.asObservable();

  onModuleDestroy() {
    this.closing.next();
    this.closing.complete();
  }

  publish(message: TelemetryMessage): void {
    this.subject.next(message);
  }

  get messages$(): Observable<TelemetryMessage> {
    return this.subject.asObservable();
  }
}
