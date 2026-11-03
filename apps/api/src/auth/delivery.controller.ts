import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope } from '../common/decorators/api-envelope.decorator';
import type { AuthRequest } from '../common/interfaces/auth-request.interface';
import { DeliveryStatusDto } from './dto/delivery.dto';
import { DeliveryMonitorService } from './services/delivery-monitor.service';

@ApiTags('Delivery administration')
@ApiCookieAuth('accessCookie')
@Controller('admin/delivery')
export class DeliveryController {
  constructor(private readonly monitor: DeliveryMonitorService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiEnvelope(DeliveryStatusDto)
  @ApiOperation({
    summary: 'Aggregate mail backlog and worker progress (ADMIN only)',
  })
  status(@Req() request: AuthRequest) {
    if (request.auth.user.role !== 'ADMIN') throw new ForbiddenException();
    return this.monitor.status();
  }
}
