import { describe, expect, it } from 'vitest';

import { mergeEdit } from './merge-edit';

describe('concurrent editor reconciliation', () => {
  it('preserves local edits and incorporates unrelated server edits', () => {
    expect(
      mergeEdit(
        { name: 'Old', order: 0 },
        { name: 'Mine', order: 0 },
        { name: 'Old', order: 7 },
      ),
    ).toEqual({ merged: { name: 'Mine', order: 7 }, conflicts: [] });
  });
  it('requires a choice only when both editors change a field differently', () => {
    expect(
      mergeEdit(
        { name: 'Old', order: 0 },
        { name: 'Mine', order: 2 },
        { name: 'Theirs', order: 2 },
      ),
    ).toEqual({ merged: { name: 'Mine', order: 2 }, conflicts: ['name'] });
  });
  it('treats empty values and assignment removals as edits', () => {
    expect(
      mergeEdit(
        { bio: 'Old', items: [1] },
        { bio: '', items: [] },
        { bio: 'New', items: [2] },
      ).conflicts,
    ).toEqual(['bio', 'items']);
  });
});
