import { Test, TestingModule } from '@nestjs/testing';
import { EnvironmentService } from './environment.service';

describe('EnvironmentService', () => {
  let service: EnvironmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EnvironmentService],
    }).compile();

    service = module.get<EnvironmentService>(EnvironmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('EnvironmentService doocs attachment base url', () => {
  function build(values: Record<string, string>) {
    return new EnvironmentService({
      get: (key: string, fallback?: string) => values[key] ?? fallback,
    } as never);
  }

  it('falls back to APP_URL when no override is set', () => {
    expect(
      build({
        APP_URL: 'https://docmost.example.com',
      }).getDoocsAttachmentBaseUrl(),
    ).toBe('https://docmost.example.com');
  });

  it('prefers the override so a LAN reader is not sent out through the public host', () => {
    const service = build({
      APP_URL: 'https://docmost.public.example',
      DOOCS_ATTACHMENT_BASE_URL: 'https://docmost.lan',
    });

    expect(service.getDoocsAttachmentBaseUrl()).toBe('https://docmost.lan');
    // The public URL is still what everything else (mail, share links) uses.
    expect(service.getAppUrl()).toBe('https://docmost.public.example');
  });

  it('ignores a blank override rather than producing a hostless url', () => {
    expect(
      build({
        APP_URL: 'https://docmost.example.com',
        DOOCS_ATTACHMENT_BASE_URL: '   ',
      }).getDoocsAttachmentBaseUrl(),
    ).toBe('https://docmost.example.com');
  });
});
