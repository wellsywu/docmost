import {
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { sql } from 'kysely';
import {
  createIntegrationDatabase,
  IntegrationDatabase,
  migrateIntegrationDatabase,
} from '@docmost/integration-db';
import { EnvironmentService } from '../../environment/environment.service';
import { DoocsConfigModule } from '../config/doocs-config.module';
import { DoocsConfigService } from '../config/doocs-config.service';

export const DOOCS_DATABASE = Symbol('DOOCS_DATABASE');
export const InjectDoocsDatabase = () => Inject(DOOCS_DATABASE);

export function createDoocsDatabase(
  config: DoocsConfigService,
): IntegrationDatabase {
  return createIntegrationDatabase(config.getDatabaseUrl(), {
    maxConnections: config.getDatabaseMaxPool(),
  });
}

@Injectable()
export class DoocsDatabaseLifecycle
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DoocsDatabaseLifecycle.name);

  constructor(
    @InjectDoocsDatabase() private readonly db: IntegrationDatabase,
    private readonly environmentService: EnvironmentService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.establishConnection();
    if (this.environmentService.getNodeEnv() === 'production') {
      await migrateIntegrationDatabase(this.db);
      this.logger.log('Integration database migrations are up to date');
    }
  }

  async establishConnection(): Promise<void> {
    this.logger.log('Establishing integration database connection');
    await sql`select 1`.execute(this.db);
    this.logger.log('Integration database connection successful');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}

@Module({
  imports: [DoocsConfigModule],
  providers: [
    {
      provide: DOOCS_DATABASE,
      inject: [DoocsConfigService],
      useFactory: createDoocsDatabase,
    },
    DoocsDatabaseLifecycle,
  ],
  exports: [DOOCS_DATABASE],
})
export class DoocsDatabaseModule {}
