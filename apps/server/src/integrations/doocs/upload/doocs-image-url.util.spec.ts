import {
  applyPublishUrls,
  buildAttachmentUrl,
  collectImageSrcs,
  publishUrlKey,
  restoreAttachmentUrls,
} from './doocs-image-url.util';

const attachmentId = '0f1d4a1e-6f4d-4a2c-9d0e-2f8e8f7c1a11';
const otherAttachmentId = '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d';

function doc(...images: string[]): any {
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
      ...images.map((src) => ({
        type: 'image',
        attrs: { src, attachmentId, width: 640 },
      })),
    ],
  };
}

describe('doocs image url util', () => {
  describe('applyPublishUrls', () => {
    it('replaces attachment image urls with their publish urls', () => {
      const content = doc(`/api/files/${attachmentId}/photo.png`);
      const result = applyPublishUrls(
        content,
        new Map([[attachmentId, 'https://cdn.example.com/photo.png']]),
      );

      expect(result.content[1].attrs.src).toBe(
        'https://cdn.example.com/photo.png',
      );
    });

    it('does not mutate the source content', () => {
      const content = doc(`/api/files/${attachmentId}/photo.png`);
      applyPublishUrls(
        content,
        new Map([[attachmentId, 'https://cdn.example.com/photo.png']]),
      );

      expect(content.content[1].attrs.src).toBe(
        `/api/files/${attachmentId}/photo.png`,
      );
    });

    it('keeps images without a publish url unchanged', () => {
      const content = doc(`/api/files/${attachmentId}/photo.png`);
      const result = applyPublishUrls(content, new Map());

      expect(result.content[1].attrs.src).toBe(
        `/api/files/${attachmentId}/photo.png`,
      );
    });

    it('keeps third party image urls unchanged', () => {
      const content = doc('https://example.com/external.png');
      const result = applyPublishUrls(
        content,
        new Map([[attachmentId, 'https://cdn.example.com/photo.png']]),
      );

      expect(result.content[1].attrs.src).toBe(
        'https://example.com/external.png',
      );
    });
  });

  describe('restoreAttachmentUrls', () => {
    it('restores publish urls back to the attachment url', () => {
      const content = doc('https://cdn.example.com/photo.png');
      restoreAttachmentUrls(
        content,
        new Map([
          [
            publishUrlKey('https://cdn.example.com/photo.png'),
            { attachmentId, fileName: 'photo.png' },
          ],
        ]),
      );

      expect(content.content[1].attrs.src).toBe(
        `/api/files/${attachmentId}/photo.png`,
      );
    });

    it('matches a publish url whose protocol changed', () => {
      const content = doc('https://mmbiz.qpic.cn/mmbiz_png/abc/640');
      restoreAttachmentUrls(
        content,
        new Map([
          [
            publishUrlKey('http://mmbiz.qpic.cn/mmbiz_png/abc/640'),
            { attachmentId, fileName: 'photo.png' },
          ],
        ]),
      );

      expect(content.content[1].attrs.src).toBe(
        `/api/files/${attachmentId}/photo.png`,
      );
    });

    it('leaves unknown urls untouched so third party images stay external', () => {
      const content = doc('https://example.com/external.png');
      restoreAttachmentUrls(
        content,
        new Map([
          [
            publishUrlKey('https://cdn.example.com/photo.png'),
            { attachmentId, fileName: 'photo.png' },
          ],
        ]),
      );

      expect(content.content[1].attrs.src).toBe(
        'https://example.com/external.png',
      );
    });

    it('encodes file names that need escaping', () => {
      const content = doc('https://cdn.example.com/photo.png');
      restoreAttachmentUrls(
        content,
        new Map([
          [
            publishUrlKey('https://cdn.example.com/photo.png'),
            { attachmentId, fileName: 'my photo #1.png' },
          ],
        ]),
      );

      expect(content.content[1].attrs.src).toBe(
        `/api/files/${attachmentId}/my%20photo%20%231.png`,
      );
    });
  });

  describe('collectImageSrcs', () => {
    it('collects unique image sources', () => {
      const content = doc(
        'https://cdn.example.com/a.png',
        'https://cdn.example.com/a.png',
        `/api/files/${otherAttachmentId}/b.png`,
      );

      expect(collectImageSrcs(content)).toEqual([
        'https://cdn.example.com/a.png',
        `/api/files/${otherAttachmentId}/b.png`,
      ]);
    });
  });

  describe('buildAttachmentUrl', () => {
    it('builds the canonical docmost attachment url', () => {
      expect(buildAttachmentUrl(attachmentId, 'photo.png')).toBe(
        `/api/files/${attachmentId}/photo.png`,
      );
    });
  });
});
