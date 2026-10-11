import type { TextareaHTMLAttributes } from 'react';
export function TextareaField({
  label,
  id,
  errors = [],
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  errors?: unknown[];
}) {
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
      <textarea
        id={id}
        rows={4}
        className="w-full rounded-lg border bg-background p-3 text-sm focus-visible:outline-ring"
        aria-invalid={messages.length > 0}
        aria-describedby={messages.length ? `${id}-error` : undefined}
        {...props}
      />
      {messages.length > 0 && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {messages.join('. ')}
        </p>
      )}
    </div>
  );
}
