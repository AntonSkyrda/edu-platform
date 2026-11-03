import { randomUUID } from 'node:crypto';

import { type DatabaseExecutor, sql } from '@project/database';

export type DeliveryKind = 'invitation' | 'password-reset' | 'password-changed';
export interface DeliveryClaim {
  id: string;
  leaseId: string;
}
function columns(kind: DeliveryKind) {
  const notification = kind === 'password-changed';
  // Identifiers are selected from constants, never request input.
  return {
    table: sql.identifier(
      kind === 'invitation' ? 'user_invitations' : 'password_resets',
    ),
    status: sql.identifier(
      notification ? 'notification_status' : 'delivery_status',
    ),
    next: sql.identifier(
      notification ? 'notification_next_dispatch_at' : 'next_dispatch_at',
    ),
    lease: sql.identifier(
      notification ? 'notification_dispatch_lease_id' : 'dispatch_lease_id',
    ),
    attempts: sql.identifier(
      notification ? 'notification_dispatch_attempts' : 'dispatch_attempts',
    ),
    enqueued: sql.identifier(
      notification ? 'notification_last_enqueued_at' : 'last_enqueued_at',
    ),
  };
}
export async function claimDelivery(
  db: DatabaseExecutor,
  kind: DeliveryKind,
  leaseMs: number,
): Promise<DeliveryClaim | null> {
  const c = columns(kind);
  const leaseId = randomUUID();
  const result = await db.execute<{ id: string; leaseId: string }>(sql`
    WITH candidate AS (
      SELECT id FROM ${c.table} WHERE ${c.status} = 'pending' AND ${c.next} <= now()
      ORDER BY ${c.next}, created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE ${c.table} AS target
    SET ${c.lease} = ${leaseId}::uuid,
        ${c.next} = now() + ${leaseMs} * interval '1 millisecond',
        ${c.attempts} = ${c.attempts} + 1
    FROM candidate WHERE target.id = candidate.id
    RETURNING target.id, ${c.lease} AS "leaseId"
  `);
  return result.rows[0] ?? null;
}
export async function finishDispatch(
  db: DatabaseExecutor,
  kind: DeliveryKind,
  claim: DeliveryClaim,
  sent: boolean,
  retryMs: number,
): Promise<void> {
  const c = columns(kind);
  await db.execute(sql`
    UPDATE ${c.table} SET ${c.lease} = NULL,
      ${c.enqueued} = CASE WHEN ${sent} THEN now() ELSE ${c.enqueued} END,
      ${c.next} = CASE WHEN ${sent} THEN ${c.next} ELSE now() + ${retryMs} * interval '1 millisecond' END
    WHERE id = ${claim.id}::uuid AND ${c.lease} = ${claim.leaseId}::uuid
  `);
}
