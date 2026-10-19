import { ApiProperty } from '@nestjs/swagger';

export class ReadingResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 29.5 })
  temperature: number;

  @ApiProperty({ type: Number, nullable: true, example: null })
  humidity: number | null;

  @ApiProperty({ example: false })
  irrigation: boolean;

  @ApiProperty({
    example: '2026-10-18T18:30:00.000Z',
    description: 'UTC timestamp set by the server',
  })
  createdAt: Date;
}
