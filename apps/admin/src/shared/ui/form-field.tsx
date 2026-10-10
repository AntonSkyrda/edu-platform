import type { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  errors?: unknown[];
};
export function FormField({ label, errors = [], id, ...props }: Props) {
  const messages = errors
    .map((error) =>
      typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : '',
    )
    .filter(Boolean);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={messages.length > 0}
        aria-describedby={messages.length ? `${id}-error` : undefined}
        className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-60"
        {...props}
      />
      {messages.length > 0 && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {[...new Set(messages)].join('. ')}
        </p>
      )}
    </div>
  );
}
