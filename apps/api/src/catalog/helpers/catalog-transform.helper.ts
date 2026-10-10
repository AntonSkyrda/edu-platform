export const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export const normalizeSlug = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
