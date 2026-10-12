import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  type CreateSubjectRequest,
  type CreateTeacherRequest,
  PUBLICATION_STATUSES,
  type PublicationStatus,
  type SetPublicationStatusRequest,
  type SetTeacherSubjectsRequest,
  type TeacherSubjectAssignment,
} from '@project/contracts';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { ExpectedVersionDto } from '../../common/dto/expected-version.dto';
import { trimString } from '../helpers/catalog-transform.helper';
export class CreateSubjectDto implements CreateSubjectRequest {
  @ApiProperty({ maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @ValidateIf((_o, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder?: number;
}
export class UpdateSubjectDto extends PartialType(CreateSubjectDto, {
  skipNullProperties: false,
}) {
  @ApiProperty({ minimum: 1, description: 'Version read by the editor' })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedVersion!: number;
}
export class CreateTeacherDto implements CreateTeacherRequest {
  @ApiProperty({ maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @Length(1, 100)
  firstName!: string;
  @ApiProperty({ maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @Length(1, 100)
  lastName!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'ID of an uploaded image',
  })
  @IsOptional()
  @IsUUID()
  photoId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  shortDescription?: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 20000,
    description: 'Plain text',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(20000)
  biography?: string | null;
}
export class UpdateTeacherDto extends PartialType(CreateTeacherDto, {
  skipNullProperties: false,
}) {
  @ApiProperty({ minimum: 1, description: 'Version read by the editor' })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedVersion!: number;
}
export class PublicationStatusDto
  extends ExpectedVersionDto
  implements SetPublicationStatusRequest
{
  @ApiProperty({ enum: PUBLICATION_STATUSES })
  @IsIn(PUBLICATION_STATUSES)
  status!: PublicationStatus;
}
export class TeacherSubjectAssignmentDto implements TeacherSubjectAssignment {
  @ApiProperty({ format: 'uuid' }) @IsUUID() subjectId!: string;
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder!: number;
}
export class SetTeacherSubjectsDto
  extends ExpectedVersionDto
  implements SetTeacherSubjectsRequest
{
  @ApiProperty({
    type: [TeacherSubjectAssignmentDto],
    maxItems: 50,
    description:
      'Replaces all assignments atomically; an empty array removes all assignments',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique((item: TeacherSubjectAssignmentDto) => item?.subjectId)
  @ValidateNested({ each: true })
  @Type(() => TeacherSubjectAssignmentDto)
  subjects!: TeacherSubjectAssignmentDto[];
}
