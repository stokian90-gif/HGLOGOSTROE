import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  ClipboardList,
  Clock,
  Image as ImageIcon,
  Landmark,
  Lock,
  LogOut,
  Megaphone,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Store,
  Trash2,
  Upload,
  Utensils,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  AiAlertRow,
  DriverRow,
  FOOD_CATEGORIES,
  FoodCategory,
  JastipOrderRow,
  MenuItemRow,
  MessageRow,
  PAYOUT_PROVIDERS,
  PayoutProvider,
  StoreRow,
  TransferProof,
  formatRupiah,
  getDriverStatus,
} from '@/lib/types';
import {
  DEFAULT_STORE_IMG,
  FOOD_DEFAULT_IMAGES,
  FOOD_PHOTO_TEMPLATES,
  loadSettings,
  readImageFileAsDataUrl,
} from '@/lib/settings';
import {
  analyzeTransferProof,
  clearFailedLoginAttempts,
  getCurrentLocationLabel,
  getDeviceFingerprint,
  getLoginCooldownSeconds,
  hashPassword,
  isDuplicateAccountNumber,
  logSecurityActivity,
  pushAiAlert,
  recordFailedLoginAttempt,
  registerUsedProofFingerprint,
  verifyPassword,
} from '@/lib/securityAi';
import { playTingSound } from '@/lib/sound';
import { Btn, ErrorBox, Field, Modal, Toast } from '@/components/ui';
import ChatView from '@/components/ChatView';
import ForgotPasswordFlow from '@/components/ForgotPasswordFlow';

const STORE_ID_KEY = 'ti_store';
const STORE_STATUS_KEY = 'ti_store_status';
const STORE_REMEMBER_KEY = 'ti_store_remember';
const STORE_PHONE_KEY = 'ti_store_phone';
const STORE_SESSION_VER_KEY = 'ti_store_session_ver';

function toStoredStatus(st: Pick<StoreRow, 'status'>): string {
  const s = getDriverStatus(st);
  if (s === 'pending') return 'menunggu';
  if (s === 'rejected') return 'ditolak';
  if (s === 'blocked') return 'diblokir';
  return 'disetujui';
}

function saveStoreSession(st: StoreRow, rememberPhone: boolean) {
  try {
    localStorage.setItem(STORE_ID_KEY, st.id);
    localStorage.setItem(STORE_STATUS_KEY, toStoredStatus(st));
    localStorage.setItem(STORE_SESSION_VER_KEY, String(st.session_version ?? 1));
    if (rememberPhone && st.phone) {
      localStorage.setItem(STORE_PHONE_KEY, st.phone);
    }
  } catch {
    // Ignore storage errors
  }
}

function clearStoreSession() {
  try {
    localStorage.removeItem(STORE_ID_KEY);
    localStorage.removeItem(STORE_STATUS_KEY);
    localStorage.removeItem(STORE_SESSION_VER_KEY);
  } catch {
    // Ignore storage errors
  }
}

export default function StoreApp({ onLogout }: { onLogout: () => void }) {
  const [storeRecord, setStoreRecord] = useState<StoreRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [isRegister, setIsRegister] = useState(true);

  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORE_REMEMBER_KEY) !== '0';
    } catch {
      return true;
    }
  });

  // Login toko pakai WA + Password
  const [loginPhone, setLoginPhone] = useState<string>(() => {
    try {
      return localStorage.getItem(STORE_REMEMBER_KEY) !== '0'
        ? localStorage.getItem(STORE_PHONE_KEY) || ''
        : '';
    } catch {
      return '';
    }
  });
  const [loginPass, setLoginPass] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [loginCooldown, setLoginCooldown] = useState(0);

  // Form daftar toko (1x saja, termasuk Rekening Utama Terkunci)
  const [sName, setSName] = useState('');
  const [sOwner, setSOwner] = useState('');
  const [sKtp, setSKtp] = useState('');
  const [sPhone, setSPhone] = useState('');
  const [sPass, setSPass] = useState('');
  const [sPhoto, setSPhoto] = useState<string>(DEFAULT_STORE_IMG);
  const [sAddress, setSAddress] = useState('');
  const [sPayProvider, setSPayProvider] = useState<PayoutProvider>('DANA');
  const [sPayNumber, setSPayNumber] = useState('');
  const [sPayOwner, setSPayOwner] = useState('');
  const [sPayProof, setSPayProof] = useState<string | null>(null);

  // Dashboard Toko state
  const [tab, setTab] = useState<'orders' | 'menus' | 'ads' | 'finance' | 'account'>('orders');
  const [menus, setMenus] = useState<MenuItemRow[]>([]);
  const [orders, setOrders] = useState<JastipOrderRow[]>([]);
  const [alerts, setAlerts] = useState<AiAlertRow[]>([]);
  const [financeLimit, setFinanceLimit] = useState(10);
  const [notifLimit, setNotifLimit] = useState(10);
  const [notifOpen, setNotifOpen] = useState(false);
  const [zoomProofUrl, setZoomProofUrl] = useState<string | null>(null);

  // Modal tambah menu
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [mName, setMName] = useState('');
  const [mCat, setMCat] = useState<FoodCategory>('Seblak');
  const [mPrice, setMPrice] = useState('15000');
  const [mStock, setMStock] = useState('25');
  const [mPhoto, setMPhoto] = useState<string>(FOOD_DEFAULT_IMAGES.Seblak);

  // Chat Customer
  const [chatOrder, setChatOrder] = useState<JastipOrderRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  // Iklan draft + bukti transfer iklan 100% Owner
  const [adTitle, setAdTitle] = useState('');
  const [adSubtitle, setAdSubtitle] = useState('');
  const [adBanner, setAdBanner] = useState('');
  const [adProof, setAdProof] = useState<TransferProof | null>(null);
  const [adCheckingProof, setAdCheckingProof] = useState(false);

  // Ajukan ganti / hapus rekening terkunci (langsung ke Owner, tanpa OTP)
  const [chgProvider, setChgProvider] = useState<PayoutProvider>('DANA');
  const [chgNumber, setChgNumber] = useState('');
  const [chgOwner, setChgOwner] = useState('');
  const [chgProof, setChgProof] = useState<string | null>(null);
  const [chgReason, setChgReason] = useState('');
  const [showDelForm, setShowDelForm] = useState(false);
  const [delReason, setDelReason] = useState('');

  const prevSignalRef = useRef(-1);

  const activeStore = useMemo(
    () => (storeRecord && getDriverStatus(storeRecord) === 'approved' ? storeRecord : null),
    [storeRecord],
  );

  const loadStoreData = useCallback(async (st: StoreRow) => {
    try {
      const [r1, r2, r3] = await Promise.all([
        supabase.from('menu_items').select('*').eq('store_id', st.id).order('created_at', { ascending: false }),
        supabase.from('jastip_orders').select('*').eq('store_id', st.id).order('created_at', { ascending: false }).limit(60),
        supabase.from('ai_alerts').select('*').eq('target_role', 'store').order('created_at', { ascending: false }).limit(40),
      ]);
      setMenus((r1.data as MenuItemRow[]) || []);
      setOrders((r2.data as JastipOrderRow[]) || []);
      const storeAlerts = ((r3.data as AiAlertRow[]) || []).filter((a) => !a.target_id || a.target_id === st.id);
      setAlerts(storeAlerts);
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  }, []);

  const reloadStore = useCallback(
    async (id: string, showFeedback = false) => {
      if (showFeedback) setChecking(true);
      try {
        const { data, error: e } = await supabase.from('stores').select('*').eq('id', id).maybeSingle();
        if (e) throw new Error('x');
        if (!data) {
          clearStoreSession();
          setStoreRecord(null);
          return;
        }
        const st = data as StoreRow;
        const savedSessionVer = localStorage.getItem(STORE_SESSION_VER_KEY);
        const remoteVer = String(st.session_version ?? 1);
        if (savedSessionVer && savedSessionVer !== remoteVer) {
          clearStoreSession();
          setStoreRecord(null);
          setIsRegister(false);
          setError('Anda otomatis keluar karena password akun toko baru saja diubah.');
          return;
        }
        saveStoreSession(st, rememberMe);
        setStoreRecord(st);
        setAdTitle(st.ad_title || `${st.name} — Promo Spesial!`);
        setAdSubtitle(st.ad_subtitle || `Pesan Makanan cepat dari ${st.address}`);
        setAdBanner(st.ad_banner_url || st.photo_url || DEFAULT_STORE_IMG);
        if (getDriverStatus(st) === 'approved') {
          await loadStoreData(st);
        } else if (showFeedback) {
          setToast(
            getDriverStatus(st) === 'rejected'
              ? 'Pendaftaran toko ditolak Owner'
              : getDriverStatus(st) === 'blocked'
                ? 'Akun toko diblokir Owner'
                : 'Masih menunggu persetujuan Owner',
          );
        }
      } catch {
        if (showFeedback) setError('Koneksi bermasalah, coba lagi');
      } finally {
        if (showFeedback) setChecking(false);
      }
    },
    [loadStoreData, rememberMe],
  );

  useEffect(() => {
    if (loginCooldown <= 0) return;
    const t = setInterval(() => setLoginCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [loginCooldown]);

  useEffect(() => {
    const savedId = localStorage.getItem(STORE_ID_KEY);
    if (!savedId) {
      setLoading(false);
      return;
    }
    reloadStore(savedId).finally(() => setLoading(false));
  }, [reloadStore]);

  // Bunyi "Ting!" saat ada Driver bayar talangan / order masuk / alert baru
  const storeNotifCount = useMemo(() => {
    const waitingConfirm = orders.filter(
      (o) =>
        o.driver_paid_store &&
        !o.store_confirmed_driver_paid &&
        !['Ditolak Toko', 'Dibatalkan', 'Selesai'].includes(o.status),
    ).length;
    return waitingConfirm + alerts.filter((a) => !a.is_read).length;
  }, [orders, alerts]);

  useEffect(() => {
    if (!activeStore) return;
    if (prevSignalRef.current >= 0 && storeNotifCount > prevSignalRef.current) {
      playTingSound();
    }
    prevSignalRef.current = storeNotifCount;
  }, [storeNotifCount, activeStore]);

  useEffect(() => {
    if (!storeRecord) return;
    const ch = supabase
      .channel(`store-live-${storeRecord.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, () => reloadStore(storeRecord.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        if (activeStore) loadStoreData(activeStore);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jastip_orders' }, () => {
        if (activeStore) loadStoreData(activeStore);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_alerts' }, () => {
        if (activeStore) loadStoreData(activeStore);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [storeRecord, activeStore, reloadStore, loadStoreData]);

  useEffect(() => {
    if (!storeRecord || getDriverStatus(storeRecord) !== 'pending') return;
    const t = setInterval(() => reloadStore(storeRecord.id), 4000);
    return () => clearInterval(t);
  }, [storeRecord, reloadStore]);

  const loadMessages = useCallback(async (orderId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at');
    setMessages((data as MessageRow[]) || []);
  }, []);

  useEffect(() => {
    if (!chatOrder) return;
    loadMessages(chatOrder.id);
    const ch = supabase
      .channel(`store-chat-${chatOrder.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => loadMessages(chatOrder.id))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [chatOrder, loadMessages]);

  const doRegisterStore = async () => {
    const cleanPhone = sPhone.replace(/[\s-]/g, '');
    const cleanKtp = sKtp.replace(/\s+/g, '');
    const cleanPayNum = sPayNumber.replace(/[\s-]/g, '');
    if (sName.trim().length < 3) return setError('Nama Toko minimal 3 huruf');
    if (sOwner.trim().length < 2) return setError('Nama Pemilik wajib diisi');
    if (!/^\d{8,16}$/.test(cleanKtp)) return setError('No. KTP harus berupa angka (8-16 digit)');
    if (!/^0\d{8,14}$/.test(cleanPhone)) return setError('Nomor WhatsApp tidak valid');
    if (sPass.length < 4) return setError('Password minimal 4 karakter');
    if (sAddress.trim().length < 5) return setError('Alamat Toko wajib diisi lengkap');
    if (cleanPayNum.length < 6) return setError('Nomor Rekening / DANA Utama wajib diisi');
    if (sPayOwner.trim().length < 2) return setError('Nama Pemilik Rekening wajib diisi');
    if (!sPayProof) return setError('Upload Foto Buku Rekening / Screenshot DANA wajib diisi');

    setError('');
    try {
      const [rStores, rDrivers] = await Promise.all([
        supabase.from('stores').select('*'),
        supabase.from('drivers').select('*'),
      ]);
      const existingStores = (rStores.data as StoreRow[]) || [];
      const existingDrivers = (rDrivers.data as DriverRow[]) || [];
      const settings = loadSettings();

      const activeStores = existingStores.filter((x) => getDriverStatus(x) !== 'rejected');
      const activeDrivers = existingDrivers.filter((x) => getDriverStatus(x) !== 'rejected');

      if (activeStores.some((x) => x.phone === cleanPhone) || activeDrivers.some((x) => x.phone === cleanPhone)) {
        await logSecurityActivity({
          actorName: sName.trim(),
          role: 'Toko',
          action: `AI blokir daftar toko: No WA ganda (${cleanPhone})`,
          severity: 'critical',
        });
        await pushAiAlert({
          targetRole: 'owner',
          title: 'AI Anti Akun Ganda',
          message: `Percobaan akun ganda terdeteksi! No WA ${cleanPhone} dicoba untuk daftar toko "${sName.trim()}".`,
          category: 'duplicate',
        });
        return setError('Nomor WA ini sudah terdaftar di akun lain (1 WA = 1 Akun).');
      }

      const ktpCount = activeStores.filter((x) => x.ktp_number === cleanKtp).length;
      if (ktpCount >= 2) {
        await pushAiAlert({
          targetRole: 'owner',
          title: 'AI Anti Akun Ganda (KTP)',
          message: `Percobaan akun ganda terdeteksi! No KTP ${cleanKtp} melebihi batas maksimal 2 toko.`,
          category: 'duplicate',
        });
        return setError('1 KTP maksimal mendaftarkan 2 toko saja.');
      }

      if (
        isDuplicateAccountNumber(
          sPayProvider,
          cleanPayNum,
          existingDrivers,
          existingStores,
          settings.finance.ownerPayout,
        )
      ) {
        await logSecurityActivity({
          actorName: sName.trim(),
          role: 'Toko',
          action: `AI blokir daftar toko: Rekening ganda (${sPayProvider} ${cleanPayNum})`,
          severity: 'critical',
        });
        await pushAiAlert({
          targetRole: 'owner',
          title: 'AI Anti Akun Ganda (Rekening)',
          message: `Percobaan akun ganda terdeteksi! Rekening ${sPayProvider} ${cleanPayNum} sudah terdaftar di akun lain.`,
          category: 'duplicate',
        });
        return setError('Nomor Rekening / DANA ini sudah terdaftar pada akun lain (1 Rekening = 1 Akun).');
      }

      const encryptedPass = await hashPassword(sPass);
      const devFp = getDeviceFingerprint();

      const { data, error: e } = await supabase
        .from('stores')
        .insert({
          name: sName.trim(),
          owner_name: sOwner.trim(),
          ktp_number: cleanKtp,
          phone: cleanPhone,
          password: encryptedPass,
          password_history: [encryptedPass],
          session_version: 1,
          last_location: getCurrentLocationLabel(),
          photo_url: sPhoto || DEFAULT_STORE_IMG,
          address: sAddress.trim(),
          payout_account: {
            provider: sPayProvider,
            accountNumber: cleanPayNum,
            ownerName: sPayOwner.trim(),
            proofPhoto: sPayProof,
            locked: true,
            pendingChange: null,
          },
          trusted_devices: [devFp],
          status: 'pending',
          rating: 5,
          ad_active: false,
          ad_status: 'none',
          ad_title: `${sName.trim()} — Menu Hemat Siap Antar`,
          ad_subtitle: `Lokasi: ${sAddress.trim()}`,
          ad_banner_url: sPhoto || DEFAULT_STORE_IMG,
        })
        .select()
        .single();
      if (e || !data) throw new Error('x');

      const created = data as StoreRow;
      await logSecurityActivity({
        actorName: created.name,
        role: 'Toko',
        action: `Mendaftar toko baru dengan rekening ${sPayProvider} ${cleanPayNum} (terkunci)`,
        severity: 'info',
      });
      saveStoreSession(created, rememberMe);
      setStoreRecord(created);
      setToast('Pendaftaran Toko terkirim! Menunggu persetujuan Owner.');
    } catch {
      setError('Gagal mendaftarkan toko, coba lagi');
    }
  };

  const finalizeStoreLogin = async (st: StoreRow) => {
    const devFp = getDeviceFingerprint();
    const devices = Array.from(new Set([...(st.trusted_devices || []), devFp]));
    const loc = getCurrentLocationLabel();
    await supabase
      .from('stores')
      .update({ trusted_devices: devices, last_location: loc })
      .eq('id', st.id);
    const updated: StoreRow = { ...st, trusted_devices: devices, last_location: loc };

    if (rememberMe) localStorage.setItem(STORE_PHONE_KEY, st.phone);
    saveStoreSession(updated, rememberMe);
    setStoreRecord(updated);
    await logSecurityActivity({
      actorName: updated.name,
      role: 'Toko',
      action: 'Login Toko berhasil',
      severity: 'info',
    });
    if (getDriverStatus(updated) === 'approved') {
      await loadStoreData(updated);
    }
  };

  const doLoginStore = async () => {
    const cleanPhone = loginPhone.replace(/[\s-]/g, '');
    if (!/^0\d{8,14}$/.test(cleanPhone)) return setError('Nomor WhatsApp tidak valid');
    if (loginPass.length < 4) return setError('Password minimal 4 karakter');

    const failKey = `store_${cleanPhone}`;
    const cd = getLoginCooldownSeconds(failKey);
    if (cd > 0) {
      setLoginCooldown(cd);
      return setError(`Password salah 3x, coba Lupa Password? atau tunggu 1 menit (${cd} dtk)`);
    }

    setError('');
    try {
      const { data } = await supabase
        .from('stores')
        .select('*')
        .eq('phone', cleanPhone)
        .order('created_at', { ascending: false });
      const rows = (data as StoreRow[]) || [];
      if (rows.length === 0) return setError('Nomor WA tidak ditemukan. Silakan daftar toko.');
      const st = rows[0];

      const storedPass = st.password || 'store123';
      const okPass = await verifyPassword(loginPass, storedPass);
      if (!okPass) {
        const failRes = recordFailedLoginAttempt(failKey);
        if (failRes.cooldownSeconds > 0) {
          setLoginCooldown(failRes.cooldownSeconds);
        }
        await logSecurityActivity({
          actorName: st.name,
          role: 'Toko',
          action:
            failRes.cooldownSeconds > 0
              ? 'Percobaan login toko gagal 3x berturut-turut (jeda 1 menit, disarankan Lupa Password ke Owner)'
              : 'Percobaan login toko gagal (password salah)',
          severity: 'warning',
        });
        return setError(failRes.message);
      }

      clearFailedLoginAttempts(failKey);
      setLoginCooldown(0);

      // Enkripsi password lama jika belum di-hash
      if (!storedPass.startsWith('enc$')) {
        const hashed = await hashPassword(loginPass);
        const hist = Array.from(new Set([...(st.password_history || []), hashed])).slice(-3);
        await supabase.from('stores').update({ password: hashed, password_history: hist }).eq('id', st.id);
        st.password = hashed;
        st.password_history = hist;
      }

      await finalizeStoreLogin(st);
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  };

  const logoutToForm = () => {
    const prevPhone = storeRecord?.phone || loginPhone;
    clearStoreSession();
    setStoreRecord(null);
    setOrders([]);
    setMenus([]);
    setIsRegister(false);
    setLoginPass('');
    if (rememberMe && prevPhone) setLoginPhone(prevPhone);
  };

  const handleStorePhoto = async (
    file: File | null,
    target: 'store' | 'menu' | 'ad' | 'payout' | 'chgPayout',
  ) => {
    if (!file) return;
    try {
      const url = await readImageFileAsDataUrl(file);
      if (target === 'store') setSPhoto(url);
      else if (target === 'menu') setMPhoto(url);
      else if (target === 'ad') setAdBanner(url);
      else if (target === 'payout') setSPayProof(url);
      else setChgProof(url);
      setToast('Foto dipilih');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membaca foto');
    }
  };

  const addMenu = async () => {
    if (!activeStore) return;
    const priceNum = parseInt(mPrice, 10);
    const stockNum = parseInt(mStock, 10);
    if (mName.trim().length < 2) return setError('Nama makanan wajib diisi');
    if (isNaN(priceNum) || priceNum < 1000) return setError('Harga minimal Rp 1.000');
    if (isNaN(stockNum) || stockNum < 0) return setError('Stok tidak valid');
    setError('');
    try {
      await supabase.from('menu_items').insert({
        store_id: activeStore.id,
        store_name: activeStore.name,
        category: mCat,
        name: mName.trim(),
        price: priceNum,
        stock: stockNum,
        photo_url: mPhoto || FOOD_DEFAULT_IMAGES[mCat],
        rating: 4.9,
        is_active: true,
      });
      setMenuModalOpen(false);
      setMName('');
      setToast('Menu ditambahkan & terkunci ke toko Anda!');
      await loadStoreData(activeStore);
    } catch {
      setError('Gagal menambah menu');
    }
  };

  const updateStock = async (m: MenuItemRow, delta: number) => {
    if (!activeStore) return;
    const nextStock = Math.max(0, m.stock + delta);
    await supabase.from('menu_items').update({ stock: nextStock }).eq('id', m.id);
    await loadStoreData(activeStore);
  };

  const deleteMenu = async (m: MenuItemRow) => {
    if (!activeStore) return;
    await supabase.from('menu_items').delete().eq('id', m.id);
    setToast('Menu dihapus');
    await loadStoreData(activeStore);
  };

  // === KONFIRMASI UANG TALANGAN DARI DRIVER ===
  const confirmDriverTalangan = async (o: JastipOrderRow) => {
    if (!activeStore) return;
    await supabase
      .from('jastip_orders')
      .update({
        store_confirmed_driver_paid: true,
        status: 'Dibuat',
      })
      .eq('id', o.id);

    if (o.driver_id) {
      await pushAiAlert({
        targetRole: 'driver',
        targetId: o.driver_id,
        title: `${activeStore.name} terima uang talangan!`,
        message: `Toko sudah terima ${formatRupiah(o.food_subtotal)} dan sedang membuat pesanan ${o.customer_name}. Siap diambil & diantar!`,
        category: 'payment',
      });
    }
    setToast('✅ Uang talangan Driver diterima! Silakan buatkan pesanan.');
    await loadStoreData(activeStore);
  };

  const rejectJastipOrder = async (o: JastipOrderRow) => {
    if (!activeStore) return;
    await supabase.from('jastip_orders').update({ status: 'Ditolak Toko' }).eq('id', o.id);
    if (o.driver_id) {
      await pushAiAlert({
        targetRole: 'driver',
        targetId: o.driver_id,
        title: `Orderan ${activeStore.name} ditolak`,
        message: `Toko menolak pesanan ${o.customer_name}.`,
        category: 'payment',
      });
    }
    setToast('Orderan ditolak');
    await loadStoreData(activeStore);
  };

  const handleUploadAdProof = async (file: File | null) => {
    if (!file || !activeStore) return;
    setAdCheckingProof(true);
    setError('');
    try {
      const settings = loadSettings();
      const res = await analyzeTransferProof(file, settings.finance.adPricePerWeek, activeStore.name);
      if (!res.valid || !res.imageUrl || !res.fingerprint) {
        setError(res.reason);
        return;
      }
      setAdProof({
        id: 'ADPRF-' + Date.now().toString(36),
        imageUrl: res.imageUrl,
        fileName: file.name,
        fileSize: file.size,
        aiNote: res.reason,
        aiPassed: true,
        fingerprint: res.fingerprint,
        uploadedAt: new Date().toISOString(),
      });
      setToast('Bukti transfer iklan lolos cek AI!');
    } finally {
      setAdCheckingProof(false);
    }
  };

  const submitAdExtension = async () => {
    if (!activeStore) return;
    if (!adProof) {
      return setError('Upload bukti transfer biaya iklan ke Rekening Owner terlebih dahulu!');
    }
    const settings = loadSettings();
    const adFee = settings.finance.adPricePerWeek;
    registerUsedProofFingerprint(adProof.fingerprint);

    const nextExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('stores')
      .update({
        ad_title: adTitle.trim() || `${activeStore.name} — Promo Spesial`,
        ad_subtitle: adSubtitle.trim() || activeStore.address,
        ad_banner_url: adBanner || activeStore.photo_url || DEFAULT_STORE_IMG,
        ad_status: activeStore.ad_status === 'approved' ? 'approved' : 'pending',
        ad_active: activeStore.ad_status === 'approved',
        ad_expires_at: nextExpiry,
      })
      .eq('id', activeStore.id);

    await pushAiAlert({
      targetRole: 'owner',
      title: 'Pengajuan / Perpanjang Iklan Toko',
      message: `${activeStore.name} mengunggah bukti transfer iklan ${formatRupiah(adFee)} (100% langsung ke Rekening Owner).`,
      category: 'payment',
    });

    setAdProof(null);
    setToast(
      activeStore.ad_status === 'approved'
        ? `Iklan diperpanjang 7 hari (${formatRupiah(adFee)} langsung ke Owner)!`
        : 'Pengajuan iklan & bukti transfer dikirim ke Owner untuk ACC!',
    );
    await reloadStore(activeStore.id);
  };

  // === GANTI / HAPUS REKENING TERKUNCI (LANGSUNG KE OWNER, TANPA OTP) ===
  const submitChangeAccount = async () => {
    if (!activeStore) return;
    const cleanNum = chgNumber.replace(/[\s-]/g, '');
    if (cleanNum.length < 6) return setError('Isi nomor rekening baru terlebih dahulu');
    if (chgOwner.trim().length < 2) return setError('Isi nama pemilik rekening baru');
    if (!chgProof) return setError('Upload foto buku rekening / screenshot DANA baru');
    if (chgReason.trim().length < 3) return setError('Isi alasan ganti rekening');

    setError('');
    const [rDrv, rSt] = await Promise.all([
      supabase.from('drivers').select('*'),
      supabase.from('stores').select('*'),
    ]);
    const settings = loadSettings();
    if (
      isDuplicateAccountNumber(
        chgProvider,
        cleanNum,
        (rDrv.data as DriverRow[]) || [],
        (rSt.data as StoreRow[]) || [],
        settings.finance.ownerPayout,
        activeStore.id,
      )
    ) {
      return setError('Nomor rekening baru sudah digunakan akun lain (1 Rekening = 1 Akun).');
    }

    const updatedPayout = {
      ...activeStore.payout_account,
      pendingChange: {
        action: 'change' as const,
        provider: chgProvider,
        accountNumber: cleanNum,
        ownerName: chgOwner.trim(),
        proofPhoto: chgProof,
        reason: chgReason.trim(),
        requestedAt: new Date().toISOString(),
      },
    };
    await supabase.from('stores').update({ payout_account: updatedPayout }).eq('id', activeStore.id);
    await logSecurityActivity({
      actorName: activeStore.name,
      role: 'Toko',
      action: `Mengajukan ganti rekening ke ${chgProvider} ${cleanNum} (Alasan: ${chgReason.trim()})`,
      severity: 'warning',
    });
    await pushAiAlert({
      targetRole: 'owner',
      title: `Ajuan Ganti Rekening Toko ${activeStore.name}`,
      message: `${activeStore.name} mengajukan ganti rekening ke ${chgProvider} ${cleanNum} a/n ${chgOwner.trim()}. Alasan: ${chgReason.trim()}`,
      category: 'payment',
    });
    setChgNumber('');
    setChgOwner('');
    setChgProof(null);
    setChgReason('');
    setToast('Pengajuan ganti rekening dikirim ke Owner untuk ACC!');
    await reloadStore(activeStore.id);
  };

  const submitDeleteAccount = async () => {
    if (!activeStore) return;
    if (delReason.trim().length < 3) return setError('Isi alasan hapus rekening');
    setError('');
    const updatedPayout = {
      ...activeStore.payout_account,
      pendingChange: {
        action: 'delete' as const,
        provider: activeStore.payout_account.provider,
        accountNumber: activeStore.payout_account.accountNumber,
        ownerName: activeStore.payout_account.ownerName,
        proofPhoto: null,
        reason: delReason.trim(),
        requestedAt: new Date().toISOString(),
      },
    };
    await supabase.from('stores').update({ payout_account: updatedPayout }).eq('id', activeStore.id);
    await logSecurityActivity({
      actorName: activeStore.name,
      role: 'Toko',
      action: `Mengajukan hapus rekening toko (${activeStore.payout_account.provider} ${activeStore.payout_account.accountNumber}). Alasan: ${delReason.trim()}`,
      severity: 'warning',
    });
    await pushAiAlert({
      targetRole: 'owner',
      title: `Ajuan Hapus Rekening Toko ${activeStore.name}`,
      message: `${activeStore.name} mengajukan hapus rekening. Alasan: ${delReason.trim()}`,
      category: 'payment',
    });
    setDelReason('');
    setShowDelForm(false);
    setToast('Pengajuan hapus rekening dikirim ke Owner untuk ACC!');
    await reloadStore(activeStore.id);
  };

  const sendStoreChat = async (body: string) => {
    if (!chatOrder || !body.trim()) return;
    await supabase.from('messages').insert({
      order_id: chatOrder.id,
      sender: 'Toko',
      body: body.trim(),
    });
    await loadMessages(chatOrder.id);
  };

  // Riwayat Penjualan Toko 100% Penuh (Tanpa Komisi, Tanpa Potongan)
  const financeHistory = useMemo(() => {
    return orders.map((o) => {
      const paidByDriver =
        o.store_confirmed_driver_paid ||
        ['Dibuat', 'Driver Mengantar', 'Selesai'].includes(o.status);
      return {
        id: o.id,
        customerName: o.customer_name,
        driverName: o.driver_name,
        itemsLabel: o.items.map((it) => `${it.qty}x ${it.name}`).join(', '),
        foodSubtotal: o.food_subtotal,
        paidByDriver,
        paymentMethod: o.driver_paid_store_method || 'Cash',
        createdAt: o.created_at,
      };
    });
  }, [orders]);

  const totalStoreReceived = useMemo(
    () =>
      financeHistory
        .filter((f) => f.paidByDriver)
        .reduce((sum, f) => sum + f.foodSubtotal, 0),
    [financeHistory],
  );

  if (loading) return <div className="min-h-screen grid place-items-center text-slate-500">Memuat Portal Toko...</div>;

  // STATUS MENUNGGU
  if (storeRecord && getDriverStatus(storeRecord) === 'pending') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-700 to-blue-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 mx-auto flex items-center justify-center">
            <Clock size={32} />
          </div>
          <div className="space-y-1">
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
              STATUS: MENUNGGU PERSETUJUAN
            </span>
            <h2 className="text-lg font-bold text-slate-800 pt-1">
              Menunggu Persetujuan Owner
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Toko <b>{storeRecord.name}</b> sedang diverifikasi Owner. Setelah disetujui, Anda langsung masuk ke Dashboard Toko tanpa login lagi.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-left text-xs space-y-1 text-slate-700">
            <p>Pemilik: <b>{storeRecord.owner_name}</b></p>
            <p>No. WA: <b>{storeRecord.phone}</b></p>
            <p>KTP: <b>{storeRecord.ktp_number}</b></p>
            <p>Alamat: <b>{storeRecord.address}</b></p>
            <p>
              Rekening Utama: <b>{storeRecord.payout_account?.provider} {storeRecord.payout_account?.accountNumber}</b>
            </p>
          </div>

          <Btn onClick={() => reloadStore(storeRecord.id, true)} disabled={checking} className="w-full !bg-blue-600 hover:!bg-blue-700 flex items-center justify-center gap-2">
            <RefreshCw size={15} className={checking ? 'animate-spin' : ''} />
            <span>{checking ? 'Memeriksa...' : 'Cek Status Toko'}</span>
          </Btn>

          <div className="space-y-1">
            <button type="button" onClick={logoutToForm} className="w-full text-xs text-blue-600 font-semibold py-1.5">
              Ganti Akun Toko
            </button>
            <button type="button" onClick={onLogout} className="w-full text-xs text-slate-400 py-1">
              Kembali ke Beranda
            </button>
          </div>
        </div>
        {toast && <Toast message={toast} onClose={() => setToast('')} />}
      </div>
    );
  }

  // STATUS DITOLAK / DIBLOKIR
  if (storeRecord && (getDriverStatus(storeRecord) === 'rejected' || getDriverStatus(storeRecord) === 'blocked')) {
    const isBlocked = getDriverStatus(storeRecord) === 'blocked';
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-700 to-blue-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center">
            {isBlocked ? <ShieldAlert size={32} /> : <AlertCircle size={32} />}
          </div>
          <h2 className="text-lg font-bold text-slate-800">
            {isBlocked ? 'Toko Diblokir Owner' : 'Pendaftaran Toko Ditolak'}
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-left text-xs text-amber-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5"><Megaphone size={14} /> Note Owner:</p>
            <p>{storeRecord.owner_note || storeRecord.rejection_reason || 'Hubungi Owner untuk keterangan lebih lanjut.'}</p>
          </div>
          {!isBlocked && (
            <Btn
              onClick={() => {
                clearStoreSession();
                setStoreRecord(null);
                setIsRegister(true);
              }}
              className="w-full !bg-blue-600"
            >
              Daftar Lagi
            </Btn>
          )}
          <button type="button" onClick={logoutToForm} className="w-full text-xs text-blue-600 font-semibold py-1">
            Masuk dengan Akun Lain
          </button>
          <button type="button" onClick={onLogout} className="w-full text-xs text-slate-400 py-1">
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  // FORM DAFTAR / MASUK TOKO / LUPA PASSWORD
  if (!activeStore) {
    if (showForgot) {
      return (
        <ForgotPasswordFlow
          role="Toko"
          initialPhone={loginPhone}
          theme="blue"
          onBackToLogin={() => {
            setShowForgot(false);
            setIsRegister(false);
            setError('');
          }}
        />
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-700 to-blue-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-7 space-y-4">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center mb-2">
              <Store size={24} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {isRegister ? 'Buka Toko & Pasang Iklan' : 'Masuk Dashboard Toko'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isRegister
                ? '1 WA = 1 Toko, 1 KTP max 2 Toko, 1 Rekening = 1 Akun. Password terenkripsi aman.'
                : 'Masukkan No. WA & Password toko terdaftar'}
            </p>
          </div>

          {isRegister ? (
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              <Field label="Nama Toko" value={sName} onChange={setSName} placeholder="Contoh: Seblak Teh Rina" />
              <Field label="Nama Pemilik" value={sOwner} onChange={setSOwner} placeholder="Sesuai KTP" />
              <Field label="No. KTP (1 KTP max 2 Toko)" value={sKtp} onChange={setSKtp} placeholder="3212xxxxxxxxxxxx" />
              <Field label="No. HP / WhatsApp" value={sPhone} onChange={setSPhone} placeholder="081234567890" />
              <Field label="Password (Terenkripsi)" value={sPass} onChange={setSPass} type="password" placeholder="Minimal 6 karakter (huruf + angka)" />
              <Field label="Alamat Toko" value={sAddress} onChange={setSAddress} placeholder="Jl. Raya Haurgeulis..." />

              <div>
                <span className="block text-xs font-semibold text-slate-600 mb-1.5">Foto Toko</span>
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                  <img src={sPhoto} alt="Preview Toko" className="w-16 h-14 rounded-lg object-cover shrink-0" />
                  <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5">
                    <Upload size={13} /> Upload Foto Toko
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleStorePhoto(e.target.files?.[0] ?? null, 'store')} />
                  </label>
                </div>
              </div>

              {/* 1 REKENING UTAMA WAJIB (TERKUNCI) */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 space-y-2.5">
                <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <Landmark size={14} /> 1 Rekening Utama Penerima Bayaran (Wajib)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PAYOUT_PROVIDERS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSPayProvider(p)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        sPayProvider === p
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <Field label={`Nomor ${sPayProvider}`} value={sPayNumber} onChange={setSPayNumber} placeholder="081234567890" />
                <Field label="Nama Pemilik Rekening" value={sPayOwner} onChange={setSPayOwner} placeholder="Sesuai Buku Rekening / Akun DANA" />
                <div className="bg-white border border-dashed border-blue-300 rounded-xl p-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {sPayProof && <img src={sPayProof} alt="Bukti Rekening" className="w-12 h-10 object-cover rounded-lg shrink-0" />}
                    <span className="text-[11px] text-slate-600 truncate">
                      {sPayProof ? 'Foto Rekening / SS DANA siap' : 'Foto Buku Rekening / SS DANA'}
                    </span>
                  </div>
                  <label className="cursor-pointer bg-blue-600 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg shrink-0">
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleStorePhoto(e.target.files?.[0] ?? null, 'payout')} />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <Field label="No. HP / WhatsApp Toko" value={loginPhone} onChange={setLoginPhone} placeholder="081234567890" />
              <div className="space-y-1.5">
                <Field label="Password" value={loginPass} onChange={setLoginPass} type="password" placeholder="Password toko" />
                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => {
                        setRememberMe(e.target.checked);
                        localStorage.setItem(STORE_REMEMBER_KEY, e.target.checked ? '1' : '0');
                      }}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span className="font-semibold">Ingat Saya</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setShowForgot(true);
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Lupa Password? Minta Reset ke Owner
                  </button>
                </div>
              </div>
              {loginCooldown > 0 && (
                <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Tunggu {loginCooldown} detik atau klik <b>Lupa Password? Minta Reset ke Owner</b>.
                </p>
              )}
            </div>
          )}

          <ErrorBox message={error} />

          <Btn
            onClick={isRegister ? doRegisterStore : doLoginStore}
            disabled={!isRegister && loginCooldown > 0}
            className="w-full !bg-blue-600 hover:!bg-blue-700"
          >
            {isRegister ? 'Daftar Toko Sekarang' : 'Masuk Dashboard Toko'}
          </Btn>

          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="w-full text-xs text-blue-600 font-semibold py-1"
          >
            {isRegister ? 'Sudah punya toko terdaftar? Masuk di sini' : 'Belum punya toko? Daftar Baru'}
          </button>

          <button type="button" onClick={onLogout} className="w-full text-xs text-slate-400 py-1">
            Kembali ke Beranda Customer
          </button>
        </div>
        {toast && <Toast message={toast} onClose={() => setToast('')} />}
      </div>
    );
  }

  const settings = loadSettings();

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <header className="bg-blue-700 text-white px-4 pt-4 pb-3 sticky top-0 z-30 shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-bold leading-tight truncate">{activeStore.name}</h1>
            <p className="text-[11px] text-blue-100 truncate">
              {activeStore.payout_account?.provider} {activeStore.payout_account?.accountNumber} · Diterima: {formatRupiah(totalStoreReceived)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative bg-white/15 hover:bg-white/25 p-2 rounded-xl"
              aria-label="Notifikasi Toko"
            >
              <Bell size={16} />
              {storeNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1.5 rounded-full">
                  {storeNotifCount}
                </span>
              )}
            </button>
            <button type="button" onClick={onLogout} className="bg-white/15 hover:bg-white/25 px-2.5 py-2 rounded-xl text-xs font-semibold">
              Beranda
            </button>
            <button type="button" onClick={logoutToForm} className="bg-white/15 hover:bg-white/25 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1">
              <LogOut size={14} /> Keluar
            </button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto grid grid-cols-5 gap-1 mt-3">
          {(
            [
              ['orders', 'Orderan', ClipboardList],
              ['menus', 'Menu', Utensils],
              ['ads', 'Iklan', Megaphone],
              ['finance', 'Keuangan', ShieldCheck],
              ['account', 'Rekening', Landmark],
            ] as const
          ).map(([k, lbl, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`py-2 px-1 rounded-xl text-[10px] sm:text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                tab === k ? 'bg-white text-blue-700 shadow' : 'bg-white/10 text-blue-50 hover:bg-white/20'
              }`}
            >
              <Icon size={12} />
              <span className="truncate">{lbl}</span>
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <ErrorBox message={error} onRetry={() => setError('')} />

        {activeStore.owner_note?.trim() && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-900">
            <b>Pesan Owner:</b> {activeStore.owner_note}
          </div>
        )}

        {/* TAB ORDERAN MAKANAN MASUK (SISTEM DRIVER TALANGIN DULU) */}
        {tab === 'orders' && (
          <section className="space-y-3">
            <h2 className="font-bold text-slate-900">Orderan Makanan Masuk ({orders.length})</h2>
            {orders.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400">
                Belum ada pesanan masuk untuk toko ini.
              </div>
            ) : (
              orders.map((o) => {
                const waitingDriverClaim = !o.driver_paid_store && !['Ditolak Toko', 'Dibatalkan', 'Dibuat', 'Driver Mengantar', 'Selesai'].includes(o.status);
                const waitingStoreConfirm = o.driver_paid_store && !o.store_confirmed_driver_paid && !['Ditolak Toko', 'Dibatalkan'].includes(o.status);

                return (
                  <div key={o.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/70 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-slate-900">{o.customer_name}</span>
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-blue-700 bg-blue-50">
                        {o.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 space-y-1">
                      {o.items.map((it, i) => (
                        <p key={i}>• {it.qty}x {it.name} — {formatRupiah(it.price * it.qty)}</p>
                      ))}
                      <p className="pt-1">Antar ke: <b>{o.delivery_address}</b> ({o.distance_km} km)</p>
                      <p>
                        Total Harga Makanan (100% dibayar Driver ke Toko):{' '}
                        <b className="text-emerald-700 tabular-nums">{formatRupiah(o.food_subtotal)}</b>
                      </p>
                    </div>

                    {/* Menunggu Driver menalangi ke Toko */}
                    {waitingDriverClaim && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700">
                        {o.driver_name
                          ? `Driver ${o.driver_name} sedang menuju toko untuk membayar talangan ${formatRupiah(o.food_subtotal)}.`
                          : `Menunggu Driver mengambil order & membayar talangan ${formatRupiah(o.food_subtotal)} ke Toko.`}
                      </div>
                    )}

                    {/* Driver sudah bayar talangan ke Toko -> Toko konfirmasi & buatkan pesanan */}
                    {waitingStoreConfirm && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-bold text-blue-900">
                          Driver {o.driver_name || 'Pengantar'} sudah bayar {formatRupiah(o.food_subtotal)} ({o.driver_paid_store_method || 'Cash'}), silakan buatkan pesanan!
                        </p>
                        {o.driver_paid_store_proof && (
                          <img
                            src={o.driver_paid_store_proof}
                            alt="Bukti Bayar Driver"
                            onClick={() => setZoomProofUrl(o.driver_paid_store_proof || null)}
                            className="w-16 h-16 rounded-lg object-cover border border-blue-300 cursor-pointer"
                          />
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <Btn variant="success" onClick={() => confirmDriverTalangan(o)} className="text-xs !py-2">
                            ✅ Uang Sudah Diterima dari Driver
                          </Btn>
                          <Btn variant="danger" onClick={() => rejectJastipOrder(o)} className="text-xs !py-2">
                            Tolak
                          </Btn>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setChatOrder(o)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5"
                      >
                        <MessageSquare size={14} /> Chat Customer
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* TAB MENU TOKO */}
        {tab === 'menus' && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Menu Toko ({menus.length})</h2>
                <p className="text-[11px] text-slate-500">Menu terkunci khusus untuk akun {activeStore.name}</p>
              </div>
              <Btn onClick={() => setMenuModalOpen(true)} className="!bg-blue-600 hover:!bg-blue-700 text-xs">
                <Plus size={14} className="inline mr-1" /> Tambah Menu
              </Btn>
            </div>

            <div className="space-y-2.5">
              {menus.map((m) => (
                <div key={m.id} className="bg-white rounded-2xl p-3 shadow-sm flex items-center gap-3">
                  <img
                    src={m.photo_url || FOOD_DEFAULT_IMAGES[m.category]}
                    alt={m.name}
                    className="w-20 h-16 rounded-xl object-cover shrink-0 bg-slate-100"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-900 truncate">{m.name}</p>
                    <p className="text-[11px] text-slate-500">{m.category} · Stok: <b className="tabular-nums">{m.stock}</b></p>
                    <p className="font-extrabold text-sm text-blue-600 tabular-nums">{formatRupiah(m.price)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => updateStock(m, -1)} className="w-7 h-7 rounded-lg bg-slate-100 font-bold text-slate-700">-</button>
                    <button type="button" onClick={() => updateStock(m, 1)} className="w-7 h-7 rounded-lg bg-slate-100 font-bold text-slate-700">+</button>
                    <button type="button" onClick={() => deleteMenu(m)} className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center ml-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB IKLAN TOKO (100% TRANSFER LANGSUNG KE REKENING OWNER) */}
        {tab === 'ads' && (
          <section className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Iklan Banner Beranda</h2>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${activeStore.ad_active && activeStore.ad_status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                {activeStore.ad_status === 'approved' ? 'IKLAN AKTIF' : activeStore.ad_status === 'pending' ? 'MENUNGGU ACC OWNER' : 'BELUM AKTIF'}
              </span>
            </div>

            <Field label="Judul Iklan" value={adTitle} onChange={setAdTitle} />
            <Field label="Subjudul / Promo" value={adSubtitle} onChange={setAdSubtitle} />

            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-600">Banner Iklan Toko</span>
              <img src={adBanner || activeStore.photo_url || DEFAULT_STORE_IMG} alt="Banner" className="w-full h-36 rounded-xl object-cover border border-slate-200" />
              <label className="inline-flex items-center gap-1.5 cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3.5 py-2 rounded-xl">
                <ImageIcon size={14} /> Ganti Gambar Iklan
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleStorePhoto(e.target.files?.[0] ?? null, 'ad')} />
              </label>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 text-xs text-blue-900 space-y-2">
              <p className="font-bold">
                Transfer Biaya Iklan 7 Hari: {formatRupiah(settings.finance.adPricePerWeek)} (100% Langsung ke Rekening Owner)
              </p>
              <p>
                Rekening Owner: <b>{settings.finance.ownerPayout.provider} {settings.finance.ownerPayout.accountNumber}</b> a/n <b>{settings.finance.ownerPayout.ownerName}</b>
              </p>
              <div className="bg-white border border-dashed border-blue-300 rounded-xl p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  {adProof ? (
                    <p className="text-emerald-700 font-bold truncate">✓ Bukti lolos AI: {adProof.fileName}</p>
                  ) : (
                    <p className="text-slate-600">Upload bukti transfer iklan (Cek AI Otomatis)</p>
                  )}
                </div>
                <label className="cursor-pointer bg-blue-600 text-white font-bold px-3 py-1.5 rounded-lg shrink-0">
                  {adCheckingProof ? 'Cek AI...' : 'Upload Bukti'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadAdProof(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </div>

            <Btn onClick={submitAdExtension} disabled={!adProof} className="w-full !bg-blue-600 hover:!bg-blue-700">
              {activeStore.ad_status === 'approved' ? 'Perpanjang Iklan 7 Hari' : 'Kirim Bukti & Ajukan Pasang Iklan'}
            </Btn>
          </section>
        )}

        {/* TAB PENJUALAN TOKO (100% MILIK TOKO, TANPA KOMISI) */}
        {tab === 'finance' && (
          <section className="space-y-4">
            <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-2">
              <p className="text-xs text-slate-300">Total Penjualan Diterima dari Driver (100% Penuh)</p>
              <p className="text-3xl font-extrabold text-emerald-300 tabular-nums">{formatRupiah(totalStoreReceived)}</p>
              <p className="text-xs text-slate-300">
                Toko menerima penuh 100% hasil penjualan tanpa potongan apapun.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">Riwayat Pembayaran Driver ke Toko ({financeHistory.length})</h3>
              {financeHistory.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Belum ada pembayaran masuk.</p>
              ) : (
                <div className="space-y-2.5">
                  {financeHistory.slice(0, financeLimit).map((item) => (
                    <div key={item.id} className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">
                            {item.customerName} {item.driverName ? `· Driver ${item.driverName}` : ''}
                          </p>
                          <p className="text-slate-500 truncate">{item.itemsLabel}</p>
                          <p className="text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString('id-ID')}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-extrabold text-emerald-700 tabular-nums">{formatRupiah(item.foodSubtotal)}</p>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${
                              item.paidByDriver
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {item.paidByDriver ? `Lunas 100% (${item.paymentMethod})` : 'Menunggu Driver'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {financeHistory.length > financeLimit && (
                    <button
                      type="button"
                      onClick={() => setFinanceLimit((l) => l + 10)}
                      className="w-full py-2.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl"
                    >
                      Muat 10 Lagi ({financeHistory.length - financeLimit} tersisa)
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB REKENING UTAMA TERKUNCI (GANTI / HAPUS LEWAT OWNER TANPA OTP) */}
        {tab === 'account' && (
          <section className="space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Landmark size={16} className="text-blue-700" /> Rekening Utama Toko
                </h2>
                <span className="bg-slate-900 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Lock size={10} /> Terkunci
                </span>
              </div>
              {activeStore.payout_account?.accountNumber ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                  <p>Bank / E-Wallet: <b>{activeStore.payout_account.provider}</b></p>
                  <p>Nomor: <b>{activeStore.payout_account.accountNumber}</b></p>
                  <p>Atas Nama: <b>{activeStore.payout_account.ownerName}</b></p>
                  {activeStore.payout_account.proofPhoto && (
                    <img
                      src={activeStore.payout_account.proofPhoto}
                      alt="Buku Rekening"
                      className="w-full h-28 object-cover rounded-lg mt-2 border"
                    />
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-3 text-slate-500">
                  Belum ada rekening tersimpan (silakan ajukan rekening baru di bawah).
                </div>
              )}
              {activeStore.payout_account?.pendingChange && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 space-y-0.5">
                  <p className="font-bold">
                    Menunggu ACC Owner ({activeStore.payout_account.pendingChange.action === 'delete' ? 'Hapus Rekening' : 'Ganti Rekening'}):
                  </p>
                  {activeStore.payout_account.pendingChange.action === 'delete' ? (
                    <p>Pengajuan penghapusan rekening utama.</p>
                  ) : (
                    <p>
                      Ke {activeStore.payout_account.pendingChange.provider}{' '}
                      {activeStore.payout_account.pendingChange.accountNumber} a/n{' '}
                      {activeStore.payout_account.pendingChange.ownerName}.
                    </p>
                  )}
                  {activeStore.payout_account.pendingChange.reason && (
                    <p className="text-[11px]">Alasan: <i>{activeStore.payout_account.pendingChange.reason}</i></p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">Ajukan Ganti Rekening (ACC Owner)</h3>
              <div className="flex flex-wrap gap-1.5">
                {PAYOUT_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setChgProvider(p)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                      chgProvider === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <Field label={`Nomor ${chgProvider} Baru`} value={chgNumber} onChange={setChgNumber} placeholder="08..." />
              <Field label="Nama Pemilik Baru" value={chgOwner} onChange={setChgOwner} placeholder="Sesuai buku rekening" />
              <div className="flex items-center justify-between bg-slate-50 border border-dashed border-slate-300 rounded-xl p-2.5 text-xs">
                <span>{chgProof ? 'Foto Rekening Baru siap' : 'Upload Foto Rekening / SS DANA Baru'}</span>
                <label className="cursor-pointer bg-blue-600 text-white font-bold px-3 py-1.5 rounded-lg">
                  Upload
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleStorePhoto(e.target.files?.[0] ?? null, 'chgPayout')} />
                </label>
              </div>
              <Field label="Alasan Ganti Rekening" value={chgReason} onChange={setChgReason} placeholder="Contoh: Ganti ke rekening DANA aktif" />
              <Btn onClick={submitChangeAccount} variant="success" className="w-full">
                Kirim ke Owner
              </Btn>
            </div>

            {activeStore.payout_account?.accountNumber && (
              <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
                {!showDelForm ? (
                  <button
                    type="button"
                    onClick={() => setShowDelForm(true)}
                    className="w-full py-2.5 px-4 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Trash2 size={14} /> Ajukan Hapus Rekening
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-xs font-bold text-red-700">Ajukan Hapus Rekening ke Owner</p>
                    <Field label="Alasan Hapus Rekening" value={delReason} onChange={setDelReason} placeholder="Tuliskan alasan hapus rekening..." />
                    <div className="grid grid-cols-2 gap-2">
                      <Btn variant="ghost" className="!bg-slate-100 !text-slate-700 text-xs" onClick={() => setShowDelForm(false)}>
                        Batal
                      </Btn>
                      <Btn variant="danger" className="text-xs" onClick={submitDeleteAccount}>
                        Kirim ke Owner
                      </Btn>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Modal Notifikasi Toko (Pagination 10 per load) */}
      {notifOpen && (
        <Modal title="Notifikasi Toko" onClose={() => setNotifOpen(false)}>
          <div className="space-y-2.5 max-h-[70vh] overflow-y-auto text-xs">
            {orders
              .filter((o) => o.driver_paid_store && !o.store_confirmed_driver_paid)
              .slice(0, 5)
              .map((o) => (
                <div key={o.id} className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="font-bold text-blue-900">
                    Driver {o.driver_name || 'Pengantar'} sudah bayar {formatRupiah(o.food_subtotal)}, silakan buatkan pesanan!
                  </p>
                </div>
              ))}
            {alerts.slice(0, notifLimit).map((a) => (
              <div key={a.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="font-bold text-slate-900">{a.title}</p>
                <p className="text-slate-600 mt-0.5">{a.message}</p>
              </div>
            ))}
            {alerts.length === 0 && orders.length === 0 && (
              <p className="text-center text-slate-400 py-4">Belum ada notifikasi baru.</p>
            )}
            {alerts.length > notifLimit && (
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

      {/* Modal Tambah Menu */}
      {menuModalOpen && (
        <Modal title="Tambah Menu Baru" onClose={() => setMenuModalOpen(false)}>
          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            <Field label="Nama Makanan / Minuman" value={mName} onChange={setMName} placeholder="Contoh: Seblak Tulang Komplit" />
            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1.5">Kategori</span>
              <div className="grid grid-cols-2 gap-2">
                {FOOD_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setMCat(cat);
                      setMPhoto(FOOD_DEFAULT_IMAGES[cat]);
                    }}
                    className={`py-2 rounded-xl border text-xs font-bold ${mCat === cat ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Harga (Rp)" value={mPrice} onChange={setMPrice} type="number" />
              <Field label="Stok" value={mStock} onChange={setMStock} type="number" />
            </div>
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-600">Foto Makanan</span>
              <div className="flex items-center gap-3">
                <img src={mPhoto} alt="Preview menu" className="w-16 h-14 rounded-xl object-cover border" />
                <label className="cursor-pointer bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-xl">
                  Upload Foto
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleStorePhoto(e.target.files?.[0] ?? null, 'menu')} />
                </label>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {FOOD_PHOTO_TEMPLATES.slice(0, 4).map((t) => (
                  <button key={t.id} type="button" onClick={() => setMPhoto(t.url)} className="shrink-0">
                    <img src={t.url} alt={t.label} className={`w-12 h-10 rounded-lg object-cover border-2 ${mPhoto === t.url ? 'border-blue-600' : 'border-transparent'}`} />
                  </button>
                ))}
              </div>
            </div>
            <Btn onClick={addMenu} className="w-full !bg-blue-600 hover:!bg-blue-700">Simpan Menu</Btn>
          </div>
        </Modal>
      )}

      {/* Modal Chat Customer */}
      {chatOrder && (
        <Modal title={`Chat: ${chatOrder.customer_name}`} onClose={() => setChatOrder(null)}>
          <ChatView
            order={{
              id: chatOrder.id,
              user_id: chatOrder.user_id,
              driver_id: chatOrder.driver_id,
              route_id: null,
              customer_name: chatOrder.customer_name,
              customer_phone: chatOrder.customer_phone,
              pickup: activeStore.name,
              destination: chatOrder.delivery_address,
              car_type: 'Order Makanan',
              price: chatOrder.total_price,
              payment_method: chatOrder.payment_method,
              status: chatOrder.status,
              is_carpool: false,
              rating: null,
              created_at: chatOrder.created_at,
            }}
            role="Driver"
            messages={messages}
            onSend={sendStoreChat}
            peerName={chatOrder.customer_name}
            peerSub={chatOrder.delivery_address}
            peerOnline={true}
            showPhone={false}
            fallbackLocation={activeStore.address}
          />
        </Modal>
      )}

      {/* Modal Zoom Bukti Transfer */}
      {zoomProofUrl && (
        <Modal title="Bukti Transfer Customer" onClose={() => setZoomProofUrl(null)}>
          <div className="space-y-3">
            <img src={zoomProofUrl} alt="Bukti Transfer" className="w-full max-h-[65vh] object-contain rounded-xl bg-slate-100" />
            <Btn onClick={() => setZoomProofUrl(null)} className="w-full !bg-blue-600">
              <XCircle size={14} className="inline mr-1" /> Tutup
            </Btn>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}
