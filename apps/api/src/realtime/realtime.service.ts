import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  emitNewMessage(chatId: string, payload: any) {
    if (!this.server) return;
    this.server.to(`chat:${chatId}`).emit('message:new', payload);
  }
}
