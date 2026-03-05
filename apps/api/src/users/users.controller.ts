import { Body, Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ZodError } from 'zod';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/auth.user';
import type { AuthUser } from '../auth/jwt.guard';
import { lookupByPhoneSchema, updateMeSchema } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const me = await this.users.me(user.id);
    if (!me) throw new NotFoundException('USER_NOT_FOUND');
    return { ok: true, user: me };
  }

  // Lookup an existing user by phone (E.164). Requires auth.
  // Returns { user: null } if not found.
  @UseGuards(JwtAuthGuard)
  @Get('lookup')
  async lookup(@Query() query: unknown) {
    try {
      const { phone } = lookupByPhoneSchema.parse(query);
      const u = await this.users.findByPhone(phone);
      return { ok: true, user: u };
    } catch (e) {
      if (e instanceof ZodError) return { ok: false, error: 'VALIDATION', details: e.flatten() };
      throw e;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    try {
      const dto = updateMeSchema.parse(body);
      const me = await this.users.updateMe(user.id, dto);
      return { ok: true, user: me };
    } catch (e) {
      if (e instanceof ZodError) return { ok: false, error: 'VALIDATION', details: e.flatten() };
      throw e;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async byId(@Param('id') id: string) {
    const u = await this.users.findById(id);
    if (!u) throw new NotFoundException('USER_NOT_FOUND');
    return { ok: true, user: u };
  }
}
