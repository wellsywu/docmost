import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDoocsTicketDto {
  @IsUUID()
  pageId: string;
}

export class BootstrapDoocsDto {
  @IsString()
  @MaxLength(512)
  ticket: string;
}

export class DoocsSettingDto {
  @IsString()
  @MaxLength(255)
  key: string;

  @IsDefined()
  value: unknown;

  @IsNumber()
  updatedAt: number;
}

export class UpdateDoocsSettingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DoocsSettingDto)
  settings: DoocsSettingDto[];
}

export class UpdateDoocsContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsString()
  markdown: string;

  @IsNumber()
  expectedUpdatedAt: number;

  @IsString()
  @MaxLength(128)
  expectedContentHash: string;

  @IsOptional()
  @IsBoolean()
  acknowledgeRoundtripRisk?: boolean;
}

export class DoocsS3UploadConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  endpoint?: string;

  @IsString()
  @MaxLength(128)
  region: string;

  @IsString()
  @MaxLength(255)
  bucket: string;

  @IsString()
  @MaxLength(255)
  accessKeyId: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  accessKeySecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cdnHost?: string;

  @IsOptional()
  @IsBoolean()
  pathStyle?: boolean;
}

export class UpdateDoocsUploadConfigDto {
  @IsIn(['wechat', 's3'])
  provider: 'wechat' | 's3';

  @IsOptional()
  @ValidateNested()
  @Type(() => DoocsS3UploadConfigDto)
  s3?: DoocsS3UploadConfigDto;
}

export class PublishDoocsAttachmentDto {
  @IsUUID()
  attachmentId: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;
}

export class DoocsWechatCredentialsDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;
}

export class DoocsPublishAssetEntryDto {
  @IsUUID()
  attachmentId: string;

  /**
   * Long enough for an mmbiz URL with its query, short enough that nothing else
   * fits. The host itself is checked server side.
   */
  @IsString()
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  mediaId?: string;
}

export class RegisterDoocsPublishAssetsDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DoocsPublishAssetEntryDto)
  assets: DoocsPublishAssetEntryDto[];
}

export class LookupDoocsPublishAssetsDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  attachmentIds: string[];
}
