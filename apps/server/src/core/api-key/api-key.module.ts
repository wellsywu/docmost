import { Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';
import { TokenModule } from '../auth/token.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [TokenModule, DatabaseModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
