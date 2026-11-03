import { useQuery } from '@tanstack/react-query';

import { usersApi } from '../api/users-api';

export function DeliveryHealth() {
  const delivery = useQuery({
    queryKey: ['delivery-status'],
    queryFn: ({ signal }) => usersApi.delivery(signal),
    refetchInterval: 15000,
  });
  if (delivery.isError)
    return (
      <p role="status" className="rounded-xl border p-4 text-sm">
        Не вдалося перевірити стан доставки. Дані оновляться автоматично.
      </p>
    );
  if (!delivery.data) return null;
  const { metrics, status } = delivery.data;
  const pending = metrics.reduce((total, row) => total + row.pending, 0);
  const failed = metrics.reduce((total, row) => total + row.failed, 0);
  return (
    <section
      aria-label="Стан доставки листів"
      className={`rounded-xl border p-5 text-sm ${status === 'warning' ? 'border-amber-300 bg-amber-50' : 'bg-white'}`}
    >
      <p className="font-semibold">
        {status === 'warning'
          ? 'Доставка листів потребує уваги'
          : 'Доставка листів працює'}
      </p>
      <p className="mt-2">
        Очікують: {pending}. Не надіслано: {failed}.
      </p>
      {status === 'warning' && (
        <p className="mt-2">
          Є збої або затримки. Листи в очікуванні надсилатимуться автоматично;
          невдале запрошення можна повторити в списку нижче.
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Стан оновлюється кожні 15 секунд. Передача поштовому серверу не
        підтверджує отримання листа адресатом.
      </p>
    </section>
  );
}
