import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        name: true,
        avatarPath: true,
        notificationsEnabled: true,
        createdAt: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        name: true,
        avatarPath: true,
        notificationsEnabled: true,
        createdAt: true,
      },
    });
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        phone: true,
        name: true,
        avatarPath: true,
        notificationsEnabled: true,
        createdAt: true,
      },
    });
  }

  async updateMe(
    userId: string,
    data: { name?: string; notificationsEnabled?: boolean; avatarPath?: string },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.notificationsEnabled !== undefined ? { notificationsEnabled: data.notificationsEnabled } : {}),
        ...(data.avatarPath !== undefined ? { avatarPath: data.avatarPath } : {}),
      },
      select: {
        id: true,
        phone: true,
        name: true,
        avatarPath: true,
        notificationsEnabled: true,
        createdAt: true,
      },
    });
  }

  async setAvatar(userId: string, avatarPath: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarPath },
      select: {
        id: true,
        phone: true,
        name: true,
        avatarPath: true,
        notificationsEnabled: true,
        createdAt: true,
      },
    });
  }
}
