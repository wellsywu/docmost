import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { User } from '@docmost/db/types/entity.types';
import { markdownToHtml } from '@docmost/editor-ext';
import {
  htmlToJson,
  jsonToMarkdown,
} from '../../collaboration/collaboration.util';
import { getPageTitle } from '../../common/helpers';
import { PageService } from '../../core/page/services/page.service';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { collectDocmostAttachmentIds } from '../../core/page/utils/attachment-identity.util';
import {
  applyPublishUrls,
  collectImageSrcs,
  restoreAttachmentUrls,
} from './upload/doocs-image-url.util';
import { DoocsUploadService } from './upload/doocs-upload.service';
import { WechatAccountService } from './accounts/wechat-account.service';
import {
  DoocsSessionPrincipal,
  DoocsSessionService,
} from './sessions/doocs-session.service';
import { DoocsSettingsService } from './settings/doocs-settings.service';
import { DoocsTicketService } from './tickets/doocs-ticket.service';
import { DoocsUploadConfigService } from './upload/doocs-upload-config.service';
import { UpdateDoocsContentDto } from './dto/doocs.dto';

interface DoocsContentBaseline {
  updatedAt: number;
  contentHash: string;
}

export interface DoocsRoundtripRisk {
  hasUnsupportedNodes: boolean;
  unsupportedNodeTypes: string[];
}

/**
 * Tells the doocs editor how far the handoff rewrite got. `pending` images could
 * not be resolved server side (WeChat needs an account the browser picks), so
 * the editor publishes those itself; `failed` ones keep their Docmost URL and
 * are shown as retryable.
 */
export interface DoocsImageSync {
  total: number;
  ready: number;
  pending: string[];
  failed: { attachmentId: string; error: string }[];
}

interface DoocsPageContent {
  markdown: string;
  imageSync: DoocsImageSync;
}

const MARKDOWN_SAFE_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'image',
]);

@Injectable()
export class DoocsService {
  constructor(
    private readonly tickets: DoocsTicketService,
    private readonly sessions: DoocsSessionService,
    private readonly settings: DoocsSettingsService,
    private readonly accounts: WechatAccountService,
    private readonly uploadConfig: DoocsUploadConfigService,
    private readonly uploads: DoocsUploadService,
    private readonly pageRepo: PageRepo,
    private readonly pageService: PageService,
    private readonly pageAccessService: PageAccessService,
    private readonly userRepo: UserRepo,
  ) {}

  async bootstrap(ticket: string) {
    const consumed = await this.tickets.consume(ticket);
    const page = await this.pageRepo.findById(consumed.pageId, {
      includeContent: true,
    });
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    const user = await this.getSessionUser(consumed.userId, page.workspaceId);
    const [{ canEdit }, settings, accounts, uploadConfig, session] =
      await Promise.all([
        this.pageAccessService.validateCanViewWithPermissions(page, user),
        this.settings.list(consumed.userId),
        this.accounts.list(page.workspaceId),
        this.uploadConfig.getPublic(page.workspaceId),
        this.sessions.create(consumed.userId, page.id),
      ]);

    // The baseline handed out here is what the editor sends back on save, so it
    // has to describe the live document rather than a `pages` row that may still
    // be waiting on the collaboration debouncer.
    const current = await this.readFlushedPage(page.id, user);
    const baseline = this.getContentBaseline(current);
    const roundtripRisk = detectMarkdownRoundtripRisk(current.content);
    const { markdown, imageSync } = await this.toDoocsContent(
      current,
      accounts,
    );

    return {
      pageId: current.id,
      docmostPagePath: `/p/${current.id}`,
      title: getPageTitle(current.title),
      markdown,
      imageSync,
      canEdit,
      updatedAt: baseline.updatedAt,
      contentHash: baseline.contentHash,
      roundtripRisk,
      settings,
      accounts,
      uploadProvider: uploadConfig.provider,
      uploadConfig,
      mdSessionToken: session.token,
      mdSessionExpiresAt: session.expiresAt,
    };
  }

  async updateContent(
    session: DoocsSessionPrincipal,
    dto: UpdateDoocsContentDto,
  ) {
    const page = await this.pageRepo.findById(session.pageId, {
      includeContent: true,
    });
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    const user = await this.getSessionUser(session.userId, page.workspaceId);

    await this.pageAccessService.validateCanEdit(page, user);

    // Comparing against an unflushed row would both invent conflicts and, worse,
    // let a stale-but-matching baseline overwrite edits that are still buffered
    // in the live document.
    const current = await this.readFlushedPage(page.id, user);

    const roundtripRisk = detectMarkdownRoundtripRisk(current.content);
    if (roundtripRisk.hasUnsupportedNodes && !dto.acknowledgeRoundtripRisk) {
      throw new BadRequestException({
        message:
          'Docmost page contains content that may not survive Markdown roundtrip',
        roundtripRisk,
      });
    }

    const baseline = this.getContentBaseline(current);
    // Only the content hash decides. `updatedAt` moves for reasons that leave the
    // content untouched — a title or icon edit, a move, another client saving an
    // identical document — and rejecting those would be a conflict the user
    // cannot explain or resolve.
    if (baseline.contentHash !== dto.expectedContentHash) {
      const remote = await this.toDoocsContent(current);
      throw new ConflictException({
        message: 'Docmost page changed since this editor session loaded',
        title: getPageTitle(current.title),
        markdown: remote.markdown,
        imageSync: remote.imageSync,
        canEdit: true,
        updatedAt: baseline.updatedAt,
        contentHash: baseline.contentHash,
        roundtripRisk,
      });
    }

    await this.pageService.updatePageContent(
      page.id,
      await this.toDocmostContent(current, dto.markdown),
      'replace',
      'json',
      user,
    );

    if (dto.title !== undefined) {
      await this.pageService.update(
        current,
        {
          pageId: current.id,
          title: dto.title,
        },
        user,
      );
    }

    // Same reasoning as above: the echoed baseline is what the next save is
    // checked against, so it must come from a flushed row.
    const updatedPage = await this.readFlushedPage(page.id, user);
    const updatedBaseline = this.getContentBaseline(updatedPage);
    const { markdown, imageSync } = await this.toDoocsContent(updatedPage);

    return {
      title: getPageTitle(updatedPage.title),
      markdown,
      imageSync,
      canEdit: true,
      updatedAt: updatedBaseline.updatedAt,
      contentHash: updatedBaseline.contentHash,
      roundtripRisk: detectMarkdownRoundtripRisk(updatedPage.content),
    };
  }

  /**
   * Reads a page after making sure the collaboration server has written out
   * whatever is still buffered for it. Browser edits are stored on a debounce, so
   * a plain read can return content that is tens of seconds behind the document
   * the user was just looking at.
   */
  private async readFlushedPage(pageId: string, user: User) {
    await this.pageService.flushPageContent(pageId, user);
    const page = await this.pageRepo.findById(pageId, { includeContent: true });
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  /**
   * Builds the doocs-facing copy of a page: same content, but every image that
   * has a publish asset points at the image host instead of `/api/files/...`.
   * The Docmost page itself is untouched, and the baseline hash stays on the
   * canonical Markdown so the optimistic lock keeps working.
   */
  private async toDoocsContent(
    page: { id: string; workspaceId: string; spaceId: string; content?: any },
    knownAccounts?: { id: string }[],
  ): Promise<DoocsPageContent> {
    const empty: DoocsImageSync = {
      total: 0,
      ready: 0,
      pending: [],
      failed: [],
    };
    if (!page.content) {
      return { markdown: '', imageSync: empty };
    }

    const attachmentIds = collectDocmostAttachmentIds(page.content);
    if (attachmentIds.length === 0) {
      return { markdown: jsonToMarkdown(page.content), imageSync: empty };
    }

    const imageSync: DoocsImageSync = {
      total: attachmentIds.length,
      ready: 0,
      pending: [],
      failed: [],
    };
    const accountId = await this.resolveHandoffAccountId(
      page.workspaceId,
      knownAccounts,
    );
    if (accountId === undefined) {
      // WeChat with zero or several accounts: the browser knows which account is
      // selected, so it finishes the remaining images through /upload/publish.
      return {
        markdown: jsonToMarkdown(page.content),
        imageSync: { ...imageSync, pending: attachmentIds },
      };
    }

    const resolved = await this.uploads.resolvePublishUrlsForPage({
      page: {
        id: page.id,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
      },
      attachmentIds,
      accountId: accountId ?? undefined,
    });

    const publishUrls = new Map<string, string>();
    for (const attachmentId of attachmentIds) {
      const asset = resolved.get(attachmentId);
      if (asset?.status === 'ready' && asset.url) {
        publishUrls.set(attachmentId, asset.url);
        imageSync.ready += 1;
      } else if (asset?.status === 'failed') {
        imageSync.failed.push({
          attachmentId,
          error: asset.error ?? 'Publish asset is not available',
        });
      }
      // No entry at all means the image points at an attachment that does not
      // belong to this page. Nothing to publish and nothing the editor can fix,
      // so it is left alone like any other foreign URL.
    }

    return {
      markdown: jsonToMarkdown(applyPublishUrls(page.content, publishUrls)),
      imageSync,
    };
  }

  /**
   * Reverse of {@link toDoocsContent}: turns the publish URLs the doocs editor
   * saved back into this page's attachment URLs, so the Docmost page keeps the
   * exact links (and attachment identity) it had before the handoff. URLs with
   * no mapping stay as they are — those are genuine third-party images.
   */
  private async toDocmostContent(
    page: { id: string; workspaceId: string },
    markdown: string,
  ): Promise<any> {
    const html = await markdownToHtml(markdown);
    const prosemirrorJson = htmlToJson(html as string);

    const externalSrcs = collectImageSrcs(prosemirrorJson).filter(
      (src) => !src.startsWith('/'),
    );
    if (externalSrcs.length === 0) {
      return prosemirrorJson;
    }

    const attachments = await this.uploads.findAttachmentsByPublishUrls(
      { id: page.id, workspaceId: page.workspaceId },
      externalSrcs,
    );
    restoreAttachmentUrls(prosemirrorJson, attachments);
    return prosemirrorJson;
  }

  /**
   * `null` means the provider needs no account (S3); `undefined` means WeChat
   * without a single obvious account, which the server cannot pick for the user.
   */
  private async resolveHandoffAccountId(
    workspaceId: string,
    knownAccounts?: { id: string }[],
  ): Promise<string | null | undefined> {
    const config = await this.uploadConfig.getPublic(workspaceId);
    if (config.provider !== 'wechat') {
      return null;
    }
    const accounts = knownAccounts ?? (await this.accounts.list(workspaceId));
    return accounts.length === 1 ? accounts[0].id : undefined;
  }

  private async getSessionUser(
    userId: string,
    workspaceId: string,
  ): Promise<User> {
    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user || user.deletedAt || user.deactivatedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private getContentBaseline(page: { content?: unknown; updatedAt: Date }) {
    const markdown = page.content ? jsonToMarkdown(page.content) : '';
    return {
      updatedAt: page.updatedAt.getTime(),
      contentHash: hashMarkdown(markdown),
    } satisfies DoocsContentBaseline;
  }
}

export function hashMarkdown(markdown: string): string {
  return createHash('sha256').update(markdown, 'utf8').digest('hex');
}

export function detectMarkdownRoundtripRisk(
  content: unknown,
): DoocsRoundtripRisk {
  const unsupportedNodeTypes = new Set<string>();

  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') {
      return;
    }
    const candidate = node as { type?: unknown; content?: unknown };
    if (
      typeof candidate.type === 'string' &&
      !MARKDOWN_SAFE_NODE_TYPES.has(candidate.type)
    ) {
      unsupportedNodeTypes.add(candidate.type);
    }
    if (Array.isArray(candidate.content)) {
      for (const child of candidate.content) {
        visit(child);
      }
    }
  }

  visit(content);

  const types = [...unsupportedNodeTypes].sort();
  return {
    hasUnsupportedNodes: types.length > 0,
    unsupportedNodeTypes: types,
  };
}
