import {
  IsEnum,
  IsUUID,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceType } from '../../../common/enums';

export class CreateBookingDto {
  @ApiProperty({ enum: ResourceType })
  @IsEnum(ResourceType)
  resource_type: ResourceType;

  @ApiProperty({ example: 'uuid-de-la-propriete-ou-voiture' })
  @IsUUID()
  resource_id: string;

  @ApiProperty({ example: '2026-09-11' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2026-09-14' })
  @IsDateString()
  end_date: string;

  @ApiProperty({ example: 2, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  guests_count?: number;

  @ApiProperty({ example: 'BIENVENUE10', required: false })
  @IsOptional()
  @IsString()
  coupon_code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  use_wallet?: boolean;

  @ApiProperty({ example: 500, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  use_loyalty_points?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  special_requests?: string;
}

export class ExtendBookingDto {
  @ApiProperty({ example: '2026-09-16' })
  @IsDateString()
  new_end_date: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  coupon_code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelBookingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CheckAvailabilityDto {
  @ApiProperty()
  @IsUUID()
  resource_id: string;

  @ApiProperty({ enum: ResourceType })
  @IsEnum(ResourceType)
  resource_type: ResourceType;

  @ApiProperty({ example: '2026-09-11' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2026-09-14' })
  @IsDateString()
  end_date: string;
}
