// Smart Booking Cards: flight / hotel details kept on an expense (expenses.booking_details, 0024).
export { cleanBooking, type Booking, type FlightBooking, type HotelBooking } from '../../supabase/functions/_shared/booking';
import type { Booking } from '../../supabase/functions/_shared/booking';

const shortDate = (iso: string | undefined, locale: string) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
};

/** The compact tag in a list row: "TLV → BKK · LY081", or "2 Dec - 5 Dec" for a stay. */
export function bookingTag(b: Booking | null | undefined, locale = 'en-US'): string | null {
  if (!b) return null;
  if (b.kind === 'flight') {
    const route = b.origin_iata && b.destination_iata ? `${b.origin_iata} → ${b.destination_iata}` : null;
    return [route, b.flight_number ?? null].filter(Boolean).join(' · ') || b.airline || null;
  }
  const stay = [shortDate(b.check_in_date, locale), shortDate(b.check_out_date, locale)].filter(Boolean).join(' - ');
  return stay || b.property_name || b.city || null;
}

/** The code to copy: the flight's PNR or the hotel's confirmation code. */
export function bookingCode(b: Booking | null | undefined): string | null {
  if (!b) return null;
  return (b.kind === 'flight' ? b.pnr : b.confirmation_code) ?? null;
}

/** Nights between check-in and check-out, or null. */
export function nights(b: Booking | null | undefined): number | null {
  if (!b || b.kind !== 'hotel' || !b.check_in_date || !b.check_out_date) return null;
  const n = Math.round((Date.parse(b.check_out_date) - Date.parse(b.check_in_date)) / 86_400_000);
  return n > 0 ? n : null;
}

/** A maps search for the hotel (address first, else name + city), or null. */
export function mapsUrl(b: Booking | null | undefined, platform: 'ios' | 'other' = 'other'): string | null {
  if (!b || b.kind !== 'hotel') return null;
  const q = [b.address ?? b.property_name, b.address ? null : b.city].filter(Boolean).join(', ');
  if (!q) return null;
  return platform === 'ios' ? `https://maps.apple.com/?q=${encodeURIComponent(q)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** "2026-12-01T23:30" -> local display "1 Dec, 23:30" (the time as printed on the ticket). */
export function bookingTime(iso: string | undefined, locale: string): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  return m[4]
    ? d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}
