import { z } from 'zod';

export const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(10),
      auth: z.string().min(10),
    }),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});
