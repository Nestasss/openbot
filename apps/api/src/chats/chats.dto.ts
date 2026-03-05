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
  mediaPath: z.string().trim().max(1024).optional(),
});

export type CreateChatDto = z.infer<typeof createChatSchema>;
export type CreateDirectByPhoneDto = z.infer<typeof createDirectByPhoneSchema>;
export type SendMessageDto = z.infer<typeof sendMessageSchema>;
