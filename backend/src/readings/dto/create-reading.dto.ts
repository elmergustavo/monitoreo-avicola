import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreateReadingDto {
  @ApiProperty({ example: 29.5, minimum: -40, maximum: 125, description: 'Temperature in °C' })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(-40)
  @Max(125)
  temperature: number;

  @ApiPropertyOptional({
    example: 65,
    minimum: 0,
    maximum: 100,
    description: 'Relative humidity in %',
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  humidity?: number;

  @ApiProperty({ example: false, description: 'Whether the irrigation system is running' })
  @IsBoolean()
  irrigation: boolean;
}
