import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @ApiOperation({ summary: 'Check API health' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        status_code: { type: 'integer', example: 200 },
        detail: {
          type: 'object',
          properties: { status: { type: 'string', example: 'ok' } },
        },
        result: { type: 'string', example: 'success' },
      },
    },
  })
  @Get()
  getHello(): { status: string } {
    return this.appService.getHealth();
  }
}
