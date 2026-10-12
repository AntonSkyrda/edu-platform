import type { InvitationDelivery } from '@project/contracts';

const labels = {
  pending: 'Очікує доставки',
  sent: 'Передано поштовому серверу',
  failed: 'Не вдалося надіслати',
  skipped: 'Не надсилатиметься',
} as const;
export function InvitationStatus({
  delivery,
}: {
  delivery: InvitationDelivery | null;
}) {
  if (!delivery) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="max-w-64 space-y-1 py-3">
      <p
        className={
          delivery.status === 'failed'
            ? 'font-medium text-red-700'
            : delivery.status === 'pending'
              ? 'text-amber-800'
              : 'text-muted-foreground'
        }
      >
        {labels[delivery.status]}
      </p>
      {delivery.status === 'failed' && (
        <p className="text-xs">Повторіть запрошення після відновлення пошти.</p>
      )}
      {delivery.status === 'pending' && (
        <p className="text-xs text-muted-foreground">
          Надсилання відбудеться автоматично.
        </p>
      )}
      {delivery.deliveredAt && (
        <p className="text-xs text-muted-foreground">
          {new Date(delivery.deliveredAt).toLocaleString('uk-UA')}
        </p>
      )}
    </div>
  );
}
