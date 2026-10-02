import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { EnvironmentService } from '../../config/environment.service';

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly environment: EnvironmentService,
  ) {}
  async issue(userId: string, sessionId: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId, type: 'access' },
      {
        secret: this.environment.accessJwtSecret,
        algorithm: 'HS256',
        expiresIn: this.environment.accessTokenTtlSeconds,
        issuer: this.environment.jwtIssuer,
        audience: this.environment.jwtAudience,
      },
    );
    return { accessToken, expiresIn: this.environment.accessTokenTtlSeconds };
  }
  async verify(token: string): Promise<{ userId: string; sessionId: string }> {
    try {
      const payload: unknown = await this.jwt.verifyAsync(token, {
        secret: this.environment.accessJwtSecret,
        algorithms: ['HS256'],
        issuer: this.environment.jwtIssuer,
        audience: this.environment.jwtAudience,
      });
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('type' in payload) ||
        payload.type !== 'access' ||
        !('sub' in payload) ||
        typeof payload.sub !== 'string' ||
        !uuid.test(payload.sub) ||
        !('sid' in payload) ||
        typeof payload.sid !== 'string' ||
        !uuid.test(payload.sid)
      )
        throw new UnauthorizedException();
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      throw new UnauthorizedException();
    }
  }
}
