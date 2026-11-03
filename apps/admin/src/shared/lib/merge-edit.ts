export function mergeEdit<T extends object>(base: T, local: T, remote: T) {
  const merged = { ...local };
  const conflicts: (keyof T)[] = [];
  for (const key of Object.keys(base) as (keyof T)[]) {
    const same = (a: T[keyof T], b: T[keyof T]) =>
      JSON.stringify(a) === JSON.stringify(b);
    if (same(local[key], base[key])) merged[key] = remote[key];
    else if (!same(remote[key], base[key]) && !same(local[key], remote[key]))
      conflicts.push(key);
  }
  return { merged, conflicts };
}
