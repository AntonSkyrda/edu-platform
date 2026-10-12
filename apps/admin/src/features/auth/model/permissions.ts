import type { CurrentUser, Permission } from '@project/contracts';
import { useQuery } from '@tanstack/react-query';

import { sessionOptions } from './session';
export function hasPermission(
  user: CurrentUser | null | undefined,
  permission: Permission,
) {
  return (
    user?.status === 'ACTIVE' &&
    (user.role === 'ADMIN' ||
      (user.role === 'MANAGER' &&
        user.permissions?.includes(permission) === true))
  );
}
export function usePermissions() {
  const { data } = useQuery(sessionOptions);
  return (permission: Permission) => hasPermission(data, permission);
}
