import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { ApiKeyService } from './api-key.service';
import { FastifyRequest } from 'fastify';
import { extractBearerTokenFromHeader } from '../../common/helpers';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly apiKeyService: ApiKeyService) {
    super();
  }

  async validate(req: FastifyRequest, done: Function): Promise<any> {
    const token = extractBearerTokenFromHeader(req);

    // Not a dm_sk_ token — skip, let JwtStrategy handle it
    if (!token || !token.startsWith('dm_sk_')) {
      return done(null, false);
    }

    try {
      const result = await this.apiKeyService.validateApiKey(token);
      return done(null, result);
    } catch {
      return done(null, false);
    }
  }
}
