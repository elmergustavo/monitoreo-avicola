import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpdatePreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  telegram?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  whatsapp?: boolean;

  @ApiPropertyOptional({ description: 'False: only critical alerts reach Telegram and WhatsApp' })
  @IsOptional()
  @IsBoolean()
  includeWarnings?: boolean;

  @ApiPropertyOptional({
    example: '22:00',
    nullable: true,
    description: 'Guatemala time; null turns quiet hours off',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(TIME, { message: 'Usa el formato HH:MM' })
  quietStart?: string | null;

  @ApiPropertyOptional({ example: '05:00', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(TIME, { message: 'Usa el formato HH:MM' })
  quietEnd?: string | null;

  @ApiPropertyOptional({ description: 'Daily summary at 18:00 with the PDF report' })
  @IsOptional()
  @IsBoolean()
  dailySummary?: boolean;
}

export class WhatsAppLinkDto {
  @ApiProperty({ example: '5555 1234', description: '8 digits = Guatemala, or +<country><number>' })
  @IsString()
  @MaxLength(24)
  phone: string;
}

export class DeliveriesQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'sent', 'failed', 'skipped'] })
  @IsOptional()
  @IsIn(['pending', 'sent', 'failed', 'skipped'])
  status?: 'pending' | 'sent' | 'failed' | 'skipped';

  @ApiPropertyOptional({ enum: ['telegram', 'whatsapp'] })
  @IsOptional()
  @IsIn(['telegram', 'whatsapp'])
  type?: 'telegram' | 'whatsapp';

  @ApiPropertyOptional()
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
