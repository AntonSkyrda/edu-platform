import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import sharp from 'sharp';

import { EnvironmentService } from '../../config/environment.service';
import type { ProcessedMedia } from '../interfaces/processed-media.interface';
@Injectable()
export class ImageProcessor {
  constructor(private readonly environment: EnvironmentService) {}
  async process(body: Buffer): Promise<ProcessedMedia> {
    if (body.length > this.environment.mediaImageMaxBytes)
      throw new PayloadTooLargeException('Image is too large');
    const jpeg = body.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
    const png = body
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp =
      body.subarray(0, 4).toString() === 'RIFF' &&
      body.subarray(8, 12).toString() === 'WEBP';
    if (!jpeg && !png && !webp)
      throw new BadRequestException(
        'Only JPEG, PNG and WebP images are supported',
      );
    try {
      const image = sharp(body, {
        limitInputPixels: this.environment.mediaImageMaxPixels,
        failOn: 'warning',
      });
      const metadata = await image.metadata();
      if (
        !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error('Unsupported image');
      const { data, info } = await image
        .rotate()
        .resize({
          width: this.environment.mediaImageMaxDimension,
          height: this.environment.mediaImageMaxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      return {
        kind: 'IMAGE',
        body: data,
        mimeType: 'image/webp',
        extension: 'webp',
        width: info.width,
        height: info.height,
      };
    } catch {
      throw new BadRequestException(
        'Image is invalid, animated or exceeds the pixel limit',
      );
    }
  }
}
