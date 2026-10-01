import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../../../iam/users/services/users.service';
import { SessionsService } from '../services/sessions.service';

export interface JwtPayload {
  sub: string;
  email: string;
  sid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    configService: ConfigService,
  ) {
    const secret = (() => {
      const value = configService.get<string>('JWT_SECRET');
      const isProd = configService.get('NODE_ENV') === 'production';
      if (value) return value;
      if (isProd) {
        throw new Error('JWT_SECRET is not set. Configure it (env var or .env) before starting the API.');
      }
      return 'dev-jwt-secret-change-me';
    })();

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => (req?.query?.token as string) ?? null,
        (req: Request) => req?.cookies?.access_token ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    // Backward-compatible: old tokens may not have sid.
    if (payload.sid) {
      await this.sessionsService.assertSessionActive(payload.sid);
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }

    if ((user as any).banned) {
      throw new UnauthorizedException('Account is banned');
    }
    return this.usersService.toSafeUser(user);
  }
}
