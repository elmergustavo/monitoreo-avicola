import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PERMISSIONS, type Permission } from '../../auth/permissions.js';

export class CreateRoleDto {
  @ApiProperty({ example: 'Veterinario' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Revisa temperaturas y eventos' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({ enum: PERMISSIONS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true })
  permissions: Permission[];
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
