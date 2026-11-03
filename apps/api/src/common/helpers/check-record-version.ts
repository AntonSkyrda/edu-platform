import { ConflictException } from '@nestjs/common';

export function checkRecordVersion(current: number, expected: number): void {
  if (current !== expected)
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message:
        'Запис змінив інший користувач. Ваші зміни не збережено. Зіставте їх з актуальними даними.',
    });
}
