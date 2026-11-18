import { useEffect, useState } from 'react';
import { CarType, FoodCategory, PayoutAccount, PayoutProvider, RouteRow } from '@/lib/types';

import heroDriverImg from '@/assets/images/hero_driver_helmet_1794952277598.jpg';
import driverAsepImg from '@/assets/images/driver_portrait_asep_1794952278435.jpg';
import driverBudiImg from '@/assets/images/driver_portrait_budi_1794952278793.jpg';
import travelBandungImg from '@/assets/images/travel_mpv_bandung_1794952279380.jpg';
import travelJakartaImg from '@/assets/images/travel_route_jakarta_1794953323026.jpg';
import travelCirebonImg from '@/assets/images/travel_route_cirebon_1794953323141.jpg';
import foodSeblakImg from '@/assets/images/food_seblak_1794955347178.jpg';
import foodAyamGeprekImg from '@/assets/images/food_ayam_geprek_1794955347382.jpg';
import foodBaksoImg from '@/assets/images/food_bakso_1794955347543.jpg';
import foodMinumanImg from '@/assets/images/food_minuman_segar_1794955348120.jpg';
import storeWarungImg from '@/assets/images/store_warung_haurgeulis_1794955348631.jpg';

export interface HeroBannerSettings {
  topLabel: string;
  titleLine1: string;
  titleLine2: string;
  titleLine3: string;
  description: string;
  buttonText: string;
  imageUrl: string | null;
}

export interface PlatformFinanceSettings {
  travelCommissionPercent: number; // 0% - hasil orderan 100% milik driver
  jastipCommissionPercent: number; // 0% - hasil orderan 100% milik driver & toko
  foodCommissionBearer: 'driver' | 'store';
  driverRegistrationFee: number; // default Rp 50.000 sekali bayar selamanya
  aiRatePerKm: number; // default Rp 3.500/km
  adPricePerWeek: number; // default Rp 50.000 (100% Full Owner)
  ownerPayout: PayoutAccount;
}

export interface TravelSettings {
  travelName: string;
  tagline: string;
  banner: string | null;
  heroBanner: HeroBannerSettings;
  finance: PlatformFinanceSettings;
}

export interface RouteMeta {
  imageUrl?: string | null;
  etaText?: string | null;
  defaultCarType?: CarType | null;
}

export const DEFAULT_HERO_BANNER: HeroBannerSettings = {
  topLabel: 'Travel Indramayu',
  titleLine1: 'Travel Itu',
  titleLine2: 'Cuma Hitungan',
  titleLine3: 'Menit Aja',
  description: 'Driver siaga 24 jam. Aman, cepat, sampai tujuan.',
  buttonText: 'Pesan Sekarang',
  imageUrl: null,
};

export const DEFAULT_OWNER_PAYOUT: PayoutAccount = {
  provider: 'DANA',
  accountNumber: '085612340000',
  ownerName: 'Owner WONG HAURGEULIS',
  proofPhoto: null,
  qrImage: null,
  locked: true,
  pendingChange: null,
};

export const DEFAULT_FINANCE_SETTINGS: PlatformFinanceSettings = {
  travelCommissionPercent: 0,
  jastipCommissionPercent: 0,
  foodCommissionBearer: 'driver',
  driverRegistrationFee: 50000,
  aiRatePerKm: 3500,
  adPricePerWeek: 50000,
  ownerPayout: { ...DEFAULT_OWNER_PAYOUT },
};

export const DEFAULT_HERO_IMAGE = heroDriverImg;
export const DEFAULT_DRIVER_CAR_IMG = driverAsepImg;
export const DEFAULT_DRIVER_MOTOR_IMG = driverBudiImg;
export const DEFAULT_STORE_IMG = storeWarungImg;

export const FOOD_DEFAULT_IMAGES: Record<FoodCategory, string> = {
  Seblak: foodSeblakImg,
  'Ayam Geprek': foodAyamGeprekImg,
  Bakso: foodBaksoImg,
  Minuman: foodMinumanImg,
};

export const HERO_PHOTO_TEMPLATES = [
  { id: 'hero-helmet', label: 'Driver Helm Siaga', url: heroDriverImg },
  { id: 'hero-asep', label: 'Driver Mobil', url: driverAsepImg },
  { id: 'hero-budi', label: 'Driver Motor', url: driverBudiImg },
  { id: 'hero-mpv', label: 'Armada MPV', url: travelBandungImg },
] as const;

export const ROUTE_PHOTO_TEMPLATES = [
  { id: 'route-bandung', label: 'Travel Pegunungan / Bandung', url: travelBandungImg },
  { id: 'route-jakarta', label: 'Tol Jakarta Eksekutif', url: travelJakartaImg },
  { id: 'route-cirebon', label: 'Jalur Pantura / Cirebon', url: travelCirebonImg },
  { id: 'route-driver', label: 'Armada Siaga Haurgeulis', url: heroDriverImg },
  { id: 'route-asep', label: 'Driver Mobil Nyaman', url: driverAsepImg },
  { id: 'route-budi', label: 'Driver Cepat Motor', url: driverBudiImg },
] as const;

export const FOOD_PHOTO_TEMPLATES = [
  { id: 'food-seblak', label: 'Seblak Spesial', url: foodSeblakImg },
  { id: 'food-geprek', label: 'Ayam Geprek', url: foodAyamGeprekImg },
  { id: 'food-bakso', label: 'Bakso Urat', url: foodBaksoImg },
  { id: 'food-minuman', label: 'Minuman Segar', url: foodMinumanImg },
  { id: 'store-warung', label: 'Foto Toko Kuliner', url: storeWarungImg },
] as const;

const KEY = 'ti_settings';
const ROUTE_META_KEY = 'ti_route_meta';

export const DEFAULT_SETTINGS: TravelSettings = {
  travelName: 'WONG HAURGEULIS',
  tagline: '24 JAM AMAN & NYAMAN',
  banner: null,
  heroBanner: { ...DEFAULT_HERO_BANNER },
  finance: {
    ...DEFAULT_FINANCE_SETTINGS,
    ownerPayout: { ...DEFAULT_OWNER_PAYOUT },
  },
};

export const MAX_BANNER_BYTES = 8_000_000;

function normalizeHeroBanner(raw?: Partial<HeroBannerSettings> | null): HeroBannerSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_HERO_BANNER };
  return {
    topLabel:
      typeof raw.topLabel === 'string' && raw.topLabel.trim()
        ? raw.topLabel
        : DEFAULT_HERO_BANNER.topLabel,
    titleLine1:
      typeof raw.titleLine1 === 'string' && raw.titleLine1.trim()
        ? raw.titleLine1
        : DEFAULT_HERO_BANNER.titleLine1,
    titleLine2:
      typeof raw.titleLine2 === 'string' && raw.titleLine2.trim()
        ? raw.titleLine2
        : DEFAULT_HERO_BANNER.titleLine2,
    titleLine3:
      typeof raw.titleLine3 === 'string' && raw.titleLine3.trim()
        ? raw.titleLine3
        : DEFAULT_HERO_BANNER.titleLine3,
    description:
      typeof raw.description === 'string' && raw.description.trim()
        ? raw.description
        : DEFAULT_HERO_BANNER.description,
    buttonText:
      typeof raw.buttonText === 'string' && raw.buttonText.trim()
        ? raw.buttonText
        : DEFAULT_HERO_BANNER.buttonText,
    imageUrl: typeof raw.imageUrl === 'string' && raw.imageUrl.trim() ? raw.imageUrl : null,
  };
}

function normalizePayout(raw?: Partial<PayoutAccount> | null): PayoutAccount {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_OWNER_PAYOUT };
  const validProviders: PayoutProvider[] = ['DANA', 'OVO', 'GoPay', 'BCA', 'BRI', 'Mandiri', 'BNI'];
  const provider = validProviders.includes(raw.provider as PayoutProvider)
    ? (raw.provider as PayoutProvider)
    : DEFAULT_OWNER_PAYOUT.provider;
  return {
    provider,
    accountNumber:
      typeof raw.accountNumber === 'string' && raw.accountNumber.trim()
        ? raw.accountNumber.trim()
        : DEFAULT_OWNER_PAYOUT.accountNumber,
    ownerName:
      typeof raw.ownerName === 'string' && raw.ownerName.trim()
        ? raw.ownerName.trim()
        : DEFAULT_OWNER_PAYOUT.ownerName,
    proofPhoto: typeof raw.proofPhoto === 'string' ? raw.proofPhoto : null,
    qrImage: typeof raw.qrImage === 'string' ? raw.qrImage : null,
    locked: raw.locked !== false,
    pendingChange: raw.pendingChange ?? null,
  };
}

function normalizeFinance(raw?: Partial<PlatformFinanceSettings> | null): PlatformFinanceSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_FINANCE_SETTINGS, ownerPayout: { ...DEFAULT_OWNER_PAYOUT } };
  }
  return {
    travelCommissionPercent: 0,
    jastipCommissionPercent: 0,
    foodCommissionBearer: raw.foodCommissionBearer === 'store' ? 'store' : 'driver',
    driverRegistrationFee:
      typeof raw.driverRegistrationFee === 'number' && raw.driverRegistrationFee >= 0
        ? raw.driverRegistrationFee
        : DEFAULT_FINANCE_SETTINGS.driverRegistrationFee,
    aiRatePerKm:
      typeof raw.aiRatePerKm === 'number' && raw.aiRatePerKm >= 500
        ? raw.aiRatePerKm
        : DEFAULT_FINANCE_SETTINGS.aiRatePerKm,
    adPricePerWeek:
      typeof raw.adPricePerWeek === 'number' && raw.adPricePerWeek >= 1000
        ? raw.adPricePerWeek
        : DEFAULT_FINANCE_SETTINGS.adPricePerWeek,
    ownerPayout: normalizePayout(raw.ownerPayout),
  };
}

export function buildOwnerWaLink(ownerPhone: string, message: string): string {
  const digits = ownerPhone.replace(/\D/g, '');
  const intl = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('62')
      ? digits
      : '6285612340000';
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

export function loadSettings(): TravelSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {
        ...DEFAULT_SETTINGS,
        heroBanner: { ...DEFAULT_HERO_BANNER },
        finance: { ...DEFAULT_FINANCE_SETTINGS, ownerPayout: { ...DEFAULT_OWNER_PAYOUT } },
      };
    }
    const parsed = JSON.parse(raw) as Partial<TravelSettings>;
    return {
      travelName:
        typeof parsed.travelName === 'string' && parsed.travelName.trim()
          ? parsed.travelName
          : DEFAULT_SETTINGS.travelName,
      tagline: typeof parsed.tagline === 'string' ? parsed.tagline : DEFAULT_SETTINGS.tagline,
      banner: typeof parsed.banner === 'string' ? parsed.banner : null,
      heroBanner: normalizeHeroBanner(parsed.heroBanner),
      finance: normalizeFinance(parsed.finance),
    };
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      heroBanner: { ...DEFAULT_HERO_BANNER },
      finance: { ...DEFAULT_FINANCE_SETTINGS, ownerPayout: { ...DEFAULT_OWNER_PAYOUT } },
    };
  }
}

export function saveSettings(s: TravelSettings): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new Event('ti_settings_changed'));
    return true;
  } catch {
    return false;
  }
}

export function useTravelSettings(): TravelSettings {
  const [settings, setSettings] = useState<TravelSettings>(loadSettings);

  useEffect(() => {
    const update = () => setSettings(loadSettings());
    window.addEventListener('ti_settings_changed', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('ti_settings_changed', update);
      window.removeEventListener('storage', update);
    };
  }, []);

  return settings;
}

export function loadRouteMetaMap(): Record<string, RouteMeta> {
  try {
    const raw = localStorage.getItem(ROUTE_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, RouteMeta>) : {};
  } catch {
    return {};
  }
}

export function saveRouteMeta(routeId: string, meta: RouteMeta): boolean {
  try {
    const current = loadRouteMetaMap();
    const next = { ...current, [routeId]: meta };
    localStorage.setItem(ROUTE_META_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('ti_route_meta_changed'));
    return true;
  } catch {
    return false;
  }
}

export function deleteRouteMeta(routeId: string) {
  try {
    const current = loadRouteMetaMap();
    if (!(routeId in current)) return;
    const copy = { ...current };
    delete copy[routeId];
    localStorage.setItem(ROUTE_META_KEY, JSON.stringify(copy));
    window.dispatchEvent(new Event('ti_route_meta_changed'));
  } catch {
    // Ignore storage errors
  }
}

export function useRouteMetaMap(): Record<string, RouteMeta> {
  const [metaMap, setMetaMap] = useState<Record<string, RouteMeta>>(loadRouteMetaMap);

  useEffect(() => {
    const update = () => setMetaMap(loadRouteMetaMap());
    window.addEventListener('ti_route_meta_changed', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('ti_route_meta_changed', update);
      window.removeEventListener('storage', update);
    };
  }, []);

  return metaMap;
}

export function getDefaultRoutePhoto(route: Pick<RouteRow, 'origin' | 'destination'>): string {
  const txt = `${route.origin} ${route.destination}`.toLowerCase();
  if (txt.includes('jakarta') || txt.includes('bekasi') || txt.includes('karawang')) {
    return travelJakartaImg;
  }
  if (txt.includes('cirebon') || txt.includes('kuningan') || txt.includes('patrol')) {
    return travelCirebonImg;
  }
  if (txt.includes('haurgeulis')) {
    return driverAsepImg;
  }
  return travelBandungImg;
}

export function resolveRouteDisplay(
  route: RouteRow,
  metaMap: Record<string, RouteMeta>,
): {
  imageUrl: string;
  etaText: string;
  defaultCarType: CarType;
} {
  const meta = metaMap[route.id];
  const imageUrl =
    (typeof meta?.imageUrl === 'string' && meta.imageUrl.trim()) ||
    (typeof route.image_url === 'string' && route.image_url.trim()) ||
    getDefaultRoutePhoto(route);
  const etaText =
    (typeof meta?.etaText === 'string' && meta.etaText.trim()) ||
    (typeof route.eta_text === 'string' && route.eta_text.trim()) ||
    '15-20 mnt';
  const defaultCarType: CarType =
    meta?.defaultCarType || route.default_car_type || 'Ekonomi';

  return { imageUrl, etaText, defaultCarType };
}

export async function readImageFileAsDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File harus berupa gambar (JPG/PNG/WEBP)');
  }
  if (file.size > MAX_BANNER_BYTES) {
    throw new Error('Ukuran gambar terlalu besar (maksimal 8 MB)');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.readAsDataURL(file);
  });

  if (file.size <= 350_000) return rawDataUrl;

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 960;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}
