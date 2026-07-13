import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CreateUserDto } from '../../auth/dto/create-user.dto';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  @IsOptional()
  @IsBoolean()
  fullPageWidth: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['read', 'edit'])
  pageEditMode: string;

  @IsOptional()
  @IsBoolean()
  editorToolbar: boolean;

  @IsOptional()
  @IsString()
  @IsIn([
    'default',
    'sepia',
    'contrast',
    'notion',
    'cursor',
    'copilot',
    'tokyo',
    'feishu',
  ])
  readingTheme: string;

  @IsOptional()
  @IsString()
  @IsIn(['sans', 'serif', 'grotesk'])
  readingFont: string;

  @IsOptional()
  @IsString()
  @IsIn(['compact', 'standard', 'large'])
  readingSize: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'auto',
    'github',
    'dracula',
    'cursor',
    'copilot',
    'tokyo',
    'notion',
    'sepia',
    'contrast',
    'feishu',
  ])
  readingCodeTheme: string;

  @IsOptional()
  @IsString()
  locale: string;

  @IsOptional()
  @MinLength(8)
  @MaxLength(70)
  @IsString()
  confirmPassword: string;

  @IsOptional()
  @IsBoolean()
  notificationPageUpdates: boolean;

  @IsOptional()
  @IsBoolean()
  notificationPageUserMention: boolean;

  @IsOptional()
  @IsBoolean()
  notificationCommentUserMention: boolean;

  @IsOptional()
  @IsBoolean()
  notificationCommentCreated: boolean;

  @IsOptional()
  @IsBoolean()
  notificationCommentResolved: boolean;
}
