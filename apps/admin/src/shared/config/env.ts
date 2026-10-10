import { z } from 'zod';

const schema = z.object({
  apiUrl: z
    .url()
    .refine(
      (value) => ['http:', 'https:'].includes(new URL(value).protocol),
      'API URL must use HTTP or HTTPS',
    ),
});

export const env = schema.parse({ apiUrl: import.meta.env.VITE_API_URL });
