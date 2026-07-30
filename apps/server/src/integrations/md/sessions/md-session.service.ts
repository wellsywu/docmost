import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { IntegrationDatabase } from '@docmost/integration-db';
import { InjectMdDatabase } from '../database/md-database.module';
import { hashToken } from '../tickets/md-ticket.service';

const MD_SESSION_TTL_MS = 15 * 60_000;

export interface MdSessionPrincipal {
  tokenHash: string;
  userId: string;
  pageId: string;
  expiresAt: Date;
}

@Injectable()
export class MdSessionService {
  constructor(@InjectMdDatabase() private readonly db: IntegrationDatabase) {}

  async create(
    userId: string,
    pageId: string,
  ): Promise<{ token: string; expiresAt: number }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + MD_SESSION_TTL_MS);

    await this.db
      .insertInto('md_integration_sessions')
      .values({
        token_hash: hashToken(token),
        user_id: userId,
        page_id: pageId,
        expires_at: expiresAt,
        revoked_at: null,
        created_at: new Date(),
      })
      .execute();

    return { token, expiresAt: expiresAt.getTime() };
  }

  async validate(token: string): Promise<MdSessionPrincipal> {
    const tokenHash = hashToken(token);
    const row = await this.db
      .selectFrom('md_integration_sessions')
      .select(['user_id', 'page_id', 'expires_at'])
      .where('token_hash', '=', tokenHash)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();

    if (!row) {
      throw new UnauthorizedException('Invalid or expired md session');
    }

    return {
      tokenHash,
      userId: row.user_id,
      pageId: row.page_id,
      expiresAt: row.expires_at,
    };
  }

  async revoke(tokenHash: string): Promise<void> {
    await this.db
      .updateTable('md_integration_sessions')
      .set({ revoked_at: new Date() })
      .where('token_hash', '=', tokenHash)
      .where('revoked_at', 'is', null)
      .execute();
  }
}
