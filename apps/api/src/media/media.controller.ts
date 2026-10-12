import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import {
  ApiEnvelope,
  ApiErrorEnvelope,
} from '../common/decorators/api-envelope.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { streamFile } from '../common/helpers/stream-file.helper';
import { MediaMessageDto, MediaResponseDto } from './dto/media-response.dto';
import { MediaAdmissionInterceptor } from './media-admission.interceptor';
import { MediaService } from './services/media.service';
@ApiTags('Media')
@ApiCookieAuth('accessCookie')
@ApiErrorEnvelope(400, 'Missing or invalid file')
@ApiErrorEnvelope(401, 'Authentication required')
@ApiErrorEnvelope(403, 'Required permission missing')
@ApiErrorEnvelope(413, 'File is too large')
@ApiErrorEnvelope(429, 'Rate limit exceeded; retry after the indicated delay')
@ApiErrorEnvelope(503, 'Storage or rate limiting temporarily unavailable')
@UseGuards(PermissionsGuard)
@Controller('admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}
  @RequirePermissions('media.upload')
  @Post('images')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(MediaAdmissionInterceptor, FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiEnvelope(MediaResponseDto, 201)
  uploadImage(@UploadedFile() file?: Express.Multer.File) {
    return this.media.upload(file?.buffer, 'IMAGE');
  }
  @RequirePermissions('media.upload')
  @Post('pdfs')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(MediaAdmissionInterceptor, FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiEnvelope(MediaResponseDto, 201)
  uploadPdf(@UploadedFile() file?: Express.Multer.File) {
    return this.media.upload(file?.buffer, 'PDF');
  }
  @RequirePermissions('media.read')
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiEnvelope(MediaResponseDto)
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.media.get(id);
  }
  @RequirePermissions('media.read')
  @Get(':id/content')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @ApiProduces('image/webp', 'application/pdf')
  @ApiResponse({ status: 200, schema: { type: 'string', format: 'binary' } })
  async content(@Param('id', new ParseUUIDPipe()) id: string) {
    return streamFile(await this.media.read(id));
  }
  @RequirePermissions('media.delete')
  @Delete(':id')
  @ApiEnvelope(MediaMessageDto)
  @ApiErrorEnvelope(409, 'File is still attached')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.media.remove(id);
  }
}
