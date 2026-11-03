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
  SubjectResponseDto,
  SubjectsPageDto,
} from '../dto/catalog-response.dto';
import {
  CreateSubjectDto,
  PublicationStatusDto,
  UpdateSubjectDto,
} from '../dto/catalog-write.dto';
import { SubjectsService } from '../services/subjects.service';
@ApiTags('Catalog administration: subjects')
@ApiCookieAuth('accessCookie')
@ApiErrorEnvelope(400, 'Invalid input or incomplete publication')
@ApiErrorEnvelope(401, 'Authentication required')
@ApiErrorEnvelope(403, 'Required permission missing')
@ApiErrorEnvelope(429, 'Rate limit exceeded; retry after the indicated delay')
@ApiErrorEnvelope(503, 'Rate limiting temporarily unavailable')
@ApiErrorEnvelope(404, 'Not found')
@ApiErrorEnvelope(409, 'Record version conflict or concurrent write')
@UseGuards(PermissionsGuard)
@Controller('admin/subjects')
export class SubjectsController {
  constructor(private readonly service: SubjectsService) {}
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('subjects.read')
  @Get()
  @ApiEnvelope(SubjectsPageDto)
  list(@Query() query: CatalogQueryDto) {
    return this.service.list(query.limit, query.offset);
  }
  @RequirePermissions('subjects.create')
  @Post()
  @ApiEnvelope(SubjectResponseDto, 201)
  create(@Body() data: CreateSubjectDto) {
    return this.service.create(data);
  }
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('subjects.read')
  @Get(':id')
  @ApiEnvelope(SubjectResponseDto)
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }
  @RequirePermissions('subjects.update')
  @Patch(':id')
  @ApiEnvelope(SubjectResponseDto)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() data: UpdateSubjectDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.update(id, data, request.auth.user);
  }
  @RequirePermissions('subjects.publish')
  @Patch(':id/status')
  @ApiEnvelope(SubjectResponseDto)
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
  @RequirePermissions('subjects.delete')
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
}
