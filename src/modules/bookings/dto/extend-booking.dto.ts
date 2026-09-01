import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExtendBookingDto {
  @ApiProperty() @IsDateString() new_end_date!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
