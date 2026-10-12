import { z } from 'zod';
export const teacherSchema = z.object({
  firstName: z.string().trim().min(1, 'Вкажіть ім’я').max(100),
  lastName: z.string().trim().min(1, 'Вкажіть прізвище').max(100),
  shortDescription: z.string().trim().max(500),
  biography: z.string().trim().max(20000),
  photoId: z.union([z.literal(''), z.uuid()]),
});
