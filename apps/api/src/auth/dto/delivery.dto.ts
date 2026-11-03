import { ApiProperty } from '@nestjs/swagger';
import type {
  AdminUser,
  DeliveryMetric,
  DeliveryStatus,
  InvitationDelivery,
} from '@project/contracts';

import { AuthUserDto } from './auth-response.dto';
export class InvitationDeliveryDto implements InvitationDelivery {
  @ApiProperty({ enum: ['pending', 'sent', 'failed', 'skipped'] })
  status!: InvitationDelivery['status'];
  @ApiProperty() attempts!: number;
  @ApiProperty() dispatchAttempts!: number;
  @ApiProperty({ type: String, nullable: true }) enqueuedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) deliveredAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) errorCode!: string | null;
  @ApiProperty() expiresAt!: string;
}
export class AdminUserDto extends AuthUserDto implements AdminUser {
  @ApiProperty({ type: InvitationDeliveryDto, nullable: true })
  invitation!: InvitationDelivery | null;
}
export class DeliveryMetricDto implements DeliveryMetric {
  @ApiProperty({ enum: ['invitation', 'password-reset', 'password-changed'] })
  kind!: DeliveryMetric['kind'];
  @ApiProperty() pending!: number;
  @ApiProperty() failed!: number;
  @ApiProperty() oldestPendingSeconds!: number;
}
class WorkersDto {
  @ApiProperty() online!: number;
  @ApiProperty() activeJobs!: number;
  @ApiProperty({ type: String, nullable: true }) lastCompletedAt!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) lastFailedAt!: string | null;
}
export class DeliveryStatusDto implements DeliveryStatus {
  @ApiProperty({ enum: ['ok', 'warning'] }) status!: 'ok' | 'warning';
  @ApiProperty({ type: [DeliveryMetricDto] }) metrics!: DeliveryMetric[];
  @ApiProperty({ type: WorkersDto }) workers!: WorkersDto;
}
