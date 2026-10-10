import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';

import { EnvironmentService } from '../../config/environment.service';
import { validatePdf } from '../helpers/validate-pdf.helper';
import type { ProcessedMedia } from '../interfaces/processed-media.interface';
@Injectable()
export class PdfProcessor {
  constructor(private readonly environment: EnvironmentService) {}
  async process(body: Buffer): Promise<ProcessedMedia> {
    if (body.length > this.environment.mediaPdfMaxBytes)
      throw new PayloadTooLargeException('PDF is too large');
    if (
      body.subarray(0, 5).toString() !== '%PDF-' ||
      !body.subarray(-2048).includes(Buffer.from('%%EOF'))
    )
      throw new BadRequestException('Invalid PDF');
    try {
      const pageCount = await validatePdf(
        body,
        this.environment.mediaPdfMaxPages,
        this.environment.mediaPdfTimeoutMs,
      );
      return {
        kind: 'PDF',
        body,
        mimeType: 'application/pdf',
        extension: 'pdf',
        pageCount,
      };
    } catch {
      throw new BadRequestException(
        'PDF is invalid, encrypted or exceeds the page limit',
      );
    }
  }
}
