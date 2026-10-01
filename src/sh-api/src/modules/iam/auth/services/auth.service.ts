import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { UsersService } from '../../../iam/users/services/users.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { SessionsService, SessionMeta } from './sessions.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client | null = null;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly sessionsService: SessionsService,
    private readonly configService: ConfigService,
  ) {}

  private getGoogleClientId(): string {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID') ?? process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new BadRequestException('GOOGLE_CLIENT_ID is not configured');
    }
    return clientId;
  }

  private getGoogleClient(): OAuth2Client {
    if (this.googleClient) return this.googleClient;
    this.googleClient = new OAuth2Client(this.getGoogleClientId());
    return this.googleClient;
  }

  async register(dto: RegisterDto, meta: SessionMeta = {}) {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersService.create(
      dto.firstName,
      dto.lastName,
      dto.email,
      passwordHash,
      dto.role,
    );
    const session = await this.sessionsService.createSession(user.id, meta);
    const token = this.signToken(user.id, user.email, session.id);
    return { user, ...token };
  }

  async login(dto: LoginDto, meta: SessionMeta = {}) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const stored = user.passwordHash;
    if (!stored || typeof stored !== 'string') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const looksLikeBcrypt = stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');

    let passwordMatch = false;
    if (looksLikeBcrypt) {
      passwordMatch = await bcrypt.compare(dto.password, stored);
    } else {
      // Legacy compatibility: some seeded DBs store plaintext in `passwordHash`.
      passwordMatch = dto.password === stored;
      if (passwordMatch) {
        user.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
        await user.save();
      }
    }

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if ((user as any).banned) {
      throw new UnauthorizedException('Account is banned');
    }
    const safeUser = this.usersService.toSafeUser(user);
    const session = await this.sessionsService.createSession(safeUser.id, meta);
    const token = this.signToken(safeUser.id, safeUser.email, session.id);
    return { user: safeUser, ...token };
  }

  async loginWithGoogle(credential: string, meta: SessionMeta = {}) {
    const clientId = this.getGoogleClientId();
    let ticket: any;
    try {
      ticket = await this.getGoogleClient().verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }

    const payload = ticket?.getPayload?.();
    const email = payload?.email?.trim().toLowerCase();

    if (!email) {
      throw new UnauthorizedException('Invalid Google token');
    }
    if (payload?.email_verified === false) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const firstName = (payload?.given_name || payload?.name || 'Google').toString().trim() || 'Google';
    const lastName = (payload?.family_name || '').toString().trim() || 'User';

    let userDoc = await this.usersService.findByEmail(email);
    let safeUser: { id: string; email: string } & Record<string, any>;

    if (userDoc) {
      if ((userDoc as any).banned) {
        throw new UnauthorizedException('Account is banned');
      }
      safeUser = this.usersService.toSafeUser(userDoc);
    } else {
      // Create a local account tied to this email. Password is random (login is via Google).
      const randomPassword = randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, SALT_ROUNDS);
      const created = await this.usersService.create(firstName, lastName, email, passwordHash);
      safeUser = created;
      userDoc = await this.usersService.findByEmail(email);
    }

    const session = await this.sessionsService.createSession(safeUser.id, meta);
    const token = this.signToken(safeUser.id, safeUser.email, session.id);
    return { user: safeUser, ...token };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.firstName === undefined && dto.lastName === undefined && dto.email === undefined) {
      throw new BadRequestException('No updates provided');
    }
    return this.usersService.updateProfile(userId, dto);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    meta: SessionMeta = {},
  ) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const stored = user.passwordHash;
    if (!stored || typeof stored !== 'string') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const looksLikeBcrypt =
      stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');

    const passwordMatch = looksLikeBcrypt
      ? await bcrypt.compare(dto.currentPassword, stored)
      : dto.currentPassword === stored;

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await user.save();

    await this.sessionsService.revokeAllForUser(user.id);
    const session = await this.sessionsService.createSession(user.id, meta);
    const token = this.signToken(user.id, user.email, session.id);
    return { user: this.usersService.toSafeUser(user), ...token };
  }

  private signToken(userId: string, email: string, sessionId: string) {
    const payload = { sub: userId, email, sid: sessionId };
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }
}
