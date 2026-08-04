import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DoocsS3UploadService } from './doocs-s3-upload.service';

jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn().mockResolvedValue({});
  const destroy = jest.fn();
  const S3ClientMock = jest.fn().mockImplementation(() => ({ send, destroy }));
  const PutObjectCommandMock = jest.fn().mockImplementation((input) => input);
  return {
    S3Client: S3ClientMock,
    PutObjectCommand: PutObjectCommandMock,
  };
});

describe('DoocsS3UploadService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads to S3 and returns a HTTPS CDN URL', async () => {
    const service = new DoocsS3UploadService();

    await expect(
      service.upload(
        {
          endpoint: 'https://s3.example.com',
          region: 'auto',
          bucket: 'bucket',
          accessKeyId: 'access-key',
          accessKeySecret: 'secret',
          path: 'docmost',
          cdnHost: 'https://cdn.example.com',
          pathStyle: true,
        },
        Buffer.from('png'),
        'image/png',
        'image.png',
      ),
    ).resolves.toEqual({
      url: expect.stringMatching(
        /^https:\/\/cdn\.example\.com\/docmost\/\d{4}\/\d{2}\/\d{2}\/.+\.png$/,
      ),
    });
    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://s3.example.com',
        forcePathStyle: true,
      }),
    );
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'bucket',
        ContentType: 'image/png',
      }),
    );
  });

  it('rejects insecure final S3 public URLs defensively', async () => {
    const service = new DoocsS3UploadService();

    await expect(
      service.upload(
        {
          endpoint: 'http://s3.example.com',
          region: 'auto',
          bucket: 'bucket',
          accessKeyId: 'access-key',
          accessKeySecret: 'secret',
          path: null,
          cdnHost: null,
          pathStyle: true,
        },
        Buffer.from('png'),
        'image/png',
        'image.png',
      ),
    ).rejects.toThrow('S3 endpoint must use HTTPS');
  });
});
