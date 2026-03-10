import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushModule } from '../push/push.module';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

@Module({
  imports: [RealtimeModule, PushModule],
  controllers: [ChatsController],
  providers: [ChatsService],
})
export class ChatsModule {}
