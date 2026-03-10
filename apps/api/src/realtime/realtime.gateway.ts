import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.setServer(server);
  }

  async handleConnection(client: Socket) {
    // Expect JWT via:
    // - client.handshake.auth.token
    // - or ?token=... query
    const token =
      (client.handshake.auth as any)?.token ||
      (client.handshake.query?.token as string | undefined);

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      });
      const userId = payload.sub as string;

      (client.data as any).userId = userId;

      // join personal room
      client.join(`user:${userId}`);

      // join all chat rooms
      const parts = await this.prisma.chatParticipant.findMany({
        where: { userId },
        select: { chatId: true },
      });
      for (const p of parts) client.join(`chat:${p.chatId}`);

      // default: not active in any chat
      this.realtime.setUserActiveChat(userId, null);

      client.emit('ready', { ok: true });
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client.data as any)?.userId as string | undefined;
    if (userId) this.realtime.clearUser(userId);
  }

  @SubscribeMessage('presence:active')
  async presenceActive(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: any,
  ) {
    const userId = (client.data as any)?.userId as string | undefined;
    if (!userId) return;

    const chatId = typeof body?.chatId === 'string' ? body.chatId : null;

    // Only allow marking active for chats the user participates in (basic guard)
    if (chatId) {
      const isMember = await this.prisma.chatParticipant.findUnique({
        where: { chatId_userId: { chatId, userId } },
        select: { userId: true },
      });
      if (!isMember) {
        this.realtime.setUserActiveChat(userId, null);
        return;
      }
    }

    this.realtime.setUserActiveChat(userId, chatId);
  }

  @SubscribeMessage('presence:idle')
  async presenceIdle(@ConnectedSocket() client: Socket) {
    const userId = (client.data as any)?.userId as string | undefined;
    if (!userId) return;
    this.realtime.setUserActiveChat(userId, null);
  }
}

