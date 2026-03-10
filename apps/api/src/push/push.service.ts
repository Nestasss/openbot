import { Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

function getVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@notificbot.ru';
  return { publicKey, privateKey, subject };
}

@Injectable()
export class PushService {
  constructor(private readonly prisma: PrismaService) {
    const v = getVapid();
    if (v.publicKey && v.privateKey) {
      webpush.setVapidDetails(v.subject, v.publicKey, v.privateKey);
    }
  }

  vapidPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || '';
  }

  async upsertSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      update: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    });
  }

  async removeSubscription(userId: string, endpoint: string) {
    // don't allow deleting other user's endpoint
    const row = await this.prisma.pushSubscription.findUnique({ where: { endpoint }, select: { userId: true } });
    if (!row) return;
    if (row.userId !== userId) return;
    await this.prisma.pushSubscription.delete({ where: { endpoint } });
  }

  async myStatus(userId: string) {
    const count = await this.prisma.pushSubscription.count({ where: { userId } });
    return { ok: true as const, enabled: count > 0, count };
  }

  async sendToUser(userId: string, payload: any) {
    const v = getVapid();
    if (!v.publicKey || !v.privateKey) {
      return;
    }

    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
      select: { endpoint: true, p256dh: true, auth: true },
    });

    const body = JSON.stringify(payload);

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            body,
          );
        } catch (e: any) {
          // If subscription is gone, drop it.
          const status = e?.statusCode || e?.status || 0;
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.delete({ where: { endpoint: s.endpoint } }).catch(() => null);
          }
        }
      }),
    );
  }
}
