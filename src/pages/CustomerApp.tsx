import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Heart,
  Home as HomeIcon,
  MapPin,
  Megaphone,
  MessageSquare,
  Minus,
  Navigation,
  Plus,
  Receipt,
  Send,
  ShieldCheck,
  ShoppingBag,
  Siren,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Tag,
  User,
  UserCheck,
  Users,
  Utensils,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  AiAlertRow,
  CAR_TYPES,
  CarType,
  DriverRow,
  FOOD_CATEGORIES,
  FoodCategory,
  JastipOrderItem,
  JastipOrderRow,
  MenuItemRow,
  MessageRow,
  OrderRow,
  RouteRow,
  StoreRow,
  UserRow,
  formatRupiah,
  getDriverStatus,
  mapsLink,
  priceForRoute,
} from '@/lib/types';
import { Btn, ErrorBox, Field, MiniMap, Modal, StarRating, Toast } from '@/components/ui';
import ChatView from '@/components/ChatView';
import {
  DEFAULT_DRIVER_CAR_IMG,
  DEFAULT_DRIVER_MOTOR_IMG,
  DEFAULT_HERO_IMAGE,
  DEFAULT_STORE_IMG,
  FOOD_DEFAULT_IMAGES,
  getDefaultRoutePhoto,
  resolveRouteDisplay,
  useRouteMetaMap,
  useTravelSettings,
} from '@/lib/settings';
import {
  answerCustomerAiQuestion,
  estimateAiOngkir,
  getAiFoodRecommendation,
} from '@/lib/aiHelper';
import {
  calculateFoodAccounting,
  calculateTravelAccounting,
  createInitialVerification,
} from '@/lib/paymentFlow';
import {
  pushAiAlert,
  recordCustomerOrderCreated,
} from '@/lib/securityAi';
import { playTingSound } from '@/lib/sound';
import { getMyReadAt } from '@/lib/chatRead';

const GUEST_STORAGE_KEY = 'ti_customer_guest';
const GUEST_ID_KEY = 'ti_customer';
const FAV_ROUTES_KEY = 'ti_fav_routes';

const PICKUP_AREAS = [
  'Haurgeulis, Indramayu',
  'Indramayu Kota',
  'Jatibarang, Indramayu',
  'Patrol, Indramayu',
];

function makeGuestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'guest-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now().toString(36);
}

function getOrCreateGuest(): UserRow {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserRow>;
      if (parsed && typeof parsed.id === 'string') {
        return {
          id: parsed.id,
          name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : 'Customer',
          whatsapp: typeof parsed.whatsapp === 'string' && parsed.whatsapp ? parsed.whatsapp : '',
          city: typeof parsed.city === 'string' && parsed.city ? parsed.city : 'Haurgeulis, Indramayu',
          created_at: typeof parsed.created_at === 'string' ? parsed.created_at : new Date().toISOString(),
        };
      }
    }
  } catch {
    // Fallback
  }

  let id = makeGuestId();
  try {
    const existingId = localStorage.getItem(GUEST_ID_KEY);
    if (existingId) id = existingId;
  } catch {
    // Ignore
  }

  const fresh: UserRow = {
    id,
    name: 'Customer',
    whatsapp: '',
    city: 'Haurgeulis, Indramayu',
    created_at: new Date().toISOString(),
  };
  saveGuestToStorage(fresh);
  return fresh;
}

function saveGuestToStorage(u: UserRow) {
  try {
    localStorage.setItem(GUEST_ID_KEY, u.id);
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(u));
  } catch {
    // Ignore
  }
}

function readFavoriteRoutes(): string[] {
  try {
    const raw = localStorage.getItem(FAV_ROUTES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export default function CustomerApp({
  onOpenRole,
}: {
  onOpenRole?: (role: 'driver' | 'store' | 'owner') => void;
}) {
  const [user, setUser] = useState<UserRow>(() => getOrCreateGuest());
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [menus, setMenus] = useState<MenuItemRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [jastipOrders, setJastipOrders] = useState<JastipOrderRow[]>([]);
  const [customerAlerts, setCustomerAlerts] = useState<AiAlertRow[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Nav & filter UI state
  const [navTab, setNavTab] = useState<'beranda' | 'makanan' | 'pesanan' | 'promo' | 'profil'>('beranda');
  const [pickupArea, setPickupArea] = useState('Haurgeulis, Indramayu');
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLimit, setNotifLimit] = useState(10);
  const [financeLimit, setFinanceLimit] = useState(10);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavoriteRoutes());

  // Filter 3 Bagian Utama GoFood
  const [driverFilter, setDriverFilter] = useState<'Semua' | 'Motor' | 'Mobil'>('Semua');
  const [foodFilter, setFoodFilter] = useState<'Semua' | FoodCategory>('Semua');
  const [storeFilterId, setStoreFilterId] = useState<string | null>(null);
  const [adSlideIdx, setAdSlideIdx] = useState(0);

  // Keranjang Order Makanan
  const [cart, setCart] = useState<{ item: MenuItemRow; qty: number }[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [jName, setJName] = useState(() => {
    const g = getOrCreateGuest();
    return g.name === 'Customer' ? '' : g.name;
  });
  const [jPhone, setJPhone] = useState(() => getOrCreateGuest().whatsapp || '');
  const [jAddress, setJAddress] = useState('Jl. Raya Haurgeulis No. 12');
  const [foodPayMethod, setFoodPayMethod] = useState<'Cash ke Driver' | 'Transfer ke Driver'>('Cash ke Driver');

  // Tanya AI Modal
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState<{ sender: 'ai' | 'user'; text: string }[]>([
    {
      sender: 'ai',
      text: 'Halo! Saya Asisten AI WONG HAURGEULIS. Tanya soal rute travel, rekomendasi seblak/geprek/bakso, atau perkiraan ongkir Order Makanan!',
    },
  ]);

  // Promo state
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);

  // Booking Travel sheet
  const [bookingOpen, setBookingOpen] = useState(false);
  const [routeId, setRouteId] = useState('');
  const [carType, setCarType] = useState<CarType>('Ekonomi');
  const [guestName, setGuestName] = useState(() => {
    const saved = getOrCreateGuest();
    return saved.name === 'Customer' ? '' : saved.name;
  });
  const [pickup, setPickup] = useState('');
  const [carpool, setCarpool] = useState(false);
  const [travelPayMethod, setTravelPayMethod] = useState<'Cash ke Driver' | 'Transfer ke Driver'>('Cash ke Driver');

  // In-App Chat (Travel atau Order Makanan)
  const [chatTarget, setChatTarget] = useState<{
    orderId: string;
    peerName: string;
    peerSub: string;
    peerPhone?: string | null;
    peerOnline?: boolean;
    pickupLoc: string;
  } | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [rateOrder, setRateOrder] = useState<OrderRow | null>(null);
  const [stars, setStars] = useState(5);
  const [sosOpen, setSosOpen] = useState(false);
  const [readTick, setReadTick] = useState(0);

  const prevNotifRef = useRef(-1);

  const appSettings = useTravelSettings();
  const routeMetaMap = useRouteMetaMap();
  const hero = appSettings.heroBanner;

  const loadMessages = useCallback(async (orderId: string) => {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at');
      setMessages((data as MessageRow[]) || []);
    } catch {
      // Ignore transient
    }
  }, []);

  const loadAll = useCallback(
    async (guestId: string) => {
      try {
        const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
          supabase.from('routes').select('*').eq('is_active', true).order('origin'),
          supabase
            .from('orders')
            .select('*, drivers(name, plate, phone, is_online)')
            .eq('user_id', guestId)
            .order('created_at', { ascending: false })
            .limit(40),
          supabase.from('drivers').select('*').order('created_at', { ascending: false }),
          supabase.from('stores').select('*').order('created_at', { ascending: false }),
          supabase.from('menu_items').select('*').eq('is_active', true).order('created_at', { ascending: false }),
          supabase
            .from('jastip_orders')
            .select('*')
            .eq('user_id', guestId)
            .order('created_at', { ascending: false })
            .limit(40),
          supabase
            .from('ai_alerts')
            .select('*')
            .eq('target_role', 'customer')
            .order('created_at', { ascending: false })
            .limit(30),
        ]);
        if (r1.error || r2.error) throw new Error('x');

        setRoutes((r1.data as RouteRow[]) || []);
        setDrivers(((r3.data as DriverRow[]) || []).filter((d) => getDriverStatus(d) === 'approved'));
        setStores(((r4.data as StoreRow[]) || []).filter((s) => getDriverStatus(s) === 'approved'));
        setMenus((r5.data as MenuItemRow[]) || []);
        setJastipOrders((r6.data as JastipOrderRow[]) || []);
        const alertsForMe = ((r7.data as AiAlertRow[]) || []).filter(
          (a) => !a.target_id || a.target_id === guestId,
        );
        setCustomerAlerts(alertsForMe);

        type JoinedOrder = OrderRow & {
          drivers?: { name: string; plate: string; phone?: string; is_online?: boolean } | null;
        };
        const rows = (((r2.data as unknown as JoinedOrder[]) || [])).map((row) => ({
          ...row,
          driver_name: row.drivers?.name ?? row.driver_name ?? null,
          driver_plate: row.drivers?.plate ?? row.driver_plate ?? null,
          driver_phone: row.drivers?.phone ?? row.driver_phone ?? null,
          driver_online: row.drivers?.is_online ?? row.driver_online ?? null,
        }));
        setOrders(rows);
        const currentActive = rows.find((o) => !['Sampai', 'Dibatalkan'].includes(o.status));
        if (currentActive) loadMessages(currentActive.id);
        setError('');
      } catch {
        setError('Koneksi bermasalah, coba lagi');
      }
    },
    [loadMessages],
  );

  useEffect(() => {
    const g = getOrCreateGuest();
    setUser(g);
    loadAll(g.id);
  }, [loadAll]);

  const activeOrder = useMemo(
    () => orders.find((o) => !['Sampai', 'Dibatalkan'].includes(o.status)) || null,
    [orders],
  );
  const pastOrders = useMemo(
    () => orders.filter((o) => ['Sampai', 'Dibatalkan'].includes(o.status)),
    [orders],
  );
  const activeJastip = useMemo(
    () =>
      jastipOrders.find(
        (j) => !['Selesai', 'Ditolak Toko', 'Dibatalkan'].includes(j.status),
      ) || null,
    [jastipOrders],
  );

  useEffect(() => {
    const ch = supabase
      .channel('customer-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadAll(user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => loadAll(user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, () => loadAll(user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, () => loadAll(user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => loadAll(user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jastip_orders' }, () => loadAll(user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_alerts' }, () => loadAll(user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        const targetId = chatTarget?.orderId ?? activeOrder?.id ?? activeJastip?.id;
        if (targetId) loadMessages(targetId);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user.id, loadAll, loadMessages, chatTarget?.orderId, activeOrder?.id, activeJastip?.id]);

  useEffect(() => {
    const syncRead = () => setReadTick((t) => t + 1);
    window.addEventListener('ti_chat_read_changed', syncRead);
    window.addEventListener('storage', syncRead);
    return () => {
      window.removeEventListener('ti_chat_read_changed', syncRead);
      window.removeEventListener('storage', syncRead);
    };
  }, []);

  // Bunyi "Ting!" saat ada peringatan atau status berubah
  const unreadCount = useMemo(() => {
    void readTick;
    const refId = activeOrder?.id || activeJastip?.id;
    if (!refId) return 0;
    const myRead = getMyReadAt(refId, 'Customer');
    const myReadMs = myRead ? new Date(myRead).getTime() : 0;
    return messages.filter(
      (m) => m.order_id === refId && m.sender !== 'Customer' && new Date(m.created_at).getTime() > myReadMs,
    ).length;
  }, [activeOrder?.id, activeJastip?.id, messages, readTick]);

  const notifTotal =
    unreadCount +
    customerAlerts.filter((a) => !a.is_read).length +
    (activeOrder ? 1 : 0) +
    (activeJastip ? 1 : 0);

  useEffect(() => {
    if (prevNotifRef.current >= 0 && notifTotal > prevNotifRef.current) {
      playTingSound();
    }
    prevNotifRef.current = notifTotal;
  }, [notifTotal]);

  // Banner iklan dari Toko yang di-ACC Owner
  const activeAds = useMemo(
    () => stores.filter((s) => s.ad_active && s.ad_status === 'approved'),
    [stores],
  );

  useEffect(() => {
    if (activeAds.length <= 1) return;
    const t = setInterval(() => {
      setAdSlideIdx((idx) => (idx + 1) % activeAds.length);
    }, 5000);
    return () => clearInterval(t);
  }, [activeAds.length]);

  // A. Driver Terdekat (filter Semua / Motor / Mobil)
  const filteredDrivers = useMemo(() => {
    return drivers
      .filter((d) => (driverFilter === 'Semua' ? true : (d.vehicle_type || 'Mobil') === driverFilter))
      .map((d, idx) => ({
        ...d,
        vehicle: d.vehicle_type === 'Motor' ? 'Motor' : 'Mobil',
        distance: `${(1.1 + idx * 0.4).toFixed(1)} km`,
        startPrice: d.vehicle_type === 'Motor' ? 15000 : 20000,
        photo:
          d.photo_url ||
          (d.vehicle_type === 'Motor' ? DEFAULT_DRIVER_MOTOR_IMG : DEFAULT_DRIVER_CAR_IMG),
      }));
  }, [drivers, driverFilter]);

  // C. Menu Order Makanan (hanya dari Toko yang disetujui & stok > 0)
  const approvedStoreIds = useMemo(() => new Set(stores.map((s) => s.id)), [stores]);
  const visibleMenus = useMemo(() => {
    return menus.filter((m) => {
      if (!approvedStoreIds.has(m.store_id) || m.stock <= 0) return false;
      if (storeFilterId && m.store_id !== storeFilterId) return false;
      if (foodFilter !== 'Semua' && m.category !== foodFilter) return false;
      return true;
    });
  }, [menus, approvedStoreIds, storeFilterId, foodFilter]);

  const aiRecommendation = useMemo(
    () =>
      getAiFoodRecommendation(
        menus.filter((m) => approvedStoreIds.has(m.store_id)),
        jastipOrders,
        foodFilter !== 'Semua' ? foodFilter : 'Seblak',
      ),
    [menus, approvedStoreIds, jastipOrders, foodFilter],
  );

  const toggleFavorite = (id: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(FAV_ROUTES_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  // Keranjang helpers
  const addToCart = (item: MenuItemRow) => {
    setCart((prev) => {
      if (prev.length > 0 && prev[0].item.store_id !== item.store_id) {
        setToast(`Keranjang diganti ke toko ${item.store_name}`);
        return [{ item, qty: 1 }];
      }
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.item.id === item.id ? { ...c, qty: Math.min(item.stock, c.qty + 1) } : c,
        );
      }
      return [...prev, { item, qty: 1 }];
    });
    setToast(`${item.name} masuk keranjang`);
  };

  const updateCartQty = (menuId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.item.id === menuId ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0),
    );
  };

  const cartStore = useMemo(() => {
    if (cart.length === 0) return null;
    return stores.find((s) => s.id === cart[0].item.store_id) || null;
  }, [cart, stores]);

  const cartFoodSubtotal = useMemo(
    () => cart.reduce((sum, c) => sum + c.item.price * c.qty, 0),
    [cart],
  );
  const cartQtyTotal = useMemo(() => cart.reduce((sum, c) => sum + c.qty, 0), [cart]);

  // AI Ongkir Otomatis live
  const aiOngkir = useMemo(
    () =>
      estimateAiOngkir(
        jAddress,
        cartStore?.address || 'Haurgeulis',
        appSettings.finance.aiRatePerKm,
      ),
    [jAddress, cartStore?.address, appSettings.finance.aiRatePerKm],
  );

  const placeFoodOrder = async () => {
    if (cart.length === 0 || !cartStore) return;
    const cleanName = jName.trim() || 'Customer';
    const cleanPhone = jPhone.trim() || '-';
    if (jAddress.trim().length < 4) return setToast('Isi alamat antar terlebih dahulu');

    const abuseCheck = await recordCustomerOrderCreated(user.id, cleanName);
    if (!abuseCheck.allowed) {
      setError(abuseCheck.reason || 'Akses sementara diblokir AI Security');
      setCartOpen(false);
      return;
    }

    const updatedGuest: UserRow = {
      ...user,
      name: cleanName,
      whatsapp: cleanPhone === '-' ? '' : cleanPhone,
      city: pickupArea,
    };
    saveGuestToStorage(updatedGuest);
    setUser(updatedGuest);

    const itemsPayload: JastipOrderItem[] = cart.map((c) => ({
      menu_id: c.item.id,
      name: c.item.name,
      price: c.item.price,
      qty: c.qty,
      category: c.item.category,
    }));

    const accounting = calculateFoodAccounting({
      foodSubtotal: cartFoodSubtotal,
      deliveryFee: aiOngkir.deliveryFee,
      settings: appSettings,
    });
    const totalPrice = cartFoodSubtotal + aiOngkir.deliveryFee;

    try {
      const { data, error: e } = await supabase
        .from('jastip_orders')
        .insert({
          user_id: updatedGuest.id,
          store_id: cartStore.id,
          store_name: cartStore.name,
          driver_id: null,
          driver_name: null,
          driver_plate: null,
          driver_phone: null,
          customer_name: cleanName,
          customer_phone: cleanPhone,
          delivery_address: jAddress.trim(),
          items: itemsPayload,
          food_subtotal: cartFoodSubtotal,
          owner_commission: accounting.ownerCommission,
          store_net: accounting.storeNet,
          commission_bearer: accounting.commissionBearer,
          commission_settled: false,
          driver_paid_store: false,
          driver_paid_store_method: null,
          driver_paid_store_proof: null,
          store_confirmed_driver_paid: false,
          customer_paid_driver: false,
          distance_km: aiOngkir.distanceKm,
          eta_minutes: aiOngkir.etaMinutes,
          delivery_fee: aiOngkir.deliveryFee,
          total_price: totalPrice,
          payment_method: foodPayMethod,
          payment_splits: [],
          transfer_proofs: [],
          verification: createInitialVerification('food'),
          status: 'Menunggu Driver',
        })
        .select()
        .single();
      if (e || !data) throw new Error('x');

      // Kurangi stok menu
      for (const c of cart) {
        await supabase
          .from('menu_items')
          .update({ stock: Math.max(0, c.item.stock - c.qty) })
          .eq('id', c.item.id);
      }

      const created = data as JastipOrderRow;
      await supabase.from('messages').insert({
        order_id: created.id,
        sender: 'Customer',
        body: `Halo, saya ${cleanName}. Saya pesan Order Makanan ke ${jAddress.trim()} (${foodPayMethod}: ${formatRupiah(totalPrice)}).`,
      });

      await pushAiAlert({
        targetRole: 'driver',
        title: `Orderan Baru! ${cartStore.name} ${formatRupiah(cartFoodSubtotal)}, Talangin dulu ya!`,
        message: `Pesanan ${cleanName} → ${jAddress.trim()}. Talangin ${formatRupiah(cartFoodSubtotal)} ke toko, ongkir Anda ${formatRupiah(aiOngkir.deliveryFee)} (${foodPayMethod}).`,
        category: 'payment',
      });
      await pushAiAlert({
        targetRole: 'store',
        targetId: cartStore.id,
        title: 'Orderan Makanan Baru',
        message: `${cleanName} pesan ${itemsPayload.map((i) => `${i.qty}x ${i.name}`).join(', ')}. Menunggu Driver datang menalangi ${formatRupiah(cartFoodSubtotal)}.`,
        category: 'payment',
      });

      setCart([]);
      setCartOpen(false);
      setNavTab('pesanan');
      setToast('Pesanan dibuat! Tinggal tunggu Driver mengambil & mengantar.');
      await loadAll(updatedGuest.id);
    } catch {
      setError('Gagal mengirim pesanan Order Makanan, coba lagi');
    }
  };

  // Travel booking helpers
  const openBookingFor = (targetRouteId?: string, preferredCarType?: CarType) => {
    const chosenId = targetRouteId || routeId || routes[0]?.id || '';
    if (chosenId) setRouteId(chosenId);

    if (preferredCarType) {
      setCarType(preferredCarType);
    } else if (chosenId) {
      const r = routes.find((item) => item.id === chosenId);
      if (r) setCarType(resolveRouteDisplay(r, routeMetaMap).defaultCarType);
    }
    setBookingOpen(true);
  };

  const selectedRoute = routes.find((r) => r.id === routeId) || null;
  const basePrice = priceForRoute(selectedRoute, carType);
  const computeFinalPrice = useCallback(
    (rawPrice: number) => {
      let p = rawPrice;
      if (carpool) p = Math.round((p * 0.6) / 500) * 500;
      if (promoApplied) p = Math.round((p * 0.8) / 500) * 500;
      return p;
    },
    [carpool, promoApplied],
  );
  const finalPrice = computeFinalPrice(basePrice);

  const bookTravel = async () => {
    if (!selectedRoute) return setError('Pilih rute terlebih dahulu');
    setError('');

    const displayName = guestName.trim() || 'Customer';
    const abuseCheck = await recordCustomerOrderCreated(user.id, displayName);
    if (!abuseCheck.allowed) {
      setError(abuseCheck.reason || 'Akses sementara diblokir AI Security');
      setBookingOpen(false);
      return;
    }

    const finalPickup = pickup.trim() || pickupArea.split(',')[0] || selectedRoute.origin;
    const updatedGuest: UserRow = { ...user, name: displayName, city: pickupArea };
    saveGuestToStorage(updatedGuest);
    setUser(updatedGuest);

    const accounting = calculateTravelAccounting({
      totalPrice: finalPrice,
      settings: appSettings,
    });

    try {
      const { data, error: e } = await supabase
        .from('orders')
        .insert({
          user_id: updatedGuest.id,
          driver_id: null,
          driver_name: null,
          driver_plate: null,
          driver_phone: null,
          route_id: selectedRoute.id,
          customer_name: displayName,
          customer_phone: updatedGuest.whatsapp || '-',
          pickup: finalPickup,
          destination: selectedRoute.destination,
          car_type: carType,
          price: finalPrice,
          owner_commission: accounting.ownerCommission,
          driver_net: accounting.driverNet,
          commission_settled: false,
          customer_paid_driver: false,
          payment_method: travelPayMethod,
          payment_splits: [],
          transfer_proofs: [],
          verification: createInitialVerification('travel'),
          is_carpool: carpool,
          status: 'Mencari Driver',
        })
        .select()
        .single();
      if (e || !data) throw new Error('x');

      const createdOrder = data as OrderRow;
      const firstName = displayName.split(/\s+/)[0] || 'Customer';
      await supabase.from('messages').insert({
        order_id: createdOrder.id,
        sender: 'Customer',
        body: `Halo, saya ${firstName}. Saya pesan rute ${selectedRoute.origin} - ${selectedRoute.destination} (${travelPayMethod}: ${formatRupiah(finalPrice)}).`,
      });

      await pushAiAlert({
        targetRole: 'driver',
        title: `Order Travel Baru! ${finalPickup} → ${selectedRoute.destination}`,
        message: `Penumpang ${displayName} menunggu dijemput (${carType} · ${formatRupiah(finalPrice)} · ${travelPayMethod}).`,
        category: 'payment',
      });

      setBookingOpen(false);
      setNavTab('pesanan');
      setToast('Order Travel dibuat! Driver segera menuju lokasi Anda.');
      setPickup('');
      await loadAll(updatedGuest.id);
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  };

  const cancelOrder = async (o: OrderRow) => {
    await supabase.from('orders').update({ status: 'Dibatalkan' }).eq('id', o.id);
    setToast('Pesanan dibatalkan');
    loadAll(user.id);
  };

  useEffect(() => {
    if (chatTarget) loadMessages(chatTarget.orderId);
  }, [chatTarget, loadMessages]);

  const sendChatMessage = async (body: string) => {
    if (!chatTarget || !body.trim()) return;
    await supabase.from('messages').insert({
      order_id: chatTarget.orderId,
      sender: 'Customer',
      body: body.trim(),
    });
    await loadMessages(chatTarget.orderId);
  };

  const submitRating = async () => {
    if (!rateOrder) return;
    await supabase.from('orders').update({ rating: stars }).eq('id', rateOrder.id);
    if (rateOrder.driver_id) {
      const { data: drv } = await supabase.from('drivers').select('rating').eq('id', rateOrder.driver_id).maybeSingle();
      if (drv) {
        const newRating = (Number(drv.rating) * 4 + stars) / 5;
        await supabase.from('drivers').update({ rating: Number(newRating.toFixed(2)) }).eq('id', rateOrder.driver_id);
      }
    }
    setRateOrder(null);
    setToast('Terima kasih atas penilaiannya!');
    loadAll(user.id);
  };

  const askAi = () => {
    const q = aiInput.trim();
    if (!q) return;
    const reply = answerCustomerAiQuestion(q, routes, menus, appSettings.finance.aiRatePerKm);
    setAiMessages((prev) => [...prev, { sender: 'user', text: q }, { sender: 'ai', text: reply }]);
    setAiInput('');
  };

  const applyPromoCode = (codeInput?: string) => {
    const clean = (codeInput ?? promoCode).trim().toUpperCase();
    if (clean === 'WONG20' || clean === 'HAURGEULIS' || clean === 'HEMAT20') {
      setPromoApplied(true);
      setPromoCode(clean);
      setToast(`Kode ${clean} aktif! Diskon 20% diterapkan.`);
    } else {
      setToast('Kode promo tidak valid. Coba kode: WONG20');
    }
  };

  // Riwayat Pembayaran Sederhana Customer (Cash / Transfer ke Driver)
  const customerFinancialHistory = useMemo(() => {
    const foodItems = jastipOrders.map((j) => {
      const stLabel =
        j.status === 'Dibatalkan' || j.status === 'Ditolak Toko'
          ? j.status
          : j.customer_paid_driver || j.status === 'Selesai'
            ? 'Lunas ke Driver'
            : 'Bayar Pas Datang';
      return {
        id: j.id,
        title: `Order Makanan: ${j.store_name}`,
        amount: j.total_price,
        method: j.payment_method || 'Cash ke Driver',
        status: stLabel,
        createdAt: j.created_at,
      };
    });

    const travelItems = orders.map((o) => {
      const stLabel =
        o.status === 'Dibatalkan'
          ? 'Dibatalkan'
          : o.customer_paid_driver || o.status === 'Sampai'
            ? 'Lunas ke Driver'
            : 'Bayar Pas Datang';
      return {
        id: o.id,
        title: `Travel: ${o.pickup} → ${o.destination}`,
        amount: o.price,
        method: o.payment_method || 'Cash ke Driver',
        status: stLabel,
        createdAt: o.created_at,
      };
    });

    return [...foodItems, ...travelItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [jastipOrders, orders]);

  const currentAd = activeAds[adSlideIdx % Math.max(1, activeAds.length)] || null;

  return (
    <div className="min-h-screen bg-white text-slate-900 pb-28">
      {/* Header Atas */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setAreaModalOpen(true)}
            className="flex items-center gap-2 text-left min-w-0 py-1.5 rounded-xl hover:bg-slate-50 transition"
          >
            <span className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <MapPin size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] text-slate-500 leading-none">Jemput di</span>
              <span className="flex items-center gap-1 text-sm font-bold text-slate-950 truncate mt-0.5">
                <span className="truncate">{pickupArea}</span>
                <ChevronDown size={15} className="text-slate-500 shrink-0" />
              </span>
            </span>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setAiModalOpen(true)}
              className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1 transition"
            >
              <Bot size={14} /> Tanya AI
            </button>
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-800 transition"
              aria-label="Notifikasi"
            >
              <Bell size={19} />
              {notifTotal > 0 && (
                <span className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums">
                  {notifTotal}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-4 space-y-6">
        <ErrorBox message={error} onRetry={() => loadAll(user.id)} />

        {navTab === 'beranda' && (
          <>
            {/* BANNER IKLAN SLIDEABLE DARI TOKO YANG SUDAH DI-ACC OWNER */}
            {currentAd && (
              <section className="relative rounded-3xl overflow-hidden shadow-sm border border-slate-200/70 bg-slate-900 text-white">
                <img
                  src={currentAd.ad_banner_url || currentAd.photo_url || DEFAULT_STORE_IMG}
                  alt={currentAd.ad_title || currentAd.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-40 sm:h-48 object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 flex flex-col justify-end">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                        Iklan Toko · {currentAd.name}
                      </p>
                      <h2 className="text-base sm:text-lg font-extrabold leading-tight truncate">
                        {currentAd.ad_title || currentAd.name}
                      </h2>
                      <p className="text-xs text-slate-200 truncate mt-0.5">
                        {currentAd.ad_subtitle || currentAd.address}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStoreFilterId(currentAd.id);
                        setNavTab('makanan');
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-full shrink-0"
                    >
                      Lihat Menu
                    </button>
                  </div>

                  {activeAds.length > 1 && (
                    <div className="flex items-center justify-between mt-2.5">
                      <div className="flex gap-1.5">
                        {activeAds.map((ad, idx) => (
                          <button
                            key={ad.id}
                            type="button"
                            onClick={() => setAdSlideIdx(idx)}
                            className={`h-1.5 rounded-full transition-all ${
                              idx === adSlideIdx % activeAds.length ? 'w-5 bg-white' : 'w-1.5 bg-white/40'
                            }`}
                            aria-label={`Slide iklan ${idx + 1}`}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setAdSlideIdx((i) => (i - 1 + activeAds.length) % activeAds.length)}
                          className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
                          aria-label="Sebelumnya"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdSlideIdx((i) => (i + 1) % activeAds.length)}
                          className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
                          aria-label="Berikutnya"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* HERO BANNER */}
            <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 sm:p-6">
              <div className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-7 space-y-2.5">
                  <p className="text-xs font-bold text-blue-600 tracking-wide">{hero.topLabel}</p>
                  <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-950 leading-[1.12]">
                    {hero.titleLine1}{' '}
                    <span className="block text-blue-600">{hero.titleLine2}</span>{' '}
                    <span className="block">{hero.titleLine3}</span>
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-xs">
                    {hero.description}
                  </p>
                  <div className="pt-1 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openBookingFor()}
                      className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-full shadow-md shadow-blue-600/20 transition active:scale-95"
                    >
                      <span>{hero.buttonText}</span>
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>

                <div className="col-span-5 flex justify-end">
                  <div className="w-full max-w-[160px] aspect-[3/4] rounded-2xl overflow-hidden bg-blue-50 border border-slate-100">
                    <img
                      src={hero.imageUrl || DEFAULT_HERO_IMAGE}
                      alt="Driver Travel Siaga"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        if (e.currentTarget.src !== DEFAULT_HERO_IMAGE) {
                          e.currentTarget.src = DEFAULT_HERO_IMAGE;
                        }
                      }}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAiModalOpen(true)}
                  className="bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 transition"
                >
                  <Bot size={15} className="text-blue-600" /> Tanya AI
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.setItem('ti_driver_open_register', '1');
                    } catch {
                      // Ignore storage errors
                    }
                    if (onOpenRole) onOpenRole('driver');
                  }}
                  className="bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl py-2.5 px-3 text-xs font-bold text-sky-700 flex items-center justify-center gap-1.5 transition"
                >
                  <UserCheck size={15} /> Daftar Jadi Driver
                </button>
                <button
                  type="button"
                  onClick={() => onOpenRole && onOpenRole('store')}
                  className="bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl py-2.5 px-3 text-xs font-bold text-blue-700 flex items-center justify-center gap-1.5 transition"
                >
                  <Megaphone size={15} /> Pasang Iklan / Buka Toko
                </button>
              </div>
            </section>

            {/* BAGIAN A: DRIVER TERDEKAT */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-extrabold text-slate-950">Driver Terdekat</h2>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full">
                  {(['Semua', 'Motor', 'Mobil'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setDriverFilter(f)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                        driverFilter === f
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {filteredDrivers.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center text-xs text-slate-500">
                  Belum ada driver {driverFilter} aktif.
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  {filteredDrivers.map((drv) => (
                    <div
                      key={drv.id}
                      className="w-52 shrink-0 bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm flex flex-col"
                    >
                      <div className="relative h-36 bg-slate-100">
                        <img
                          src={drv.photo}
                          alt={drv.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover object-top"
                        />
                        <span className="absolute top-2 left-2 bg-white/95 text-slate-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-sm">
                          {drv.vehicle}
                        </span>
                      </div>
                      <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-bold text-sm text-slate-950 truncate">{drv.name}</p>
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-0.5 shrink-0 tabular-nums">
                              <Star size={12} className="text-amber-500 fill-amber-500" />
                              {Number(drv.rating).toFixed(1)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                            {drv.distance} · Mulai {formatRupiah(drv.startPrice)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openBookingFor(undefined, drv.vehicle === 'Motor' ? 'Ekonomi' : 'Nyaman')}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded-xl transition active:scale-95"
                        >
                          Pesan
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* BAGIAN B: RUTE POPULER */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-slate-950">Rute Populer</h2>
                <button
                  type="button"
                  onClick={() => openBookingFor()}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                >
                  <span>Lihat Semua</span>
                  <ChevronRight size={14} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {routes.map((r) => {
                  const disp = resolveRouteDisplay(r, routeMetaMap);
                  const price = computeFinalPrice(priceForRoute(r, disp.defaultCarType));
                  const isFav = favoriteIds.includes(r.id);
                  return (
                    <div
                      key={r.id}
                      className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm flex items-center gap-3 p-2.5"
                    >
                      <div className="relative w-24 h-20 rounded-xl overflow-hidden bg-blue-50 shrink-0">
                        <img
                          src={disp.imageUrl}
                          alt={`${r.origin} - ${r.destination}`}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const fb = getDefaultRoutePhoto(r);
                            if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                          }}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => toggleFavorite(r.id)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center text-rose-500"
                          aria-label="Favoritkan rute"
                        >
                          <Heart size={12} className={isFav ? 'fill-rose-500' : ''} />
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-slate-950 truncate">
                          {r.origin} - {r.destination}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {disp.etaText} • {disp.defaultCarType}
                        </p>
                        <p className="font-extrabold text-sm text-blue-600 mt-1 tabular-nums">
                          {formatRupiah(price)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => openBookingFor(r.id, disp.defaultCarType)}
                        className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-sm shadow-blue-600/25 transition active:scale-95 shrink-0"
                        aria-label={`Pesan ${r.origin} - ${r.destination}`}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* BAGIAN C: ORDER MAKANAN GAYA GOFOOD */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-slate-950">Order Makanan</h2>
                <button
                  type="button"
                  onClick={() => setNavTab('makanan')}
                  className="text-xs font-bold text-blue-600 flex items-center gap-0.5"
                >
                  <span>Semua Menu</span>
                  <ChevronRight size={14} />
                </button>
              </div>

              {aiRecommendation && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <Sparkles size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-blue-700">{aiRecommendation.reason}</p>
                      <p className="text-xs font-extrabold text-slate-900 truncate">
                        {aiRecommendation.item.name} · {formatRupiah(aiRecommendation.item.price)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addToCart(aiRecommendation.item)}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-full shrink-0"
                  >
                    + Pesan
                  </button>
                </div>
              )}

              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {(['Semua', ...FOOD_CATEGORIES] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFoodFilter(cat)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap shrink-0 transition ${
                      foodFilter === cat
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visibleMenus.map((m) => (
                  <div
                    key={m.id}
                    className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm flex flex-col"
                  >
                    <div className="relative h-40 bg-slate-100">
                      <img
                        src={m.photo_url || FOOD_DEFAULT_IMAGES[m.category]}
                        alt={m.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-2.5 left-2.5 bg-white/95 text-slate-900 text-[10px] font-bold px-2.5 py-1 rounded-full">
                        {m.category}
                      </span>
                      <span className="absolute top-2.5 right-2.5 bg-slate-950/75 text-white text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        <Star size={11} className="text-amber-400 fill-amber-400" />
                        {Number(m.rating).toFixed(1)}
                      </span>
                    </div>
                    <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-950">{m.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{m.store_name}</p>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <p className="font-extrabold text-base text-blue-600 tabular-nums">
                          {formatRupiah(m.price)}
                        </p>
                        <button
                          type="button"
                          onClick={() => addToCart(m)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-full transition active:scale-95"
                        >
                          Pesan
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {navTab === 'makanan' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-slate-950">Order Makanan</h2>
              {storeFilterId && (
                <button
                  type="button"
                  onClick={() => setStoreFilterId(null)}
                  className="text-xs font-bold text-blue-600 underline"
                >
                  Tampilkan Semua Toko
                </button>
              )}
            </div>

            {aiRecommendation && (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-blue-700">{aiRecommendation.reason}</p>
                  <p className="text-xs font-extrabold text-slate-900 truncate">
                    {aiRecommendation.item.name} · {formatRupiah(aiRecommendation.item.price)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addToCart(aiRecommendation.item)}
                  className="bg-blue-600 text-white text-xs font-bold px-3.5 py-2 rounded-full shrink-0"
                >
                  Pesan
                </button>
              </div>
            )}

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {(['Semua', ...FOOD_CATEGORIES] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFoodFilter(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap shrink-0 ${
                    foodFilter === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleMenus.map((m) => (
                <div key={m.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <img
                    src={m.photo_url || FOOD_DEFAULT_IMAGES[m.category]}
                    alt={m.name}
                    className="w-full h-40 object-cover bg-slate-100"
                  />
                  <div className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-sm text-slate-950 truncate">{m.name}</h3>
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-0.5 shrink-0">
                        <Star size={12} className="text-amber-500 fill-amber-500" />
                        {Number(m.rating).toFixed(1)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{m.store_name} · Stok {m.stock}</p>
                    <div className="flex items-center justify-between pt-1">
                      <p className="font-extrabold text-blue-600 tabular-nums">{formatRupiah(m.price)}</p>
                      <button
                        type="button"
                        onClick={() => addToCart(m)}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-full"
                      >
                        Pesan
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {navTab === 'pesanan' && (
          <section className="space-y-4">
            <h2 className="text-lg font-extrabold text-slate-950">Pesanan & Riwayat</h2>

            {activeJastip && (
              <ActiveFoodCard
                order={activeJastip}
                onChat={() =>
                  setChatTarget({
                    orderId: activeJastip.id,
                    peerName: activeJastip.driver_name || activeJastip.store_name,
                    peerSub: `Order Makanan ${activeJastip.store_name}`,
                    peerPhone: activeJastip.driver_phone,
                    peerOnline: true,
                    pickupLoc: activeJastip.delivery_address,
                  })
                }
              />
            )}

            {activeOrder && (
              <ActiveOrderCard
                order={activeOrder}
                unreadCount={unreadCount}
                onChat={() =>
                  setChatTarget({
                    orderId: activeOrder.id,
                    peerName: activeOrder.driver_name || 'Menunggu Driver',
                    peerSub: `${activeOrder.pickup} → ${activeOrder.destination}`,
                    peerPhone: activeOrder.driver_phone,
                    peerOnline: activeOrder.driver_online ?? Boolean(activeOrder.driver_id),
                    pickupLoc: activeOrder.pickup,
                  })
                }
                onCancel={() => cancelOrder(activeOrder)}
                onRate={() => setRateOrder(activeOrder)}
              />
            )}

            {!activeJastip && !activeOrder && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-3">
                <Clock size={32} className="mx-auto text-slate-400" />
                <p className="font-bold text-slate-800 text-sm">Belum ada pesanan aktif</p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => openBookingFor()}
                    className="bg-blue-600 text-white font-bold text-xs px-4 py-2.5 rounded-full"
                  >
                    Pesan Travel
                  </button>
                  <button
                    type="button"
                    onClick={() => setNavTab('makanan')}
                    className="bg-slate-900 text-white font-bold text-xs px-4 py-2.5 rounded-full"
                  >
                    Pesan Makanan
                  </button>
                </div>
              </div>
            )}

            {/* Riwayat Pembayaran Sederhana Customer (Pagination 10 per load) */}
            {customerFinancialHistory.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <Receipt size={15} className="text-blue-600" /> Riwayat Pesanan Saya ({customerFinancialHistory.length})
                </h3>
                <div className="space-y-2.5">
                  {customerFinancialHistory.slice(0, financeLimit).map((item) => (
                    <div key={item.id} className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 text-xs space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{item.title}</p>
                          <p className="text-[11px] text-slate-500">
                            {item.method} · {new Date(item.createdAt).toLocaleString('id-ID')}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-extrabold text-blue-600 tabular-nums">{formatRupiah(item.amount)}</p>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${
                              item.status === 'Lunas ke Driver'
                                ? 'bg-emerald-100 text-emerald-700'
                                : item.status === 'Dibatalkan' || item.status === 'Ditolak Toko'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {customerFinancialHistory.length > financeLimit && (
                    <button
                      type="button"
                      onClick={() => setFinanceLimit((l) => l + 10)}
                      className="w-full py-2.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl"
                    >
                      Muat 10 Lagi ({customerFinancialHistory.length - financeLimit} tersisa)
                    </button>
                  )}
                </div>
              </div>
            )}

            {pastOrders.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
                <h3 className="font-bold text-sm text-slate-900">Riwayat Perjalanan Travel</h3>
                {pastOrders.slice(0, 10).map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-xl px-3 py-2.5">
                    <div>
                      <p className="font-semibold text-slate-800">{o.pickup} - {o.destination}</p>
                      <p className="text-slate-500">{new Date(o.created_at).toLocaleDateString('id-ID')} · {o.status}</p>
                    </div>
                    <p className="font-bold text-blue-600 tabular-nums">{formatRupiah(o.price)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {navTab === 'promo' && (
          <section className="space-y-4">
            <h2 className="text-lg font-extrabold text-slate-950">Promo Diskon</h2>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <p className="font-bold text-sm text-slate-900">Kode Promo Tersedia</p>
              <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl p-3">
                <div>
                  <p className="font-extrabold text-blue-700 text-sm">WONG20</p>
                  <p className="text-xs text-slate-600">Diskon 20% semua rute travel</p>
                </div>
                <button
                  type="button"
                  onClick={() => applyPromoCode('WONG20')}
                  className="bg-blue-600 text-white text-xs font-bold px-3.5 py-2 rounded-full"
                >
                  {promoApplied ? 'Aktif' : 'Pakai'}
                </button>
              </div>
              <Field label="Kode Promo Lain" value={promoCode} onChange={setPromoCode} placeholder="Contoh: WONG20" />
              <button
                type="button"
                onClick={() => applyPromoCode()}
                className="w-full bg-blue-600 text-white font-bold text-sm py-3 rounded-xl"
              >
                Pakai Kode Promo
              </button>
            </div>
          </section>
        )}

        {navTab === 'profil' && (
          <section className="space-y-4">
            <h2 className="text-lg font-extrabold text-slate-950">Portal & Akun</h2>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
              <p className="text-xs font-bold text-slate-500">Masuk / Daftar Portal</p>
              {onOpenRole && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenRole('driver')}
                    className="bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-slate-900 flex items-center justify-center gap-2"
                  >
                    <UserCheck size={16} className="text-blue-600" /> Portal Driver
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenRole('store')}
                    className="bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl py-3 px-4 text-xs font-bold text-blue-800 flex items-center justify-center gap-2"
                  >
                    <Store size={16} /> Buka Toko / Iklan
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenRole('owner')}
                    className="bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-slate-900 flex items-center justify-center gap-2"
                  >
                    <ShieldCheck size={16} className="text-blue-600" /> Dashboard Owner
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setSosOpen(true)}
                className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-2"
              >
                <Siren size={16} /> Tombol SOS Darurat
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Floating Keranjang Order Makanan */}
      {cart.length > 0 && !cartOpen && !chatTarget && (
        <div className="fixed bottom-20 left-4 right-4 z-30 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl px-4 py-3.5 shadow-xl shadow-blue-900/25 flex items-center justify-between transition active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <ShoppingBag size={17} />
              </span>
              <div className="text-left">
                <p className="text-xs font-extrabold">{cartQtyTotal} Item · {cartStore?.name}</p>
                <p className="text-[11px] text-blue-100">Klik untuk hitung AI Ongkir & Pesan</p>
              </div>
            </div>
            <span className="font-extrabold text-sm tabular-nums">{formatRupiah(cartFoodSubtotal)}</span>
          </button>
        </div>
      )}

      {/* Floating Chat Driver saat ada orderan aktif dan keranjang kosong */}
      {cart.length === 0 && activeOrder && activeOrder.driver_id && !chatTarget && (
        <button
          type="button"
          onClick={() =>
            setChatTarget({
              orderId: activeOrder.id,
              peerName: activeOrder.driver_name || 'Driver',
              peerSub: `${activeOrder.pickup} → ${activeOrder.destination}`,
              peerPhone: activeOrder.driver_phone,
              peerOnline: activeOrder.driver_online ?? true,
              pickupLoc: activeOrder.pickup,
            })
          }
          className="fixed bottom-20 right-4 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 z-30 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-5 py-3 rounded-full shadow-xl flex items-center gap-2"
        >
          <MessageSquare size={18} />
          <span>Chat Driver</span>
        </button>
      )}

      {/* BOTTOM NAVBAR - 5 Menu */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200">
        <div className="max-w-4xl mx-auto grid grid-cols-5 h-16 items-center">
          {(
            [
              ['beranda', 'Beranda', HomeIcon],
              ['makanan', 'Makanan', Utensils],
              ['pesanan', 'Pesanan', Receipt],
              ['promo', 'Promo', Tag],
              ['profil', 'Profil', User],
            ] as const
          ).map(([key, label, Icon]) => {
            const active = navTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setNavTab(key)}
                className={`relative flex flex-col items-center justify-center h-full transition ${
                  active ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                <span className={`text-[10px] mt-1 tracking-tight ${active ? 'font-bold' : 'font-medium'}`}>
                  {label}
                </span>
                {key === 'pesanan' && (activeOrder || activeJastip) && (
                  <span className="absolute top-2 right-1/4 w-2 h-2 rounded-full bg-blue-600" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modal Checkout Order Makanan — Simpel Bayar ke Driver Pas Datang */}
      {cartOpen && (
        <Modal title="Keranjang Order Makanan" onClose={() => setCartOpen(false)}>
          <div className="space-y-3.5 max-h-[78vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              {cart.map((c) => (
                <div key={c.item.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl p-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{c.item.name}</p>
                    <p className="text-blue-600 font-bold tabular-nums">{formatRupiah(c.item.price)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => updateCartQty(c.item.id, -1)} className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center">
                      <Minus size={12} />
                    </button>
                    <span className="font-bold tabular-nums">{c.qty}</span>
                    <button type="button" onClick={() => updateCartQty(c.item.id, 1)} className="w-7 h-7 rounded-lg bg-white border flex items-center justify-center">
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Field label="Nama Pemesan (opsional)" value={jName} onChange={setJName} placeholder="Kosongkan otomatis jadi Customer" />
            <Field label="No. WhatsApp (opsional)" value={jPhone} onChange={setJPhone} placeholder="081234567890" />
            <Field label="Alamat Antar Lengkap" value={jAddress} onChange={setJAddress} placeholder="Contoh: Jl. Siliwangi Blok A, Haurgeulis" />

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 space-y-1 text-xs">
              <p className="font-bold text-blue-800 flex items-center gap-1.5">
                <Bot size={15} /> Ongkir Otomatis dari AI
              </p>
              <p className="text-slate-700 tabular-nums">
                Jarak: <b>{aiOngkir.distanceKm} km</b> · Estimasi: <b>{aiOngkir.etaMinutes} mnt</b> · Ongkir: <b className="text-blue-700">{formatRupiah(aiOngkir.deliveryFee)}</b>
              </p>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-bold text-slate-700">Pilih Cara Bayar</span>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setFoodPayMethod('Cash ke Driver')}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left text-xs font-bold transition ${
                    foodPayMethod === 'Cash ke Driver'
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <Banknote size={16} className="text-emerald-600 shrink-0" />
                  <span>💵 Bayar Cash ke Driver Pas Datang</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFoodPayMethod('Transfer ke Driver')}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left text-xs font-bold transition ${
                    foodPayMethod === 'Transfer ke Driver'
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <Smartphone size={16} className="text-blue-600 shrink-0" />
                  <span>📱 Transfer ke Driver Pas Datang</span>
                </button>
              </div>
            </div>

            <div className="bg-slate-900 text-white rounded-2xl p-3.5 space-y-1">
              <p className="text-[11px] text-slate-300">Total yang harus kamu bayar ke Driver:</p>
              <p className="font-extrabold text-lg tabular-nums">
                {formatRupiah(cartFoodSubtotal + aiOngkir.deliveryFee)}
              </p>
              <p className="text-[11px] text-slate-300 tabular-nums">
                (Makanan {formatRupiah(cartFoodSubtotal)} + Ongkir {formatRupiah(aiOngkir.deliveryFee)})
              </p>
            </div>

            <button
              type="button"
              onClick={placeFoodOrder}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-3 rounded-xl transition active:scale-95"
            >
              Pesan Sekarang
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Form Pemesanan Travel — Simpel Bayar ke Driver Pas Datang */}
      {bookingOpen && (
        <Modal title="Pesan Travel Sekarang" onClose={() => setBookingOpen(false)}>
          <div className="space-y-3.5 max-h-[78vh] overflow-y-auto pr-1">
            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1.5">Pilih Rute</span>
              <div className="grid grid-cols-2 gap-2">
                {routes.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setRouteId(r.id);
                      setCarType(resolveRouteDisplay(r, routeMetaMap).defaultCarType);
                    }}
                    className={`text-left px-3 py-2 rounded-xl border text-xs font-semibold transition ${
                      routeId === r.id ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="block truncate">{r.origin} - {r.destination}</span>
                    <span className="block text-[11px] font-bold text-blue-600 tabular-nums">
                      {formatRupiah(computeFinalPrice(priceForRoute(r, carType)))}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1.5">Jenis Mobil</span>
              <div className="grid grid-cols-3 gap-2">
                {CAR_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCarType(t)}
                    className={`py-2 rounded-xl border text-xs font-bold transition ${
                      carType === t ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Nama (opsional)" value={guestName} onChange={setGuestName} placeholder="Kosongkan otomatis jadi Customer" />
            <Field label="Titik Jemput (opsional)" value={pickup} onChange={setPickup} placeholder={`Contoh: Jl. Raya ${pickupArea.split(',')[0]}`} />

            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={carpool} onChange={(e) => setCarpool(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              <Users size={14} className="text-blue-600" /> Carpool / Patungan (hemat 40%)
            </label>

            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-700">Pilih Cara Bayar</span>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => setTravelPayMethod('Cash ke Driver')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-xs font-bold transition ${
                    travelPayMethod === 'Cash ke Driver'
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <Banknote size={15} className="text-emerald-600 shrink-0" />
                  <span>💵 Bayar Cash ke Driver Pas Datang</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTravelPayMethod('Transfer ke Driver')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-xs font-bold transition ${
                    travelPayMethod === 'Transfer ke Driver'
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <Smartphone size={15} className="text-blue-600 shrink-0" />
                  <span>📱 Transfer ke Driver Pas Datang</span>
                </button>
              </div>
            </div>

            <div className="bg-slate-900 text-white rounded-2xl px-4 py-3">
              <p className="text-[11px] text-slate-300">Total yang harus kamu bayar ke Driver:</p>
              <p className="text-lg font-extrabold tabular-nums">{formatRupiah(finalPrice)}</p>
            </div>

            <button
              type="button"
              onClick={bookTravel}
              disabled={!routeId}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-3 rounded-xl"
            >
              Pesan Sekarang
            </button>
          </div>
        </Modal>
      )}

      {/* Modal [Tanya AI] */}
      {aiModalOpen && (
        <Modal title="Asisten AI WONG HAURGEULIS" onClose={() => setAiModalOpen(false)}>
          <div className="space-y-3">
            <div className="h-64 overflow-y-auto space-y-2.5 bg-slate-50 rounded-2xl p-3">
              {aiMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs whitespace-pre-line ${
                    msg.sender === 'user'
                      ? 'ml-auto bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  }`}
                >
                  {msg.text}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['Rekomendasi seblak', 'Harga travel Bandung', 'Berapa ongkir ke Patrol?'].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    const reply = answerCustomerAiQuestion(q, routes, menus, appSettings.finance.aiRatePerKm);
                    setAiMessages((prev) => [...prev, { sender: 'user', text: q }, { sender: 'ai', text: reply }]);
                  }}
                  className="text-[11px] bg-blue-50 text-blue-700 font-semibold px-2.5 py-1 rounded-full"
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && askAi()}
                placeholder="Tanya rute, makanan, atau ongkir..."
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <button
                type="button"
                onClick={askAi}
                className="bg-blue-600 text-white px-3.5 rounded-xl flex items-center justify-center"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Pilih Area Jemput */}
      {areaModalOpen && (
        <Modal title="Pilih Lokasi Jemput" onClose={() => setAreaModalOpen(false)}>
          <div className="space-y-2">
            {PICKUP_AREAS.map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => {
                  setPickupArea(area);
                  setAreaModalOpen(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-semibold flex items-center justify-between ${
                  pickupArea === area ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700'
                }`}
              >
                <span>{area}</span>
                {pickupArea === area && <CheckCircle2 size={16} className="text-blue-600" />}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Modal Notifikasi Customer (Pagination 10 per load) */}
      {notifOpen && (
        <Modal title="Notifikasi" onClose={() => setNotifOpen(false)}>
          <div className="space-y-2.5 max-h-[70vh] overflow-y-auto text-sm">
            {activeJastip && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="font-bold text-blue-900">Order Makanan: {activeJastip.status}</p>
                <p className="text-xs text-slate-600">{activeJastip.store_name} → {activeJastip.delivery_address}</p>
              </div>
            )}
            {activeOrder && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="font-bold text-blue-900">Travel: {activeOrder.status}</p>
                <p className="text-xs text-slate-600">{activeOrder.pickup} → {activeOrder.destination}</p>
              </div>
            )}
            {customerAlerts.slice(0, notifLimit).map((a) => (
              <div key={a.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">
                <p className="font-bold text-amber-950">{a.title}</p>
                <p className="text-amber-800 mt-0.5">{a.message}</p>
              </div>
            ))}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="font-bold text-slate-800">Promo Hari Ini · Kode WONG20</p>
              <p className="text-xs text-slate-500">Diskon 20% semua rute travel.</p>
            </div>
            {customerAlerts.length > notifLimit && (
              <button
                type="button"
                onClick={() => setNotifLimit((l) => l + 10)}
                className="w-full py-2 text-xs font-bold text-blue-700 bg-blue-50 rounded-xl"
              >
                Muat 10 Notifikasi Lagi
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Chat Fullscreen */}
      {chatTarget && (
        <ChatView
          fullScreen
          order={{
            id: chatTarget.orderId,
            user_id: user.id,
            driver_id: null,
            route_id: null,
            customer_name: user.name,
            customer_phone: user.whatsapp || '-',
            pickup: chatTarget.pickupLoc,
            destination: chatTarget.peerSub,
            car_type: 'Travel / Order Makanan',
            price: 0,
            payment_method: 'Transfer Terstruktur',
            status: 'Aktif',
            is_carpool: false,
            rating: null,
            created_at: new Date().toISOString(),
          }}
          role="Customer"
          messages={messages}
          onSend={sendChatMessage}
          onBack={() => setChatTarget(null)}
          peerName={chatTarget.peerName}
          peerSub={chatTarget.peerSub}
          peerOnline={chatTarget.peerOnline ?? true}
          peerPhone={chatTarget.peerPhone}
          showPhone={true}
          onMissingPhone={() => setToast('Nomor telepon belum tersedia')}
          fallbackLocation={`${chatTarget.pickupLoc}, ${user.city}`}
        />
      )}

      {rateOrder && (
        <Modal title="Beri Rating Driver" onClose={() => setRateOrder(null)}>
          <div className="flex flex-col items-center gap-4 py-4">
            <StarRating value={stars} onChange={setStars} />
            <Btn onClick={submitRating} className="w-full">Kirim Rating</Btn>
          </div>
        </Modal>
      )}

      {sosOpen && (
        <Modal title="Tombol SOS - Darurat" onClose={() => setSosOpen(false)}>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">Lokasi Anda: {pickupArea}.</p>
            <a href="tel:110" className="block bg-red-600 text-white text-center font-bold py-3 rounded-xl">Polisi - 110</a>
            <a href="tel:119" className="block bg-rose-500 text-white text-center font-bold py-3 rounded-xl">Ambulans - 119</a>
            <a href="tel:112" className="block bg-slate-800 text-white text-center font-bold py-3 rounded-xl">Darurat Umum - 112</a>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

function ActiveFoodCard({
  order,
  onChat,
}: {
  order: JastipOrderRow;
  onChat: () => void;
}) {
  const steps = ['Menunggu Driver', 'Menunggu Talangan', 'Menunggu Konfirmasi Toko', 'Dibuat', 'Driver Mengantar', 'Selesai'];
  const shortLabels = ['Cari Driver', 'Talangan', 'Cek Toko', 'Dibuat', 'Diantar', 'Selesai'];
  const idx = Math.max(0, steps.indexOf(order.status));
  return (
    <section className="bg-white border border-blue-200 rounded-2xl shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-slate-950">Order Makanan Aktif · {order.store_name}</h3>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 shrink-0">
          {order.status}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= idx ? 'bg-blue-600' : 'bg-slate-200'}`} />
            <p className={`text-[8px] mt-1 font-semibold truncate ${i <= idx ? 'text-blue-700' : 'text-slate-400'}`}>
              {shortLabels[i]}
            </p>
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-600 space-y-1">
        {order.items.map((it, k) => (
          <p key={k}>• {it.qty}x {it.name} — {formatRupiah(it.price * it.qty)}</p>
        ))}
        <p>Alamat Antar: <b>{order.delivery_address}</b> ({order.distance_km} km, ±{order.eta_minutes} mnt)</p>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 mt-1">
          <p className="text-[11px] text-slate-600">Total yang harus kamu bayar ke Driver ({order.payment_method || 'Cash ke Driver'}):</p>
          <p className="font-extrabold text-sm text-blue-700 tabular-nums">
            {formatRupiah(order.total_price)}{' '}
            <span className="text-[11px] font-normal text-slate-600">
              (Makanan {formatRupiah(order.food_subtotal)} + Ongkir {formatRupiah(order.delivery_fee)})
            </span>
          </p>
        </div>
        {order.driver_name && <p>Driver: <b>{order.driver_name}</b> ({order.driver_plate})</p>}
      </div>
      <Btn onClick={onChat} className="w-full !bg-blue-600 hover:!bg-blue-700 flex items-center justify-center gap-2 text-xs">
        <MessageSquare size={15} /> Chat Toko / Driver
      </Btn>
    </section>
  );
}

function ActiveOrderCard({
  order,
  unreadCount,
  onChat,
  onCancel,
  onRate,
}: {
  order: OrderRow;
  unreadCount: number;
  onChat: () => void;
  onCancel: () => void;
  onRate: () => void;
}) {
  const steps = ['Mencari Driver', 'Driver OTW', 'Driver Tiba', 'Dalam Perjalanan', 'Sampai'];
  const stepIdx = Math.max(0, steps.indexOf(order.status));
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-slate-950">Pesanan Travel Aktif</h2>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 shrink-0">
          {order.status}
        </span>
      </div>
      <MiniMap progress={stepIdx <= 0 ? 0.1 : stepIdx >= 4 ? 1 : 0.5} label={order.status} />
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= stepIdx ? 'bg-blue-600' : 'bg-slate-200'}`} />
            <p className={`text-[8px] mt-1 font-semibold truncate ${i <= stepIdx ? 'text-blue-700' : 'text-slate-400'}`}>{s}</p>
          </div>
        ))}
      </div>
      <div className="text-sm space-y-1 text-slate-600">
        <p><MapPin size={13} className="inline mr-1 text-blue-600" />{order.pickup} → {order.destination}</p>
        <p className="tabular-nums">Armada: {order.car_type}</p>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-xs">
          <p className="text-slate-600">Bayar pas sampai ({order.payment_method || 'Cash ke Driver'}):</p>
          <p className="font-extrabold text-sm text-blue-700 tabular-nums">{formatRupiah(order.price)}</p>
        </div>
        {order.driver_name && <p>Driver: <b>{order.driver_name}</b> ({order.driver_plate})</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {order.driver_id && (
          <a href={mapsLink(order.pickup)} target="_blank" rel="noreferrer" className="col-span-2">
            <span className="flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl">
              <Navigation size={15} /> Lihat Titik Jemput di Maps
            </span>
          </a>
        )}
        <Btn variant="ghost" onClick={onChat} className="!text-slate-800 !bg-slate-100 flex items-center justify-center gap-2">
          <MessageSquare size={15} /> Chat Driver {unreadCount > 0 ? `(${unreadCount})` : ''}
        </Btn>
        {order.status === 'Sampai' ? (
          <Btn variant="warning" onClick={onRate}>Beri Rating</Btn>
        ) : (
          <Btn variant="danger" onClick={onCancel}>Batalkan</Btn>
        )}
      </div>
    </section>
  );
}
