import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateWechatAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  appId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  appSecret: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mpId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  serviceType?: string;

  @IsOptional()
  @IsBoolean()
  verify?: boolean;
}

export class UpdateWechatAccountDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  appId?: string;

  /**
   * Empty means preserve the existing encrypted secret.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  appSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mpId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  serviceType?: string;

  @IsOptional()
  @IsBoolean()
  verify?: boolean;
}

export class WechatAccountIdDto {
  @IsUUID()
  id: string;
}
