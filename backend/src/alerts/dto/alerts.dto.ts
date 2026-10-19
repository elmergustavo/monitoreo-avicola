import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const ALERT_KINDS = [
  'heat_no_irrigation',
  'prolonged_irrigation',
  'sensor_error',
  'device_offline',
  'sustained_heat',
  'sustained_cold',
] as const;
export type AlertKindParam = (typeof ALERT_KINDS)[number];

export class AlertsQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'resolved'], description: 'Omit it for every alert' })
  @IsOptional()
  @IsIn(['active', 'resolved'])
  status?: 'active' | 'resolved';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional({ enum: ALERT_KINDS })
  @IsOptional()
  @IsIn(ALERT_KINDS)
  kind?: AlertKindParam;

  @ApiPropertyOptional({ enum: ['critical', 'warning'] })
  @IsOptional()
  @IsIn(['critical', 'warning'])
  severity?: 'critical' | 'warning';

  @ApiPropertyOptional({ description: 'Alerts opened before this date (pagination cursor)' })
  @IsOptional()
  @IsISO8601()
  before?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AlertStatsQueryDto {
  @ApiPropertyOptional({ default: 30, maximum: 365, description: 'Days back from now' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}

export class UpdateAlertRulesDto {
  @ApiPropertyOptional({
    example: 5,
    description: 'Minutes without data before a shed counts as offline',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  offlineAfterMin?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Minutes at or above the alert temperature before "sustained heat"',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  sustainedHeatMin?: number;

  @ApiPropertyOptional({
    example: 30,
    description: 'Minutes below the minimum before "sustained cold"',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  sustainedColdMin?: number;

  @ApiPropertyOptional({
    example: 30,
    description: 'Minutes between reminders while nobody attends an alert',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  reminderEveryMin?: number;

  @ApiPropertyOptional({
    example: 15,
    description: 'Minutes before an unattended critical alert goes to administrators',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  escalateAfterMin?: number;
}
