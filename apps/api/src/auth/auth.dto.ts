import { z } from 'zod';

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{9,14}$/, 'Phone must be in E.164 format, e.g. +79991234567');

export const requestCodeSchema = z.object({
  phone: phoneSchema,
});

export const verifyCodeSchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export type RequestCodeDto = z.infer<typeof requestCodeSchema>;
export type VerifyCodeDto = z.infer<typeof verifyCodeSchema>;
