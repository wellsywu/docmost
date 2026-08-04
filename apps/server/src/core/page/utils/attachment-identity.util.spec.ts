import {
  collectDocmostAttachmentIds,
  restoreDocmostAttachmentIds,
} from './attachment-identity.util';

const attachmentId = '019fabe2-2a4d-7ee9-b9de-1c4dfbed0001';

describe('Docmost attachment identity restoration', () => {
  it('restores attachmentId and size from a Docmost image URL', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: `https://docmost.example/api/files/${attachmentId}/cat.png`,
          },
        },
      ],
    };

    expect(collectDocmostAttachmentIds(content)).toEqual([attachmentId]);
    restoreDocmostAttachmentIds(content, [
      { id: attachmentId, fileSize: '42' },
    ]);

    expect(content.content[0].attrs).toEqual({
      src: `https://docmost.example/api/files/${attachmentId}/cat.png`,
      attachmentId,
      size: 42,
    });
  });

  it('recognizes relative file URLs with query strings from Markdown roundtrips', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: `/api/files/${attachmentId}/cat%20photo.png?t=1` },
        },
        {
          type: 'image',
          attrs: { src: `/files/${attachmentId}/cat.png` },
        },
      ],
    };

    expect(collectDocmostAttachmentIds(content)).toEqual([attachmentId]);
    restoreDocmostAttachmentIds(content, [
      { id: attachmentId, fileSize: 42 },
    ]);

    expect((content.content[0].attrs as any).attachmentId).toBe(attachmentId);
    expect((content.content[1].attrs as any).attachmentId).toBe(attachmentId);
  });

  it('does not trust an attachment id that was not authorized by the caller', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: `/api/files/${attachmentId}/cat.png` },
        },
      ],
    };

    restoreDocmostAttachmentIds(content, []);

    expect(content.content[0].attrs).not.toHaveProperty('attachmentId');
  });

  it('ignores external and malformed image URLs', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'https://example.com/cat.png' } },
        { type: 'image', attrs: { src: '/api/files/not-a-uuid/cat.png' } },
      ],
    };

    expect(collectDocmostAttachmentIds(content)).toEqual([]);
  });
});
