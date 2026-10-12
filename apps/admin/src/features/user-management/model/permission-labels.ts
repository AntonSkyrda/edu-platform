import type { Permission } from '@project/contracts';
export const permissionLabels: Record<Permission, string> = {
  'subjects.read': 'Перегляд напрямів',
  'subjects.create': 'Створення напрямів',
  'subjects.update': 'Редагування напрямів',
  'subjects.publish': 'Публікація напрямів',
  'subjects.delete': 'Видалення напрямів',
  'teachers.read': 'Перегляд викладачів',
  'teachers.create': 'Створення викладачів',
  'teachers.update': 'Редагування викладачів',
  'teachers.publish': 'Публікація викладачів',
  'teachers.delete': 'Видалення викладачів',
  'media.read': 'Перегляд файлів',
  'media.upload': 'Завантаження файлів',
  'media.delete': 'Видалення файлів',
};
