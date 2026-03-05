import { Body, Controller, Post } from '@nestjs/common';
import { ZodError } from 'zod';
import { AuthService } from './auth.service';
import { requestTelegramLinkSchema } from './auth.link.dto';
import { requestCodeSchema, verifyCodeSchema } from './auth.dto';
import { verifyTelegramLoginSchema } from './auth.tglogin.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('request-code')
  async requestCode(@Body() body: unknown) {
    try {
      const { phone } = requestCodeSchema.parse(body);
      return await this.auth.requestCode(phone);
    } catch (e) {
      if (e instanceof ZodError) {
        return { ok: false, error: 'VALIDATION', details: e.flatten() };
      }
      throw e;
    }
  }

  @Post('verify-code')
  async verifyCode(@Body() body: unknown) {
    try {
      const { phone, code } = verifyCodeSchema.parse(body);
      return await this.auth.verifyCode(phone, code);
    } catch (e) {
      if (e instanceof ZodError) {
        return { ok: false, error: 'VALIDATION', details: e.flatten() };
      }
      throw e;
    }
  }

  // Telegram linking: user will paste this code into the bot: /link <code>
  @Post('request-telegram-link')
  async requestTelegramLink(@Body() body: unknown) {
    try {
      const { phone } = requestTelegramLinkSchema.parse(body);
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await this.auth.setTelegramLinkCode(phone, code);
      return { ok: true, linkCode: code };
    } catch (e) {
      if (e instanceof ZodError) {
        return { ok: false, error: 'VALIDATION', details: e.flatten() };
      }
      throw e;
    }
  }

  // New simple flow: create a telegram login session. User will open bot via /start <sessionId>
  @Post('start-telegram-login')
  async startTelegramLogin() {
    const sessionId = await this.auth.startTelegramLoginSession();
    return { ok: true, sessionId };
  }

  // Verify code by sessionId (no phone entry required)
  @Post('verify-telegram-login')
  async verifyTelegramLogin(@Body() body: unknown) {
    try {
      const { sessionId, code } = verifyTelegramLoginSchema.parse(body);
      return await this.auth.verifyTelegramLogin(sessionId, code);
    } catch (e) {
      if (e instanceof ZodError) {
        return { ok: false, error: 'VALIDATION', details: e.flatten() };
      }
      throw e;
    }
  }
}
