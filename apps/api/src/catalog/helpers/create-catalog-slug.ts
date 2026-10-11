import { randomUUID } from 'node:crypto';
const ukrainian: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ye',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'yi',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'yu',
  я: 'ya',
};
export function catalogSlug(value: string, maxLength: number): string {
  return (
    Array.from(value.toLowerCase())
      .map((char) => ukrainian[char] ?? char)
      .join('')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['’ʼ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLength)
      .replace(/-+$/g, '') || 'item'
  );
}
export async function createWithCatalogSlug<T>(
  name: string,
  maxLength: number,
  constraint: string,
  create: (slug: string) => Promise<T>,
): Promise<T> {
  const base = catalogSlug(name, maxLength);
  for (let attempt = 0; ; attempt++) {
    const slug =
      attempt === 0
        ? base
        : `${base.slice(0, maxLength - 37).replace(/-+$/g, '')}-${randomUUID()}`;
    try {
      return await create(slug);
    } catch (error) {
      const pg = error as {
        code?: string;
        constraint?: string;
        cause?: { code?: string; constraint?: string };
      };
      const cause = pg.cause ?? pg;
      if (
        cause.code !== '23505' ||
        cause.constraint !== constraint ||
        attempt >= 3
      )
        throw error;
    }
  }
}
