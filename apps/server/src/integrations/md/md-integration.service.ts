import { Injectable, NotFoundException } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { jsonToMarkdown } from '../../collaboration/collaboration.util';
import { getPageTitle } from '../../common/helpers';
import { WechatAccountService } from './accounts/wechat-account.service';
import { MdSessionService } from './sessions/md-session.service';
import { MdSettingsService } from './settings/md-settings.service';
import { MdTicketService } from './tickets/md-ticket.service';

@Injectable()
export class MdIntegrationService {
  constructor(
    private readonly tickets: MdTicketService,
    private readonly sessions: MdSessionService,
    private readonly settings: MdSettingsService,
    private readonly accounts: WechatAccountService,
    private readonly pageRepo: PageRepo,
  ) {}

  async bootstrap(ticket: string) {
    const consumed = await this.tickets.consume(ticket);
    const page = await this.pageRepo.findById(consumed.pageId, {
      includeContent: true,
    });
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    const [settings, accounts, session] = await Promise.all([
      this.settings.list(consumed.userId),
      this.accounts.list(page.workspaceId),
      this.sessions.create(consumed.userId, page.id),
    ]);

    return {
      title: getPageTitle(page.title),
      markdown: page.content ? jsonToMarkdown(page.content) : '',
      settings,
      accounts,
      mdSessionToken: session.token,
      mdSessionExpiresAt: session.expiresAt,
    };
  }
}
