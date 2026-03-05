import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ZodError } from 'zod';
import { CurrentUser } from '../auth/auth.user';
import { JwtAuthGuard, type AuthUser } from '../auth/jwt.guard';
import { ChatsService } from './chats.service';
import { createChatSchema, createDirectByPhoneSchema, sendMessageSchema } from './chats.dto';

@UseGuards(JwtAuthGuard)
@Controller('chats')
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const items = await this.chats.listMyChats(user.id);
    return { ok: true, chats: items };
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    try {
      const { peerUserId } = createChatSchema.parse(body);
      const chat = await this.chats.createDirectChat(user.id, peerUserId);
      return { ok: true, chat };
    } catch (e) {
      if (e instanceof ZodError) return { ok: false, error: 'VALIDATION', details: e.flatten() };
      throw e;
    }
  }

  // Create or return a 1-1 chat by peer phone. (Peer must already exist.)
  @Post('direct')
  async directByPhone(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    try {
      const { phone } = createDirectByPhoneSchema.parse(body);
      const peer = await this.chats.findUserIdByPhone(phone);
      if (!peer) return { ok: false, error: 'PEER_NOT_FOUND' as const };

      const chat = await this.chats.createDirectChat(user.id, peer.id);
      return { ok: true, chat };
    } catch (e) {
      if (e instanceof ZodError) return { ok: false, error: 'VALIDATION', details: e.flatten() };
      throw e;
    }
  }

  @Get(':id/messages')
  async messages(
    @CurrentUser() user: AuthUser,
    @Param('id') chatId: string,
    @Query('limit') limit?: string,
  ) {
    const items = await this.chats.listMessages(user.id, chatId, limit ? Number(limit) : 50);
    return { ok: true, messages: items };
  }

  @Post(':id/messages')
  async send(@CurrentUser() user: AuthUser, @Param('id') chatId: string, @Body() body: unknown) {
    try {
      const dto = sendMessageSchema.parse(body);
      const msg = await this.chats.sendMessage(user.id, chatId, dto);
      return { ok: true, message: msg };
    } catch (e) {
      if (e instanceof ZodError) return { ok: false, error: 'VALIDATION', details: e.flatten() };
      throw e;
    }
  }

  @Delete(':id')
  async deleteChat(@CurrentUser() user: AuthUser, @Param('id') chatId: string) {
    await this.chats.deleteChatForAll(user.id, chatId);
    return { ok: true };
  }
}
