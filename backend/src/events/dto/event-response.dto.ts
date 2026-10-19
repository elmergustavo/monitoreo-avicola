import { ApiProperty } from '@nestjs/swagger';
import { EventType } from '../../generated/prisma/enums.js';

export class EventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: EventType, enumName: 'EventType' })
  type: EventType;

  @ApiProperty({ type: Number, nullable: true, example: 28.1 })
  temperature: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 8.5 })
  durationMin: number | null;

  @ApiProperty({
    example: '2026-10-18T18:30:00.000Z',
    description: 'UTC timestamp set by the server',
  })
  createdAt: Date;
}
