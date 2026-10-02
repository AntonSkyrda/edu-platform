import type { AuthUser } from '@project/contracts';
import type { User } from '@project/database/types';

export const toAuthUser = (user: User): AuthUser => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  status: user.status,
});
