import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ReadingsQueryDto {
  @ApiProperty({ example: '2026-10-18T00:00:00Z' })
  @IsISO8601()
  from: string;

  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class EventsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'Return events created before this date (pagination cursor)',
  })
  @IsOptional()
  @IsISO8601()
  before?: string;

  @ApiPropertyOptional({ default: 50, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class UpdateSettingsDto {
  @ApiProperty({ example: 27 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-40)
  @Max(125)
  tempMin: number;

  @ApiProperty({ example: 30 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-40)
  @Max(125)
  tempMax: number;

  @ApiProperty({ example: 32 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-40)
  @Max(125)
  tempAlert: number;
}
