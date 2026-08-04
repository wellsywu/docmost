import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * doocs-owned configuration reader.
 *
 * Deliberately separate from EnvironmentService: doocs is an optional
 * integration and must not grow getters on a Docmost core service. ConfigModule
 * is registered globally (environment.module.ts), so ConfigService injects here
 * without importing anything.
 *
 * The environment variable names stay `MD_*` / `INTEGRATION_*` on purpose —
 * they are already set in deployed compose files and in
 * `scripts/docmost-md-deploy.sh`. Renaming them would break existing installs
 * for no functional gain.
 */
@Injectable()
export class DoocsConfigService {
  constructor(private readonly configService: ConfigService) {}

  getDatabaseUrl(): string {
    const url = this.configService.get<string>('INTEGRATION_DATABASE_URL');
    if (!url) {
      throw new Error('INTEGRATION_DATABASE_URL is required');
    }
    return url;
  }

  getDatabaseMaxPool(): number {
    return parseInt(
      this.configService.get<string>('INTEGRATION_DATABASE_MAX_POOL', '5'),
    );
  }

  /**
   * Browser-facing URL of the doocs editor SPA. Empty when the integration is
   * not deployed, which is how the client decides to hide its entry point.
   */
  getEditorUrl(): string {
    return (this.configService.get<string>('MD_EDITOR_URL') ?? '')
      .trim()
      .replace(/\/+$/, '');
  }
}
