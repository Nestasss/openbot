import { Body, Controller, Headers, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly auth: AuthService,
  ) {}

  @Post('webhook')
  async webhook(
    @Body() update: any,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expected && secret !== expected) {
      return { ok: false };
    }

    const msg = update?.message;
    const text: string | undefined = msg?.text;
    const chatId: number | undefined = msg?.chat?.id;

    // contact payload
    const contactPhone: string | undefined = msg?.contact?.phone_number;

    if ((!text && !contactPhone) || !chatId) return { ok: true };

    // /start <payload>
    if (text && text.startsWith('/start')) {
      const parts = text.trim().split(/\s+/);
      const payload = parts[1];

      // New login flow: payload can be a login sessionId.
      if (payload && payload.length >= 8 && !/^\d{6}$/.test(payload)) {
        const ok = await this.auth.attachTelegramLoginSession(payload, String(chatId));
        if (ok) {
          await this.sendMessage(chatId, 'Привет👋🏻\n\nНажми «Отправить номер»\nПолучи код и введи его в Raka');
          await this.sendContactButton(chatId);
          return { ok: true };
        }
      }

      // If payload is a 6-digit link code, auto-link.
      if (payload && /^\d{6}$/.test(payload)) {
        const redis = this.redisService.redis;
        const phone = await redis.get(`tg:link:${payload}`);
        if (phone) {
          await redis.del(`tg:link:${payload}`);
          const user = await this.prisma.user.upsert({
            where: { phone },
            create: { phone, telegramChatId: String(chatId), telegramLinkedAt: new Date() },
            update: { telegramChatId: String(chatId), telegramLinkedAt: new Date() },
            select: { phone: true },
          });
          await this.sendMessage(chatId, `Готово. Номер ${user.phone} привязан. Теперь коды входа будут приходить сюда.`);
          return { ok: true };
        }
      }

      await this.sendMessage(
        chatId,
        'Привет!\n\nДля входа:\n1) Вернись на сайт и нажми «Войти»\n2) Telegram откроет этот бот с кодом\n3) Нажми Start и «Отправить номер»\n\nЕсли ты видишь это сообщение — значит бот открылся без кода. Просто нажми «Войти» на сайте ещё раз.',
      );
      return { ok: true };
    }

    const linkCodeFromText = (() => {
      const t = (text || '').trim();
      if (/^\d{6}$/.test(t)) return t;
      if (t.startsWith('/link')) {
        const parts = t.split(/\s+/);
        return parts[1];
      }
      return undefined;
    })();

    if (contactPhone) {
      const phone = this.normalizePhone(contactPhone);
      if (!phone) {
        await this.sendMessage(chatId, 'Не смог распознать номер. Отправь номер ещё раз через кнопку «Отправить номер».' );
        await this.sendContactButton(chatId);
        return { ok: true };
      }

      const sessionId = await this.auth.setTelegramLoginPhone(String(chatId), phone);
      if (!sessionId) {
        await this.sendMessage(chatId, 'Сессия входа не найдена. Вернись на сайт и нажми «Войти» ещё раз.' );
        return { ok: true };
      }

      // Link telegram to this phone for future logins
      await this.prisma.user.upsert({
        where: { phone },
        create: { phone, telegramChatId: String(chatId), telegramLinkedAt: new Date() },
        update: { telegramChatId: String(chatId), telegramLinkedAt: new Date() },
      });

      // generate and send OTP
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const redis = this.redisService.redis;
      await redis.set(`otp:${phone}`, code, 'EX', 5 * 60);

      await this.sendMessage(chatId, `Код входа: ${code}`);
      await this.sendMessage(chatId, 'Вернись на сайт и введи код.');
      return { ok: true };
    }

    if (linkCodeFromText) {
      const code = linkCodeFromText;
      if (!code) {
        await this.sendMessage(chatId, 'Формат: /link 123456');
        return { ok: true };
      }

      const redis = this.redisService.redis;
      const phone = await redis.get(`tg:link:${code}`);
      if (!phone) {
        await this.sendMessage(chatId, 'Код не найден или истёк. Получи новый на сайте.');
        return { ok: true };
      }

      await redis.del(`tg:link:${code}`);

      const user = await this.prisma.user.upsert({
        where: { phone },
        create: { phone, telegramChatId: String(chatId), telegramLinkedAt: new Date() },
        update: { telegramChatId: String(chatId), telegramLinkedAt: new Date() },
        select: { phone: true },
      });

      await this.sendMessage(chatId, `Готово. Номер ${user.phone} привязан. Теперь коды входа будут приходить сюда.`);
      return { ok: true };
    }

    return { ok: true };
  }

  private normalizePhone(raw: string): string | null {
    // Telegram contact phone_number may be like "7999..." or "+7999...".
    const digits = raw.replace(/[^0-9+]/g, '');
    let p = digits;
    if (p.startsWith('8') && p.length === 11) p = `+7${p.slice(1)}`;
    if (!p.startsWith('+')) p = `+${p}`;
    // minimal validation
    if (!/^\+\d{10,15}$/.test(p)) return null;
    return p;
  }

  private async sendContactButton(chatId: number | string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const reply_markup = {
      keyboard: [[{ text: 'Отправить номер', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    };
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: 'Нажми «Отправить номер»', reply_markup }),
    }).catch(() => undefined);
  }

  private async sendMessage(chatId: number | string, text: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    }).catch(() => undefined);
  }
}
