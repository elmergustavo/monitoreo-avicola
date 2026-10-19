import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

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

export type TelemetryMessage = ReadingMessage | EventMessage;

/**
 * In-process pub/sub for live updates. Enough for a single API instance;
 * with several replicas this would move to Postgres LISTEN/NOTIFY or Redis.
 */
@Injectable()
export class TelemetryStreamService {
  private readonly subject = new Subject<TelemetryMessage>();

  publish(message: TelemetryMessage): void {
    this.subject.next(message);
  }

  get messages$(): Observable<TelemetryMessage> {
    return this.subject.asObservable();
  }
}
