import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RealtimeService } from '../realtime/realtime.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async createDirectChat(myId: string, peerUserId: string) {
    if (myId === peerUserId) throw new BadRequestException('CANT_CHAT_WITH_SELF');

    const peer = await this.prisma.user.findUnique({ where: { id: peerUserId }, select: { id: true } });
    if (!peer) throw new NotFoundException('PEER_NOT_FOUND');

    // Find an existing 1-1 chat between these two users.
    const existing = await this.prisma.chat.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: myId } } },
          { participants: { some: { userId: peerUserId } } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        participants: { select: { userId: true, joinedAt: true } },
      },
    });
    if (existing) return existing;

    // Create a new 1-1 chat.
    return this.prisma.chat.create({
      data: {
        participants: {
          create: [{ userId: myId }, { userId: peerUserId }],
        },
      },
      select: {
        id: true,
        createdAt: true,
        participants: { select: { userId: true, joinedAt: true } },
      },
    });
  }

  async findUserIdByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
  }

  async listMyChats(myId: string) {
    const rows = await this.prisma.chat.findMany({
      where: { participants: { some: { userId: myId } } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        updatedAt: true,
        createdAt: true,
        participants: {
          select: {
            userId: true,
            lastReadAt: true,
            user: { select: { id: true, phone: true, name: true, avatarPath: true } },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            senderId: true,
            text: true,
            mediaPath: true,
            createdAt: true,
          },
        },
      },
    });

    const items = await Promise.all(
      rows.map(async (c) => {
        const users = c.participants.map((p) => p.user);
        const peer = users.find((u) => u.id !== myId) || null;
        const lastMessage = c.messages?.[0] || null;

        const myPart = c.participants.find((p) => p.userId === myId) || null;
        const myLastReadAt = myPart?.lastReadAt ?? null;

        const peerPart = c.participants.find((p) => p.userId !== myId) || null;
        const peerLastReadAt = peerPart?.lastReadAt ?? null;

        const since = myLastReadAt ?? new Date(0);
        const unreadCount = await this.prisma.message.count({
          where: {
            chatId: c.id,
            senderId: { not: myId },
            createdAt: { gt: since },
          },
        });

        return {
          id: c.id,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          peer,
          participants: users,
          lastMessage,
          myLastReadAt,
          peerLastReadAt,
          unreadCount,
        };
      }),
    );

    return items;
  }

  async sendMessage(myId: string, chatId: string, data: { text?: string; mediaPath?: string }) {
    if (!data.text && !data.mediaPath) throw new BadRequestException('EMPTY_MESSAGE');

    const isMember = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId: myId } },
      select: { userId: true },
    });
    if (!isMember) throw new NotFoundException('CHAT_NOT_FOUND');

    const msg = await this.prisma.message.create({
      data: {
        chatId,
        senderId: myId,
        text: data.text,
        mediaPath: data.mediaPath,
      },
      select: {
        id: true,
        chatId: true,
        senderId: true,
        text: true,
        mediaPath: true,
        createdAt: true,
      },
    });

    // bump chat updatedAt
    await this.prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

    // realtime fanout
    this.realtime.emitNewMessage(chatId, msg);

    return msg;
  }

  async deleteChatForAll(myId: string, chatId: string) {
    const isMember = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId: myId } },
      select: { userId: true },
    });
    if (!isMember) throw new NotFoundException('CHAT_NOT_FOUND');

    // Deleting chat cascades participants and messages.
    await this.prisma.chat.delete({ where: { id: chatId } });
  }

  async listMessages(myId: string, chatId: string, limit = 50) {
    const isMember = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId: myId } },
      select: { userId: true },
    });
    if (!isMember) throw new NotFoundException('CHAT_NOT_FOUND');

    // mark as read when opening the chat
    await this.prisma.chatParticipant.update({
      where: { chatId_userId: { chatId, userId: myId } },
      data: { lastReadAt: new Date() },
    });

    const msgs = await this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      select: {
        id: true,
        chatId: true,
        senderId: true,
        text: true,
        mediaPath: true,
        createdAt: true,
      },
    });

    return msgs.reverse();
  }
}
