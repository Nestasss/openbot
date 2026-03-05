import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { ChatsModule } from './chats/chats.module';
import { MediaModule } from './media/media.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    ChatsModule,
    MediaModule,
    RealtimeModule,
    TelegramModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
