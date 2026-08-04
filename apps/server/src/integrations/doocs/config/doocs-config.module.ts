import { Module } from '@nestjs/common';
import { DoocsConfigService } from './doocs-config.service';

@Module({
  providers: [DoocsConfigService],
  exports: [DoocsConfigService],
})
export class DoocsConfigModule {}
