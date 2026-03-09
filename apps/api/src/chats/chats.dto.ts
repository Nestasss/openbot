import { z } from 'zod';
import { phoneSchema } from '../auth/auth.dto';

export const createChatSchema = z.object({
  peerUserId: z.string().trim().min(1),
});

export const createDirectByPhoneSchema = z.object({
  phone: phoneSchema,
});

export const sendMessageSchema = z.object({
  text: z.string().trim().max(4000).optional(),

  mediaKind: z.enum(['photo', 'voice']).optional(),
  mediaPath: z.string().trim().max(1024).optional(),
  mediaMime: z.string().trim().max(128).optional(),
  mediaSize: z.number().int().positive().max(50 * 1024 * 1024).optional(),
  mediaDurationMs: z.number().int().positive().max(180_000).optional(),
});

export type CreateChatDto = z.infer<typeof createChatSchema>;
export type CreateDirectByPhoneDto = z.infer<typeof createDirectByPhoneSchema>;
export type SendMessageDto = z.infer<typeof sendMessageSchema>;
