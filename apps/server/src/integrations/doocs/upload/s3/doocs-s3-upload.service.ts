import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { ResolvedDoocsUploadConfig } from '../doocs-upload-config.service';

const PROTOCOL_REGEX = /^https?:\/\//;

@Injectable()
export class DoocsS3UploadService {
  async upload(
    config: NonNullable<ResolvedDoocsUploadConfig['s3']>,
    bytes: Buffer,
    mime: string,
    filename: string,
  ): Promise<{ url: string }> {
    const key = this.key(config.path, filename);
    const endpoint = config.endpoint
      ? config.endpoint.startsWith('http')
        ? config.endpoint
        : `https://${config.endpoint}`
      : undefined;
    const client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.accessKeySecret,
      },
      endpoint,
      forcePathStyle: config.pathStyle,
    });

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: mime,
        }),
      );
    } finally {
      client.destroy();
    }

    return { url: this.publicUrl(config, endpoint, key) };
  }

  private key(path: string | null, filename: string): string {
    const ext = filename.includes('.')
      ? filename.split('.').pop()?.toLowerCase()
      : undefined;
    const generated = `${Date.now()}-${randomUUID()}${ext ? `.${ext}` : ''}`;
    const now = new Date();
    const datePath = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('/');
    return [path, datePath, generated].filter(Boolean).join('/');
  }

  private publicUrl(
    config: NonNullable<ResolvedDoocsUploadConfig['s3']>,
    endpoint: string | undefined,
    key: string,
  ): string {
    if (config.cdnHost) {
      if (!config.cdnHost.startsWith('https://')) {
        throw new Error('S3 CDN host must use HTTPS');
      }
      return `${config.cdnHost.replace(/\/+$/, '')}/${key}`;
    }
    if (endpoint) {
      if (!endpoint.startsWith('https://')) {
        throw new Error('S3 endpoint must use HTTPS');
      }
      const protocol = 'https';
      const host = endpoint.replace(PROTOCOL_REGEX, '').replace(/\/+$/, '');
      return config.pathStyle
        ? `${protocol}://${host}/${config.bucket}/${key}`
        : `${protocol}://${config.bucket}.${host}/${key}`;
    }
    return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
  }
}
