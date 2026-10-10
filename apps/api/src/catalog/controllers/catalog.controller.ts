import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  ApiEnvelope,
  ApiErrorEnvelope,
} from '../../common/decorators/api-envelope.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { streamFile } from '../../common/helpers/stream-file.helper';
import { CatalogQueryDto } from '../dto/catalog-query.dto';
import {
  SubjectResponseDto,
  SubjectsPageDto,
  TeacherResponseDto,
  TeachersPageDto,
} from '../dto/catalog-response.dto';
import { CatalogService } from '../services/catalog.service';
@Public()
@ApiTags('Public catalog')
@ApiErrorEnvelope(404, 'Published record not found')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('subjects') @ApiEnvelope(SubjectsPageDto) listSubjects(
    @Query() query: CatalogQueryDto,
  ) {
    return this.catalog.listSubjects(query.limit, query.offset);
  }
  @Get('subjects/:slug') @ApiEnvelope(SubjectResponseDto) subject(
    @Param('slug') slug: string,
  ) {
    return this.catalog.getSubject(slug);
  }
  @Get('subjects/:slug/teachers')
  @ApiEnvelope(TeachersPageDto)
  subjectTeachers(
    @Param('slug') slug: string,
    @Query() query: CatalogQueryDto,
  ) {
    return this.catalog.listSubjectTeachers(slug, query.limit, query.offset);
  }
  @Get('teachers') @ApiEnvelope(TeachersPageDto) listTeachers(
    @Query() query: CatalogQueryDto,
  ) {
    return this.catalog.listTeachers(query.limit, query.offset);
  }
  @Get('teachers/:slug/photo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiProduces('image/webp')
  @ApiResponse({ status: 200, schema: { type: 'string', format: 'binary' } })
  async teacherPhoto(@Param('slug') slug: string) {
    return streamFile(await this.catalog.getTeacherPhoto(slug));
  }

  @Get('teachers/:slug') @ApiEnvelope(TeacherResponseDto) teacher(
    @Param('slug') slug: string,
  ) {
    return this.catalog.getTeacher(slug);
  }
}
