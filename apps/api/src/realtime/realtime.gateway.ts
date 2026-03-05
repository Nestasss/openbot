import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayInit,
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
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
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

      client.emit('ready', { ok: true });
    } catch {
      client.disconnect(true);
    }
  }
}
