import { INVITABLE_ROLES } from '@project/contracts';
import { z } from 'zod';
export const inviteSchema = z.object({
  email: z.string().trim().email('Вкажіть коректний email').max(254),
  firstName: z.string().trim().min(1, 'Вкажіть ім’я').max(100),
  lastName: z.string().trim().min(1, 'Вкажіть прізвище').max(100),
  role: z.enum(INVITABLE_ROLES),
});
export const roleLabels = {
  ADMIN: 'Адміністратор',
  MANAGER: 'Менеджер',
  TEACHER: 'Викладач',
  STUDENT: 'Студент',
};
export const statusLabels = {
  INVITED: 'Запрошений',
  ACTIVE: 'Активний',
  BLOCKED: 'Заблокований',
};
