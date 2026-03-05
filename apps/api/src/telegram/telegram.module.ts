import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [PrismaModule, RedisModule, AuthModule],
  controllers: [TelegramController],
})
export class TelegramModule {}
