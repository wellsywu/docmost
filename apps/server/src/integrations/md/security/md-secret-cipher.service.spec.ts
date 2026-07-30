import { MdSecretCipherService } from './md-secret-cipher.service';

describe('MdSecretCipherService', () => {
  const plaintext = 'wechat-app-secret-value';
  const environment = {
    getAppSecret: () => 'server-app-secret-for-tests',
  };

  it('round trips with AES-256-GCM without storing plaintext', () => {
    const cipher = new MdSecretCipherService(environment as never);

    const envelope = cipher.encrypt(plaintext);

    expect(envelope).toEqual({
      version: 1,
      algorithm: 'aes-256-gcm',
      iv: expect.any(String),
      ciphertext: expect.any(String),
      authTag: expect.any(String),
    });
    expect(JSON.stringify(envelope)).not.toContain(plaintext);
    expect(cipher.decrypt(envelope)).toBe(plaintext);
  });

  it('uses a random IV for each encryption', () => {
    const cipher = new MdSecretCipherService(environment as never);

    const first = cipher.encrypt(plaintext);
    const second = cipher.encrypt(plaintext);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });
});
