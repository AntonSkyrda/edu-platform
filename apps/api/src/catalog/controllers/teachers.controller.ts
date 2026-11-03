import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ApiEnvelope,
  ApiErrorEnvelope,
} from '../../common/decorators/api-envelope.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ExpectedVersionDto } from '../../common/dto/expected-version.dto';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthRequest } from '../../common/interfaces/auth-request.interface';
import { CatalogQueryDto } from '../dto/catalog-query.dto';
import {
  CatalogMessageDto,
  TeacherResponseDto,
  TeachersPageDto,
  TeacherSubjectsResponseDto,
} from '../dto/catalog-response.dto';
import {
  CreateTeacherDto,
  PublicationStatusDto,
  SetTeacherSubjectsDto,
  UpdateTeacherDto,
} from '../dto/catalog-write.dto';
import { TeachersService } from '../services/teachers.service';
@ApiTags('Catalog administration: teachers')
@ApiCookieAuth('accessCookie')
@ApiErrorEnvelope(400, 'Invalid input or incomplete publication')
@ApiErrorEnvelope(401, 'Authentication required')
@ApiErrorEnvelope(403, 'Required permission missing')
@ApiErrorEnvelope(429, 'Rate limit exceeded; retry after the indicated delay')
@ApiErrorEnvelope(503, 'Rate limiting temporarily unavailable')
@ApiErrorEnvelope(404, 'Not found')
@ApiErrorEnvelope(409, 'Record version conflict or concurrent write')
@UseGuards(PermissionsGuard)
@Controller('admin/teachers')
export class TeachersController {
  constructor(private readonly service: TeachersService) {}
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('teachers.read')
  @Get()
  @ApiEnvelope(TeachersPageDto)
  list(@Query() query: CatalogQueryDto) {
    return this.service.list(query.limit, query.offset);
  }
  @RequirePermissions('teachers.create')
  @Post()
  @ApiEnvelope(TeacherResponseDto, 201)
  create(@Body() data: CreateTeacherDto) {
    return this.service.create(data);
  }
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('teachers.read')
  @Get(':id')
  @ApiEnvelope(TeacherResponseDto)
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }
  @RequirePermissions('teachers.update')
  @Patch(':id')
  @ApiEnvelope(TeacherResponseDto)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() data: UpdateTeacherDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.update(id, data, request.auth.user);
  }
  @RequirePermissions('teachers.publish')
  @Patch(':id/status')
  @ApiEnvelope(TeacherResponseDto)
  @ApiOperation({ summary: 'Publish complete content or return it to draft' })
  setStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() data: PublicationStatusDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.setStatus(
      id,
      data.status,
      data.expectedVersion,
      request.auth.user,
    );
  }
  @RequirePermissions('teachers.delete')
  @Delete(':id')
  @ApiEnvelope(CatalogMessageDto)
  @ApiOperation({
    summary: 'Permanently delete the record and its subject assignments',
  })
  delete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() data: ExpectedVersionDto,
  ) {
    return this.service.delete(id, data.expectedVersion);
  }

  @Header('Cache-Control', 'no-store')
  @RequirePermissions('teachers.read')
  @Get(':id/subjects')
  @ApiEnvelope(TeacherSubjectsResponseDto)
  subjects(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getSubjects(id);
  }
  @RequirePermissions('teachers.update')
  @Put(':id/subjects')
  @ApiEnvelope(TeacherSubjectsResponseDto)
  @ApiOperation({ summary: 'Replace all subject assignments atomically' })
  setSubjects(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() data: SetTeacherSubjectsDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.setSubjects(
      id,
      data.subjects,
      data.expectedVersion,
      request.auth.user,
    );
  }
}
