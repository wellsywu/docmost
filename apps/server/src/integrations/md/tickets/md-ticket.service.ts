import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { IntegrationDatabase } from '@docmost/integration-db';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../../core/page/page-access/page-access.service';
import { User } from '@docmost/db/types/entity.types';
import { InjectMdDatabase } from '../database/md-database.module';

const TICKET_TTL_MS = 60_000;

export interface ConsumedMdTicket {
  userId: string;
  pageId: string;
}

@Injectable()
export class MdTicketService {
  constructor(
    @InjectMdDatabase() private readonly db: IntegrationDatabase,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
  ) {}

  async create(
    pageId: string,
    user: User,
  ): Promise<{ ticket: string; expiresAt: number }> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.workspaceId !== user.workspaceId) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
    await this.db
      .insertInto('md_integration_tickets')
      .values({
        ticket_hash: hashToken(ticket),
        user_id: user.id,
        page_id: page.id,
        expires_at: expiresAt,
        consumed_at: null,
        created_at: new Date(),
      })
      .execute();

    return { ticket, expiresAt: expiresAt.getTime() };
  }

  async consume(ticket: string): Promise<ConsumedMdTicket> {
    const row = await this.db
      .updateTable('md_integration_tickets')
      .set({ consumed_at: new Date() })
      .where('ticket_hash', '=', hashToken(ticket))
      .where('consumed_at', 'is', null)
      .where('expires_at', '>', new Date())
      .returning(['user_id', 'page_id'])
      .executeTakeFirst();

    if (!row) {
      throw new UnauthorizedException('Invalid or expired integration ticket');
    }

    return { userId: row.user_id, pageId: row.page_id };
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
