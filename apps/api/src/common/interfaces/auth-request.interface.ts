import type { Request } from 'express';

import type { AuthContext } from '../../auth/interfaces/auth-context.interface';

export type AuthRequest = Request & { auth: AuthContext };
