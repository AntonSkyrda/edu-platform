import type { MulterModuleOptions } from '@nestjs/platform-express';

import type { EnvironmentService } from './environment.service';
export function createMediaUploadOptions(
  environment: EnvironmentService,
): MulterModuleOptions {
  return {
    limits: {
      fileSize: Math.max(
        environment.mediaImageMaxBytes,
        environment.mediaPdfMaxBytes,
      ),
      files: 1,
      fields: 0,
      parts: 2,
    },
  };
}
