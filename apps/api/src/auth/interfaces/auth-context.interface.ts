import type { AuthUser } from '@project/contracts';

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
}
