import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  apiKeyId: string;

  @IsString()
  @IsNotEmpty()
  name: string;
}

export class RevokeApiKeyDto {
  @IsString()
  @IsNotEmpty()
  apiKeyId: string;
}
