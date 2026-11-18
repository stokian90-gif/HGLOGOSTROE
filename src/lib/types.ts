export type PayoutProvider = 'DANA' | 'OVO' | 'GoPay' | 'BCA' | 'BRI' | 'Mandiri' | 'BNI';

export const PAYOUT_PROVIDERS: readonly PayoutProvider[] = [
  'DANA',
  'OVO',
  'GoPay',
  'BCA',
  'BRI',
  'Mandiri',
  'BNI',
] as const;

export interface PendingPayoutChange {
  action?: 'change' | 'delete';
  provider: PayoutProvider;
  accountNumber: string;
  ownerName: string;
  proofPhoto: string | null;
  reason?: string;
  requestedAt: string;
}

export interface PayoutAccount {
  provider: PayoutProvider;
  accountNumber: string;
  ownerName: string;
  proofPhoto: string | null;
  qrImage?: string | null;
  locked: boolean;
  pendingChange?: PendingPayoutChange | null;
}

export interface PaymentSplit {
  recipientRole: 'store' | 'driver' | 'owner';
  recipientId: string;
  recipientName: string;
  label: string;
  description: string;
  amount: number;
  provider: PayoutProvider;
  accountNumber: string;
  accountOwnerName: string;
  qrImage?: string | null;
}

export interface TransferProof {
  id: string;
  imageUrl: string;
  fileName: string;
  fileSize: number;
  aiNote: string;
  aiPassed: boolean;
  fingerprint: string;
  uploadedAt: string;
}

export interface OrderVerification {
  customerConfirmed: boolean;
  driverConfirmed: boolean;
  storeConfirmed: boolean;
  driverDisputed: boolean;
  storeDisputed: boolean;
  disputeNote?: string | null;
  disputeBy?: 'Driver' | 'Toko' | null;
  commissionStatus: 'Belum Masuk' | 'Sudah Masuk' | 'Sengketa';
  remindedAt?: string | null;
}

export interface UserRow {
  id: string;
  name: string;
  whatsapp: string;
  city: string;
  created_at: string;
}

export type DriverStatus = 'pending' | 'approved' | 'rejected' | 'blocked';

export interface DriverRow {
  id: string;
  name: string;
  phone: string;
  driver_code: string;
  sim: string;
  plate: string;
  password: string;
  vehicle_type?: 'Motor' | 'Mobil';
  ktp_number?: string | null;
  ktp_photo?: string | null;
  sim_photo?: string | null;
  vehicle_photo?: string | null;
  photo_url?: string | null;
  payout_account: PayoutAccount;
  trusted_devices?: string[];
  password_history?: string[];
  session_version?: number;
  last_location?: string;
  dispute_false_count?: number;
  registration_payment_method?: 'Cash' | 'Transfer';
  registration_fee_amount?: number;
  registration_fee_paid?: boolean;
  registration_proof_photo?: string | null;
  password_reset_requested_at?: string | null;
  status?: DriverStatus;
  owner_note?: string | null;
  rejection_reason?: string | null;
  is_online: boolean;
  rating: number;
  trips_today: number;
  bonus_date: string | null;
  created_at: string;
}

export function getDriverStatus(d: Pick<DriverRow, 'status'>): DriverStatus {
  if (d.status === 'pending' || d.status === 'rejected' || d.status === 'blocked') return d.status;
  return 'approved';
}

export interface StoreRow {
  id: string;
  name: string;
  owner_name: string;
  ktp_number: string;
  phone: string;
  password?: string;
  photo_url: string | null;
  address: string;
  payout_account: PayoutAccount;
  trusted_devices?: string[];
  password_history?: string[];
  session_version?: number;
  last_location?: string;
  password_reset_requested_at?: string | null;
  status: DriverStatus;
  owner_note?: string | null;
  rejection_reason?: string | null;
  rating: number;
  ad_active: boolean;
  ad_status: 'none' | 'pending' | 'approved' | 'rejected';
  ad_title?: string | null;
  ad_subtitle?: string | null;
  ad_banner_url?: string | null;
  ad_expires_at?: string | null;
  created_at: string;
}

export const FOOD_CATEGORIES = ['Seblak', 'Ayam Geprek', 'Bakso', 'Minuman'] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

export interface MenuItemRow {
  id: string;
  store_id: string;
  store_name: string;
  category: FoodCategory;
  name: string;
  price: number;
  stock: number;
  photo_url: string | null;
  rating: number;
  is_active: boolean;
  created_at: string;
}

export interface JastipOrderItem {
  menu_id: string;
  name: string;
  price: number;
  qty: number;
  category: FoodCategory;
}

export const JASTIP_STATUSES = [
  'Menunggu Driver',
  'Menunggu Talangan',
  'Menunggu Konfirmasi Toko',
  'Dibuat',
  'Driver Mengambil',
  'Driver Mengantar',
  'Selesai',
  'Ditolak Toko',
  'Dibatalkan',
] as const;

export interface JastipOrderRow {
  id: string;
  user_id: string | null;
  store_id: string;
  store_name: string;
  driver_id: string | null;
  driver_name?: string | null;
  driver_plate?: string | null;
  driver_phone?: string | null;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  items: JastipOrderItem[];
  food_subtotal: number;
  owner_commission: number;
  store_net: number;
  distance_km: number;
  eta_minutes: number;
  delivery_fee: number;
  total_price: number;
  payment_method: string;
  payment_splits?: PaymentSplit[];
  transfer_proofs?: TransferProof[];
  verification?: OrderVerification;
  commission_bearer?: 'driver' | 'store';
  commission_settled?: boolean;
  commission_settlement_id?: string | null;
  driver_paid_store?: boolean;
  driver_paid_store_method?: 'Cash' | 'Transfer' | null;
  driver_paid_store_proof?: string | null;
  store_confirmed_driver_paid?: boolean;
  customer_paid_driver?: boolean;
  status: string;
  rating?: number | null;
  created_at: string;
}

export interface RouteRow {
  id: string;
  origin: string;
  destination: string;
  price_economy: number;
  price_comfort: number;
  price_premium: number;
  is_active: boolean;
  image_url?: string | null;
  eta_text?: string | null;
  default_car_type?: CarType | null;
}

export interface OrderRow {
  id: string;
  user_id: string | null;
  driver_id: string | null;
  route_id: string | null;
  customer_name: string;
  customer_phone: string;
  pickup: string;
  destination: string;
  car_type: string;
  price: number;
  owner_commission?: number;
  driver_net?: number;
  payment_method: string;
  payment_splits?: PaymentSplit[];
  transfer_proofs?: TransferProof[];
  verification?: OrderVerification;
  commission_settled?: boolean;
  commission_settlement_id?: string | null;
  customer_paid_driver?: boolean;
  status: string;
  is_carpool: boolean;
  rating: number | null;
  created_at: string;
  driver_name?: string | null;
  driver_plate?: string | null;
  driver_phone?: string | null;
  driver_online?: boolean | null;
}

export interface CommissionSettlementRow {
  id: string;
  role: 'driver' | 'store';
  actor_id: string;
  actor_name: string;
  actor_phone: string;
  amount: number;
  order_count: number;
  travel_order_ids: string[];
  food_order_ids: string[];
  proof_url: string;
  ai_note?: string;
  status: 'Menunggu ACC' | 'Sudah Diterima' | 'Ditolak';
  created_at: string;
  verified_at?: string | null;
}

export interface MessageRow {
  id: string;
  order_id: string;
  sender: string;
  body: string;
  created_at: string;
  is_read?: boolean;
}

export interface SecurityLogRow {
  id: string;
  actor_name: string;
  role: 'Customer' | 'Driver' | 'Toko' | 'Owner' | 'Sistem AI';
  action: string;
  device_info: string;
  ip_address: string;
  severity: 'info' | 'warning' | 'critical';
  created_at: string;
}

export interface AiAlertRow {
  id: string;
  target_role: 'owner' | 'driver' | 'store' | 'customer';
  target_id?: string | null;
  title: string;
  message: string;
  category:
    | 'duplicate'
    | 'fake_proof'
    | 'fake_order'
    | 'bad_driver'
    | 'dispute'
    | 'payment'
    | 'password_reset'
    | 'system';
  is_read: boolean;
  created_at: string;
}

export const CAR_TYPES = ['Ekonomi', 'Nyaman', 'Premium'] as const;
export type CarType = (typeof CAR_TYPES)[number];

export const ORDER_STATUSES = [
  'Mencari Driver',
  'Driver OTW',
  'Driver Tiba',
  'Dalam Perjalanan',
  'Sampai',
  'Dibatalkan',
] as const;

export function priceForRoute(route: RouteRow | null | undefined, carType: CarType): number {
  if (!route) return 0;
  const base =
    carType === 'Premium'
      ? route.price_premium
      : carType === 'Nyaman'
        ? route.price_comfort
        : route.price_economy;
  return rushPrice(base);
}

// Harga dinamis jam sibuk: 07-09 dan 16-19 naik 15%
export function rushPrice(base: number, hour?: number): number {
  const h = hour ?? new Date().getHours();
  const rush = (h >= 7 && h < 9) || (h >= 16 && h < 19);
  return rush ? Math.round((base * 1.15) / 500) * 500 : base;
}

export function formatRupiah(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

export function mapsLink(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function getErrorMessage(err?: unknown): string {
  void err;
  return 'Koneksi bermasalah, coba lagi';
}
