import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';

import { EnvironmentModule } from '../config/environment.module';
import { EnvironmentService } from '../config/environment.service';
import { createMediaUploadOptions } from '../config/media.config';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../infrastructure/queue/queue.module';
import { StorageModule } from '../infrastructure/storage/storage.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { MediaAdmissionInterceptor } from './media-admission.interceptor';
import { MediaController } from './media.controller';
import { ImageProcessor } from './processors/image.processor';
import { MediaCleanupProcessor } from './processors/media-cleanup.processor';
import { PdfProcessor } from './processors/pdf.processor';
import { MediaDeletionsRepository } from './repositories/media-deletions.repository';
import { MediaRepository } from './repositories/media.repository';
import { MediaAdmissionService } from './services/media-admission.service';
import { MediaCleanupScheduler } from './services/media-cleanup-scheduler.service';
import { MediaCleanupService } from './services/media-cleanup.service';
import { MediaDeletionsService } from './services/media-deletions.service';
import { MediaService } from './services/media.service';
@Module({
  imports: [
    PermissionsModule,
    EnvironmentModule,
    DatabaseModule,
    StorageModule,
    QueueModule,
    MulterModule.registerAsync({
      imports: [PermissionsModule, EnvironmentModule],
      inject: [EnvironmentService],
      useFactory: createMediaUploadOptions,
    }),
  ],
  controllers: [MediaController],
  providers: [
    MediaAdmissionService,
    MediaAdmissionInterceptor,
    ImageProcessor,
    PdfProcessor,
    MediaCleanupProcessor,
    MediaRepository,
    MediaDeletionsRepository,
    MediaService,
    MediaDeletionsService,
    MediaCleanupService,
    MediaCleanupScheduler,
  ],
  exports: [MediaService],
})
export class MediaModule {}
