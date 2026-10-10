import { ConflictException, NotFoundException } from '@nestjs/common';
export function throwCatalogWriteError(error: unknown): never {
  const pg = error as { code?: string; cause?: { code?: string } };
  const code = pg?.cause?.code ?? pg?.code;
  if (code === '23505')
    throw new ConflictException('Slug or assignment already exists');
  if (code === '23503')
    throw new NotFoundException('Referenced subject or teacher does not exist');
  throw error;
}
