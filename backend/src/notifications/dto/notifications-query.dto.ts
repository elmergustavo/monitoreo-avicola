import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export class NotificationsQueryDto {
  @ApiPropertyOptional({ description: 'Entries created before this date (pagination cursor)' })
  @IsOptional()
  @IsISO8601()
  before?: string;

  @ApiPropertyOptional({ default: 30, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unread?: boolean;
}
