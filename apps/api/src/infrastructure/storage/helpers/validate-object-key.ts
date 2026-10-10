export function validateObjectKey(key: string): void {
  if (!/^(images|documents)\/[a-f0-9-]{36}\.(webp|pdf)$/.test(key))
    throw new Error('Invalid storage object key');
}
