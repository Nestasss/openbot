import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

function rand6(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly jwt: JwtService,
  ) {}

  private otpKey(phone: string) {
    return `otp:${phone}`;
  }

  private otpRlKey(phone: string) {
    return `otp:rl:${phone}`;
  }

  async requestCode(phone: string) {
    const redis = this.redisService.redis;

    // Require Telegram linking: send login code only to the user's personal Telegram chat.
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { telegramChatId: true },
    });
    if (!user?.telegramChatId) {
      return { ok: false as const, error: 'TELEGRAM_NOT_LINKED' as const };
    }

    // rate limit: max 3 per 10 min per phone
    const rlKey = this.otpRlKey(phone);
    const count = await redis.incr(rlKey);
    if (count === 1) {
      await redis.expire(rlKey, 10 * 60);
    }
    if (count > 3) {
      return { ok: true } as const; // don't leak info
    }

    const code = rand6();
    await redis.set(this.otpKey(phone), code, 'EX', 5 * 60);

    await this.sendTelegramCode(phone, code, user.telegramChatId);

    return { ok: true } as const;
  }

  async setTelegramLinkCode(phone: string, code: string) {
    const redis = this.redisService.redis;
    // 10 minutes
    await redis.set(`tg:link:${code}`, phone, 'EX', 10 * 60);
  }

  async startTelegramLoginSession() {
    const redis = this.redisService.redis;
    const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    await redis.set(`tg:login:${sessionId}`, '1', 'EX', 10 * 60);
    return sessionId;
  }

  async attachTelegramLoginSession(sessionId: string, chatId: string) {
    const redis = this.redisService.redis;
    const exists = await redis.get(`tg:login:${sessionId}`);
    if (!exists) return false;
    await redis.set(`tg:login:${sessionId}:chat`, chatId, 'EX', 10 * 60);
    await redis.set(`tg:login:chat:${chatId}`, sessionId, 'EX', 10 * 60);
    return true;
  }

  async setTelegramLoginPhone(chatId: string, phone: string) {
    const redis = this.redisService.redis;
    const sessionId = await redis.get(`tg:login:chat:${chatId}`);
    if (!sessionId) return null;
    const exists = await redis.get(`tg:login:${sessionId}`);
    if (!exists) return null;

    await redis.set(`tg:login:${sessionId}:phone`, phone, 'EX', 10 * 60);
    return sessionId;
  }

  async verifyTelegramLogin(sessionId: string, code: string) {
    const redis = this.redisService.redis;
    const phone = await redis.get(`tg:login:${sessionId}:phone`);
    if (!phone) return { ok: false as const, error: 'SESSION_NOT_READY' as const };
    return await this.verifyCode(phone, code);
  }

  async verifyCode(phone: string, code: string) {
    const redis = this.redisService.redis;
    const stored = await redis.get(this.otpKey(phone));
    if (!stored || stored !== code) {
      return { ok: false as const, error: 'INVALID_CODE' as const };
    }

    await redis.del(this.otpKey(phone));

    const user = await this.prisma.user.upsert({
      where: { phone },
      create: { phone },
      update: {},
      select: { id: true, phone: true, createdAt: true },
    });

    const accessToken = await this.jwt.signAsync({ sub: user.id, phone: user.phone });

    return { ok: true as const, accessToken, user };
  }

  private async sendTelegramCode(phone: string, code: string, userChatId: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !userChatId) return;

    const text = `Raka login code\n${phone}: ${code}`;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: userChatId, text }),
      });

      const body = await res.text();
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error('TELEGRAM_SEND_FAILED', res.status, body);
      } else {
        // eslint-disable-next-line no-console
        console.log('TELEGRAM_SENT', body);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('TELEGRAM_SEND_ERROR', e);
    }
  }
}
