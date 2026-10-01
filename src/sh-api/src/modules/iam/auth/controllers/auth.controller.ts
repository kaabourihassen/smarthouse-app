import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { GoogleLoginDto } from '../dto/google-login.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { SessionsService } from '../services/sessions.service';

const COOKIE_NAME = 'access_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly sessionsService: SessionsService,
  ) {}

  private getCookieOptions(req: Request) {
    const isProd = this.configService.get('NODE_ENV') === 'production';
    const forwardedProto = req.headers['x-forwarded-proto'];
    const isHttps = req.secure || forwardedProto === 'https';

    // If you run "production" locally on http://, `secure: true` prevents the cookie from being set,
    // which makes login appear broken. We only mark cookies `secure` when the request is actually HTTPS.
    const secure = isProd ? isHttps : false;

    return {
      httpOnly: true,
      // Must be available to all API routes (not only /api/auth/*)
      path: '/',
      sameSite: 'lax' as const,
      secure,
    };
  }

  private setCookie(res: Response, token: string, req: Request): void {
    res.cookie(COOKIE_NAME, token, {
      ...this.getCookieOptions(req),
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  private clearCookie(res: Response, req: Request): void {
    res.clearCookie(COOKIE_NAME, this.getCookieOptions(req));
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user } = await this.authService.register(dto, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    this.setCookie(res, accessToken, req);
    return { user };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user } = await this.authService.login(dto, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    this.setCookie(res, accessToken, req);
    return { user };
  }

  @Post('google')
  async googleLogin(
    @Body() dto: GoogleLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user } = await this.authService.loginWithGoogle(dto.credential, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    this.setCookie(res, accessToken, req);
    return { user };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const user = await this.authService.updateProfile(userId, dto);
    return { user };
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const { accessToken, user } = await this.authService.changePassword(userId, dto, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    this.setCookie(res, accessToken, req);
    return { user };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req?.cookies?.[COOKIE_NAME] as string | undefined;
    if (token) {
      try {
        const payload = this.jwtService.verify(token) as { sid?: unknown };
        const sid = typeof payload?.sid === 'string' ? payload.sid : null;
        if (sid) {
          await this.sessionsService.revokeSession(sid);
        }
      } catch {
        // Ignore invalid/expired tokens; logout still clears cookie.
      }
    }
    this.clearCookie(res, req);
    return { ok: true };
  }

}
