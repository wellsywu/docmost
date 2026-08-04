import { BadRequestException } from '@nestjs/common';
import { AttachmentService } from './attachment.service';

function createService() {
  const storage = {
    upload: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const attachmentRepo = {
    insertAttachment: jest
      .fn()
      .mockImplementation(async (value: Record<string, unknown>) => ({
        ...value,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        aiChatId: null,
      })),
    deleteAttachmentByFilePath: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AttachmentService(
    storage as never,
    attachmentRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { add: jest.fn() } as never,
  );
  return { service, storage, attachmentRepo };
}

describe('AttachmentService page buffer uploads', () => {
  it('writes the deployment storage and creates a page-bound attachment', async () => {
    const { service, storage, attachmentRepo } = createService();
    const content = Buffer.from('image bytes');

    const result = await service.uploadPageFileFromBuffer({
      bytes: content,
      fileName: 'image.png',
      mimeType: 'image/png',
      pageId: 'page-1',
      userId: 'user-1',
      spaceId: 'space-1',
      workspaceId: 'workspace-1',
    });

    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^workspace-1\/files\/[0-9a-f-]+\/image\.png$/),
      content,
    );
    expect(attachmentRepo.insertAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: 'page-1',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        creatorId: 'user-1',
        fileName: 'image.png',
        fileSize: content.length,
        mimeType: 'image/png',
      }),
      undefined,
    );
    expect(result.pageId).toBe('page-1');
  });

  it('deletes the stored object and fails when the attachment row cannot be saved', async () => {
    const { service, storage, attachmentRepo } = createService();
    attachmentRepo.insertAttachment.mockRejectedValue(new Error('db failed'));

    await expect(
      service.uploadPageFileFromBuffer({
        bytes: Buffer.from('image bytes'),
        fileName: 'image.png',
        mimeType: 'image/png',
        pageId: 'page-1',
        userId: 'user-1',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(storage.delete).toHaveBeenCalledWith(
      expect.stringMatching(/^workspace-1\/files\/[0-9a-f-]+\/image\.png$/),
    );
    expect(attachmentRepo.deleteAttachmentByFilePath).toHaveBeenCalled();
  });
});
