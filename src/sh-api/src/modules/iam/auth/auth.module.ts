import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../../iam/users/users.module';
import { Session, SessionSchema } from './schemas/session.schema';
import { SessionsService } from './services/sessions.service';
import { SubscriptionsModule } from '../../billing_domain/subscriptions/subscriptions.module';
import { JwtSubscriptionGuard } from './guards/jwt-subscription.guard';

function getJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET');
  const isProd = configService.get('NODE_ENV') === 'production';

  if (secret) return secret;
  if (isProd) {
    throw new Error('JWT_SECRET is not set. Configure it (env var or .env) before starting the API.');
  }

  return 'dev-jwt-secret-change-me';
}

@Module({
  imports: [
    UsersModule,
    SubscriptionsModule,
    MongooseModule.forFeature([{ name: Session.name, schema: SessionSchema }]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: getJwtSecret(configService),
        signOptions: { expiresIn: configService.get('JWT_EXPIRES_IN', '1d') as '1d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionsService, JwtStrategy, JwtSubscriptionGuard],
  exports: [SessionsService, JwtModule, JwtSubscriptionGuard, UsersModule, SubscriptionsModule],
})
export class AuthModule {}
