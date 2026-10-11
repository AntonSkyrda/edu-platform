import { Button } from './button';
export function Pagination({
  page,
  hasMore,
  busy,
  onChange,
}: {
  page: number;
  hasMore: boolean;
  busy: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <footer className="flex items-center justify-between gap-4 border-t pt-5">
      <Button
        variant="outline"
        disabled={page === 0 || busy}
        onClick={() => onChange(page - 1)}
      >
        Назад
      </Button>
      <span className="text-sm text-muted-foreground">Сторінка {page + 1}</span>
      <Button
        variant="outline"
        disabled={!hasMore || busy}
        onClick={() => onChange(page + 1)}
      >
        Далі
      </Button>
    </footer>
  );
}
