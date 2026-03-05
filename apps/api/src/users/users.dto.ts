import { z } from 'zod';
import { phoneSchema } from '../auth/auth.dto';

export const lookupByPhoneSchema = z.object({
  phone: phoneSchema,
});

export const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  notificationsEnabled: z.boolean().optional(),
  avatarPath: z.string().trim().max(1024).optional(),
});

export type LookupByPhoneDto = z.infer<typeof lookupByPhoneSchema>;
export type UpdateMeDto = z.infer<typeof updateMeSchema>;
