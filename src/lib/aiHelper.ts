import {
  FoodCategory,
  JastipOrderRow,
  MenuItemRow,
  OrderRow,
  RouteRow,
  formatRupiah,
} from '@/lib/types';

// Estimasi Ongkir Otomatis dari AI berdasarkan alamat antar & tarif per km Owner
export function estimateAiOngkir(
  deliveryAddress: string,
  storeAddress: string,
  ratePerKm: number,
): { distanceKm: number; etaMinutes: number; deliveryFee: number } {
  const addr = deliveryAddress.trim().toLowerCase();
  let distanceKm = 2.3;

  if (!addr) {
    distanceKm = 2.3;
  } else if (addr.includes('haurgeulis') || addr.includes('pasar') || addr.includes('alun')) {
    distanceKm = 1.8 + ((addr.length % 7) * 0.15);
  } else if (addr.includes('patrol') || addr.includes('anjatan') || addr.includes('gantar')) {
    distanceKm = 3.2 + ((addr.length % 6) * 0.25);
  } else if (addr.includes('jatibarang') || addr.includes('indramayu') || addr.includes('terisi')) {
    distanceKm = 5.4 + ((addr.length % 5) * 0.35);
  } else {
    // Variasi deterministik berbasis alamat tujuan dan lokasi toko
    const seed = (addr.length * 13 + storeAddress.length * 7) % 24;
    distanceKm = 1.6 + seed * 0.15;
  }

  const roundedKm = Number(distanceKm.toFixed(1));
  const etaMinutes = Math.max(8, Math.round(roundedKm * 5.2));
  const rawFee = roundedKm * ratePerKm;
  const deliveryFee = Math.max(5000, Math.round(rawFee / 500) * 500);

  return { distanceKm: roundedKm, etaMinutes, deliveryFee };
}

// Rekomendasi AI berdasarkan kategori yang paling sering dipesan Customer
export function getAiFoodRecommendation(
  menus: MenuItemRow[],
  pastJastip: JastipOrderRow[],
  favoriteCategoryHint?: FoodCategory | null,
): { reason: string; item: MenuItemRow } | null {
  const available = menus.filter((m) => m.is_active && m.stock > 0);
  if (available.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const ord of pastJastip) {
    for (const it of ord.items) {
      counts[it.category] = (counts[it.category] || 0) + it.qty;
    }
  }

  let topCategory: FoodCategory = 'Seblak';
  let topScore = 0;
  for (const [cat, score] of Object.entries(counts)) {
    if (score > topScore) {
      topScore = score;
      topCategory = cat as FoodCategory;
    }
  }
  if (topScore === 0 && favoriteCategoryHint) {
    topCategory = favoriteCategoryHint;
  }

  const match =
    available.find((m) => m.category === topCategory) ||
    available.find((m) => m.category === 'Seblak') ||
    available[0];

  return {
    reason: `Karena kamu sering pesan ${topCategory}, cobain ini`,
    item: match,
  };
}

// Laporan AI untuk Dashboard Owner: makanan terlaris, jam ramai, rute terlaris
export function buildOwnerAiReport(
  travelOrders: OrderRow[],
  jastipOrders: JastipOrderRow[],
  routes: RouteRow[],
  menus: MenuItemRow[],
): {
  topFood: string;
  topFoodCount: number;
  peakHour: string;
  topRoute: string;
  topRouteCount: number;
  summaryTip: string;
} {
  // 1. Makanan paling laris
  const foodCounts: Record<string, number> = {};
  for (const o of jastipOrders) {
    if (o.status === 'Ditolak Toko' || o.status === 'Dibatalkan') continue;
    for (const item of o.items) {
      foodCounts[item.name] = (foodCounts[item.name] || 0) + item.qty;
    }
  }
  let topFood = menus[0]?.name || 'Seblak Ceker Pedas';
  let topFoodCount = 0;
  for (const [name, cnt] of Object.entries(foodCounts)) {
    if (cnt > topFoodCount) {
      topFoodCount = cnt;
      topFood = name;
    }
  }

  // 2. Jam ramai
  const hourBuckets: Record<number, number> = {};
  for (const o of [...travelOrders, ...jastipOrders]) {
    const h = new Date(o.created_at).getHours();
    if (!isNaN(h)) hourBuckets[h] = (hourBuckets[h] || 0) + 1;
  }
  let bestHour = 12;
  let bestHourCnt = 0;
  for (const [hStr, cnt] of Object.entries(hourBuckets)) {
    if (cnt > bestHourCnt) {
      bestHourCnt = cnt;
      bestHour = Number(hStr);
    }
  }
  const peakHour =
    bestHourCnt > 0
      ? `${String(bestHour).padStart(2, '0')}:00 - ${String((bestHour + 2) % 24).padStart(2, '0')}:00 WIB`
      : '11:00 - 14:00 & 17:00 - 20:00 WIB';

  // 3. Rute paling laris
  const routeCounts: Record<string, number> = {};
  for (const o of travelOrders) {
    if (o.status === 'Dibatalkan') continue;
    const key = `${o.pickup} - ${o.destination}`;
    routeCounts[key] = (routeCounts[key] || 0) + 1;
  }
  let topRoute = routes[0] ? `${routes[0].origin} - ${routes[0].destination}` : 'Haurgeulis - Bandung';
  let topRouteCount = 0;
  for (const [rKey, cnt] of Object.entries(routeCounts)) {
    if (cnt > topRouteCount) {
      topRouteCount = cnt;
      topRoute = rKey;
    }
  }

  return {
    topFood,
    topFoodCount,
    peakHour,
    topRoute,
    topRouteCount,
    summaryTip: `Stok ${topFood} & siagakan driver rute ${topRoute} pada jam ${peakHour}.`,
  };
}

// Asisten [Tanya AI] untuk Customer berdasarkan data nyata app
export function answerCustomerAiQuestion(
  question: string,
  routes: RouteRow[],
  menus: MenuItemRow[],
  aiRatePerKm: number,
): string {
  const q = question.trim().toLowerCase();
  if (!q) {
    return 'Halo! Saya Asisten AI WONG HAURGEULIS. Tanyakan soal tarif rute travel, rekomendasi seblak/ayam geprek/bakso, atau perkiraan ongkir Order Makanan.';
  }

  if (q.includes('ongkir') || q.includes('jarak') || q.includes('antar') || q.includes('biaya')) {
    const sample = estimateAiOngkir(q, 'Haurgeulis', aiRatePerKm);
    return `Ongkir AI otomatis dihitung ${formatRupiah(aiRatePerKm)}/km. Contoh pengiriman sekitar ${sample.distanceKm} km (±${sample.etaMinutes} mnt) ongkirnya ${formatRupiah(sample.deliveryFee)} — 100% langsung untuk driver!`;
  }

  if (
    q.includes('makan') ||
    q.includes('seblak') ||
    q.includes('geprek') ||
    q.includes('bakso') ||
    q.includes('minum') ||
    q.includes('jastip') ||
    q.includes('order makanan') ||
    q.includes('lapar')
  ) {
    const matched = menus.filter(
      (m) =>
        m.is_active &&
        m.stock > 0 &&
        (q.includes(m.category.toLowerCase()) || q.includes(m.name.toLowerCase())),
    );
    const picks = (matched.length > 0 ? matched : menus.filter((m) => m.is_active && m.stock > 0)).slice(0, 3);
    if (picks.length === 0) {
      return 'Saat ini toko kuliner sedang menyiapkan menu. Cek kembali sebentar lagi ya!';
    }
    const list = picks.map((p) => `• ${p.name} (${p.store_name}) - ${formatRupiah(p.price)}`).join('\n');
    return `Rekomendasi Order Makanan AI untuk Anda:\n${list}\nKlik tombol Pesan pada menu favorit untuk langsung masuk keranjang!`;
  }

  if (q.includes('rute') || q.includes('bandung') || q.includes('jakarta') || q.includes('cirebon') || q.includes('harga') || q.includes('travel')) {
    const matchedRoutes = routes.filter(
      (r) =>
        q.includes(r.destination.toLowerCase()) || q.includes(r.origin.toLowerCase()),
    );
    const list = (matchedRoutes.length > 0 ? matchedRoutes : routes).slice(0, 4);
    if (list.length === 0) return 'Semua rute travel siaga 24 jam dari Haurgeulis & Indramayu.';
    const lines = list
      .map((r) => `• ${r.origin} - ${r.destination}: mulai ${formatRupiah(r.price_economy)} (${r.eta_text || '15-20 mnt'})`)
      .join('\n');
    return `Daftar Rute & Tarif Travel:\n${lines}\nPakai kode promo WONG20 untuk diskon 20%!`;
  }

  if (q.includes('promo') || q.includes('diskon')) {
    return 'Gunakan kode promo WONG20 saat checkout atau pesan rute untuk menikmati diskon 20%!';
  }

  return `Driver WONG HAURGEULIS siaga 24 jam untuk antar travel & Order Makanan.\n• Tarif AI Ongkir Order Makanan: ${formatRupiah(aiRatePerKm)}/km\n• Promo aktif: WONG20 (20% OFF)\nCoba tanya: "Rekomendasi seblak enak", "Harga travel ke Bandung", atau "Berapa ongkir ke Patrol?"`;
}
