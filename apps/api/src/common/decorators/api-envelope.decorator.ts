import type { Type } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

export const ApiEnvelope = (
  model: Type<unknown>,
  status = 200,
  description = 'Success',
) =>
  applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: ['status_code', 'detail', 'result'],
        properties: {
          status_code: { type: 'integer', example: status },
          detail: { $ref: getSchemaPath(model) },
          result: { type: 'string', enum: ['success'] },
        },
      },
    }),
  );

export const ApiErrorEnvelope = (status: number, description: string) =>
  ApiResponse({
    status,
    description,
    schema: {
      type: 'object',
      required: ['status_code', 'detail', 'result'],
      properties: {
        status_code: { type: 'integer', example: status },
        detail: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
        },
        result: { type: 'string', enum: ['error'] },
      },
    },
  });
