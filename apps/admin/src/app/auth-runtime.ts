import { captureLinkToken, recoverSession, sessionKey } from '@/features/auth';
import { configureSessionRecovery } from '@/shared/api/client';

import { queryClient } from './query-client';
import { router } from './router';
captureLinkToken();
configureSessionRecovery(recoverSession, () => {
  queryClient.setQueryData(sessionKey, null);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== 'auth',
  });
  window.setTimeout(() => {
    void router.invalidate();
  }, 0);
});
