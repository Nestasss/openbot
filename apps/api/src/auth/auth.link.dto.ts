import { z } from 'zod';
import { phoneSchema } from './auth.dto';

export const requestTelegramLinkSchema = z.object({
  phone: phoneSchema,
});

export type RequestTelegramLinkDto = z.infer<typeof requestTelegramLinkSchema>;
