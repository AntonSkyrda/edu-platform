import { ApiProperty } from '@nestjs/swagger';
import {
  type Permission,
  PERMISSIONS,
  type PermissionsResponse,
  type SetPermissionsRequest,
} from '@project/contracts';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn } from 'class-validator';
export class SetPermissionsDto implements SetPermissionsRequest {
  @ApiProperty({ enum: PERMISSIONS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(PERMISSIONS.length)
  @IsIn(PERMISSIONS, { each: true })
  permissions!: Permission[];
}
export class PermissionsResponseDto implements PermissionsResponse {
  @ApiProperty({ enum: PERMISSIONS, isArray: true })
  permissions!: Permission[];
}
