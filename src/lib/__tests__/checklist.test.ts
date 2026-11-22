import { describe, expect, it } from 'vitest';
import { applyChecklistChanges, cleanTitle, listItems, nextSortOrder, progress } from '../checklist';
import { mergeChange } from '../pendingChanges';
import type { ChecklistChange } from '@/store/outbox';
import type { ChecklistItem } from '@/types/db';

const T = 'trip-1';
const item = (over: Partial<ChecklistItem>): ChecklistItem => ({
  id: 'i1',
  trip_id: T,
  user_id: 'u1',
  list_type: 'to_pack',
  title: 'Passport',
  is_checked: false,
  sort_order: 0,
  created_at: '2026-11-22T10:00:00Z',
  ...over,
});
const change = (over: Partial<ChecklistChange>): ChecklistChange => ({
  kind: 'checklist',
  clientId: `ck:${over.itemId ?? 'i1'}`,
  tripId: T,
  createdBy: '',
  queuedAt: '2026-11-22T11:00:00Z',
  itemId: 'i1',
  listType: 'to_pack',
  userId: 'u1',
  create: false,
  remove: false,
  fields: {},
  ...over,
});

describe('cleanTitle', () => {
  it('trims, joins lines and caps the length', () => {
    expect(cleanTitle('  Sun\n cream  ')).toBe('Sun cream');
    expect(cleanTitle('   ')).toBe('');
    expect(cleanTitle('x'.repeat(250))).toHaveLength(200);
  });
});

describe('applyChecklistChanges', () => {
  it('adds, ticks and removes on top of the saved items', () => {
    const saved = [item({}), item({ id: 'i2', title: 'Charger' })];
    const out = applyChecklistChanges(
      saved,
      [
        change({ fields: { is_checked: true } }),
        change({ itemId: 'i2', remove: true }),
        change({ itemId: 'i3', create: true, listType: 'brought', fields: { title: 'Hat', sort_order: 4 } }),
      ],
      T,
    );
    expect(out.map((i) => [i.id, i.is_checked])).toEqual([
      ['i1', true],
      ['i3', false],
    ]);
    expect(out[1]).toMatchObject({ list_type: 'brought', title: 'Hat', user_id: 'u1', sort_order: 4 });
  });

  it('ignores other trips and an item added and removed before it was sent', () => {
    const saved = [item({})];
    expect(applyChecklistChanges(saved, [change({ tripId: 'other', remove: true })], T)).toBe(saved);
    expect(applyChecklistChanges([], [change({ itemId: 'x', create: true, remove: true, fields: { title: 'x' } })], T)).toEqual([]);
  });
});

describe('mergeChange (checklist)', () => {
  it('keeps "create" and "remove" and the latest fields', () => {
    const a = change({ create: true, fields: { title: 'Hat', is_checked: false } });
    const b = change({ fields: { is_checked: true } });
    expect(mergeChange(a, b)).toMatchObject({ create: true, remove: false, fields: { title: 'Hat', is_checked: true } });
    expect(mergeChange(a, change({ remove: true }))).toMatchObject({ create: true, remove: true });
  });
});

describe('listItems', () => {
  it('shows open items first, ticked last, and only my own "brought" items', () => {
    const all = [
      item({ id: 'a', sort_order: 2 }),
      item({ id: 'b', sort_order: 1, is_checked: true }),
      item({ id: 'c', sort_order: 3 }),
      item({ id: 'd', list_type: 'brought', user_id: 'u2' }),
      item({ id: 'e', list_type: 'brought' }),
    ];
    expect(listItems(all, 'to_pack', 'u1').map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(listItems(all, 'brought', 'u1').map((i) => i.id)).toEqual(['e']);
    expect(nextSortOrder(all, 'to_pack')).toBe(4);
    expect(nextSortOrder(all, 'to_buy_do')).toBe(0);
    expect(progress(listItems(all, 'to_pack', 'u1'))).toEqual({ done: 1, total: 3 });
  });
});
