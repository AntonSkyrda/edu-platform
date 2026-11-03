import { NodeAdapter } from '@nestjs/platform-node';

export class ApplicationHttpAdapter extends NodeAdapter {
  private drain?: () => Promise<void>;

  setDrainHandler(drain: () => Promise<void>): void {
    this.drain = drain;
  }

  override async beforeClose(): Promise<void> {
    super.beforeClose();
    // Nest 12 logs and suppresses provider shutdown-hook failures. Run the
    // bounded drain here so a timeout aborts teardown and the signal handler
    // exits with failure before closing dependencies beneath unfinished work.
    await this.drain?.();
  }
}

// Catalog slugs can contain up to 200 characters. Share the transport options
// between production and integration tests so valid catalog URLs stay reachable.
export function createHttpAdapter(
  trustedProxies: string[] = [],
): ApplicationHttpAdapter {
  return new ApplicationHttpAdapter({
    maxParamLength: 200,
    trustProxy: trustedProxies.length ? trustedProxies : false,
  });
}
