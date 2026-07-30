import {
  Global,
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

export const MD_DATABASE = Symbol('MD_DATABASE');
export const InjectMdDatabase = () => Inject(MD_DATABASE);

export function createMdDatabase(
  environmentService: EnvironmentService,
): IntegrationDatabase {
  return createIntegrationDatabase(
    environmentService.getIntegrationDatabaseUrl(),
    {
      maxConnections: environmentService.getIntegrationDatabaseMaxPool(),
    },
  );
}

@Injectable()
export class MdDatabaseLifecycle
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MdDatabaseLifecycle.name);

  constructor(
    @InjectMdDatabase() private readonly db: IntegrationDatabase,
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

@Global()
@Module({
  providers: [
    {
      provide: MD_DATABASE,
      inject: [EnvironmentService],
      useFactory: createMdDatabase,
    },
    MdDatabaseLifecycle,
  ],
  exports: [MD_DATABASE],
})
export class MdIntegrationDatabaseModule {}
