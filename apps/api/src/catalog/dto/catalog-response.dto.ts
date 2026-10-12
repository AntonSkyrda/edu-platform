import { ApiProperty } from '@nestjs/swagger';
import {
  PUBLICATION_STATUSES,
  type PublicationStatus,
  type SubjectResponse,
  type TeacherResponse,
} from '@project/contracts';

import { TeacherSubjectAssignmentDto } from './catalog-write.dto';
class CatalogEntityDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ minimum: 1 }) version!: number;
  @ApiProperty({ enum: PUBLICATION_STATUSES }) status!: PublicationStatus;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
export class SubjectResponseDto
  extends CatalogEntityDto
  implements SubjectResponse
{
  @ApiProperty() name!: string;
  @ApiProperty() sortOrder!: number;
}
export class TeacherResponseDto
  extends CatalogEntityDto
  implements TeacherResponse
{
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ type: String, nullable: true }) photoId!: string | null;
  @ApiProperty({ type: String, nullable: true }) shortDescription!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) biography!: string | null;
}
export class SubjectsPageDto {
  @ApiProperty({ type: [SubjectResponseDto] }) items!: SubjectResponseDto[];
  @ApiProperty() hasMore!: boolean;
}
export class TeachersPageDto {
  @ApiProperty({ type: [TeacherResponseDto] }) items!: TeacherResponseDto[];
  @ApiProperty() hasMore!: boolean;
}
export class TeacherSubjectsResponseDto {
  @ApiProperty({ minimum: 1 }) version!: number;
  @ApiProperty({ type: [TeacherSubjectAssignmentDto] })
  items!: TeacherSubjectAssignmentDto[];
}
export class CatalogMessageDto {
  @ApiProperty() message!: string;
}
