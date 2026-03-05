import { z } from 'zod';

export const startTelegramLoginSchema = z.object({});

export const verifyTelegramLoginSchema = z.object({
  sessionId: z.string().trim().min(8).max(128),
  code: z.string().trim().regex(/^\d{6}$/),
});

export type VerifyTelegramLoginDto = z.infer<typeof verifyTelegramLoginSchema>;
