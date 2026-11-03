import { isIP } from 'node:net';

// Accept explicit addresses/networks only; never a hop count or trust-all switch.
export function parseTrustedProxies(value: string): string[] {
  if (!value.trim()) return [];

  const proxies = value.split(',').map((entry) => entry.trim());
  for (const entry of proxies) {
    const [address, prefix, ...extra] = entry.split('/');
    const version = isIP(address);
    if (
      !version ||
      address.includes('%') ||
      extra.length ||
      (prefix !== undefined &&
        (!/^[1-9]\d*$/.test(prefix) ||
          Number(prefix) > (version === 4 ? 32 : 128)))
    ) {
      throw new Error(
        'TRUSTED_PROXIES must contain comma-separated IP addresses or CIDRs with nonzero prefixes',
      );
    }
  }
  return proxies;
}
