import { Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
