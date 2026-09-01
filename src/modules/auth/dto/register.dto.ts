import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Language } from '../../../common/enums';

export class RegisterDto {
  @ApiProperty({ example: 'Jean' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  first_name: string;

  @ApiProperty({ example: 'Kamga' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  last_name: string;

  @ApiProperty({ example: 'jean.kamga@example.cm' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+237 6XX XXX XXX', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[\d\s\-()]{8,20}$/, { message: 'Numéro de téléphone invalide' })
  phone?: string;

  @ApiProperty({ example: 'motdepasse123' })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(128)
  password: string;

  @ApiProperty({ enum: Language, default: Language.FR, required: false })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @ApiProperty({ example: 'JEA1234', required: false })
  @IsOptional()
  @IsString()
  referral_code?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'jean.kamga@example.cm' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'motdepasse123' })
  @IsString()
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refresh_token: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'jean.kamga@example.cm' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ example: 'nouveauMotdepasse123' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class VerifyEmailDto {
  @ApiProperty()
  @IsString()
  token: string;
}
