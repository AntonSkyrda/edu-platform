import { z } from 'zod';
export const subjectSchema = z.object({
  name: z.string().trim().min(1, 'Вкажіть назву').max(100),
  sortOrder: z.number().int().min(0).max(2147483647),
});
