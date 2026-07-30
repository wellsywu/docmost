import {
  IsArray,
  IsDefined,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMdTicketDto {
  @IsUUID()
  pageId: string;
}

export class BootstrapMdIntegrationDto {
  @IsString()
  @MaxLength(512)
  ticket: string;
}

export class MdSettingDto {
  @IsString()
  @MaxLength(255)
  key: string;

  @IsDefined()
  value: unknown;

  @IsNumber()
  updatedAt: number;
}

export class UpdateMdSettingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MdSettingDto)
  settings: MdSettingDto[];
}
