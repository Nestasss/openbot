import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ZodError } from 'zod';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { pushSubscribeSchema, pushUnsubscribeSchema } from './push.dto';
import { PushService } from './push.service';

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-public-key')
  async vapidPublicKey() {
    return { ok: true, publicKey: this.push.vapidPublicKey() };
  }

  @Get('status')
  async status(@Req() req: any) {
    return await this.push.myStatus(req.user.id);
  }

  @Post('subscribe')
  async subscribe(@Req() req: any, @Body() body: unknown) {
    try {
      const { subscription } = pushSubscribeSchema.parse(body);
      await this.push.upsertSubscription(req.user.id, subscription);
      return { ok: true };
    } catch (e) {
      if (e instanceof ZodError) return { ok: false, error: 'VALIDATION', details: e.flatten() };
      throw e;
    }
  }

  @Post('unsubscribe')
  async unsubscribe(@Req() req: any, @Body() body: unknown) {
    try {
      const { endpoint } = pushUnsubscribeSchema.parse(body);
      await this.push.removeSubscription(req.user.id, endpoint);
      return { ok: true };
    } catch (e) {
      if (e instanceof ZodError) return { ok: false, error: 'VALIDATION', details: e.flatten() };
      throw e;
    }
  }
}
