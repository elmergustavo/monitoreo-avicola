import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { EventType } from '../../generated/prisma/enums.js';

export class CreateEventDto {
  @ApiProperty({ enum: EventType, enumName: 'EventType', example: EventType.irrigation_off })
  @IsEnum(EventType)
  type: EventType;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 28.1,
    minimum: -40,
    maximum: 125,
    description: 'Temperature in °C at the time of the event (null if the sensor failed)',
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(-40)
  @Max(125)
  temperature?: number | null;

  @ApiPropertyOptional({
    example: 8.5,
    minimum: 0,
    description: 'Duration in minutes (e.g. irrigation time)',
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999)
  durationMin?: number;
}
