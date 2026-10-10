import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { MediaModule } from '../media/media.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { CatalogController } from './controllers/catalog.controller';
import { SubjectsController } from './controllers/subjects.controller';
import { TeachersController } from './controllers/teachers.controller';
import { SubjectsRepository } from './repositories/subjects.repository';
import { TeacherSubjectsRepository } from './repositories/teacher-subjects.repository';
import { TeachersRepository } from './repositories/teachers.repository';
import { CatalogService } from './services/catalog.service';
import { SubjectsService } from './services/subjects.service';
import { TeacherSubjectsService } from './services/teacher-subjects.service';
import { TeachersService } from './services/teachers.service';
@Module({
  imports: [PermissionsModule, DatabaseModule, MediaModule],
  controllers: [CatalogController, SubjectsController, TeachersController],
  providers: [
    CatalogService,
    SubjectsRepository,
    TeachersRepository,
    TeacherSubjectsRepository,
    SubjectsService,
    TeachersService,
    TeacherSubjectsService,
  ],
  exports: [SubjectsService, TeachersService],
})
export class CatalogModule {}
