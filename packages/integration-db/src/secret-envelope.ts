import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import type { EncryptedSecretEnvelope } from './types';

const SECRET_KEY_DOMAIN = 'docmost:md:wechat-account-secret:v1';
const ALGORITHM = 'aes-256-gcm';
const ENVELOPE_VERSION = 1;

function deriveKey(appSecret: string): Buffer {
  return createHmac('sha256', appSecret)
    .update(SECRET_KEY_DOMAIN, 'utf8')
    .digest();
}

export function encryptWechatAccountSecret(
  secret: string,
  appSecret: string,
): EncryptedSecretEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(appSecret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);

  return {
    version: ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptWechatAccountSecret(
  envelope: EncryptedSecretEnvelope,
  appSecret: string,
): string {
  if (
    envelope?.version !== ENVELOPE_VERSION ||
    envelope?.algorithm !== ALGORITHM
  ) {
    throw new Error('Unsupported encrypted secret envelope');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(appSecret),
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
