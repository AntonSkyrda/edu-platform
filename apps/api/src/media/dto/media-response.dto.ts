import { ApiProperty } from '@nestjs/swagger';
import {
  MEDIA_KINDS,
  type MediaKind,
  type MediaResponse,
} from '@project/contracts';
export class MediaResponseDto implements MediaResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: MEDIA_KINDS }) kind!: MediaKind;
  @ApiProperty() mimeType!: string;
  @ApiProperty() size!: number;
  @ApiProperty({ type: Number, nullable: true }) width!: number | null;
  @ApiProperty({ type: Number, nullable: true }) height!: number | null;
  @ApiProperty({ type: Number, nullable: true }) pageCount!: number | null;
  @ApiProperty() previewUrl!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class MediaMessageDto {
  @ApiProperty() message!: string;
}
