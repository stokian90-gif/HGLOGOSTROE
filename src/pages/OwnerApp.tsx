import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  BarChart3,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Eye,
  Heart,
  Image as ImageIcon,
  IndianRupee,
  Landmark,
  Link2,
  Lock,
  LogOut,
  Megaphone,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Trash2,
  Unlock,
  Upload,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  AiAlertRow,
  CAR_TYPES,
  CarType,
  DriverRow,
  DriverStatus,
  JastipOrderRow,
  MenuItemRow,
  OrderRow,
  PAYOUT_PROVIDERS,
  PayoutAccount,
  RouteRow,
  SecurityLogRow,
  StoreRow,
  formatRupiah,
  getDriverStatus,
} from '@/lib/types';
import { Btn, ErrorBox, Field, Modal, Toast } from '@/components/ui';
import {
  DEFAULT_HERO_BANNER,
  DEFAULT_HERO_IMAGE,
  DEFAULT_STORE_IMG,
  HERO_PHOTO_TEMPLATES,
  HeroBannerSettings,
  ROUTE_PHOTO_TEMPLATES,
  TravelSettings,
  deleteRouteMeta,
  getDefaultRoutePhoto,
  loadSettings,
  readImageFileAsDataUrl,
  resolveRouteDisplay,
  saveRouteMeta,
  saveSettings,
  useRouteMetaMap,
  useTravelSettings,
} from '@/lib/settings';
import { buildOwnerAiReport } from '@/lib/aiHelper';
import {
  clearFailedLoginAttempts,
  evaluatePasswordStrength,
  getCurrentLocationLabel,
  getLoginCooldownSeconds,
  getOwnerSecurityState,
  hashPassword,
  isPasswordInHistory,
  logSecurityActivity,
  pushAiAlert,
  recordFailedLoginAttempt,
  saveOwnerSecurityState,
  verifyOwnerPin,
} from '@/lib/securityAi';
import { playTingSound } from '@/lib/sound';
import ForgotPasswordFlow from '@/components/ForgotPasswordFlow';

const ETA_PRESETS = ['15-20 mnt', '20-30 mnt', '30-45 mnt', '45+ mnt'] as const;
const OWNER_SESSION_VER_KEY = 'ti_owner_session_ver';

type OwnerTab =
  | 'dash'
  | 'drivers'
  | 'stores'
  | 'jastip'
  | 'orders'
  | 'routes'
  | 'finance'
  | 'history'
  | 'security'
  | 'hero'
  | 'settings';

function parseRouteName(raw: string): { origin: string; destination: string } | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const sepMatch = cleaned.match(/^(.+?)\s*(?:-|→|->)\s*(.+)$/);
  if (sepMatch) {
    const origin = sepMatch[1].trim();
    const destination = sepMatch[2].trim();
    if (origin.length >= 2 && destination.length >= 2) {
      return { origin, destination };
    }
    return null;
  }
  if (cleaned.length < 3) return null;
  return { origin: 'Haurgeulis', destination: cleaned };
}

export default function OwnerApp({ onLogout }: { onLogout: () => void }) {
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [resetNotice, setResetNotice] = useState<{ banner: string; waAlert: string } | null>(null);
  const [loginCooldown, setLoginCooldown] = useState(0);
  const [secFilter, setSecFilter] = useState<'all' | 'auth' | 'critical'>('all');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [jastipOrders, setJastipOrders] = useState<JastipOrderRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [menus, setMenus] = useState<MenuItemRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityLogRow[]>([]);
  const [aiAlerts, setAiAlerts] = useState<AiAlertRow[]>([]);

  const [tab, setTab] = useState<OwnerTab>('dash');
  const [historyLimit, setHistoryLimit] = useState(10);
  const [secLogLimit, setSecLogLimit] = useState(10);
  const [notifOpen, setNotifOpen] = useState(false);
  const [zoomProofUrl, setZoomProofUrl] = useState<string | null>(null);

  // Driver management state
  const [driverFilter, setDriverFilter] = useState<'all' | DriverStatus>('all');
  const [detailDriver, setDetailDriver] = useState<DriverRow | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [editPhoneDraft, setEditPhoneDraft] = useState('');
  const [editPlateDraft, setEditPlateDraft] = useState('');
  const [approveTarget, setApproveTarget] = useState<DriverRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DriverRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DriverRow | null>(null);

  // Reset password Driver / Toko oleh Owner
  const [resetPwDraft, setResetPwDraft] = useState('');
  const [resetPwError, setResetPwError] = useState('');
  const [resettingPw, setResettingPw] = useState(false);

  // Store & Ad management state
  const [storeFilter, setStoreFilter] = useState<'all' | DriverStatus | 'ads'>('all');
  const [detailStore, setDetailStore] = useState<StoreRow | null>(null);
  const [storeNoteDraft, setStoreNoteDraft] = useState('');
  const [rejectStoreTarget, setRejectStoreTarget] = useState<StoreRow | null>(null);
  const [rejectStoreReason, setRejectStoreReason] = useState('');

  // Kelola Rute modal state
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteRow | null>(null);
  const [routeNameDraft, setRouteNameDraft] = useState('');
  const [routeEtaDraft, setRouteEtaDraft] = useState('15-20 mnt');
  const [routeTypeDraft, setRouteTypeDraft] = useState<CarType>('Ekonomi');
  const [routePriceDraft, setRoutePriceDraft] = useState('');
  const [routePhotoDraft, setRoutePhotoDraft] = useState('');
  const [routePhotoTab, setRoutePhotoTab] = useState<'upload' | 'template' | 'url'>('template');
  const [routePreviewOpen, setRoutePreviewOpen] = useState(false);
  const [deleteRouteTarget, setDeleteRouteTarget] = useState<RouteRow | null>(null);

  // Pengaturan, Komisi & AI, Rekening Owner, Hero Banner
  const liveSettings = useTravelSettings();
  const [settings, setSettings] = useState<TravelSettings>(loadSettings);
  const [nameDraft, setNameDraft] = useState('');
  const [taglineDraft, setTaglineDraft] = useState('');
  const [settingsError, setSettingsError] = useState('');

  const [regFeeDraft, setRegFeeDraft] = useState(String(liveSettings.finance.driverRegistrationFee ?? 50000));
  const [aiRateDraft, setAiRateDraft] = useState(String(liveSettings.finance.aiRatePerKm));
  const [adPriceDraft, setAdPriceDraft] = useState(String(liveSettings.finance.adPricePerWeek));
  const [ownerPayoutDraft, setOwnerPayoutDraft] = useState<PayoutAccount>(() => loadSettings().finance.ownerPayout);

  const [heroDraft, setHeroDraft] = useState<HeroBannerSettings>(() => loadSettings().heroBanner);
  const [heroPhotoTab, setHeroPhotoTab] = useState<'upload' | 'template' | 'url'>('template');
  const [heroPreviewOpen, setHeroPreviewOpen] = useState(false);

  const routeMetaMap = useRouteMetaMap();
  const prevAlertRef = useRef(-1);

  const loadAll = useCallback(async () => {
    try {
      const [r1, r2, r3, r4, r5, r6, r7, r8] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(120),
        supabase.from('drivers').select('*').order('created_at', { ascending: false }),
        supabase.from('routes').select('*').order('origin'),
        supabase.from('stores').select('*').order('created_at', { ascending: false }),
        supabase.from('jastip_orders').select('*').order('created_at', { ascending: false }).limit(120),
        supabase.from('menu_items').select('*').order('created_at', { ascending: false }),
        supabase.from('security_logs').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('ai_alerts').select('*').eq('target_role', 'owner').order('created_at', { ascending: false }).limit(60),
      ]);
      if (r1.error || r2.error || r3.error) throw new Error('x');
      setOrders((r1.data as OrderRow[]) || []);
      const driverRows = (r2.data as DriverRow[]) || [];
      setDrivers(driverRows);
      setDetailDriver((prev) => (prev ? driverRows.find((x) => x.id === prev.id) ?? null : null));
      setRoutes((r3.data as RouteRow[]) || []);
      const storeRows = (r4.data as StoreRow[]) || [];
      setStores(storeRows);
      setDetailStore((prev) => (prev ? storeRows.find((x) => x.id === prev.id) ?? null : null));
      setJastipOrders((r5.data as JastipOrderRow[]) || []);
      setMenus((r6.data as MenuItemRow[]) || []);
      setSecurityLogs((r7.data as SecurityLogRow[]) || []);
      setAiAlerts((r8.data as AiAlertRow[]) || []);
      setError('');
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadAll();
    const ch = supabase
      .channel('owner-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jastip_orders' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_logs' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_alerts' }, loadAll)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [authed, loadAll]);

  const ownerAlertSignal = useMemo(
    () => aiAlerts.filter((a) => !a.is_read).length,
    [aiAlerts],
  );

  useEffect(() => {
    if (!authed) return;
    if (prevAlertRef.current >= 0 && ownerAlertSignal > prevAlertRef.current) {
      playTingSound();
    }
    prevAlertRef.current = ownerAlertSignal;
  }, [ownerAlertSignal, authed]);

  const openSettings = () => {
    const s = loadSettings();
    setNameDraft(s.travelName);
    setTaglineDraft(s.tagline);
    setSettingsError('');
    setTab('settings');
  };

  const openHeroTab = () => {
    const s = loadSettings();
    setHeroDraft({ ...s.heroBanner });
    setSettingsError('');
    setTab('hero');
  };

  const openFinanceTab = () => {
    const s = loadSettings();
    setRegFeeDraft(String(s.finance.driverRegistrationFee ?? 50000));
    setAiRateDraft(String(s.finance.aiRatePerKm));
    setAdPriceDraft(String(s.finance.adPricePerWeek));
    setOwnerPayoutDraft({ ...s.finance.ownerPayout });
    setTab('finance');
  };

  const completeOwnerLogin = async () => {
    const sec = getOwnerSecurityState(liveSettings.finance.ownerPayout.accountNumber || '085612340000');
    saveOwnerSecurityState({ ...sec, lastLocation: getCurrentLocationLabel() });
    localStorage.setItem(OWNER_SESSION_VER_KEY, String(sec.sessionVersion));
    localStorage.setItem('ti_owner', '1');
    setError('');
    setResetNotice(null);
    setAuthed(true);
    await logSecurityActivity({
      actorName: 'Owner',
      role: 'Owner',
      action: 'Login Owner berhasil',
      severity: 'info',
    });
  };

  const login = async () => {
    const cd = getLoginCooldownSeconds('owner_admin');
    if (cd > 0) {
      setLoginCooldown(cd);
      return setError(`Password salah 3x, coba Lupa Password? atau tunggu 1 menit (${cd} dtk)`);
    }

    if (username.trim() !== 'admin' && username.trim() !== 'owner') {
      return setError('Username salah (gunakan: admin)');
    }

    const fallbackPhone = liveSettings.finance.ownerPayout.accountNumber || '085612340000';
    const validPin = await verifyOwnerPin(pin, fallbackPhone);
    if (!validPin) {
      const failRes = recordFailedLoginAttempt('owner_admin');
      if (failRes.cooldownSeconds > 0) {
        setLoginCooldown(failRes.cooldownSeconds);
      }
      await logSecurityActivity({
        actorName: username.trim() || 'Unknown',
        role: 'Owner',
        action:
          failRes.cooldownSeconds > 0
            ? 'Percobaan login Owner gagal 3x berturut-turut (jeda 1 menit)'
            : 'Percobaan login Owner gagal (PIN/Password salah)',
        severity: 'critical',
      });
      return setError(failRes.message);
    }

    clearFailedLoginAttempts('owner_admin');
    setLoginCooldown(0);
    await completeOwnerLogin();
  };

  useEffect(() => {
    if (loginCooldown <= 0) return;
    const t = setInterval(() => setLoginCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [loginCooldown]);

  useEffect(() => {
    const syncOwnerSession = () => {
      if (localStorage.getItem('ti_owner') !== '1') return;
      const sec = getOwnerSecurityState();
      const savedVer = localStorage.getItem(OWNER_SESSION_VER_KEY);
      if (savedVer && savedVer !== String(sec.sessionVersion)) {
        localStorage.removeItem('ti_owner');
        localStorage.removeItem(OWNER_SESSION_VER_KEY);
        setAuthed(false);
        setError('Sesi Owner dihentikan karena password baru saja diubah dari perangkat lain.');
        return;
      }
      setAuthed(true);
    };
    syncOwnerSession();
    window.addEventListener('ti_owner_sec_changed', syncOwnerSession);
    window.addEventListener('storage', syncOwnerSession);
    return () => {
      window.removeEventListener('ti_owner_sec_changed', syncOwnerSession);
      window.removeEventListener('storage', syncOwnerSession);
    };
  }, []);

  const logout = () => {
    localStorage.removeItem('ti_owner');
    localStorage.removeItem(OWNER_SESSION_VER_KEY);
    setAuthed(false);
    onLogout();
  };

  // === Driver Actions ===
  const openDriverDetail = (drv: DriverRow) => {
    setDetailDriver(drv);
    setNoteDraft(drv.owner_note ?? '');
    setEditPhoneDraft(drv.phone ?? '');
    setEditPlateDraft(drv.plate ?? '');
    setResetPwDraft('');
    setResetPwError('');
  };

  const saveDriverNote = async () => {
    if (!detailDriver) return;
    try {
      const cleanNote = noteDraft.trim() || null;
      const { error: e } = await supabase
        .from('drivers')
        .update({ owner_note: cleanNote })
        .eq('id', detailDriver.id);
      if (e) throw new Error('x');
      setToast('Note untuk driver disimpan');
      await loadAll();
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  };

  const saveDriverLockedFields = async () => {
    if (!detailDriver) return;
    const cleanPhone = editPhoneDraft.replace(/[\s-]/g, '');
    const cleanPlate = editPlateDraft.trim().toUpperCase();
    if (!/^0\d{8,14}$/.test(cleanPhone)) {
      return setError('Nomor WhatsApp driver harus format 08... yang valid');
    }
    if (cleanPlate.length < 4) {
      return setError('Plat nomor minimal 4 karakter');
    }
    try {
      const duplicatePhone = drivers.some((d) => d.id !== detailDriver.id && d.phone === cleanPhone);
      if (duplicatePhone) return setError('Nomor WhatsApp tersebut sudah digunakan driver lain');
      const duplicatePlate = drivers.some(
        (d) => d.id !== detailDriver.id && d.plate.trim().toUpperCase() === cleanPlate,
      );
      if (duplicatePlate) return setError('Plat nomor tersebut sudah terdaftar pada driver lain');

      const { error: e } = await supabase
        .from('drivers')
        .update({ phone: cleanPhone, plate: cleanPlate })
        .eq('id', detailDriver.id);
      if (e) throw new Error('x');
      setError('');
      setToast('WA & Plat Nomor driver berhasil diubah oleh Owner');
      await loadAll();
    } catch {
      setError('Gagal memperbarui data driver');
    }
  };

  const markDriverCashPaid = async (drv: DriverRow) => {
    try {
      const { error: e } = await supabase
        .from('drivers')
        .update({ registration_fee_paid: true })
        .eq('id', drv.id);
      if (e) throw new Error('x');
      await logSecurityActivity({
        actorName: 'Owner',
        role: 'Owner',
        action: `Owner konfirmasi terima Cash pendaftaran Rp 50.000 dari Driver ${drv.name}`,
        severity: 'info',
      });
      setToast(`Pembayaran Cash Rp 50.000 dari ${drv.name} dicatat diterima!`);
      await loadAll();
    } catch {
      setError('Gagal mencatat pembayaran Cash driver');
    }
  };

  const resolveDriverPayoutChange = async (drv: DriverRow, approve: boolean) => {
    const chg = drv.payout_account?.pendingChange;
    if (!chg) return;
    const isDelete = chg.action === 'delete';
    const nextPayout: PayoutAccount = approve
      ? isDelete
        ? {
            provider: 'DANA',
            accountNumber: '',
            ownerName: '',
            proofPhoto: null,
            qrImage: null,
            locked: true,
            pendingChange: null,
          }
        : {
            provider: chg.provider,
            accountNumber: chg.accountNumber,
            ownerName: chg.ownerName,
            proofPhoto: chg.proofPhoto,
            qrImage: drv.payout_account?.qrImage ?? null,
            locked: true,
            pendingChange: null,
          }
      : {
          ...drv.payout_account,
          pendingChange: null,
        };
    await supabase.from('drivers').update({ payout_account: nextPayout }).eq('id', drv.id);
    await logSecurityActivity({
      actorName: 'Owner',
      role: 'Owner',
      action: `${approve ? 'ACC' : 'Tolak'} ${isDelete ? 'penghapusan' : 'perubahan'} rekening Driver ${drv.name}`,
      severity: 'info',
    });
    await pushAiAlert({
      targetRole: 'driver',
      targetId: drv.id,
      title: approve
        ? isDelete
          ? 'Penghapusan Rekening Disetujui Owner'
          : 'Penggantian Rekening Disetujui Owner'
        : 'Pengajuan Rekening Ditolak Owner',
      message: approve
        ? isDelete
          ? 'Owner menyetujui penghapusan rekening lama. Silakan isi rekening baru di menu Profil.'
          : `Rekening baru ${chg.provider} ${chg.accountNumber} disetujui Owner.`
        : `Pengajuan ${isDelete ? 'hapus' : 'ganti'} rekening ditolak oleh Owner.`,
      category: 'payment',
    });
    setToast(
      approve
        ? `${isDelete ? 'Penghapusan' : 'Rekening baru'} ${drv.name} disetujui!`
        : `Pengajuan rekening ${drv.name} ditolak.`,
    );
    await loadAll();
  };

  const confirmApproveDriver = async () => {
    if (!approveTarget) return;
    try {
      const { error: e } = await supabase
        .from('drivers')
        .update({ status: 'approved', registration_fee_paid: true, rejection_reason: null })
        .eq('id', approveTarget.id);
      if (e) throw new Error('x');
      await logSecurityActivity({
        actorName: 'Owner',
        role: 'Owner',
        action: `Owner menyetujui & mengaktifkan Driver ${approveTarget.name} (Biaya daftar Rp 50.000 lunas)`,
        severity: 'info',
      });
      await pushAiAlert({
        targetRole: 'driver',
        targetId: approveTarget.id,
        title: 'Selamat! Kamu resmi jadi Driver WONG HAURGEULIS!',
        message: 'Selamat! Kamu resmi jadi Driver WONG HAURGEULIS! Silakan Masuk Dashboard!',
        category: 'info',
      });
      setToast(`Driver ${approveTarget.name} disetujui & aktif!`);
      setApproveTarget(null);
      await loadAll();
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  };

  const confirmRejectDriver = async () => {
    if (!rejectTarget) return;
    const reasonText = rejectReason.trim();
    try {
      const { error: e } = await supabase
        .from('drivers')
        .update({
          status: 'rejected',
          is_online: false,
          rejection_reason: reasonText || null,
        })
        .eq('id', rejectTarget.id);
      if (e) throw new Error('x');
      await pushAiAlert({
        targetRole: 'driver',
        targetId: rejectTarget.id,
        title: 'Pendaftaran Driver Ditolak Owner',
        message: `${reasonText ? `Alasan: ${reasonText}. ` : ''}Jika sudah transfer Rp 50.000, pengembalian dana diproses manual oleh Owner via WA.`,
        category: 'info',
      });
      setToast(`Pendaftaran ${rejectTarget.name} ditolak`);
      setRejectTarget(null);
      setRejectReason('');
      await loadAll();
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  };

  const toggleBlockDriver = async (drv: DriverRow) => {
    const curr = getDriverStatus(drv);
    const nextStatus: DriverStatus = curr === 'blocked' ? 'approved' : 'blocked';
    try {
      const { error: e } = await supabase
        .from('drivers')
        .update({
          status: nextStatus,
          is_online: nextStatus === 'blocked' ? false : drv.is_online,
          owner_note:
            nextStatus === 'blocked'
              ? drv.owner_note || 'Akun diblokir oleh Owner'
              : drv.owner_note,
        })
        .eq('id', drv.id);
      if (e) throw new Error('x');
      setToast(
        nextStatus === 'blocked'
          ? `Driver ${drv.name} berhasil diblokir`
          : `Blokir driver ${drv.name} dibuka kembali`,
      );
      await loadAll();
    } catch {
      setError('Gagal mengubah status blokir driver');
    }
  };

  const confirmDeleteDriver = async () => {
    if (!deleteTarget) return;
    try {
      await supabase.from('drivers').delete().eq('id', deleteTarget.id);
      setToast('Driver dihapus');
      setDeleteTarget(null);
      if (detailDriver?.id === deleteTarget.id) setDetailDriver(null);
      loadAll();
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  };

  // === Store & Ad Actions ===
  const openStoreDetail = (st: StoreRow) => {
    setDetailStore(st);
    setStoreNoteDraft(st.owner_note ?? '');
    setResetPwDraft('');
    setResetPwError('');
  };

  // === Owner Reset Password Driver / Toko ===
  const ownerResetAccountPassword = async (role: 'Driver' | 'Toko', target: DriverRow | StoreRow) => {
    const pwd = resetPwDraft.trim();
    const strength = evaluatePasswordStrength(pwd);
    if (!strength.valid) {
      return setResetPwError(strength.reason || 'Password minimal 6 karakter (kombinasi huruf + angka).');
    }
    setResettingPw(true);
    setResetPwError('');
    try {
      const reused = await isPasswordInHistory(pwd, target.password, target.password_history || []);
      if (reused) {
        setResetPwError('Ditolak AI: Password baru tidak boleh sama dengan 3 password terakhir.');
        return;
      }
      const hashed = await hashPassword(pwd);
      const nextHistory = Array.from(
        new Set([...(target.password_history || []), ...(target.password ? [target.password] : []), hashed]),
      ).slice(-3);
      const nextVer = Date.now();
      const table = role === 'Driver' ? 'drivers' : 'stores';
      const { error: e } = await supabase
        .from(table)
        .update({
          password: hashed,
          password_history: nextHistory,
          session_version: nextVer,
          password_reset_requested_at: null,
        })
        .eq('id', target.id);
      if (e) throw new Error('x');

      await logSecurityActivity({
        actorName: 'Owner',
        role: 'Owner',
        action: `Owner mereset password ${role} ${target.name} (${target.phone})`,
        severity: 'warning',
      });
      await pushAiAlert({
        targetRole: role === 'Driver' ? 'driver' : 'store',
        targetId: target.id,
        title: `Password ${role} direset oleh Owner`,
        message: `Password baru akun ${role} ${target.name} dari Owner: ${pwd}. Silakan login kembali.`,
        category: 'password_reset',
      });
      setResetPwDraft('');
      setToast(`Password ${role} ${target.name} berhasil direset! Notif masuk ke akun ${role}.`);
      await loadAll();
    } catch {
      setResetPwError('Gagal mereset password, coba lagi.');
    } finally {
      setResettingPw(false);
    }
  };

  const saveStoreNote = async () => {
    if (!detailStore) return;
    await supabase
      .from('stores')
      .update({ owner_note: storeNoteDraft.trim() || null })
      .eq('id', detailStore.id);
    setToast('Note toko disimpan');
    await loadAll();
  };

  const resolveStorePayoutChange = async (st: StoreRow, approve: boolean) => {
    const chg = st.payout_account?.pendingChange;
    if (!chg) return;
    const isDelete = chg.action === 'delete';
    const nextPayout: PayoutAccount = approve
      ? isDelete
        ? {
            provider: 'DANA',
            accountNumber: '',
            ownerName: '',
            proofPhoto: null,
            qrImage: null,
            locked: true,
            pendingChange: null,
          }
        : {
            provider: chg.provider,
            accountNumber: chg.accountNumber,
            ownerName: chg.ownerName,
            proofPhoto: chg.proofPhoto,
            qrImage: st.payout_account?.qrImage ?? null,
            locked: true,
            pendingChange: null,
          }
      : {
          ...st.payout_account,
          pendingChange: null,
        };
    await supabase.from('stores').update({ payout_account: nextPayout }).eq('id', st.id);
    await logSecurityActivity({
      actorName: 'Owner',
      role: 'Owner',
      action: `${approve ? 'ACC' : 'Tolak'} ${isDelete ? 'penghapusan' : 'perubahan'} rekening Toko ${st.name}`,
      severity: 'info',
    });
    await pushAiAlert({
      targetRole: 'store',
      targetId: st.id,
      title: approve
        ? isDelete
          ? 'Penghapusan Rekening Disetujui Owner'
          : 'Penggantian Rekening Disetujui Owner'
        : 'Pengajuan Rekening Ditolak Owner',
      message: approve
        ? isDelete
          ? 'Owner menyetujui penghapusan rekening lama toko. Silakan isi rekening baru di Profil Toko.'
          : `Rekening baru toko ${chg.provider} ${chg.accountNumber} disetujui Owner.`
        : `Pengajuan ${isDelete ? 'hapus' : 'ganti'} rekening toko ditolak oleh Owner.`,
      category: 'payment',
    });
    setToast(
      approve
        ? `${isDelete ? 'Penghapusan' : 'Rekening baru'} ${st.name} disetujui!`
        : `Pengajuan rekening ${st.name} ditolak.`,
    );
    await loadAll();
  };

  const approveStore = async (st: StoreRow) => {
    await supabase.from('stores').update({ status: 'approved', rejection_reason: null }).eq('id', st.id);
    setToast(`Toko ${st.name} disetujui!`);
    await loadAll();
  };

  const confirmRejectStore = async () => {
    if (!rejectStoreTarget) return;
    await supabase
      .from('stores')
      .update({
        status: 'rejected',
        ad_active: false,
        rejection_reason: rejectStoreReason.trim() || null,
      })
      .eq('id', rejectStoreTarget.id);
    setToast(`Toko ${rejectStoreTarget.name} ditolak`);
    setRejectStoreTarget(null);
    setRejectStoreReason('');
    await loadAll();
  };

  const toggleBlockStore = async (st: StoreRow) => {
    const curr = getDriverStatus(st);
    const next: DriverStatus = curr === 'blocked' ? 'approved' : 'blocked';
    await supabase
      .from('stores')
      .update({
        status: next,
        ad_active: next === 'blocked' ? false : st.ad_active,
      })
      .eq('id', st.id);
    setToast(next === 'blocked' ? `Toko ${st.name} diblokir` : `Blokir toko ${st.name} dibuka`);
    await loadAll();
  };

  const approveStoreAd = async (st: StoreRow) => {
    const nextExpiry = st.ad_expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('stores')
      .update({
        ad_status: 'approved',
        ad_active: true,
        ad_expires_at: nextExpiry,
      })
      .eq('id', st.id);
    setToast(`Iklan ${st.name} disetujui & langsung tayang di Beranda Customer!`);
    await loadAll();
  };

  const rejectStoreAd = async (st: StoreRow) => {
    await supabase.from('stores').update({ ad_status: 'rejected', ad_active: false }).eq('id', st.id);
    setToast(`Iklan ${st.name} ditolak / dinonaktifkan`);
    await loadAll();
  };

  // === Kelola Order Makanan ===
  const markJastipDone = async (ord: JastipOrderRow) => {
    await supabase
      .from('jastip_orders')
      .update({ status: 'Selesai', customer_paid_driver: true })
      .eq('id', ord.id);
    setToast('Order Makanan ditandai Selesai!');
    await loadAll();
  };

  const cancelJastipOrder = async (ord: JastipOrderRow) => {
    await supabase.from('jastip_orders').update({ status: 'Dibatalkan' }).eq('id', ord.id);
    setToast('Order Makanan dibatalkan');
    await loadAll();
  };

  // === Kelola Rute handlers ===
  const openAddRoute = () => {
    setEditingRoute(null);
    setRouteNameDraft('');
    setRouteEtaDraft('15-20 mnt');
    setRouteTypeDraft('Ekonomi');
    setRoutePriceDraft('100000');
    setRoutePhotoDraft(ROUTE_PHOTO_TEMPLATES[0].url);
    setRoutePhotoTab('template');
    setRoutePreviewOpen(false);
    setError('');
    setRouteModalOpen(true);
  };

  const openEditRoute = (r: RouteRow, initialPhotoTab: 'upload' | 'template' | 'url' = 'template') => {
    const disp = resolveRouteDisplay(r, routeMetaMap);
    const currentPrice =
      disp.defaultCarType === 'Premium'
        ? r.price_premium
        : disp.defaultCarType === 'Nyaman'
          ? r.price_comfort
          : r.price_economy;

    setEditingRoute(r);
    setRouteNameDraft(`${r.origin} - ${r.destination}`);
    setRouteEtaDraft(disp.etaText);
    setRouteTypeDraft(disp.defaultCarType);
    setRoutePriceDraft(String(currentPrice));
    setRoutePhotoDraft(disp.imageUrl);
    setRoutePhotoTab(initialPhotoTab);
    setRoutePreviewOpen(false);
    setError('');
    setRouteModalOpen(true);
  };

  const onRouteTypeChange = (nextType: CarType) => {
    setRouteTypeDraft(nextType);
    if (editingRoute) {
      const nextPrice =
        nextType === 'Premium'
          ? editingRoute.price_premium
          : nextType === 'Nyaman'
            ? editingRoute.price_comfort
            : editingRoute.price_economy;
      setRoutePriceDraft(String(nextPrice));
    }
  };

  const onRoutePhotoUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setRoutePhotoDraft(dataUrl);
      setError('');
      setToast('Foto rute siap, klik Simpan untuk menerapkan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membaca foto');
    }
  };

  const saveRouteForm = async () => {
    const parsed = parseRouteName(routeNameDraft);
    if (!parsed) return setError('Isi Nama Rute dengan format contoh: Haurgeulis - Bandung');
    const priceNum = parseInt(routePriceDraft, 10);
    if (isNaN(priceNum) || priceNum < 1000) return setError('Harga minimal Rp 1.000');
    const etaClean = routeEtaDraft.trim() || '15-20 mnt';
    const photoClean = routePhotoDraft.trim() || getDefaultRoutePhoto(parsed);

    const economy =
      routeTypeDraft === 'Ekonomi'
        ? priceNum
        : editingRoute
          ? editingRoute.price_economy
          : Math.max(5000, Math.round((priceNum * 0.8) / 1000) * 1000);
    const comfort =
      routeTypeDraft === 'Nyaman'
        ? priceNum
        : editingRoute
          ? editingRoute.price_comfort
          : Math.max(5000, Math.round((priceNum * 1.25) / 1000) * 1000);
    const premium =
      routeTypeDraft === 'Premium'
        ? priceNum
        : editingRoute
          ? editingRoute.price_premium
          : Math.max(5000, Math.round((priceNum * 1.6) / 1000) * 1000);

    setError('');
    try {
      if (editingRoute) {
        const fullPatch = {
          origin: parsed.origin,
          destination: parsed.destination,
          price_economy: economy,
          price_comfort: comfort,
          price_premium: premium,
          image_url: photoClean,
          eta_text: etaClean,
          default_car_type: routeTypeDraft,
        };
        const res = await supabase.from('routes').update(fullPatch).eq('id', editingRoute.id);
        if (res.error) {
          const fallbackRes = await supabase
            .from('routes')
            .update({
              origin: parsed.origin,
              destination: parsed.destination,
              price_economy: economy,
              price_comfort: comfort,
              price_premium: premium,
            })
            .eq('id', editingRoute.id);
          if (fallbackRes.error) throw new Error('x');
        }
        saveRouteMeta(editingRoute.id, {
          imageUrl: photoClean,
          etaText: etaClean,
          defaultCarType: routeTypeDraft,
        });
        setToast('Rute & foto diperbarui!');
      } else {
        const fullInsert = {
          origin: parsed.origin,
          destination: parsed.destination,
          price_economy: economy,
          price_comfort: comfort,
          price_premium: premium,
          is_active: true,
          image_url: photoClean,
          eta_text: etaClean,
          default_car_type: routeTypeDraft,
        };
        let createdRes = await supabase.from('routes').insert(fullInsert).select().single();
        if (createdRes.error) {
          createdRes = await supabase
            .from('routes')
            .insert({
              origin: parsed.origin,
              destination: parsed.destination,
              price_economy: economy,
              price_comfort: comfort,
              price_premium: premium,
              is_active: true,
            })
            .select()
            .single();
        }
        if (createdRes.error || !createdRes.data) throw new Error('x');
        const created = createdRes.data as RouteRow;
        saveRouteMeta(created.id, {
          imageUrl: photoClean,
          etaText: etaClean,
          defaultCarType: routeTypeDraft,
        });
        setToast('Rute baru ditambahkan!');
      }
      setRouteModalOpen(false);
      setEditingRoute(null);
      await loadAll();
    } catch {
      setError('Gagal menyimpan rute, coba periksa ukuran foto atau koneksi');
    }
  };

  const confirmDeleteRoute = async () => {
    if (!deleteRouteTarget) return;
    try {
      await supabase.from('routes').delete().eq('id', deleteRouteTarget.id);
      deleteRouteMeta(deleteRouteTarget.id);
      setDeleteRouteTarget(null);
      setToast('Rute dihapus');
      loadAll();
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  };

  // === Tarif AI, Biaya Daftar Driver & Rekening Utama Owner ===
  const saveFinanceSettings = () => {
    const regFee = Number(regFeeDraft);
    const rate = Number(aiRateDraft);
    const adPrice = Number(adPriceDraft);
    if (isNaN(regFee) || regFee < 5000) return setError('Biaya Pendaftaran Driver minimal Rp 5.000');
    if (isNaN(rate) || rate < 1000) return setError('Tarif Ongkir AI minimal Rp 1.000/km');
    if (isNaN(adPrice) || adPrice < 5000) return setError('Biaya Iklan minimal Rp 5.000');
    if (ownerPayoutDraft.accountNumber.trim().length < 5) return setError('Nomor Rekening Owner wajib diisi');

    const s = loadSettings();
    const ok = saveSettings({
      ...s,
      finance: {
        ...s.finance,
        travelCommissionPercent: 0,
        jastipCommissionPercent: 0,
        driverRegistrationFee: Math.round(regFee),
        aiRatePerKm: Math.round(rate),
        adPricePerWeek: Math.round(adPrice),
        ownerPayout: {
          ...ownerPayoutDraft,
          accountNumber: ownerPayoutDraft.accountNumber.trim(),
          ownerName: ownerPayoutDraft.ownerName.trim() || 'Owner WONG HAURGEULIS',
          locked: true,
          pendingChange: null,
        },
      },
    });
    if (!ok) return setError('Gagal menyimpan pengaturan');
    setSettings(loadSettings());
    setError('');
    setToast('Biaya Pendaftaran, Tarif AI & Rekening Utama Owner disimpan!');
  };

  const onOwnerPayoutPhoto = async (file: File | null, kind: 'proof' | 'qr') => {
    if (!file) return;
    try {
      const url = await readImageFileAsDataUrl(file);
      setOwnerPayoutDraft((p) => (kind === 'proof' ? { ...p, proofPhoto: url } : { ...p, qrImage: url }));
      setToast(kind === 'proof' ? 'Foto rekening Owner dipilih' : 'Gambar QR DANA Owner dipilih');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membaca foto');
    }
  };

  // === Hero Banner & Pengaturan ===
  const onHeroPhotoUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setHeroDraft((prev) => ({ ...prev, imageUrl: dataUrl }));
      setSettingsError('');
      setToast('Foto Hero siap, klik Simpan untuk menerapkan');
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Gagal membaca foto');
    }
  };

  const saveHeroBanner = () => {
    const clean: HeroBannerSettings = {
      topLabel: heroDraft.topLabel.trim() || DEFAULT_HERO_BANNER.topLabel,
      titleLine1: heroDraft.titleLine1.trim() || DEFAULT_HERO_BANNER.titleLine1,
      titleLine2: heroDraft.titleLine2.trim() || DEFAULT_HERO_BANNER.titleLine2,
      titleLine3: heroDraft.titleLine3.trim() || DEFAULT_HERO_BANNER.titleLine3,
      description: heroDraft.description.trim() || DEFAULT_HERO_BANNER.description,
      buttonText: heroDraft.buttonText.trim() || DEFAULT_HERO_BANNER.buttonText,
      imageUrl: heroDraft.imageUrl?.trim() ? heroDraft.imageUrl.trim() : null,
    };
    const s = loadSettings();
    const ok = saveSettings({ ...s, heroBanner: clean });
    if (!ok) return setSettingsError('Gagal menyimpan (penyimpanan penuh, gunakan gambar lebih kecil)');
    setSettings(loadSettings());
    setHeroDraft(clean);
    setSettingsError('');
    setToast('Hero Banner disimpan & langsung tampil di halaman utama!');
  };

  const resetHeroBanner = () => {
    const s = loadSettings();
    const ok = saveSettings({ ...s, heroBanner: { ...DEFAULT_HERO_BANNER } });
    if (!ok) return setSettingsError('Gagal mereset pengaturan');
    setSettings(loadSettings());
    setHeroDraft({ ...DEFAULT_HERO_BANNER });
    setSettingsError('');
    setToast('Hero Banner dikembalikan ke awal');
  };

  const saveTravelInfo = () => {
    if (nameDraft.trim().length < 3) return setSettingsError('Nama travel minimal 3 huruf');
    if (taglineDraft.trim().length < 3) return setSettingsError('Tagline minimal 3 huruf');
    const s = loadSettings();
    const ok = saveSettings({ ...s, travelName: nameDraft.trim(), tagline: taglineDraft.trim() });
    if (!ok) return setSettingsError('Gagal menyimpan (penyimpanan penuh)');
    setSettings(loadSettings());
    setSettingsError('');
    setToast('Nama travel & tagline diperbarui');
  };

  const onBannerFile = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      const s = loadSettings();
      if (saveSettings({ ...s, banner: dataUrl })) {
        setSettings(loadSettings());
        setSettingsError('');
        setToast('Banner diperbarui');
      } else {
        setSettingsError('Gagal menyimpan banner (penyimpanan penuh)');
      }
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Gagal membaca gambar');
    }
  };

  // === Riwayat Keuangan Owner (100% Tanpa Komisi — dari Biaya Daftar Driver & Iklan Toko) ===
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStr = new Date().toISOString().slice(0, 7);

  const ownerRevenueLedger = useMemo(() => {
    const regRows = drivers
      .filter((d) => d.registration_fee_paid || getDriverStatus(d) === 'approved')
      .map((d) => ({
        id: 'reg-' + d.id,
        type: 'Pendaftaran Driver (100%)' as const,
        title: `${d.name} (${d.plate || '-'})`,
        customer: `${d.phone} · ${d.registration_payment_method || 'Transfer'}`,
        amount: d.registration_fee_amount ?? liveSettings.finance.driverRegistrationFee ?? 50000,
        status: d.registration_fee_paid ? ('Lunas Diterima' as const) : ('Menunggu ACC' as const),
        createdAt: d.created_at,
      }));

    const adRows = stores
      .filter((s) => s.ad_status === 'approved' && s.ad_active)
      .map((s) => ({
        id: 'ad-' + s.id,
        type: 'Iklan Toko (100%)' as const,
        title: `Banner: ${s.name}`,
        customer: s.owner_name,
        amount: liveSettings.finance.adPricePerWeek,
        status: 'Lunas Diterima' as const,
        createdAt: s.created_at,
      }));

    return [...regRows, ...adRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [drivers, stores, liveSettings.finance]);

  const ownerRevenueToday = useMemo(
    () =>
      ownerRevenueLedger
        .filter((x) => x.createdAt.slice(0, 10) === todayStr)
        .reduce((sum, x) => sum + x.amount, 0),
    [ownerRevenueLedger, todayStr],
  );

  const ownerRevenueThisMonth = useMemo(
    () =>
      ownerRevenueLedger
        .filter((x) => x.createdAt.slice(0, 7) === monthStr)
        .reduce((sum, x) => sum + x.amount, 0),
    [ownerRevenueLedger, monthStr],
  );

  const completedOrdersLedger = useMemo(() => {
    const tRows = orders
      .filter((o) => o.status !== 'Dibatalkan')
      .map((o) => ({
        id: o.id,
        type: 'Travel (0% Komisi)' as const,
        title: `${o.pickup} → ${o.destination}`,
        customer: o.customer_name,
        gross: o.price,
        status: o.status,
        createdAt: o.created_at,
      }));
    const fRows = jastipOrders
      .filter((j) => j.status !== 'Dibatalkan' && j.status !== 'Ditolak Toko')
      .map((j) => ({
        id: j.id,
        type: 'Order Makanan (0% Komisi)' as const,
        title: j.store_name,
        customer: j.customer_name,
        gross: j.total_price,
        status: j.status,
        createdAt: j.created_at,
      }));
    return [...tRows, ...fRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, jastipOrders]);

  const todayOrders = orders.filter((ord) => ord.created_at.slice(0, 10) === todayStr);
  const todayJastip = jastipOrders.filter((ord) => ord.created_at.slice(0, 10) === todayStr);
  const todayRevenue =
    todayOrders.filter((x) => x.status !== 'Dibatalkan').reduce((s, x) => s + x.price, 0) +
    todayJastip.filter((x) => !['Dibatalkan', 'Ditolak Toko'].includes(x.status)).reduce((s, x) => s + x.total_price, 0);

  const onlineDrivers = drivers.filter((x) => x.is_online && getDriverStatus(x) === 'approved');
  const pendingCount = drivers.filter((x) => getDriverStatus(x) === 'pending').length;
  const approvedCount = drivers.filter((x) => getDriverStatus(x) === 'approved').length;
  const rejectedCount = drivers.filter((x) => getDriverStatus(x) === 'rejected').length;
  const blockedDriverCount = drivers.filter((x) => getDriverStatus(x) === 'blocked').length;

  const pendingStoresCount = stores.filter((s) => getDriverStatus(s) === 'pending').length;
  const pendingAdsCount = stores.filter((s) => s.ad_status === 'pending').length;
  const pendingDriverPayoutCount = drivers.filter((d) => d.payout_account?.pendingChange).length;
  const pendingStorePayoutCount = stores.filter((s) => s.payout_account?.pendingChange).length;
  const pendingDriverResetCount = drivers.filter((d) => Boolean(d.password_reset_requested_at)).length;
  const pendingStoreResetCount = stores.filter((s) => Boolean(s.password_reset_requested_at)).length;

  const filteredDrivers = drivers.filter((drv) => {
    if (driverFilter === 'all') return true;
    return getDriverStatus(drv) === driverFilter;
  });

  const filteredStores = stores.filter((st) => {
    if (storeFilter === 'all') return true;
    if (storeFilter === 'ads') return st.ad_status === 'pending' || st.ad_active;
    return getDriverStatus(st) === storeFilter;
  });

  const aiReport = buildOwnerAiReport(orders, jastipOrders, routes, menus);

  const weekData = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - (6 - i));
    const key = dt.toISOString().slice(0, 10);
    const total = orders
      .filter((ord) => ord.created_at.slice(0, 10) === key && ord.status !== 'Dibatalkan')
      .reduce((s, x) => s + x.price, 0);
    return { day: ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][dt.getDay()], total };
  });
  const maxWeek = Math.max(1, ...weekData.map((w) => w.total));

  if (!authed) {
    if (showForgot) {
      const ownerSec = getOwnerSecurityState(liveSettings.finance.ownerPayout.accountNumber || '085612340000');
      return (
        <ForgotPasswordFlow
          role="Owner"
          initialPhone={ownerSec.phone}
          theme="slate"
          onBackToLogin={() => {
            setShowForgot(false);
            setError('');
          }}
          onResetSuccess={({ noticeBanner, waAlertText }) => {
            setShowForgot(false);
            setPin('');
            setLoginCooldown(0);
            setError('');
            setResetNotice({ banner: noticeBanner, waAlert: waAlertText });
            setToast(noticeBanner);
          }}
        />
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7">
          <h2 className="text-xl font-bold text-center text-slate-800 mb-1">Masuk Owner / Admin</h2>
          <p className="text-xs text-slate-500 text-center mb-5">Khusus pemilik armada</p>

          {resetNotice && (
            <div className="space-y-2 mb-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-xs text-emerald-800 font-semibold flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>{resetNotice.banner}</span>
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 text-[11px] text-sky-900">
                <p className="font-bold">Notifikasi WA Owner:</p>
                <p className="mt-0.5">{resetNotice.waAlert}</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Field label="Username" value={username} onChange={setUsername} placeholder="admin" />
            <div className="space-y-1.5">
              <Field label="PIN / Password" value={pin} onChange={setPin} type="password" placeholder="PIN / Password owner" />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setShowForgot(true);
                  }}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900 hover:underline"
                >
                  Lupa Password? Klik di Sini
                </button>
              </div>
            </div>
            {loginCooldown > 0 && (
              <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Tunggu {loginCooldown} detik atau klik <b>Lupa Password? Klik di Sini</b> untuk reset password Owner.
              </p>
            )}
            <ErrorBox message={error} />
            <Btn onClick={login} disabled={loginCooldown > 0} className="w-full">
              Masuk Dashboard
            </Btn>
            <button onClick={onLogout} className="w-full text-xs text-slate-400 hover:text-slate-600 py-2">
              Kembali ke halaman utama
            </button>
          </div>
        </div>
        {toast && <Toast message={toast} onClose={() => setToast('')} />}
      </div>
    );
  }

  const tabs: readonly { key: OwnerTab; label: string; badge?: number }[] = [
    { key: 'dash', label: 'Ringkasan' },
    { key: 'drivers', label: 'Driver', badge: pendingCount + pendingDriverPayoutCount + pendingDriverResetCount },
    { key: 'stores', label: 'Toko / Iklan', badge: pendingStoresCount + pendingAdsCount + pendingStorePayoutCount + pendingStoreResetCount },
    { key: 'jastip', label: 'Kelola Order Makanan' },
    { key: 'orders', label: 'Order Travel' },
    { key: 'routes', label: 'Kelola Rute' },
    { key: 'finance', label: 'Tarif AI & Rekening' },
    { key: 'history', label: 'Riwayat Keuangan' },
    { key: 'security', label: 'Log Keamanan & AI', badge: ownerAlertSignal },
    { key: 'hero', label: 'Hero Banner' },
    { key: 'settings', label: 'Pengaturan' },
  ];

  const statusBadge = (status: DriverStatus) => {
    if (status === 'pending') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">MENUNGGU PERSETUJUAN</span>;
    }
    if (status === 'rejected') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">DITOLAK</span>;
    }
    if (status === 'blocked') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-white">DIBLOKIR</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">DISETUJUI • AKTIF</span>;
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <header className="bg-slate-900 text-white px-4 py-4 sticky top-0 z-30 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div>
            <h1 className="font-bold leading-tight">Dashboard Owner</h1>
            <p className="text-[11px] text-slate-400">
              {settings.travelName} · Rekening Utama: {liveSettings.finance.ownerPayout.provider} {liveSettings.finance.ownerPayout.accountNumber}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative bg-white/10 hover:bg-white/20 p-2 rounded-xl"
              aria-label="Peringatan AI Owner"
            >
              <Bell size={16} />
              {ownerAlertSignal > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1.5 rounded-full">
                  {ownerAlertSignal}
                </span>
              )}
            </button>
            <button onClick={logout} className="bg-white/10 hover:bg-white/20 p-2 rounded-xl" title="Keluar">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-0.5">
          {tabs.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                if (item.key === 'settings') openSettings();
                else if (item.key === 'hero') openHeroTab();
                else if (item.key === 'finance') openFinanceTab();
                else setTab(item.key);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 shrink-0 ${
                tab === item.key ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              {item.key === 'hero' && <ImageIcon size={12} />}
              {item.key === 'settings' && <Settings size={12} />}
              {item.key === 'finance' && <Landmark size={12} />}
              {item.key === 'history' && <ClipboardList size={12} />}
              {item.key === 'security' && <ShieldCheck size={12} />}
              <span>{item.label}</span>
              {(item.badge ?? 0) > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full leading-none">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        <ErrorBox message={error} onRetry={loadAll} />

        {/* === TAB RINGKASAN === */}
        {tab === 'dash' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-[11px] text-slate-500 flex items-center gap-1"><ShoppingCart size={12} /> Order Hari Ini</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{todayOrders.length + todayJastip.length}</p>
                <p className="text-[10px] text-slate-400">{todayOrders.length} Travel · {todayJastip.length} Order Makanan</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-[11px] text-slate-500 flex items-center gap-1"><IndianRupee size={12} /> Total Transaksi</p>
                <p className="text-xl font-bold text-emerald-600 mt-1">{formatRupiah(todayRevenue)}</p>
                <p className="text-[10px] text-slate-400">100% Milik Driver & Toko</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-[11px] text-slate-500 flex items-center gap-1"><Landmark size={12} /> Pendapatan Owner</p>
                <p className="text-xl font-bold text-blue-600 mt-1">{formatRupiah(ownerRevenueThisMonth)}</p>
                <p className="text-[10px] text-slate-400">Daftar Driver & Iklan Toko</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-[11px] text-slate-500 flex items-center gap-1"><Store size={12} /> Toko & Driver</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  {stores.filter((s) => getDriverStatus(s) === 'approved').length} / {approvedCount}
                </p>
                <p className="text-[10px] text-slate-400">{pendingStoresCount + pendingCount} butuh ACC</p>
              </div>
            </div>

            {pendingCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-bold text-amber-950">
                    {pendingCount} pendaftar Driver baru menunggu ACC & pengecekan biaya Rp 50.000!
                  </p>
                  <p className="text-amber-800 mt-0.5">Periksa KTP, SIM, Foto Kendaraan & Bukti Bayar di tab Driver.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDriverFilter('pending');
                    setTab('drivers');
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-2 rounded-xl"
                >
                  Cek Driver Baru →
                </button>
              </div>
            )}

            <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold flex items-center gap-1.5 text-sky-300">
                  <Sparkles size={14} /> Ringkasan Laporan AI Hari Ini
                </p>
                <button
                  type="button"
                  onClick={openFinanceTab}
                  className="text-[11px] font-bold bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg"
                >
                  Tarif AI & Iklan →
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-white/10 rounded-xl p-2.5">
                  <p className="text-[10px] text-slate-300">Makanan Paling Laris</p>
                  <p className="font-bold mt-0.5 truncate">{aiReport.topFood}</p>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5">
                  <p className="text-[10px] text-slate-300">Jam Ramai</p>
                  <p className="font-bold mt-0.5">{aiReport.peakHour}</p>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5">
                  <p className="text-[10px] text-slate-300">Rute Paling Laris</p>
                  <p className="font-bold mt-0.5 truncate">{aiReport.topRoute}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <BarChart3 size={18} className="text-emerald-600" /> Grafik Pendapatan Mingguan
              </h2>
              <div className="flex items-end gap-2 h-36">
                {weekData.map((w, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] text-slate-400">{w.total > 0 ? (w.total / 1000).toFixed(0) + 'rb' : ''}</span>
                    <div
                      className="w-full bg-emerald-500 rounded-t-lg transition-all duration-500 hover:bg-emerald-600"
                      style={{ height: `${Math.max(4, (w.total / maxWeek) * 100)}%` }}
                    />
                    <span className="text-[10px] font-semibold text-slate-500">{w.day}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Users size={18} className="text-emerald-600" /> Driver Sedang Online ({onlineDrivers.length})
              </h2>
              {onlineDrivers.length === 0 ? (
                <p className="text-xs text-slate-400">Belum ada driver yang sedang aktif online.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {onlineDrivers.map((d) => (
                    <div key={d.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900">{d.name} ({d.vehicle_type || 'Mobil'})</p>
                        <p className="text-slate-500">{d.plate} · {d.payout_account?.provider} {d.payout_account?.accountNumber}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">ONLINE</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* === TAB KELOLA DRIVER === */}
        {tab === 'drivers' && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Users size={18} className="text-emerald-600" /> Kontrol Driver ({drivers.length})
              </h2>
              <span className="text-[11px] text-slate-500">Klik Detail untuk cek KTP, Rekening & ubah WA/Plat</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDriverFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  driverFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua ({drivers.length})
              </button>
              <button
                type="button"
                onClick={() => setDriverFilter('pending')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  driverFilter === 'pending' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <span>Menunggu Persetujuan</span>
                <span className="bg-red-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full leading-none">
                  {pendingCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDriverFilter('approved')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  driverFilter === 'approved' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                Disetujui ({approvedCount})
              </button>
              <button
                type="button"
                onClick={() => setDriverFilter('rejected')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  driverFilter === 'rejected' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                Ditolak ({rejectedCount})
              </button>
              <button
                type="button"
                onClick={() => setDriverFilter('blocked')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  driverFilter === 'blocked' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Diblokir ({blockedDriverCount})
              </button>
            </div>

            <div className="space-y-3">
              {filteredDrivers.length === 0 && (
                <p className="text-xs text-slate-400 py-4 text-center">Belum ada driver di kategori ini.</p>
              )}
              {filteredDrivers.map((drv) => {
                const st = getDriverStatus(drv);
                const chg = drv.payout_account?.pendingChange;
                const isDelReq = chg?.action === 'delete';
                const payMethod = drv.registration_payment_method || 'Transfer';
                return (
                  <div key={drv.id} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-800">{drv.name}</span>
                          {statusBadge(st)}
                          {drv.password_reset_requested_at && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-700">
                              AJUAN RESET PASSWORD
                            </span>
                          )}
                          {chg && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-800">
                              {isDelReq ? 'AJUAN HAPUS REKENING' : 'AJUAN GANTI REKENING'}
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600">
                          WA: <b>{drv.phone}</b> • {drv.vehicle_type || 'Mobil'} • Plat: <b>{drv.plate || '-'}</b>
                        </p>
                        <p className="text-slate-600">
                          Rekening Utama:{' '}
                          {drv.payout_account?.accountNumber ? (
                            <>
                              <b>{drv.payout_account.provider} {drv.payout_account.accountNumber}</b> a/n <b>{drv.payout_account.ownerName}</b>
                            </>
                          ) : (
                            <i className="text-amber-700">Belum ada rekening (terhapus)</i>
                          )}
                        </p>
                        {st === 'pending' && (
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1.5 text-emerald-950 font-semibold">
                            Driver Baru: <b>{drv.name}</b>, WA <b>{drv.phone}</b>, Plat <b>{drv.plate || '-'}</b>,{' '}
                            {payMethod === 'Cash'
                              ? drv.registration_fee_paid
                                ? 'Cash Rp 50.000 Sudah Diterima ✓'
                                : 'Bayar Cash Rp 50.000 ke Owner'
                              : drv.registration_proof_photo
                                ? 'Sudah Bayar Rp 50.000, Bukti Terlampir'
                                : 'Transfer Rp 50.000 ke Owner'}
                          </div>
                        )}
                        {drv.owner_note?.trim() && (
                          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 mt-1">
                            Note: {drv.owner_note}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setDeleteTarget(drv)}
                        className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 shrink-0"
                        title="Hapus driver"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {chg && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs space-y-2">
                        <p className="font-bold text-blue-900">
                          {isDelReq
                            ? `Ajuan Hapus Rekening: ${drv.payout_account?.provider} ${drv.payout_account?.accountNumber}`
                            : `Ajuan Ganti Rekening Baru: ${chg.provider} ${chg.accountNumber} a/n ${chg.ownerName}`}
                        </p>
                        {chg.reason && (
                          <p className="text-blue-800">Alasan: <b>{chg.reason}</b></p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => resolveDriverPayoutChange(drv, true)}
                            className="bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-lg"
                          >
                            {isDelReq ? '✓ ACC Hapus Rekening' : '✓ ACC Ganti Rekening'}
                          </button>
                          <button
                            type="button"
                            onClick={() => resolveDriverPayoutChange(drv, false)}
                            className="bg-red-100 text-red-700 font-bold px-3 py-1.5 rounded-lg"
                          >
                            ✕ Tolak
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openDriverDetail(drv)}
                        className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
                      >
                        <Eye size={14} /> Lihat KTP / SIM / Bukti
                      </button>

                      {st === 'pending' && payMethod === 'Cash' && !drv.registration_fee_paid && (
                        <button
                          type="button"
                          onClick={() => markDriverCashPaid(drv)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1 transition"
                        >
                          💵 Sudah Terima Cash
                        </button>
                      )}

                      {st === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setApproveTarget(drv)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1 transition"
                          >
                            <Check size={14} /> ACC &amp; Aktifkan
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectTarget(drv);
                              setRejectReason('');
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1 transition"
                          >
                            <X size={14} /> Tolak
                          </button>
                        </>
                      )}

                      {(st === 'approved' || st === 'blocked') && (
                        <button
                          type="button"
                          onClick={() => toggleBlockDriver(drv)}
                          className={`text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1 transition ${
                            st === 'blocked'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-slate-800 hover:bg-slate-900 text-white'
                          }`}
                        >
                          {st === 'blocked' ? <Unlock size={13} /> : <Ban size={13} />}
                          {st === 'blocked' ? 'Buka Blokir' : 'Blokir'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* === TAB KELOLA TOKO & IKLAN === */}
        {tab === 'stores' && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Store size={18} className="text-orange-500" /> Kelola Toko & Iklan ({stores.length})
              </h2>
              <p className="text-xs text-slate-500">Iklan disetujui otomatis tampil di slide atas Customer.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                ['all', `Semua (${stores.length})`],
                ['pending', `Menunggu Toko (${pendingStoresCount})`],
                ['approved', 'Disetujui'],
                ['blocked', 'Diblokir'],
                ['ads', `Iklan (${pendingAdsCount} pending)`],
              ].map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStoreFilter(k as 'all' | DriverStatus | 'ads')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    storeFilter === k ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {filteredStores.length === 0 && (
                <p className="text-xs text-slate-400 py-4 text-center">Belum ada toko di kategori ini.</p>
              )}
              {filteredStores.map((st) => {
                const status = getDriverStatus(st);
                const storeChg = st.payout_account?.pendingChange;
                const isStoreDel = storeChg?.action === 'delete';
                return (
                  <div key={st.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <img
                        src={st.photo_url || DEFAULT_STORE_IMG}
                        alt={st.name}
                        className="w-16 h-16 rounded-xl object-cover bg-white border border-slate-200 shrink-0"
                      />
                      <div className="flex-1 min-w-0 text-xs space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">{st.name}</span>
                          {statusBadge(status)}
                          {st.password_reset_requested_at && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                              AJUAN RESET PASSWORD
                            </span>
                          )}
                          {storeChg && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                              {isStoreDel ? 'AJUAN HAPUS REKENING' : 'AJUAN GANTI REKENING'}
                            </span>
                          )}
                          {st.ad_status === 'pending' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                              IKLAN MENUNGGU ACC
                            </span>
                          )}
                          {st.ad_active && st.ad_status === 'approved' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                              IKLAN AKTIF
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600">
                          Pemilik: <b>{st.owner_name}</b> • KTP: <b>{st.ktp_number}</b>
                        </p>
                        <p className="text-slate-600">
                          WA: <b>{st.phone}</b> • Rekening:{' '}
                          {st.payout_account?.accountNumber ? (
                            <b>{st.payout_account.provider} {st.payout_account.accountNumber}</b>
                          ) : (
                            <i className="text-amber-700">Belum ada rekening (terhapus)</i>
                          )}
                        </p>
                        <p className="text-slate-500">Alamat: {st.address}</p>
                      </div>
                    </div>

                    {storeChg && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs space-y-2">
                        <p className="font-bold text-blue-900">
                          {isStoreDel
                            ? `Ajuan Hapus Rekening: ${st.payout_account?.provider} ${st.payout_account?.accountNumber}`
                            : `Ajuan Ganti Rekening Baru: ${storeChg.provider} ${storeChg.accountNumber} a/n ${storeChg.ownerName}`}
                        </p>
                        {storeChg.reason && (
                          <p className="text-blue-800">Alasan: <b>{storeChg.reason}</b></p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => resolveStorePayoutChange(st, true)}
                            className="bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-lg"
                          >
                            {isStoreDel ? '✓ ACC Hapus Rekening' : '✓ ACC Ganti Rekening'}
                          </button>
                          <button
                            type="button"
                            onClick={() => resolveStorePayoutChange(st, false)}
                            className="bg-red-100 text-red-700 font-bold px-3 py-1.5 rounded-lg"
                          >
                            ✕ Tolak
                          </button>
                        </div>
                      </div>
                    )}

                    {(st.ad_status === 'pending' || st.ad_active) && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={st.ad_banner_url || st.photo_url || DEFAULT_STORE_IMG}
                            alt="Banner Iklan"
                            className="w-12 h-12 rounded-lg object-cover shrink-0"
                          />
                          <div className="text-xs min-w-0">
                            <p className="font-bold text-blue-950 flex items-center gap-1">
                              <Megaphone size={12} /> {st.ad_title || st.name}
                            </p>
                            <p className="text-blue-700 truncate">{st.ad_subtitle || st.address}</p>
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {st.ad_status !== 'approved' || !st.ad_active ? (
                            <button
                              type="button"
                              onClick={() => approveStoreAd(st)}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl"
                            >
                              ✓ Setujui Iklan
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => rejectStoreAd(st)}
                            className="bg-red-100 hover:bg-red-200 text-red-700 text-[11px] font-bold px-3 py-1.5 rounded-xl"
                          >
                            ✕ {st.ad_active ? 'Matikan Iklan' : 'Tolak Iklan'}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openStoreDetail(st)}
                        className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1"
                      >
                        <Eye size={14} /> Detail Toko
                      </button>
                      {status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => approveStore(st)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1"
                          >
                            <Check size={14} /> Setujui Toko
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectStoreTarget(st);
                              setRejectStoreReason('');
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1"
                          >
                            <X size={14} /> Tolak Toko
                          </button>
                        </>
                      )}
                      {(status === 'approved' || status === 'blocked') && (
                        <button
                          type="button"
                          onClick={() => toggleBlockStore(st)}
                          className={`text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1 ${
                            status === 'blocked'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-slate-800 hover:bg-slate-900 text-white'
                          }`}
                        >
                          {status === 'blocked' ? <Unlock size={13} /> : <Ban size={13} />}
                          {status === 'blocked' ? 'Buka Blokir Toko' : 'Blokir Toko'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* === TAB KELOLA ORDER MAKANAN === */}
        {tab === 'jastip' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <ShoppingBag size={18} className="text-orange-500" /> Kelola Order Makanan ({jastipOrders.length})
                </h2>
                <span className="text-xs text-slate-500">{menus.length} menu aktif di {stores.length} toko</span>
              </div>

              {jastipOrders.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Belum ada Orderan Makanan masuk.</p>
              ) : (
                <div className="space-y-2.5">
                  {jastipOrders.map((ord) => (
                    <div key={ord.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">
                            {ord.store_name} → {ord.customer_name}
                          </p>
                          <p className="text-slate-500">
                            WA: {ord.customer_phone} • Alamat: {ord.delivery_address}
                          </p>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 bg-blue-100 text-blue-700">
                          {ord.status}
                        </span>
                      </div>

                      <div className="bg-white rounded-xl p-2.5 border border-slate-100 space-y-1">
                        {ord.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>{it.qty}x {it.name}</span>
                            <span className="font-semibold">{formatRupiah(it.price * it.qty)}</span>
                          </div>
                        ))}
                        <div className="pt-1 border-t border-slate-100 flex justify-between text-slate-500">
                          <span>Ongkir AI ({ord.distance_km} km, ~{ord.eta_minutes} mnt)</span>
                          <span>{formatRupiah(ord.delivery_fee)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-slate-900">
                          <span>Total ({ord.payment_method || 'Cash ke Driver'})</span>
                          <span className="text-emerald-700">{formatRupiah(ord.total_price)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className={`px-2 py-0.5 rounded-full font-bold ${ord.driver_paid_store ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                          {ord.driver_paid_store ? `Talangan Toko: Lunas (${ord.driver_paid_store_method || 'Cash'})` : 'Menunggu Driver Talangi'}
                        </span>
                        {ord.store_confirmed_driver_paid && (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700">
                            Toko Konfirmasi ✓
                          </span>
                        )}
                        {ord.driver_paid_store_proof && (
                          <button
                            type="button"
                            onClick={() => setZoomProofUrl(ord.driver_paid_store_proof || null)}
                            className="text-blue-600 underline font-bold"
                          >
                            Lihat Bukti Talangan
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-slate-500">
                          Driver: <b>{ord.driver_name || 'Menunggu driver'}</b> · <b className="text-emerald-700">100% Milik Driver &amp; Toko (0% Komisi)</b>
                        </span>
                        {ord.status !== 'Selesai' && ord.status !== 'Dibatalkan' && ord.status !== 'Ditolak Toko' && (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => markJastipDone(ord)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg"
                            >
                              Tandai Selesai
                            </button>
                            <button
                              type="button"
                              onClick={() => cancelJastipOrder(ord)}
                              className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-2.5 py-1 rounded-lg"
                            >
                              Batalkan
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* === TAB ORDER TRAVEL === */}
        {tab === 'orders' && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <h2 className="font-bold text-slate-800">Semua Order Travel ({orders.length})</h2>
            <div className="space-y-2.5">
              {orders.length === 0 && (
                <p className="text-xs text-slate-400 py-4 text-center">Belum ada order travel masuk.</p>
              )}
              {orders.map((ord) => (
                <div key={ord.id} className="text-xs bg-slate-50 border border-slate-200/70 rounded-xl px-3.5 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{ord.customer_name} - {ord.pickup} → {ord.destination}</p>
                      <p className="text-slate-400">
                        {new Date(ord.created_at).toLocaleString('id-ID')} · {ord.car_type} · {ord.payment_method}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-emerald-700">{formatRupiah(ord.price)}</p>
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                        {ord.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-emerald-700 font-semibold">
                    100% Milik Driver (Tanpa Komisi, Tanpa Potongan)
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === TAB KELOLA RUTE === */}
        {tab === 'routes' && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-slate-800">Kelola Rute Populer</h2>
                <p className="text-xs text-slate-500">Ubah nama rute, harga, waktu, jenis & foto card per rute.</p>
              </div>
              <Btn onClick={openAddRoute}>
                <Plus size={15} className="inline mr-1" /> Tambah Rute Baru
              </Btn>
            </div>

            <div className="space-y-3">
              {routes.length === 0 && (
                <p className="text-xs text-slate-400 py-4 text-center">Belum ada rute. Klik Tambah Rute Baru untuk membuat.</p>
              )}
              {routes.map((r) => {
                const disp = resolveRouteDisplay(r, routeMetaMap);
                const mainPrice =
                  disp.defaultCarType === 'Premium'
                    ? r.price_premium
                    : disp.defaultCarType === 'Nyaman'
                      ? r.price_comfort
                      : r.price_economy;
                return (
                  <div
                    key={r.id}
                    className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={disp.imageUrl}
                        alt={`${r.origin} - ${r.destination}`}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const fb = getDefaultRoutePhoto(r);
                          if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                        }}
                        className="w-20 h-16 rounded-xl object-cover shrink-0 bg-blue-50 border border-slate-200"
                      />
                      <div className="min-w-0 text-xs space-y-0.5">
                        <p className="font-bold text-slate-900 text-sm truncate">
                          {r.origin} - {r.destination}
                        </p>
                        <p className="text-slate-500">
                          {disp.etaText} • {disp.defaultCarType}
                        </p>
                        <p className="font-extrabold text-blue-600 text-sm tabular-nums">
                          {formatRupiah(mainPrice)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditRoute(r, 'template')}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-3 py-2 rounded-xl flex items-center gap-1 transition"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditRoute(r, 'upload')}
                        className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-bold px-3 py-2 rounded-xl flex items-center gap-1 transition"
                      >
                        <ImageIcon size={12} /> Ganti Foto
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteRouteTarget(r)}
                        className="bg-red-100 hover:bg-red-200 text-red-700 text-[11px] font-bold px-3 py-2 rounded-xl flex items-center gap-1 transition"
                      >
                        <Trash2 size={12} /> Hapus Rute
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* === TAB TARIF AI, BIAYA DAFTAR DRIVER & REKENING UTAMA OWNER === */}
        {tab === 'finance' && (
          <div className="space-y-4">
            <section className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
              <div>
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <Landmark size={18} className="text-blue-600" /> Rekening Utama Owner &amp; Pengaturan Biaya
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hasil orderan Travel &amp; Order Makanan 100% milik Driver &amp; Toko (0% potongan). Pemasukan Owner dari Biaya Pendaftaran Driver (Rp 50.000 sekali bayar) &amp; Biaya Iklan Toko.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-bold text-blue-950">Rekening Utama Penerima Pendaftaran Driver &amp; Iklan Toko</p>
                <div className="flex flex-wrap gap-1.5">
                  {PAYOUT_PROVIDERS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setOwnerPayoutDraft((prev) => ({ ...prev, provider: p }))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        ownerPayoutDraft.provider === p
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Field
                    label={`Nomor ${ownerPayoutDraft.provider} Owner`}
                    value={ownerPayoutDraft.accountNumber}
                    onChange={(v) => setOwnerPayoutDraft((prev) => ({ ...prev, accountNumber: v }))}
                  />
                  <Field
                    label="Atas Nama Rekening"
                    value={ownerPayoutDraft.ownerName}
                    onChange={(v) => setOwnerPayoutDraft((prev) => ({ ...prev, ownerName: v }))}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className="bg-white border border-dashed border-blue-300 rounded-xl p-2.5 flex items-center justify-between cursor-pointer">
                    <span>{ownerPayoutDraft.proofPhoto ? 'Foto Buku Rekening/DANA ✓' : 'Upload Foto Buku Rekening'}</span>
                    <span className="bg-blue-600 text-white font-bold px-2.5 py-1 rounded-lg">Pilih</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onOwnerPayoutPhoto(e.target.files?.[0] ?? null, 'proof')} />
                  </label>
                  <label className="bg-white border border-dashed border-blue-300 rounded-xl p-2.5 flex items-center justify-between cursor-pointer">
                    <span>{ownerPayoutDraft.qrImage ? 'Gambar QR DANA ✓' : 'Upload Gambar QR DANA'}</span>
                    <span className="bg-blue-600 text-white font-bold px-2.5 py-1 rounded-lg">Pilih</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onOwnerPayoutPhoto(e.target.files?.[0] ?? null, 'qr')} />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Biaya Pendaftaran Driver (Rp)" value={regFeeDraft} onChange={setRegFeeDraft} type="number" placeholder="50000" />
                <Field label="Tarif Ongkir AI per KM (Rp)" value={aiRateDraft} onChange={setAiRateDraft} type="number" placeholder="3500" />
                <Field label="Biaya Iklan Toko per Minggu (Rp)" value={adPriceDraft} onChange={setAdPriceDraft} type="number" placeholder="50000" />
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2 text-xs">
                <p className="font-bold text-emerald-950">Aturan Pembagian Dana (0% Potongan Orderan)</p>
                <div className="bg-white rounded-xl p-3 border border-emerald-100 space-y-1">
                  <p className="font-semibold text-slate-800">1. Travel Rp 100.000</p>
                  <p className="text-slate-600">• Customer bayar langsung ke Driver: <b>Rp 100.000</b> → <b className="text-emerald-700">100% Milik Driver</b> (Tanpa potongan)</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-emerald-100 space-y-1">
                  <p className="font-semibold text-slate-800">2. Order Makanan Rp 35.000 + Ongkir Rp 8.000</p>
                  <p className="text-slate-600">• Driver talangin ke Toko: <b>Rp 35.000</b> → <b className="text-emerald-700">100% Milik Toko</b></p>
                  <p className="text-slate-600">• Customer bayar ke Driver: <b>Rp 43.000</b> → Ongkir <b>Rp 8.000</b> <b className="text-emerald-700">100% Milik Driver</b></p>
                </div>
              </div>

              <Btn onClick={saveFinanceSettings} className="w-full !bg-blue-600 hover:!bg-blue-700">
                Simpan Biaya Daftar, Tarif AI &amp; Rekening Owner
              </Btn>
            </section>

            <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Bot size={18} className="text-blue-600" /> Laporan AI Pintar WONG HAURGEULIS
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3.5">
                  <p className="text-[11px] font-semibold text-orange-700">Makanan Paling Laris</p>
                  <p className="font-extrabold text-sm text-slate-900 mt-1">{aiReport.topFood}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5">
                  <p className="text-[11px] font-semibold text-blue-700">Jam Paling Ramai</p>
                  <p className="font-extrabold text-sm text-slate-900 mt-1">{aiReport.peakHour}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5">
                  <p className="text-[11px] font-semibold text-emerald-700">Rute Paling Laris</p>
                  <p className="font-extrabold text-sm text-slate-900 mt-1">{aiReport.topRoute}</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* === TAB RIWAYAT KEUANGAN OWNER === */}
        {tab === 'history' && (
          <div className="space-y-4">
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-900 text-white rounded-2xl p-5">
                <p className="text-xs text-slate-300">Pendapatan Owner Hari Ini</p>
                <p className="text-2xl font-extrabold mt-1 tabular-nums">{formatRupiah(ownerRevenueToday)}</p>
              </div>
              <div className="bg-blue-900 text-white rounded-2xl p-5">
                <p className="text-xs text-blue-200">Pendapatan Owner Bulan Ini</p>
                <p className="text-2xl font-extrabold mt-1 tabular-nums">{formatRupiah(ownerRevenueThisMonth)}</p>
              </div>
              <div className="bg-emerald-700 text-white rounded-2xl p-5">
                <p className="text-xs text-emerald-100">Transaksi Order (0% Potongan)</p>
                <p className="text-2xl font-extrabold mt-1 tabular-nums">{completedOrdersLedger.length} order</p>
              </div>
            </section>

            <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <Landmark size={18} className="text-blue-600" /> Pemasukan Owner — Pendaftaran Driver &amp; Iklan Toko ({ownerRevenueLedger.length})
              </h2>
              {ownerRevenueLedger.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Belum ada pemasukan pendaftaran driver atau iklan toko.</p>
              ) : (
                <div className="space-y-2.5">
                  {ownerRevenueLedger.slice(0, historyLimit).map((item) => (
                    <div key={item.id} className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{item.type}: {item.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.status === 'Lunas Diterima' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                            {item.status}
                          </span>
                        </div>
                        <p className="text-slate-500 mt-0.5">
                          {item.customer} · {new Date(item.createdAt).toLocaleString('id-ID')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-slate-400">Masuk Owner</p>
                        <p className="font-extrabold text-blue-700 text-sm tabular-nums">{formatRupiah(item.amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <ClipboardList size={18} className="text-emerald-600" /> Riwayat Order Travel &amp; Makanan (100% Milik Driver &amp; Toko)
              </h2>
              {completedOrdersLedger.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Belum ada transaksi order tercatat.</p>
              ) : (
                <div className="space-y-2.5">
                  {completedOrdersLedger.slice(0, historyLimit).map((item) => (
                    <div key={item.id} className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{item.type}: {item.title}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                            {item.status}
                          </span>
                        </div>
                        <p className="text-slate-500 mt-0.5">
                          Customer: <b>{item.customer}</b> · {new Date(item.createdAt).toLocaleString('id-ID')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-emerald-700 font-bold">100% Driver / Toko</p>
                        <p className="font-extrabold text-slate-900 text-sm tabular-nums">{formatRupiah(item.gross)}</p>
                      </div>
                    </div>
                  ))}
                  {Math.max(ownerRevenueLedger.length, completedOrdersLedger.length) > historyLimit && (
                    <button
                      type="button"
                      onClick={() => setHistoryLimit((l) => l + 10)}
                      className="w-full py-2.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl"
                    >
                      Muat 10 Lagi
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {/* === TAB LOG KEAMANAN & PERINGATAN AI === */}
        {tab === 'security' && (
          <div className="space-y-4">
            <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <AlertTriangle size={18} className="text-red-600" /> Peringatan Security AI ({aiAlerts.length})
              </h2>
              {aiAlerts.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Belum ada peringatan AI — sistem aman terkendali.</p>
              ) : (
                <div className="space-y-2">
                  {aiAlerts.slice(0, 15).map((a) => (
                    <div key={a.id} className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-red-900">{a.title}</p>
                        <span className="text-[10px] text-red-600">{new Date(a.created_at).toLocaleString('id-ID')}</span>
                      </div>
                      <p className="text-red-800 mt-0.5">{a.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <ShieldCheck size={18} className="text-emerald-600" /> Log Keamanan Lengkap ({securityLogs.length})
                </h2>
                <div className="flex gap-1.5">
                  {(
                    [
                      ['all', 'Semua'],
                      ['auth', 'Lupa Password & Login'],
                      ['critical', 'Peringatan / Gagal'],
                    ] as const
                  ).map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setSecFilter(k);
                        setSecLogLimit(10);
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                        secFilter === k
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Mencatat setiap login, pengajuan Lupa Password ke Owner (siapa, jam berapa, dari HP apa), reset password oleh Owner, serta upaya akun ganda &amp; bukti palsu.
              </p>
              {(() => {
                const filteredLogs = securityLogs.filter((l) => {
                  if (secFilter === 'auth') {
                    const txt = l.action.toLowerCase();
                    return txt.includes('password') || txt.includes('login');
                  }
                  if (secFilter === 'critical') {
                    return l.severity === 'critical' || l.severity === 'warning';
                  }
                  return true;
                });
                if (filteredLogs.length === 0) {
                  return <p className="text-xs text-slate-400 py-4 text-center">Belum ada log aktivitas keamanan untuk filter ini.</p>;
                }
                return (
                  <div className="space-y-2">
                    {filteredLogs.slice(0, secLogLimit).map((log) => (
                      <div key={log.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">
                            [{log.role}] {log.actor_name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              log.severity === 'critical'
                                ? 'bg-red-100 text-red-700'
                                : log.severity === 'warning'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {log.severity === 'info' ? 'Berhasil' : log.severity === 'warning' ? 'Peringatan' : 'Gagal / Kritis'}
                          </span>
                        </div>
                        <p className="text-slate-700">{log.action}</p>
                        <p className="text-[10px] text-slate-400">
                          HP/Perangkat: {log.device_info} · IP: {log.ip_address} · {new Date(log.created_at).toLocaleString('id-ID')}
                        </p>
                      </div>
                    ))}
                    {filteredLogs.length > secLogLimit && (
                      <button
                        type="button"
                        onClick={() => setSecLogLimit((l) => l + 10)}
                        className="w-full py-2.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl"
                      >
                        Muat 10 Log Lagi ({filteredLogs.length - secLogLimit} tersisa)
                      </button>
                    )}
                  </div>
                );
              })()}
            </section>
          </div>
        )}

        {/* === TAB KELOLA HERO BANNER === */}
        {tab === 'hero' && (
          <div className="space-y-4">
            <section className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
              <div>
                <h2 className="font-bold text-slate-800 text-base">Kelola Hero Banner Halaman Utama</h2>
                <p className="text-xs text-slate-500 mt-0.5">Edit tulisan & foto driver di Hero Banner.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Tulisan kecil atas" value={heroDraft.topLabel} onChange={(v) => setHeroDraft((p) => ({ ...p, topLabel: v }))} placeholder="Travel Indramayu" />
                <Field label="Tulisan tombol" value={heroDraft.buttonText} onChange={(v) => setHeroDraft((p) => ({ ...p, buttonText: v }))} placeholder="Pesan Sekarang" />
                <Field label="Judul baris 1 (hitam)" value={heroDraft.titleLine1} onChange={(v) => setHeroDraft((p) => ({ ...p, titleLine1: v }))} placeholder="Travel Itu" />
                <Field label="Judul baris 2 (biru)" value={heroDraft.titleLine2} onChange={(v) => setHeroDraft((p) => ({ ...p, titleLine2: v }))} placeholder="Cuma Hitungan" />
                <Field label="Judul baris 3 (hitam)" value={heroDraft.titleLine3} onChange={(v) => setHeroDraft((p) => ({ ...p, titleLine3: v }))} placeholder="Menit Aja" />
                <Field label="Deskripsi" value={heroDraft.description} onChange={(v) => setHeroDraft((p) => ({ ...p, description: v }))} placeholder="Driver siaga 24 jam." />
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-3">
                <span className="block text-xs font-bold text-slate-700">Foto Kanan Hero Banner</span>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setHeroPhotoTab('upload')} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${heroPhotoTab === 'upload' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                    <Upload size={13} /> Upload dari HP
                  </button>
                  <button type="button" onClick={() => setHeroPhotoTab('template')} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${heroPhotoTab === 'template' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                    <ImageIcon size={13} /> Pilih Template
                  </button>
                  <button type="button" onClick={() => setHeroPhotoTab('url')} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${heroPhotoTab === 'url' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                    <Link2 size={13} /> Link URL
                  </button>
                </div>

                {heroPhotoTab === 'upload' && (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 flex items-center justify-between gap-3">
                    <img src={heroDraft.imageUrl || DEFAULT_HERO_IMAGE} alt="Preview" className="w-14 h-16 rounded-xl object-cover object-top" />
                    <label className="cursor-pointer bg-blue-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl">
                      Pilih Foto
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => onHeroPhotoUpload(e.target.files?.[0] ?? null)} />
                    </label>
                  </div>
                )}

                {heroPhotoTab === 'template' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {HERO_PHOTO_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setHeroDraft((p) => ({ ...p, imageUrl: tpl.url === DEFAULT_HERO_IMAGE ? null : tpl.url }))}
                        className={`text-left rounded-xl border p-1.5 ${(heroDraft.imageUrl || DEFAULT_HERO_IMAGE) === tpl.url ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}
                      >
                        <img src={tpl.url} alt={tpl.label} className="w-full h-20 rounded-lg object-cover object-top" />
                        <p className="text-[11px] font-bold text-slate-700 mt-1 truncate">{tpl.label}</p>
                      </button>
                    ))}
                  </div>
                )}

                {heroPhotoTab === 'url' && (
                  <Field label="Tempel Link Gambar (URL)" value={heroDraft.imageUrl ?? ''} onChange={(v) => setHeroDraft((p) => ({ ...p, imageUrl: v }))} />
                )}
              </div>

              {settingsError && <ErrorBox message={settingsError} onRetry={() => setSettingsError('')} />}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                <Btn onClick={saveHeroBanner} className="w-full !bg-blue-600 hover:!bg-blue-700">Simpan</Btn>
                <button type="button" onClick={() => setHeroPreviewOpen((v) => !v)} className="bg-slate-100 text-slate-800 text-sm font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5">
                  <Eye size={15} /> {heroPreviewOpen ? 'Tutup Pratinjau' : 'Lihat Pratinjau'}
                </button>
                <button type="button" onClick={resetHeroBanner} className="bg-amber-50 border border-amber-200 text-amber-800 text-sm font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5">
                  <RotateCcw size={15} /> Reset
                </button>
              </div>
            </section>

            {heroPreviewOpen && (
              <section className="bg-white rounded-3xl border-2 border-blue-200 shadow-sm p-5">
                <div className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-7 space-y-2">
                    <p className="text-xs font-bold text-blue-600">{heroDraft.topLabel}</p>
                    <h3 className="text-2xl font-extrabold text-slate-950 leading-tight">
                      {heroDraft.titleLine1} <span className="block text-blue-600">{heroDraft.titleLine2}</span> <span className="block">{heroDraft.titleLine3}</span>
                    </h3>
                    <span className="inline-flex items-center gap-1 bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-full">
                      {heroDraft.buttonText} <ChevronRight size={14} />
                    </span>
                  </div>
                  <div className="col-span-5 flex justify-end">
                    <img src={heroDraft.imageUrl || DEFAULT_HERO_IMAGE} alt="Pratinjau" className="w-32 h-40 rounded-2xl object-cover object-top" />
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* === TAB PENGATURAN === */}
        {tab === 'settings' && (
          <div className="space-y-4">
            <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-slate-800">Ubah Nama Travel & Tagline</h2>
              <Field label="Nama Travel" value={nameDraft} onChange={setNameDraft} placeholder="WONG HAURGEULIS" />
              <Field label="Tagline" value={taglineDraft} onChange={setTaglineDraft} placeholder="24 JAM AMAN & NYAMAN" />
              <Btn onClick={saveTravelInfo} className="w-full">Simpan Nama & Tagline</Btn>
            </section>

            <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-slate-800">Banner Tambahan Halaman Customer</h2>
              {settings.banner ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-200">
                  <img src={settings.banner} alt="Preview banner" className="w-full h-40 object-cover" />
                  <button
                    onClick={() => {
                      const s = loadSettings();
                      saveSettings({ ...s, banner: null });
                      setSettings(loadSettings());
                      setToast('Banner tambahan dihapus');
                    }}
                    className="absolute top-2 right-2 bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
                  >
                    Hapus Banner
                  </button>
                </div>
              ) : (
                <div className="h-28 rounded-xl bg-slate-100 border border-dashed border-slate-300 grid place-items-center text-slate-500 text-xs font-semibold">
                  Belum ada banner promo tambahan
                </div>
              )}
              <label className="inline-block cursor-pointer bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl">
                Upload Foto Banner
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onBannerFile(e.target.files?.[0] ?? null)} />
              </label>
            </section>
          </div>
        )}
      </main>

      {/* MODAL NOTIFIKASI OWNER */}
      {notifOpen && (
        <Modal title="Notifikasi & Peringatan AI Owner" onClose={() => setNotifOpen(false)}>
          <div className="space-y-2.5 max-h-[70vh] overflow-y-auto text-xs">
            {aiAlerts.slice(0, 10).map((a) => (
              <div key={a.id} className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="font-bold text-red-900">{a.title}</p>
                <p className="text-red-800 mt-0.5">{a.message}</p>
              </div>
            ))}
            {aiAlerts.length === 0 && (
              <p className="text-center text-slate-400 py-4">Tidak ada peringatan baru.</p>
            )}
          </div>
        </Modal>
      )}

      {/* === MODAL DETAIL DRIVER (KTP, REKENING UTAMA, PASSWORD TERENKRIPSI AMAN, NOTE) === */}
      {detailDriver && (
        <Modal title={`Detail Driver - ${detailDriver.name}`} onClose={() => setDetailDriver(null)}>
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
            <div className="bg-slate-50 rounded-xl p-3.5 text-xs space-y-1.5 text-slate-700">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-800">{detailDriver.name}</span>
                {statusBadge(getDriverStatus(detailDriver))}
              </div>
              <p>Jenis Kendaraan: <b>{detailDriver.vehicle_type || 'Mobil'}</b></p>
              <p>No. KTP: <b>{detailDriver.ktp_number || '-'}</b></p>
              <p>
                Rekening Utama: <b>{detailDriver.payout_account?.provider} {detailDriver.payout_account?.accountNumber}</b> a/n <b>{detailDriver.payout_account?.ownerName}</b>
              </p>
              <p className="text-slate-500 flex items-center gap-1">
                <Lock size={12} /> Password: <i>Terenkripsi aman (tidak dapat dilihat siapa pun)</i>
              </p>
            </div>

            {(detailDriver.ktp_photo ||
              detailDriver.sim_photo ||
              detailDriver.vehicle_photo ||
              detailDriver.payout_account?.proofPhoto ||
              detailDriver.registration_proof_photo) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {detailDriver.ktp_photo && (
                  <div className="border border-slate-200 rounded-xl p-1.5 bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-600 mb-1">Foto KTP</p>
                    <img src={detailDriver.ktp_photo} alt="KTP" onClick={() => setZoomProofUrl(detailDriver.ktp_photo!)} className="w-full h-20 object-cover rounded-lg cursor-pointer" />
                  </div>
                )}
                {detailDriver.sim_photo && (
                  <div className="border border-slate-200 rounded-xl p-1.5 bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-600 mb-1">Foto SIM</p>
                    <img src={detailDriver.sim_photo} alt="SIM" onClick={() => setZoomProofUrl(detailDriver.sim_photo!)} className="w-full h-20 object-cover rounded-lg cursor-pointer" />
                  </div>
                )}
                {detailDriver.vehicle_photo && (
                  <div className="border border-slate-200 rounded-xl p-1.5 bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-600 mb-1">Kendaraan + Plat</p>
                    <img src={detailDriver.vehicle_photo} alt="Kendaraan" onClick={() => setZoomProofUrl(detailDriver.vehicle_photo!)} className="w-full h-20 object-cover rounded-lg cursor-pointer" />
                  </div>
                )}
                {detailDriver.payout_account?.proofPhoto && (
                  <div className="border border-slate-200 rounded-xl p-1.5 bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-600 mb-1">Rekening Driver</p>
                    <img src={detailDriver.payout_account.proofPhoto} alt="Rekening" onClick={() => setZoomProofUrl(detailDriver.payout_account.proofPhoto!)} className="w-full h-20 object-cover rounded-lg cursor-pointer" />
                  </div>
                )}
                {detailDriver.registration_proof_photo && (
                  <div className="border border-emerald-300 rounded-xl p-1.5 bg-emerald-50">
                    <p className="text-[10px] font-bold text-emerald-800 mb-1">Bukti Bayar Rp 50.000</p>
                    <img src={detailDriver.registration_proof_photo} alt="Bukti Bayar" onClick={() => setZoomProofUrl(detailDriver.registration_proof_photo!)} className="w-full h-20 object-cover rounded-lg cursor-pointer" />
                  </div>
                )}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-blue-900">Edit WA & Plat Nomor (Khusus Owner)</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="No. WhatsApp" value={editPhoneDraft} onChange={setEditPhoneDraft} />
                <Field label="Plat Nomor" value={editPlateDraft} onChange={setEditPlateDraft} />
              </div>
              <Btn onClick={saveDriverLockedFields} className="w-full !bg-blue-600 hover:!bg-blue-700">
                Simpan Perubahan WA & Plat
              </Btn>
            </div>

            <div className="space-y-2">
              <label className="block">
                <span className="block text-xs font-bold text-slate-700 mb-1.5">Catatan / Note untuk Driver ini</span>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm"
                />
              </label>
              <Btn onClick={saveDriverNote} className="w-full">Simpan Note</Btn>
            </div>

            {/* RESET PASSWORD DRIVER OLEH OWNER */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-amber-950">Reset Password Driver oleh Owner</p>
              <p className="text-[11px] text-amber-800">
                Owner tidak dapat melihat password lama. Masukkan password baru untuk me-reset akun ini.
              </p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Field
                    label="Password Baru"
                    value={resetPwDraft}
                    onChange={setResetPwDraft}
                    type="password"
                    placeholder="Min. 6 karakter (huruf + angka)"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setResetPwDraft(`whg${Math.floor(1000 + Math.random() * 9000)}`)}
                  className="bg-white border border-amber-300 text-amber-900 text-xs font-bold px-3 py-2.5 rounded-xl shrink-0"
                >
                  Acak
                </button>
              </div>
              {resetPwError && <p className="text-xs text-red-600 font-semibold">{resetPwError}</p>}
              <Btn
                disabled={resettingPw}
                onClick={() => ownerResetAccountPassword('Driver', detailDriver)}
                className="w-full !bg-amber-600 hover:!bg-amber-700"
              >
                {resettingPw ? 'Menyimpan...' : 'Reset Password Driver Sekarang'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* === MODAL DETAIL TOKO === */}
      {detailStore && (
        <Modal title={`Detail Toko - ${detailStore.name}`} onClose={() => setDetailStore(null)}>
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
            <div className="flex items-center gap-3">
              <img src={detailStore.photo_url || DEFAULT_STORE_IMG} alt={detailStore.name} className="w-16 h-16 rounded-xl object-cover border" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-sm text-slate-900">{detailStore.name}</p>
                {statusBadge(getDriverStatus(detailStore))}
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1 text-slate-700">
              <p>Pemilik: <b>{detailStore.owner_name}</b></p>
              <p>No. KTP: <b>{detailStore.ktp_number}</b></p>
              <p>No. WA: <b>{detailStore.phone}</b></p>
              <p>Alamat: <b>{detailStore.address}</b></p>
              <p>
                Rekening Utama: <b>{detailStore.payout_account?.provider} {detailStore.payout_account?.accountNumber}</b> a/n <b>{detailStore.payout_account?.ownerName}</b>
              </p>
              <p className="text-slate-500 flex items-center gap-1">
                <Lock size={12} /> Password: <i>Terenkripsi aman (tidak dapat dilihat siapa pun)</i>
              </p>
            </div>
            {detailStore.payout_account?.proofPhoto && (
              <img
                src={detailStore.payout_account.proofPhoto}
                alt="Buku Rekening Toko"
                onClick={() => setZoomProofUrl(detailStore.payout_account.proofPhoto!)}
                className="w-full h-28 object-cover rounded-xl border cursor-pointer"
              />
            )}
            <div className="space-y-2">
              <textarea
                value={storeNoteDraft}
                onChange={(e) => setStoreNoteDraft(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                placeholder="Catatan untuk pemilik toko..."
              />
              <Btn onClick={saveStoreNote} className="w-full">Simpan Note Toko</Btn>
            </div>

            {/* RESET PASSWORD TOKO OLEH OWNER */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-amber-950">Reset Password Toko oleh Owner</p>
              <p className="text-[11px] text-amber-800">
                Owner tidak dapat melihat password lama. Masukkan password baru untuk me-reset akun toko ini.
              </p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Field
                    label="Password Baru"
                    value={resetPwDraft}
                    onChange={setResetPwDraft}
                    type="password"
                    placeholder="Min. 6 karakter (huruf + angka)"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setResetPwDraft(`toko${Math.floor(1000 + Math.random() * 9000)}`)}
                  className="bg-white border border-amber-300 text-amber-900 text-xs font-bold px-3 py-2.5 rounded-xl shrink-0"
                >
                  Acak
                </button>
              </div>
              {resetPwError && <p className="text-xs text-red-600 font-semibold">{resetPwError}</p>}
              <Btn
                disabled={resettingPw}
                onClick={() => ownerResetAccountPassword('Toko', detailStore)}
                className="w-full !bg-amber-600 hover:!bg-amber-700"
              >
                {resettingPw ? 'Menyimpan...' : 'Reset Password Toko Sekarang'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Zoom Bukti */}
      {zoomProofUrl && (
        <Modal title="Detail Foto / Bukti" onClose={() => setZoomProofUrl(null)}>
          <div className="space-y-3">
            <img src={zoomProofUrl} alt="Bukti" className="w-full max-h-[65vh] object-contain rounded-xl bg-slate-100" />
            <Btn onClick={() => setZoomProofUrl(null)} className="w-full">
              <XCircle size={14} className="inline mr-1" /> Tutup
            </Btn>
          </div>
        </Modal>
      )}

      {approveTarget && (
        <Modal title="Setujui Driver?" onClose={() => setApproveTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Setujui pendaftaran driver <b>{approveTarget.name}</b> ({approveTarget.vehicle_type || 'Mobil'}) agar akun menjadi <b>AKTIF</b>?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="ghost" className="!text-slate-700 !bg-slate-100" onClick={() => setApproveTarget(null)}>Batal</Btn>
              <Btn variant="success" onClick={confirmApproveDriver}>Ya, Setujui</Btn>
            </div>
          </div>
        </Modal>
      )}

      {rejectTarget && (
        <Modal title="Tolak Pendaftaran Driver" onClose={() => setRejectTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Tolak pendaftaran driver <b>{rejectTarget.name}</b>?</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Alasan penolakan (opsional)..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="ghost" className="!text-slate-700 !bg-slate-100" onClick={() => setRejectTarget(null)}>Batal</Btn>
              <Btn variant="danger" onClick={confirmRejectDriver}>Konfirmasi Tolak</Btn>
            </div>
          </div>
        </Modal>
      )}

      {rejectStoreTarget && (
        <Modal title="Tolak Pendaftaran Toko" onClose={() => setRejectStoreTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Tolak pendaftaran toko <b>{rejectStoreTarget.name}</b>?</p>
            <textarea
              value={rejectStoreReason}
              onChange={(e) => setRejectStoreReason(e.target.value)}
              rows={3}
              placeholder="Alasan penolakan (opsional)..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="ghost" className="!text-slate-700 !bg-slate-100" onClick={() => setRejectStoreTarget(null)}>Batal</Btn>
              <Btn variant="danger" onClick={confirmRejectStore}>Konfirmasi Tolak</Btn>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Hapus Driver?" onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Hapus driver <b>{deleteTarget.name}</b>?</p>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="ghost" className="!text-slate-700 !bg-slate-100" onClick={() => setDeleteTarget(null)}>Batal</Btn>
              <Btn variant="danger" onClick={confirmDeleteDriver}>Hapus</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Tambah / Edit Rute + Ganti Foto */}
      {routeModalOpen && (
        <Modal
          title={editingRoute ? `Edit Rute: ${editingRoute.origin} - ${editingRoute.destination}` : 'Tambah Rute Baru'}
          onClose={() => setRouteModalOpen(false)}
        >
          <div className="space-y-3.5 max-h-[78vh] overflow-y-auto pr-1">
            <Field label="Nama Rute" value={routeNameDraft} onChange={setRouteNameDraft} placeholder="Contoh: Haurgeulis - Bandung" />

            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1.5">Jenis</span>
              <div className="grid grid-cols-3 gap-2">
                {CAR_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onRouteTypeChange(t)}
                    className={`py-2 rounded-xl border text-xs font-bold transition ${
                      routeTypeDraft === t ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label={`Harga (${routeTypeDraft}) (Rp)`} value={routePriceDraft} onChange={setRoutePriceDraft} type="number" />
              <div>
                <span className="block text-xs font-semibold text-slate-600 mb-1.5">Waktu</span>
                <input value={routeEtaDraft} onChange={(e) => setRouteEtaDraft(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm" />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {ETA_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRouteEtaDraft(preset)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                    routeEtaDraft === preset ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <span className="block text-xs font-bold text-slate-700">Foto / Banner Rute</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" onClick={() => setRoutePhotoTab('upload')} className={`py-2 px-2 rounded-xl text-[11px] font-bold border ${routePhotoTab === 'upload' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>Upload HP</button>
                <button type="button" onClick={() => setRoutePhotoTab('template')} className={`py-2 px-2 rounded-xl text-[11px] font-bold border ${routePhotoTab === 'template' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>Template</button>
                <button type="button" onClick={() => setRoutePhotoTab('url')} className={`py-2 px-2 rounded-xl text-[11px] font-bold border ${routePhotoTab === 'url' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>Link URL</button>
              </div>

              {routePhotoTab === 'upload' && (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-3 flex items-center justify-between gap-3">
                  <img src={routePhotoDraft || ROUTE_PHOTO_TEMPLATES[0].url} alt="Foto rute" className="w-16 h-14 rounded-lg object-cover" />
                  <label className="cursor-pointer bg-blue-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl">
                    Upload Foto dari HP
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onRoutePhotoUpload(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              )}

              {routePhotoTab === 'template' && (
                <div className="grid grid-cols-3 gap-2">
                  {ROUTE_PHOTO_TEMPLATES.map((tpl) => (
                    <button key={tpl.id} type="button" onClick={() => setRoutePhotoDraft(tpl.url)} className={`text-left rounded-xl border p-1 ${routePhotoDraft === tpl.url ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                      <img src={tpl.url} alt={tpl.label} className="w-full h-14 rounded-lg object-cover" />
                      <p className="text-[10px] font-semibold text-slate-700 mt-1 truncate">{tpl.label}</p>
                    </button>
                  ))}
                </div>
              )}

              {routePhotoTab === 'url' && (
                <Field label="Tempel Link Gambar (URL)" value={routePhotoDraft} onChange={setRoutePhotoDraft} />
              )}
            </div>

            {routePreviewOpen && (
              <div className="bg-slate-50 border border-blue-200 rounded-2xl p-3 space-y-2">
                <p className="text-[10px] font-bold text-blue-600 uppercase">Pratinjau Card Rute Populer</p>
                <div className="bg-white border border-slate-200 rounded-2xl p-2.5 flex items-center gap-3">
                  <div className="relative w-24 h-20 rounded-xl overflow-hidden bg-blue-50 shrink-0">
                    <img src={routePhotoDraft || ROUTE_PHOTO_TEMPLATES[0].url} alt="Pratinjau" className="w-full h-full object-cover" />
                    <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center text-rose-500">
                      <Heart size={12} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-950 truncate">{routeNameDraft || 'Haurgeulis - Bandung'}</p>
                    <p className="text-[11px] text-slate-500">{routeEtaDraft} • {routeTypeDraft}</p>
                    <p className="font-extrabold text-sm text-blue-600">{formatRupiah(Number(routePriceDraft) || 0)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Btn onClick={saveRouteForm} className="w-full !bg-blue-600 hover:!bg-blue-700">Simpan</Btn>
              <button type="button" onClick={() => setRoutePreviewOpen((v) => !v)} className="bg-slate-100 text-slate-800 text-sm font-bold py-2.5 rounded-xl">
                {routePreviewOpen ? 'Tutup Pratinjau' : 'Lihat Pratinjau'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteRouteTarget && (
        <Modal title="Hapus Rute?" onClose={() => setDeleteRouteTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Hapus rute <b>{deleteRouteTarget.origin} - {deleteRouteTarget.destination}</b>?</p>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="ghost" className="!text-slate-700 !bg-slate-100" onClick={() => setDeleteRouteTarget(null)}>Batal</Btn>
              <Btn variant="danger" onClick={confirmDeleteRoute}>Hapus</Btn>
            </div>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}
