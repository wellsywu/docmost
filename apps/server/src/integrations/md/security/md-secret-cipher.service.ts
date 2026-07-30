import { Injectable } from '@nestjs/common';
import {
  decryptWechatAccountSecret,
  encryptWechatAccountSecret,
  EncryptedSecretEnvelope,
} from '@docmost/integration-db';
import { EnvironmentService } from '../../environment/environment.service';

@Injectable()
export class MdSecretCipherService {
  private readonly appSecret: string;

  constructor(environmentService: EnvironmentService) {
    this.appSecret = environmentService.getAppSecret();
  }

  encrypt(secret: string): EncryptedSecretEnvelope {
    return encryptWechatAccountSecret(secret, this.appSecret);
  }

  decrypt(envelope: EncryptedSecretEnvelope): string {
    return decryptWechatAccountSecret(envelope, this.appSecret);
  }
}
