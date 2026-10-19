import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class AnalyticsQueryDto {
  @ApiProperty()
  @IsUUID()
  deviceId: string;

  @ApiProperty({ example: '2026-10-01', description: 'First day (Guatemala time), inclusive' })
  @Matches(DATE_PATTERN, { message: 'from debe tener el formato AAAA-MM-DD' })
  from: string;

  @ApiProperty({
    example: '2026-10-19',
    description: 'Last day (Guatemala time), inclusive; up to 92 days',
  })
  @Matches(DATE_PATTERN, { message: 'to debe tener el formato AAAA-MM-DD' })
  to: string;
}
