export function isDatabaseTimeout(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === 'object' && !seen.has(error)) {
    seen.add(error);
    if ('code' in error && ['57014', '55P03', '25P03'].includes(String(error.code))) return true;
    error = 'cause' in error ? error.cause : undefined;
  }
  return false;
}
