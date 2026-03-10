import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  // Presence: user is "active" inside a specific chat (opened in UI)
  private activeChatByUser = new Map<string, string | null>();

  setServer(server: Server) {
    this.server = server;
  }

  setUserActiveChat(userId: string, chatId: string | null) {
    this.activeChatByUser.set(userId, chatId);
  }

  clearUser(userId: string) {
    this.activeChatByUser.delete(userId);
  }

  isUserActiveInChat(userId: string, chatId: string) {
    return this.activeChatByUser.get(userId) === chatId;
  }

  emitNewMessage(chatId: string, payload: any) {
    if (!this.server) return;
    this.server.to(`chat:${chatId}`).emit('message:new', payload);
  }
}
