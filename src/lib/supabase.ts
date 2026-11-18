import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import driverAsepImg from '@/assets/images/driver_portrait_asep_1794952278435.jpg';
import driverBudiImg from '@/assets/images/driver_portrait_budi_1794952278793.jpg';
import heroDriverImg from '@/assets/images/hero_driver_helmet_1794952277598.jpg';
import foodSeblakImg from '@/assets/images/food_seblak_1794955347178.jpg';
import foodAyamGeprekImg from '@/assets/images/food_ayam_geprek_1794955347382.jpg';
import foodBaksoImg from '@/assets/images/food_bakso_1794955347543.jpg';
import foodMinumanImg from '@/assets/images/food_minuman_segar_1794955348120.jpg';
import storeWarungImg from '@/assets/images/store_warung_haurgeulis_1794955348631.jpg';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

type Row = Record<string, unknown>;
type QueryResult<T = Row[]> = Promise<{ data: T | null; error: { message: string } | null }>;

interface Listener {
  table: string;
  cb: () => void;
}

const DB_PREFIX = 'ti_mock_db_';

const DEFAULT_ROUTES: Row[] = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    origin: 'Haurgeulis',
    destination: 'Indramayu Kota',
    price_economy: 20000,
    price_comfort: 25000,
    price_premium: 35000,
    is_active: true,
    eta_text: '15-20 mnt',
    default_car_type: 'Ekonomi',
    created_at: '2026-11-17T00:00:00.000Z',
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    origin: 'Haurgeulis',
    destination: 'Jakarta',
    price_economy: 120000,
    price_comfort: 150000,
    price_premium: 200000,
    is_active: true,
    eta_text: '20-30 mnt',
    default_car_type: 'Ekonomi',
    created_at: '2026-11-17T00:00:01.000Z',
  },
  {
    id: '11111111-1111-4111-8111-111111111103',
    origin: 'Haurgeulis',
    destination: 'Bandung',
    price_economy: 100000,
    price_comfort: 125000,
    price_premium: 160000,
    is_active: true,
    eta_text: '15-20 mnt',
    default_car_type: 'Ekonomi',
    created_at: '2026-11-17T00:00:02.000Z',
  },
  {
    id: '11111111-1111-4111-8111-111111111104',
    origin: 'Indramayu',
    destination: 'Cirebon',
    price_economy: 35000,
    price_comfort: 45000,
    price_premium: 60000,
    is_active: true,
    eta_text: '15-20 mnt',
    default_car_type: 'Ekonomi',
    created_at: '2026-11-17T00:00:03.000Z',
  },
];

const DEFAULT_DRIVERS: Row[] = [
  {
    id: '22222222-2222-4222-8222-222222222201',
    name: 'Driver Asep',
    phone: '081211112201',
    driver_code: 'DRV1001',
    sim: '-',
    plate: 'E 1420 PH',
    password: 'driver123',
    vehicle_type: 'Mobil',
    ktp_number: '3212101101900001',
    photo_url: driverAsepImg,
    payout_account: {
      provider: 'DANA',
      accountNumber: '081211112201',
      ownerName: 'Asep Sunandar',
      proofPhoto: null,
      locked: true,
      pendingChange: null,
    },
    trusted_devices: [],
    dispute_false_count: 0,
    status: 'approved',
    owner_note: 'Standby Alun-alun Haurgeulis',
    rejection_reason: null,
    is_online: true,
    rating: 4.9,
    trips_today: 3,
    bonus_date: null,
    created_at: '2026-11-17T01:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222202',
    name: 'Driver Budi',
    phone: '081211112202',
    driver_code: 'DRV1002',
    sim: '-',
    plate: 'E 4418 PA',
    password: 'driver123',
    vehicle_type: 'Motor',
    ktp_number: '3212101202920002',
    photo_url: driverBudiImg,
    payout_account: {
      provider: 'DANA',
      accountNumber: '081211112202',
      ownerName: 'Budi Santoso',
      proofPhoto: null,
      locked: true,
      pendingChange: null,
    },
    trusted_devices: [],
    dispute_false_count: 0,
    status: 'approved',
    owner_note: 'Prioritas antar makanan cepat sekitar Pasar Haurgeulis',
    rejection_reason: null,
    is_online: true,
    rating: 4.8,
    trips_today: 4,
    bonus_date: null,
    created_at: '2026-11-17T01:10:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222203',
    name: 'Driver Dedi',
    phone: '081211112203',
    driver_code: 'DRV1003',
    sim: '-',
    plate: 'E 1890 PC',
    password: 'driver123',
    vehicle_type: 'Mobil',
    ktp_number: '3212101505880003',
    photo_url: heroDriverImg,
    payout_account: {
      provider: 'BRI',
      accountNumber: '012301009911502',
      ownerName: 'Dedi Kurniawan',
      proofPhoto: null,
      locked: true,
      pendingChange: null,
    },
    trusted_devices: [],
    dispute_false_count: 0,
    status: 'approved',
    owner_note: 'Siaga arah Bandung & Jakarta',
    rejection_reason: null,
    is_online: true,
    rating: 4.7,
    trips_today: 2,
    bonus_date: null,
    created_at: '2026-11-17T01:20:00.000Z',
  },
];

const DEFAULT_STORES: Row[] = [
  {
    id: '33333333-3333-4333-8333-333333333301',
    name: 'Seblak Teh Rina Haurgeulis',
    owner_name: 'Rina Marlina',
    ktp_number: '3212105005940001',
    phone: '081355551101',
    password: 'store123',
    photo_url: storeWarungImg,
    address: 'Jl. Siliwangi No. 18, Haurgeulis',
    payout_account: {
      provider: 'DANA',
      accountNumber: '081355551101',
      ownerName: 'Rina Marlina',
      proofPhoto: null,
      locked: true,
      pendingChange: null,
    },
    trusted_devices: [],
    status: 'approved',
    owner_note: 'Toko favorit seblak Haurgeulis',
    rejection_reason: null,
    rating: 4.9,
    ad_active: true,
    ad_status: 'approved',
    ad_title: 'Seblak Teh Rina — Gratis Toping Bakso!',
    ad_subtitle: 'Pesan Makanan sekarang, diantar cepat 12 menit dari Haurgeulis',
    ad_banner_url: foodSeblakImg,
    ad_expires_at: '2026-12-30T23:59:59.000Z',
    created_at: '2026-11-17T02:00:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333302',
    name: 'Geprek & Bakso Mas Joko',
    owner_name: 'Joko Santoso',
    ktp_number: '3212102208910002',
    phone: '081355551102',
    password: 'store123',
    photo_url: foodAyamGeprekImg,
    address: 'Jl. Ahmad Yani No. 45, Haurgeulis',
    payout_account: {
      provider: 'BRI',
      accountNumber: '012301009876501',
      ownerName: 'Joko Santoso',
      proofPhoto: null,
      locked: true,
      pendingChange: null,
    },
    trusted_devices: [],
    status: 'approved',
    owner_note: 'Paket hemat ayam geprek + es teh',
    rejection_reason: null,
    rating: 4.8,
    ad_active: true,
    ad_status: 'approved',
    ad_title: 'Ayam Geprek Sambal Ijo & Bakso Urat',
    ad_subtitle: 'Porsi kenyang harga mulai Rp 15.000 · Ongkir mulai Rp 6.000',
    ad_banner_url: foodAyamGeprekImg,
    ad_expires_at: '2026-12-30T23:59:59.000Z',
    created_at: '2026-11-17T02:10:00.000Z',
  },
];

const DEFAULT_MENUS: Row[] = [
  {
    id: '44444444-4444-4444-8444-444444444401',
    store_id: '33333333-3333-4333-8333-333333333301',
    store_name: 'Seblak Teh Rina Haurgeulis',
    category: 'Seblak',
    name: 'Seblak Ceker & Bakso Komplit',
    price: 18000,
    stock: 25,
    photo_url: foodSeblakImg,
    rating: 4.9,
    is_active: true,
    created_at: '2026-11-17T03:00:00.000Z',
  },
  {
    id: '44444444-4444-4444-8444-444444444402',
    store_id: '33333333-3333-4333-8333-333333333302',
    store_name: 'Geprek & Bakso Mas Joko',
    category: 'Ayam Geprek',
    name: 'Ayam Geprek Sambal Bawang + Nasi',
    price: 17000,
    stock: 30,
    photo_url: foodAyamGeprekImg,
    rating: 4.8,
    is_active: true,
    created_at: '2026-11-17T03:05:00.000Z',
  },
  {
    id: '44444444-4444-4444-8444-444444444403',
    store_id: '33333333-3333-4333-8333-333333333302',
    store_name: 'Geprek & Bakso Mas Joko',
    category: 'Bakso',
    name: 'Bakso Urat Jumbo Kuah Gurih',
    price: 20000,
    stock: 20,
    photo_url: foodBaksoImg,
    rating: 4.9,
    is_active: true,
    created_at: '2026-11-17T03:10:00.000Z',
  },
  {
    id: '44444444-4444-4444-8444-444444444404',
    store_id: '33333333-3333-4333-8333-333333333301',
    store_name: 'Seblak Teh Rina Haurgeulis',
    category: 'Minuman',
    name: 'Es Boba Gula Aren & Mangga Segar',
    price: 12000,
    stock: 40,
    photo_url: foodMinumanImg,
    rating: 4.7,
    is_active: true,
    created_at: '2026-11-17T03:15:00.000Z',
  },
];

const memoryTables = new Map<string, Row[]>();
const channelListeners = new Map<string, Listener[]>();

function defaultSeedForTable(table: string): Row[] {
  if (table === 'routes') return DEFAULT_ROUTES.map((r) => ({ ...r }));
  if (table === 'drivers') return DEFAULT_DRIVERS.map((r) => ({ ...r }));
  if (table === 'stores') return DEFAULT_STORES.map((r) => ({ ...r }));
  if (table === 'menu_items') return DEFAULT_MENUS.map((r) => ({ ...r }));
  return [];
}

function normalizeLegacyRow(table: string, row: Row): Row {
  if (table === 'drivers') {
    const rawPayout = row.payout_account;
    const payout =
      rawPayout && typeof rawPayout === 'object'
        ? rawPayout
        : {
            provider: 'DANA',
            accountNumber: String(row.phone || '081200000000'),
            ownerName: String(row.name || 'Driver'),
            proofPhoto: null,
            locked: true,
            pendingChange: null,
          };
    return {
      ...row,
      payout_account: payout,
      session_version: typeof row.session_version === 'number' ? row.session_version : 1,
      password_history: Array.isArray(row.password_history) ? row.password_history : [],
      last_location: typeof row.last_location === 'string' ? row.last_location : 'Haurgeulis, Indramayu',
    };
  }
  if (table === 'stores') {
    const rawPayout = row.payout_account;
    const payout =
      rawPayout && typeof rawPayout === 'object'
        ? rawPayout
        : {
            provider: 'DANA',
            accountNumber: String(rawPayout || row.phone || '081300000000'),
            ownerName: String(row.owner_name || row.name || 'Pemilik Toko'),
            proofPhoto: null,
            locked: true,
            pendingChange: null,
          };
    return {
      ...row,
      payout_account: payout,
      session_version: typeof row.session_version === 'number' ? row.session_version : 1,
      password_history: Array.isArray(row.password_history) ? row.password_history : [],
      last_location: typeof row.last_location === 'string' ? row.last_location : 'Haurgeulis, Indramayu',
    };
  }
  return row;
}

function readTable(table: string): Row[] {
  try {
    const raw = localStorage.getItem(DB_PREFIX + table);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0 && (table === 'routes' || table === 'stores' || table === 'menu_items')) {
          const seeded = defaultSeedForTable(table);
          writeTable(table, seeded);
          return seeded;
        }
        return (parsed as Row[]).map((r) => normalizeLegacyRow(table, r));
      }
    }
  } catch {
    // Fallback to memory
  }
  if (!memoryTables.has(table)) {
    const initial = defaultSeedForTable(table);
    memoryTables.set(table, initial);
    writeTable(table, initial);
  }
  return memoryTables.get(table) ?? [];
}

function writeTable(table: string, rows: Row[]) {
  memoryTables.set(table, rows);
  try {
    localStorage.setItem(DB_PREFIX + table, JSON.stringify(rows));
  } catch {
    // Ignore quota errors
  }
}

function notifyTable(table: string) {
  for (const list of channelListeners.values()) {
    for (const item of list) {
      if (item.table === '*' || item.table === table) {
        queueMicrotask(item.cb);
      }
    }
  }
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'mock-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now().toString(36);
}

function parseCondition(expr: string, row: Row): boolean {
  const trimmed = expr.trim();
  if (trimmed.startsWith('and(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(4, -1);
    return splitTopLevel(inner).every((part) => parseCondition(part, row));
  }
  if (trimmed.startsWith('or(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(3, -1);
    return splitTopLevel(inner).some((part) => parseCondition(part, row));
  }
  const firstDot = trimmed.indexOf('.');
  const secondDot = trimmed.indexOf('.', firstDot + 1);
  if (firstDot < 0 || secondDot < 0) return true;
  const col = trimmed.slice(0, firstDot);
  const op = trimmed.slice(firstDot + 1, secondDot);
  const val = trimmed.slice(secondDot + 1);
  const actual = row[col];
  if (op === 'eq') return String(actual ?? '') === val;
  if (op === 'is') {
    if (val === 'null') return actual === null || actual === undefined;
    return String(actual) === val;
  }
  return true;
}

function splitTopLevel(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(expr.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(expr.slice(start));
  return parts;
}

class MockQueryBuilder {
  private table: string;
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private selectCols = '*';
  private payload: Row | Row[] | null = null;
  private filters: ((row: Row) => boolean)[] = [];
  private orderBy: { col: string; ascending: boolean } | null = null;
  private maxRows: number | null = null;
  private returnMode: 'many' | 'single' | 'maybeSingle' = 'many';

  constructor(table: string) {
    this.table = table;
  }

  select(cols = '*') {
    this.selectCols = cols;
    return this;
  }

  insert(values: Row | Row[]) {
    this.op = 'insert';
    this.payload = values;
    return this;
  }

  update(values: Row) {
    this.op = 'update';
    this.payload = values;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push((row) => row[col] === val);
    return this;
  }

  is(col: string, val: null) {
    this.filters.push((row) => (val === null ? row[col] === null || row[col] === undefined : row[col] === val));
    return this;
  }

  or(expr: string) {
    const clauses = splitTopLevel(expr);
    this.filters.push((row) => clauses.some((c) => parseCondition(c, row)));
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, ascending: opts?.ascending !== false };
    return this;
  }

  limit(n: number) {
    this.maxRows = n;
    return this;
  }

  single() {
    this.returnMode = 'single';
    return this;
  }

  maybeSingle() {
    this.returnMode = 'maybeSingle';
    return this;
  }

  private withDefaults(input: Row): Row {
    const base: Row = {
      id: input.id ?? makeId(),
      created_at: input.created_at ?? new Date().toISOString(),
      ...input,
    };
    if (this.table === 'users') {
      return { city: 'Indramayu', ...base };
    }
    if (this.table === 'drivers') {
      return {
        is_online: false,
        rating: 5,
        trips_today: 0,
        bonus_date: null,
        dispute_false_count: 0,
        trusted_devices: [],
        password_history: [],
        session_version: 1,
        last_location: 'Haurgeulis, Indramayu',
        sim_photo: null,
        registration_payment_method: 'Transfer',
        registration_fee_amount: 50000,
        registration_fee_paid: false,
        registration_proof_photo: null,
        password_reset_requested_at: null,
        status: 'approved',
        vehicle_type: 'Mobil',
        owner_note: null,
        rejection_reason: null,
        ...base,
      };
    }
    if (this.table === 'stores') {
      return {
        rating: 5,
        status: 'pending',
        ad_active: false,
        ad_status: 'none',
        trusted_devices: [],
        password_history: [],
        session_version: 1,
        last_location: 'Haurgeulis, Indramayu',
        password_reset_requested_at: null,
        owner_note: null,
        rejection_reason: null,
        ...base,
      };
    }
    if (this.table === 'menu_items') {
      return {
        is_active: true,
        rating: 4.8,
        stock: 20,
        ...base,
      };
    }
    if (this.table === 'routes') {
      return { is_active: true, ...base };
    }
    if (this.table === 'orders') {
      return {
        user_id: null,
        driver_id: null,
        route_id: null,
        car_type: 'Ekonomi',
        payment_method: 'Cash ke Driver',
        payment_splits: [],
        transfer_proofs: [],
        commission_settled: false,
        commission_settlement_id: null,
        customer_paid_driver: false,
        status: 'Mencari Driver',
        is_carpool: false,
        rating: null,
        ...base,
      };
    }
    if (this.table === 'jastip_orders') {
      return {
        user_id: null,
        driver_id: null,
        payment_method: 'Cash ke Driver',
        payment_splits: [],
        transfer_proofs: [],
        commission_bearer: 'driver',
        commission_settled: false,
        commission_settlement_id: null,
        driver_paid_store: false,
        driver_paid_store_method: null,
        driver_paid_store_proof: null,
        store_confirmed_driver_paid: false,
        customer_paid_driver: false,
        status: 'Menunggu Driver',
        rating: null,
        ...base,
      };
    }
    if (this.table === 'commission_settlements') {
      return {
        travel_order_ids: [],
        food_order_ids: [],
        status: 'Menunggu ACC',
        verified_at: null,
        ...base,
      };
    }
    if (this.table === 'ai_alerts') {
      return {
        is_read: false,
        ...base,
      };
    }
    return base;
  }

  private enrichRow(row: Row): Row {
    if (this.table === 'orders' && this.selectCols.includes('drivers(')) {
      const drivers = readTable('drivers');
      const drv = row.driver_id ? drivers.find((d) => d.id === row.driver_id) : null;
      return {
        ...row,
        drivers: drv
          ? {
              name: drv.name,
              plate: drv.plate,
              phone: drv.phone,
              is_online: drv.is_online,
            }
          : null,
      };
    }
    return { ...row };
  }

  private async execute(): QueryResult<unknown> {
    let rows = readTable(this.table);
    let affected: Row[] = [];

    if (this.op === 'select') {
      affected = rows.filter((r) => this.filters.every((fn) => fn(r)));
    } else if (this.op === 'insert') {
      const items = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
      const inserted = items.map((item) => this.withDefaults(item));
      rows = [...rows, ...inserted];
      writeTable(this.table, rows);
      notifyTable(this.table);
      affected = inserted;
    } else if (this.op === 'update') {
      const patch = (this.payload && !Array.isArray(this.payload) ? this.payload : {}) as Row;
      const updatedRows: Row[] = [];
      rows = rows.map((r) => {
        if (this.filters.every((fn) => fn(r))) {
          const next = { ...r, ...patch };
          updatedRows.push(next);
          return next;
        }
        return r;
      });
      writeTable(this.table, rows);
      if (updatedRows.length > 0) notifyTable(this.table);
      affected = updatedRows;
    } else if (this.op === 'delete') {
      const deleted: Row[] = [];
      const remaining: Row[] = [];
      for (const r of rows) {
        if (this.filters.every((fn) => fn(r))) deleted.push(r);
        else remaining.push(r);
      }
      writeTable(this.table, remaining);
      if (deleted.length > 0) notifyTable(this.table);
      affected = deleted;
    }

    if (this.orderBy) {
      const { col, ascending } = this.orderBy;
      affected = [...affected].sort((a, b) => {
        const av = String(a[col] ?? '');
        const bv = String(b[col] ?? '');
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }

    if (this.maxRows !== null) {
      affected = affected.slice(0, this.maxRows);
    }

    const enriched = affected.map((r) => this.enrichRow(r));

    if (this.returnMode === 'single') {
      if (enriched.length === 0) {
        return { data: null, error: null };
      }
      return { data: enriched[0], error: null };
    }
    if (this.returnMode === 'maybeSingle') {
      return { data: enriched[0] ?? null, error: null };
    }
    return { data: enriched, error: null };
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class MockChannel {
  private name: string;
  private listeners: Listener[] = [];

  constructor(name: string) {
    this.name = name;
  }

  on(
    _type: string,
    filter: { table?: string },
    cb: () => void,
  ) {
    this.listeners.push({ table: filter.table ?? '*', cb });
    return this;
  }

  subscribe() {
    channelListeners.set(this.name, this.listeners);
    return this;
  }
}

function createMockSupabase() {
  console.warn('[AI Studio] VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY not set — using localStorage-backed mock Supabase client');
  readTable('routes');
  readTable('drivers');
  readTable('stores');
  readTable('menu_items');
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (ev) => {
      if (ev.key && ev.key.startsWith(DB_PREFIX)) {
        notifyTable(ev.key.slice(DB_PREFIX.length));
      }
    });
  }
  return {
    from(table: string) {
      return new MockQueryBuilder(table);
    },
    channel(name: string) {
      return new MockChannel(name);
    },
    removeChannel(ch: unknown) {
      for (const [k, v] of channelListeners.entries()) {
        if (ch && typeof ch === 'object' && 'listeners' in ch && v === (ch as { listeners: Listener[] }).listeners) {
          channelListeners.delete(k);
        }
      }
      return Promise.resolve('ok');
    },
  };
}

export const supabase: SupabaseClient =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        realtime: { params: { eventsPerSecond: 10 } },
      })
    : (createMockSupabase() as unknown as SupabaseClient);
