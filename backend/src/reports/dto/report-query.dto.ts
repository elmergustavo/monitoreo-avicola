import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import type { ReportFormat } from '../report.types.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
  @ApiProperty({ enum: ['pdf', 'xlsx'] })
  @IsIn(['pdf', 'xlsx'])
  format: ReportFormat;

  @ApiProperty({ example: '2026-10-01', description: 'First day (Guatemala time), inclusive' })
  @Matches(DATE_PATTERN, { message: 'from debe tener el formato AAAA-MM-DD' })
  from: string;

  @ApiProperty({ example: '2026-10-18', description: 'Last day (Guatemala time), inclusive' })
  @Matches(DATE_PATTERN, { message: 'to debe tener el formato AAAA-MM-DD' })
  to: string;

  @ApiPropertyOptional({ description: 'One shed; omit it to include every active shed' })
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}
