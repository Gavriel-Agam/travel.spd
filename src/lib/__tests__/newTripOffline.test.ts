import { describe, expect, it } from 'vitest';
import { applyNewTripMembers, applyTripChanges, builtInsForNewTrip } from '../pendingChanges';
import type { NewTripItem, OutboxItem, TripItem } from '@/store/outbox';
import type { Category, Member, Trip } from '@/types/db';

const trip = (id: string, name = id): Trip =>
  ({ id, name, start_date: null, end_date: null, home_currency: 'ILS', default_currency: 'THB', timezone: 'Asia/Bangkok', created_by: 'u1', created_at: '2026-11-24T10:00:00Z' }) as Trip;
const member: Member = { id: 'm-new', trip_id: 'new', user_id: 'u1', display_name: 'Noa', color: '#3366FF', role: 'owner', joined_at: '2026-11-24T10:00:00Z' };
const newTrip: NewTripItem = { kind: 'newTrip', clientId: 'newtrip:new', tripId: 'new', createdBy: 'u1', queuedAt: '2026-11-24T10:00:00Z', trip: trip('new', 'Offline'), member };

describe('trip created offline', () => {
  it('is listed first until the server has it, with queued edits applied', () => {
    const rename: TripItem = { kind: 'trip', clientId: 'trip:new', tripId: 'new', createdBy: 'u1', queuedAt: '2026-11-24T10:01:00Z', patch: { name: 'Renamed' } };
    const list = applyTripChanges([trip('old')], [newTrip, rename] as OutboxItem[]);
    expect(list.map((t) => [t.id, t.name])).toEqual([
      ['new', 'Renamed'],
      ['old', 'old'],
    ]);
  });

  it('is not listed twice once the server returns it', () => {
    expect(applyTripChanges([trip('new'), trip('old')], [newTrip]).map((t) => t.id)).toEqual(['new', 'old']);
  });

  it('shows its owner before the server has the trip, only in that trip', () => {
    expect(applyNewTripMembers([], [newTrip], 'new')).toEqual([member]);
    expect(applyNewTripMembers([member], [newTrip], 'new')).toHaveLength(1);
    expect(applyNewTripMembers([], [newTrip], 'other')).toEqual([]);
  });

  it('gets the built-in categories with their default looks, not another trip\'s edits', () => {
    const saved: Category[] = [
      { id: 'b1', trip_id: null, key: 'restaurants', name: 'Food!', icon: '🍕', color: '#000000', sort_order: 20, archived: false, renamed: true, edited: true, hidden: true },
      { id: 'own', trip_id: 'old', key: null, name: 'Mine', icon: '⭐', color: '#111111', sort_order: 500, archived: false },
    ];
    const out = builtInsForNewTrip([undefined, saved]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'b1', trip_id: null, name: 'Restaurants', icon: '🍽️' });
    expect(out[0].hidden).toBeUndefined();
    expect(builtInsForNewTrip([undefined])).toEqual([]);
  });
});
