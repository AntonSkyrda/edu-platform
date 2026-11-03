import type { NodeRequest as Request } from '@nestjs/platform-node';

import type { AuthContext } from '../../auth/interfaces/auth-context.interface';

export type AuthRequest = Request & { auth: AuthContext };
