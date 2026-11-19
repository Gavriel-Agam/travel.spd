// Flight / hotel details read from a booking (Smart import and ingest-smart-item).
// Pure code: also used by the app's tests.

export type FlightBooking = {
  kind: 'flight';
  airline?: string;
  flight_number?: string;
  origin_iata?: string;
  destination_iata?: string;
  departure_at?: string;
  arrival_at?: string;
  pnr?: string;
  passengers?: string[];
};

export type HotelBooking = {
  kind: 'hotel';
  property_name?: string;
  address?: string;
  city?: string;
  check_in_date?: string;
  check_out_date?: string;
  confirmation_code?: string;
  room_info?: string;
};

export type Booking = FlightBooking | HotelBooking;

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const iata = (v: unknown) => (typeof v === 'string' && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : undefined);
const code = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9-]{3,20}$/.test(v.trim()) ? v.trim().toUpperCase() : undefined);
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);
/** Local date and time as written (YYYY-MM-DDTHH:mm), no time zone. */
const dateTime = (v: unknown) => {
  if (typeof v !== 'string') return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(v.trim());
  return m && !Number.isNaN(Date.parse(`${m[1]}T${m[2]}`)) ? `${m[1]}T${m[2]}` : date(v);
};

/** Drops empty fields. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as T;
}

/** A well-formed booking with at least one useful field, or null. */
export function cleanBooking(raw: unknown): Booking | null {
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;
  if (x.kind === 'flight') {
    const b = compact<FlightBooking>({
      kind: 'flight',
      airline: str(x.airline, 60),
      flight_number: typeof x.flight_number === 'string' && /^[A-Za-z0-9]{2}\s?\d{1,4}[A-Za-z]?$/.test(x.flight_number.trim()) ? x.flight_number.replace(/\s/g, '').toUpperCase() : undefined,
      origin_iata: iata(x.origin_iata),
      destination_iata: iata(x.destination_iata),
      departure_at: dateTime(x.departure_at),
      arrival_at: dateTime(x.arrival_at),
      pnr: code(x.pnr),
      passengers: Array.isArray(x.passengers) ? x.passengers.map((p) => str(p, 60)).filter((p): p is string => !!p).slice(0, 9) : undefined,
    });
    return Object.keys(b).length > 1 ? b : null;
  }
  if (x.kind === 'hotel') {
    const b = compact<HotelBooking>({
      kind: 'hotel',
      property_name: str(x.property_name, 100),
      address: str(x.address, 200),
      city: str(x.city, 60),
      check_in_date: date(x.check_in_date),
      check_out_date: date(x.check_out_date),
      confirmation_code: code(x.confirmation_code),
      room_info: str(x.room_info, 100),
    });
    return Object.keys(b).length > 1 ? b : null;
  }
  return null;
}

/** Gemini response schema for the optional booking object. */
export const BOOKING_SCHEMA = {
  type: 'OBJECT',
  nullable: true,
  properties: {
    kind: { type: 'STRING', enum: ['flight', 'hotel'] },
    airline: { type: 'STRING', nullable: true },
    flight_number: { type: 'STRING', nullable: true },
    origin_iata: { type: 'STRING', nullable: true },
    destination_iata: { type: 'STRING', nullable: true },
    departure_at: { type: 'STRING', nullable: true },
    arrival_at: { type: 'STRING', nullable: true },
    pnr: { type: 'STRING', nullable: true },
    passengers: { type: 'ARRAY', items: { type: 'STRING' }, nullable: true },
    property_name: { type: 'STRING', nullable: true },
    address: { type: 'STRING', nullable: true },
    city: { type: 'STRING', nullable: true },
    check_in_date: { type: 'STRING', nullable: true },
    check_out_date: { type: 'STRING', nullable: true },
    confirmation_code: { type: 'STRING', nullable: true },
    room_info: { type: 'STRING', nullable: true },
  },
  required: ['kind'],
};

export const BOOKING_PROMPT = [
  "- booking: only when the item is a flight ticket or a hotel / apartment booking, else null. kind 'flight' or 'hotel'.",
  '  flight: airline, flight_number (e.g. LY081), origin_iata and destination_iata (3-letter airport codes), departure_at and arrival_at (local time, YYYY-MM-DDTHH:mm), pnr (booking reference), passengers (names).',
  '  hotel: property_name, address, city, check_in_date and check_out_date (YYYY-MM-DD), confirmation_code, room_info.',
  '  Leave a field null when the source does not show it. Never invent codes.',
].join('\n');
