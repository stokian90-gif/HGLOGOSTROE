import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  Landmark,
  Lock,
  LogOut,
  MapPin,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Navigation,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
  Utensils,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  AiAlertRow,
  DriverRow,
  JastipOrderRow,
  MessageRow,
  OrderRow,
  PAYOUT_PROVIDERS,
  PayoutProvider,
  StoreRow,
  formatRupiah,
  getDriverStatus,
  mapsLink,
} from '@/lib/types';
import {
  DEFAULT_DRIVER_CAR_IMG,
  DEFAULT_DRIVER_MOTOR_IMG,
  buildOwnerWaLink,
  loadSettings,
  readImageFileAsDataUrl,
} from '@/lib/settings';
import {
  clearFailedLoginAttempts,
  getCurrentLocationLabel,
  getDeviceFingerprint,
  getLoginCooldownSeconds,
  hashPassword,
  isDuplicateAccountNumber,
  logSecurityActivity,
  pushAiAlert,
  recordFailedLoginAttempt,
  verifyPassword,
} from '@/lib/securityAi';
import { playTingSound } from '@/lib/sound';
import { Btn, ErrorBox, Field, MiniMap, Modal, Toast } from '@/components/ui';
import ChatView from '@/components/ChatView';
import ForgotPasswordFlow from '@/components/ForgotPasswordFlow';
import { getMyReadAt } from '@/lib/chatRead';

const DRIVER_ID_KEY = 'ti_driver';
const DRIVER_STATUS_KEY = 'ti_driver_status';
const DRIVER_REMEMBER_KEY = 'ti_driver_remember';
const DRIVER_PHONE_KEY = 'ti_driver_phone';
const DRIVER_SESSION_VER_KEY = 'ti_driver_session_ver';

type StoredDriverStatus = 'menunggu' | 'disetujui' | 'ditolak' | 'diblokir';

function toStoredStatus(d: Pick<DriverRow, 'status'>): StoredDriverStatus {
  const s = getDriverStatus(d);
  if (s === 'pending') return 'menunggu';
  if (s === 'rejected') return 'ditolak';
  if (s === 'blocked') return 'diblokir';
  return 'disetujui';
}

function saveDriverSession(d: DriverRow, rememberPhone: boolean) {
  try {
    localStorage.setItem(DRIVER_ID_KEY, d.id);
    localStorage.setItem(DRIVER_STATUS_KEY, toStoredStatus(d));
    localStorage.setItem(DRIVER_SESSION_VER_KEY, String(d.session_version ?? 1));
    if (rememberPhone && d.phone) {
      localStorage.setItem(DRIVER_PHONE_KEY, d.phone);
    }
  } catch {
    // Ignore storage errors
  }
}

function clearDriverSession() {
  try {
    localStorage.removeItem(DRIVER_ID_KEY);
    localStorage.removeItem(DRIVER_STATUS_KEY);
    localStorage.removeItem(DRIVER_SESSION_VER_KEY);
  } catch {
    // Ignore storage errors
  }
}

function normalizePlate(p: string): string {
  return p.replace(/\s+/g, '').toUpperCase();
}

export default function DriverApp({ onLogout }: { onLogout: () => void }) {
  const [driverRecord, setDriverRecord] = useState<DriverRow | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [isRegister, setIsRegister] = useState(false);

  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DRIVER_REMEMBER_KEY) !== '0';
    } catch {
      return true;
    }
  });

  const [phone, setPhone] = useState<string>(() => {
    try {
      const rem = localStorage.getItem(DRIVER_REMEMBER_KEY) !== '0';
      return rem ? localStorage.getItem(DRIVER_PHONE_KEY) || '' : '';
    } catch {
      return '';
    }
  });
  const [pass, setPass] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [loginCooldown, setLoginCooldown] = useState(0);

  // Form daftar driver 1x (Data diri + Foto KTP/SIM/Kendaraan + Rekening + Bayar Rp 50.000)
  const [regStep, setRegStep] = useState<'form' | 'payment'>('form');
  const [regPayMethod, setRegPayMethod] = useState<'Cash' | 'Transfer'>('Transfer');
  const [rName, setRName] = useState('');
  const [rPhone, setRPhone] = useState('');
  const [rPass, setRPass] = useState('');
  const [rVehicle, setRVehicle] = useState<'Motor' | 'Mobil'>('Motor');
  const [rPlate, setRPlate] = useState('');
  const [rKtpNum, setRKtpNum] = useState('');
  const [rKtpPhoto, setRKtpPhoto] = useState<string | null>(null);
  const [rSimPhoto, setRSimPhoto] = useState<string | null>(null);
  const [rVehiclePhoto, setRVehiclePhoto] = useState<string | null>(null);
  const [rPayProvider, setRPayProvider] = useState<PayoutProvider>('DANA');
  const [rPayNumber, setRPayNumber] = useState('');
  const [rPayOwner, setRPayOwner] = useState('');
  const [rPayProof, setRPayProof] = useState<string | null>(null);
  const [rRegProof, setRRegProof] = useState<string | null>(null);
  const [submittingReg, setSubmittingReg] = useState(false);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [jastipOrders, setJastipOrders] = useState<JastipOrderRow[]>([]);
  const [alerts, setAlerts] = useState<AiAlertRow[]>([]);
  const [storesMap, setStoresMap] = useState<Record<string, StoreRow>>({});
  const [pending, setPending] = useState<{ order: OrderRow; expires: number } | null>(null);

  const [tab, setTab] = useState<'travel' | 'jastip' | 'finance' | 'profile'>('travel');
  const [financeLimit, setFinanceLimit] = useState(10);
  const [notifLimit, setNotifLimit] = useState(10);
  const [notifOpen, setNotifOpen] = useState(false);
  const [zoomProofUrl, setZoomProofUrl] = useState<string | null>(null);
  const [talanganProofDraft, setTalanganProofDraft] = useState<Record<string, string>>({});

  // Ganti / Hapus rekening terkunci (langsung ke Owner, tanpa OTP)
  const [chgProvider, setChgProvider] = useState<PayoutProvider>('DANA');
  const [chgNumber, setChgNumber] = useState('');
  const [chgOwner, setChgOwner] = useState('');
  const [chgProof, setChgProof] = useState<string | null>(null);
  const [chgReason, setChgReason] = useState('');
  const [showDelForm, setShowDelForm] = useState(false);
  const [delReason, setDelReason] = useState('');

  const [chatTarget, setChatTarget] = useState<{
    orderId: string;
    customerName: string;
    subtitle: string;
    pickup: string;
  } | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [readTick, setReadTick] = useState(0);

  const prevNotifCountRef = useRef(-1);

  const activeDriver = useMemo(
    () => (driverRecord && getDriverStatus(driverRecord) === 'approved' ? driverRecord : null),
    [driverRecord],
  );

  const loadMessages = useCallback(async (orderId: string) => {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at');
      setMessages((data as MessageRow[]) || []);
    } catch {
      // Ignore transient load error
    }
  }, []);

  const loadAllWork = useCallback(async (d: DriverRow) => {
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        supabase
          .from('orders')
          .select('*')
          .or(`driver_id.eq.${d.id},and(status.eq.Mencari Driver,driver_id.is.null)`)
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('jastip_orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('ai_alerts')
          .select('*')
          .eq('target_role', 'driver')
          .order('created_at', { ascending: false })
          .limit(40),
        supabase.from('stores').select('*'),
      ]);
      if (r1.error) throw new Error('x');
      setOrders((r1.data as OrderRow[]) || []);
      const allJastip = (r2.data as JastipOrderRow[]) || [];
      setJastipOrders(
        allJastip.filter(
          (j) =>
            j.driver_id === d.id ||
            (!j.driver_id &&
              (j.status === 'Menunggu Driver' ||
                j.status === 'Dibuat' ||
                j.status === 'Diterima Toko')),
        ),
      );
      const alertRows = ((r3.data as AiAlertRow[]) || []).filter(
        (a) => !a.target_id || a.target_id === d.id,
      );
      setAlerts(alertRows);
      const stMap: Record<string, StoreRow> = {};
      ((r4.data as StoreRow[]) || []).forEach((st) => {
        stMap[st.id] = st;
      });
      setStoresMap(stMap);
      setError('');
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  }, []);

  const reloadDriver = useCallback(
    async (id: string, showFeedback = false) => {
      if (showFeedback) setCheckingStatus(true);
      try {
        const { data, error: e } = await supabase.from('drivers').select('*').eq('id', id).maybeSingle();
        if (e) throw new Error('x');
        if (!data) {
          clearDriverSession();
          setDriverRecord(null);
          return;
        }
        const d = data as DriverRow;
        const savedVer = localStorage.getItem(DRIVER_SESSION_VER_KEY);
        const remoteVer = String(d.session_version ?? 1);
        if (savedVer && savedVer !== remoteVer) {
          clearDriverSession();
          setDriverRecord(null);
          setIsRegister(false);
          setError('Anda otomatis keluar karena password akun driver baru saja diubah.');
          return;
        }
        saveDriverSession(d, rememberMe);
        setDriverRecord(d);
        if (getDriverStatus(d) === 'approved') {
          await loadAllWork(d);
        } else if (showFeedback) {
          const st = getDriverStatus(d);
          setToast(
            st === 'rejected'
              ? 'Pendaftaran ditolak Owner'
              : st === 'blocked'
                ? 'Akun diblokir Owner'
                : 'Masih menunggu persetujuan Owner',
          );
        }
      } catch {
        if (showFeedback) setError('Koneksi bermasalah, coba lagi');
      } finally {
        if (showFeedback) setCheckingStatus(false);
      }
    },
    [loadAllWork, rememberMe],
  );

  useEffect(() => {
    if (loginCooldown <= 0) return;
    const t = setInterval(() => setLoginCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [loginCooldown]);

  useEffect(() => {
    const savedId = localStorage.getItem(DRIVER_ID_KEY);
    let openReg = false;
    try {
      if (localStorage.getItem('ti_driver_open_register') === '1') {
        openReg = true;
        localStorage.removeItem('ti_driver_open_register');
      }
    } catch {
      // Ignore storage errors
    }
    if (!savedId) {
      if (openReg) {
        setIsRegister(true);
        setRegStep('form');
      }
      setLoading(false);
      return;
    }
    reloadDriver(savedId).finally(() => setLoading(false));
  }, [reloadDriver]);

  const myOrders = useMemo(
    () => (activeDriver ? orders.filter((o) => o.driver_id === activeDriver.id) : []),
    [orders, activeDriver],
  );
  const activeOrder = useMemo(
    () => myOrders.find((o) => !['Sampai', 'Dibatalkan'].includes(o.status)) || null,
    [myOrders],
  );
  const myActiveJastip = useMemo(
    () =>
      activeDriver
        ? jastipOrders.filter(
            (j) =>
              j.driver_id === activeDriver.id &&
              !['Selesai', 'Ditolak Toko', 'Dibatalkan'].includes(j.status),
          )
        : [],
    [jastipOrders, activeDriver],
  );
  const availableJastip = useMemo(
    () =>
      jastipOrders.filter(
        (j) =>
          !j.driver_id &&
          (j.status === 'Menunggu Driver' || j.status === 'Dibuat' || j.status === 'Diterima Toko'),
      ),
    [jastipOrders],
  );

  // Bunyi "Ting!" saat ada order baru / alert baru
  const driverNotifSignal =
    alerts.filter((a) => !a.is_read).length +
    availableJastip.length +
    (orders.some((o) => o.status === 'Mencari Driver' && !o.driver_id) ? 1 : 0);

  useEffect(() => {
    if (!activeDriver) return;
    if (prevNotifCountRef.current >= 0 && driverNotifSignal > prevNotifCountRef.current) {
      playTingSound();
    }
    prevNotifCountRef.current = driverNotifSignal;
  }, [driverNotifSignal, activeDriver]);

  useEffect(() => {
    if (!driverRecord) return;
    const ch = supabase
      .channel(`driver-live-${driverRecord.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        reloadDriver(driverRecord.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        if (activeDriver) loadAllWork(activeDriver);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jastip_orders' }, () => {
        if (activeDriver) loadAllWork(activeDriver);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_alerts' }, () => {
        if (activeDriver) loadAllWork(activeDriver);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        if (chatTarget) loadMessages(chatTarget.orderId);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [driverRecord, activeDriver, loadAllWork, reloadDriver, loadMessages, chatTarget]);

  useEffect(() => {
    if (!driverRecord || getDriverStatus(driverRecord) !== 'pending') return;
    const t = setInterval(() => reloadDriver(driverRecord.id), 4000);
    return () => clearInterval(t);
  }, [driverRecord, reloadDriver]);

  useEffect(() => {
    if (chatTarget) loadMessages(chatTarget.orderId);
  }, [chatTarget, loadMessages]);

  useEffect(() => {
    const syncRead = () => setReadTick((t) => t + 1);
    window.addEventListener('ti_chat_read_changed', syncRead);
    window.addEventListener('storage', syncRead);
    return () => {
      window.removeEventListener('ti_chat_read_changed', syncRead);
      window.removeEventListener('storage', syncRead);
    };
  }, []);

  useEffect(() => {
    if (!activeDriver?.is_online || pending) return;
    const candidate = orders.find((o) => o.status === 'Mencari Driver' && !o.driver_id);
    if (candidate) {
      setPending({ order: candidate, expires: Date.now() + 30000 });
      playTingSound();
    }
  }, [orders, activeDriver, pending]);

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => {
      setPending((p) => {
        if (!p) return null;
        if (Date.now() > p.expires) return null;
        return p;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pending]);

  const toggleRememberMe = (checked: boolean) => {
    setRememberMe(checked);
    try {
      localStorage.setItem(DRIVER_REMEMBER_KEY, checked ? '1' : '0');
      if (!checked) localStorage.removeItem(DRIVER_PHONE_KEY);
      else if (phone.trim()) localStorage.setItem(DRIVER_PHONE_KEY, phone.replace(/[\s-]/g, ''));
    } catch {
      // Ignore storage errors
    }
  };

  const handleUploadPhoto = async (
    file: File | null,
    target: 'ktp' | 'sim' | 'vehicle' | 'payout' | 'regProof' | 'chgPayout',
  ) => {
    if (!file) return;
    try {
      const url = await readImageFileAsDataUrl(file);
      if (target === 'ktp') setRKtpPhoto(url);
      else if (target === 'sim') setRSimPhoto(url);
      else if (target === 'vehicle') setRVehiclePhoto(url);
      else if (target === 'payout') setRPayProof(url);
      else if (target === 'regProof') setRRegProof(url);
      else setChgProof(url);
      setToast('Foto berhasil dipilih');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membaca foto');
    }
  };

  const finalizeLogin = async (matched: DriverRow) => {
    const devFp = getDeviceFingerprint();
    const devices = Array.from(new Set([...(matched.trusted_devices || []), devFp]));
    const loc = getCurrentLocationLabel();
    await supabase
      .from('drivers')
      .update({ trusted_devices: devices, last_location: loc })
      .eq('id', matched.id);
    const updated: DriverRow = { ...matched, trusted_devices: devices, last_location: loc };

    if (rememberMe) localStorage.setItem(DRIVER_PHONE_KEY, matched.phone);
    else localStorage.removeItem(DRIVER_PHONE_KEY);

    saveDriverSession(updated, rememberMe);
    setDriverRecord(updated);
    await logSecurityActivity({
      actorName: updated.name,
      role: 'Driver',
      action: 'Login driver berhasil',
      severity: 'info',
    });
    if (getDriverStatus(updated) === 'approved') {
      await loadAllWork(updated);
    }
  };

  const doLogin = async () => {
    const cleanPhone = phone.replace(/[\s-]/g, '');
    if (!/^0\d{8,14}$/.test(cleanPhone)) return setError('Nomor HP / WhatsApp tidak valid');
    if (pass.length < 4) return setError('Password minimal 4 karakter');

    const failKey = `driver_${cleanPhone}`;
    const cd = getLoginCooldownSeconds(failKey);
    if (cd > 0) {
      setLoginCooldown(cd);
      return setError(`Password salah 3x, coba Lupa Password? atau tunggu 1 menit (${cd} dtk)`);
    }

    setError('');
    try {
      const { data, error: e } = await supabase
        .from('drivers')
        .select('*')
        .eq('phone', cleanPhone)
        .order('created_at', { ascending: false });
      if (e) throw new Error('x');
      const rows = (data as DriverRow[]) || [];
      let matched: DriverRow | null = null;
      for (const row of rows) {
        if (await verifyPassword(pass, row.password)) {
          matched = row;
          break;
        }
      }
      if (!matched) {
        const failRes = recordFailedLoginAttempt(failKey);
        if (failRes.cooldownSeconds > 0) {
          setLoginCooldown(failRes.cooldownSeconds);
        }
        await logSecurityActivity({
          actorName: cleanPhone,
          role: 'Driver',
          action:
            failRes.cooldownSeconds > 0
              ? 'Percobaan login driver gagal 3x berturut-turut (jeda 1 menit, disarankan Lupa Password ke Owner)'
              : 'Percobaan login gagal (No. HP / password salah)',
          severity: 'warning',
        });
        return setError(failRes.message);
      }

      clearFailedLoginAttempts(failKey);
      setLoginCooldown(0);

      // Enkripsi password lama & simpan riwayat awal jika belum hash
      if (!matched.password.startsWith('enc$')) {
        const hashed = await hashPassword(pass);
        const hist = Array.from(new Set([...(matched.password_history || []), hashed])).slice(-3);
        await supabase.from('drivers').update({ password: hashed, password_history: hist }).eq('id', matched.id);
        matched = { ...matched, password: hashed, password_history: hist };
      }

      await finalizeLogin(matched);
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  };

  const validateAndProceedToPayment = async () => {
    const cleanPhone = rPhone.replace(/[\s-]/g, '');
    const cleanPlate = rPlate.trim().toUpperCase();
    const normPlate = normalizePlate(rPlate);
    const cleanKtp = rKtpNum.replace(/\s+/g, '');
    const cleanPayNum = rPayNumber.replace(/[\s-]/g, '');

    if (rName.trim().length < 2) return setError('Nama lengkap minimal 2 huruf');
    if (!/^0\d{8,14}$/.test(cleanPhone)) return setError('Nomor WA tidak valid (contoh: 081234567890)');
    if (rPass.length < 6) return setError('Password minimal 6 karakter');
    if (cleanPlate.length < 3) return setError('Plat Motor / Mobil wajib diisi (contoh: E 21212 BA)');
    if (!/^\d{8,16}$/.test(cleanKtp)) return setError('Nomor KTP harus angka 8-16 digit');
    if (!rKtpPhoto) return setError('Foto KTP wajib diupload');
    if (!rSimPhoto) return setError('Foto SIM wajib diupload');
    if (!rVehiclePhoto) return setError('Foto Kendaraan + Plat wajib diupload');
    if (cleanPayNum.length < 6) return setError('Nomor Rekening DANA / Bank wajib diisi');
    if (rPayOwner.trim().length < 2) return setError('Nama Pemilik Rekening wajib diisi');

    setError('');
    try {
      const [rDrv, rSt] = await Promise.all([
        supabase.from('drivers').select('*'),
        supabase.from('stores').select('*'),
      ]);
      const allDrivers = (rDrv.data as DriverRow[]) || [];
      const allStores = (rSt.data as StoreRow[]) || [];
      // Cek duplikasi terhadap semua driver aktif, menunggu, maupun yang diblokir
      const nonRejected = allDrivers.filter((d) => getDriverStatus(d) !== 'rejected');
      const settings = loadSettings();

      const rejectDuplicate = async (reason: string) => {
        await logSecurityActivity({
          actorName: rName.trim(),
          role: 'Driver',
          action: `Ditolak otomatis AI Anti Akun Ganda: ${reason}`,
          severity: 'critical',
        });
        await pushAiAlert({
          targetRole: 'owner',
          title: 'Percobaan Daftar Akun Ganda Driver!',
          message: `Pendaftar "${rName.trim()}" (${cleanPhone}, Plat ${cleanPlate}) ditolak: ${reason}`,
          category: 'duplicate',
        });
        setError('Data sudah terdaftar, hubungi Owner!');
      };

      if (nonRejected.some((d) => d.phone === cleanPhone)) {
        return rejectDuplicate('No. WA sudah terdaftar (1 WA = 1 Driver)');
      }
      if (nonRejected.some((d) => normalizePlate(d.plate) === normPlate)) {
        return rejectDuplicate('Plat kendaraan sudah terdaftar (1 Plat = 1 Driver)');
      }
      if (nonRejected.some((d) => (d.ktp_number || '') === cleanKtp)) {
        return rejectDuplicate('No. KTP sudah terdaftar (1 KTP = 1 Driver)');
      }
      if (
        isDuplicateAccountNumber(
          rPayProvider,
          cleanPayNum,
          allDrivers,
          allStores,
          settings.finance.ownerPayout,
        )
      ) {
        return rejectDuplicate('Rekening sudah dipakai akun lain (1 Rekening = 1 Akun)');
      }

      setRegStep('payment');
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  };

  const doRegister = async () => {
    const cleanPhone = rPhone.replace(/[\s-]/g, '');
    const cleanPlate = rPlate.trim().toUpperCase();
    const cleanKtp = rKtpNum.replace(/\s+/g, '');
    const cleanPayNum = rPayNumber.replace(/[\s-]/g, '');

    if (regPayMethod === 'Transfer' && !rRegProof) {
      return setError('Upload 1 Foto Bukti Transfer Rp 50.000 ke Owner terlebih dahulu');
    }

    setError('');
    setSubmittingReg(true);
    try {
      const settings = loadSettings();
      const regFee = settings.finance.driverRegistrationFee || 50000;
      const encryptedPass = await hashPassword(rPass);
      const newCode = 'DRV' + Math.floor(1000 + Math.random() * 9000);
      const devFp = getDeviceFingerprint();
      const isTransfer = regPayMethod === 'Transfer';

      const { data, error: e } = await supabase
        .from('drivers')
        .insert({
          name: rName.trim(),
          phone: cleanPhone,
          driver_code: newCode,
          sim: '-',
          plate: cleanPlate,
          password: encryptedPass,
          password_history: [encryptedPass],
          session_version: 1,
          last_location: getCurrentLocationLabel(),
          vehicle_type: rVehicle,
          ktp_number: cleanKtp,
          ktp_photo: rKtpPhoto,
          sim_photo: rSimPhoto,
          vehicle_photo: rVehiclePhoto,
          photo_url: rVehicle === 'Motor' ? DEFAULT_DRIVER_MOTOR_IMG : DEFAULT_DRIVER_CAR_IMG,
          payout_account: {
            provider: rPayProvider,
            accountNumber: cleanPayNum,
            ownerName: rPayOwner.trim(),
            proofPhoto: rPayProof,
            locked: true,
            pendingChange: null,
          },
          trusted_devices: [devFp],
          dispute_false_count: 0,
          registration_payment_method: regPayMethod,
          registration_fee_amount: regFee,
          registration_fee_paid: isTransfer,
          registration_proof_photo: isTransfer ? rRegProof : null,
          status: 'pending',
          is_online: false,
          owner_note: null,
          rejection_reason: null,
        })
        .select()
        .single();
      if (e || !data) throw new Error('x');

      const created = data as DriverRow;
      await logSecurityActivity({
        actorName: created.name,
        role: 'Driver',
        action: `Daftar Driver baru (${regPayMethod} ${formatRupiah(regFee)}) — menunggu ACC Owner`,
        severity: 'info',
      });

      await pushAiAlert({
        targetRole: 'owner',
        title: `Driver Baru: ${created.name}`,
        message: `Driver Baru: ${created.name}, WA ${created.phone}, Plat ${created.plate}, ${
          isTransfer
            ? `Sudah Bayar ${formatRupiah(regFee)}, Bukti Terlampir`
            : `Pilih Bayar Cash ${formatRupiah(regFee)} ke Owner`
        }.`,
        category: 'system',
      });

      if (rememberMe) localStorage.setItem(DRIVER_PHONE_KEY, cleanPhone);
      saveDriverSession(created, rememberMe);
      setPhone(cleanPhone);
      setPass('');
      setRName('');
      setRPhone('');
      setRPass('');
      setRPlate('');
      setRKtpNum('');
      setRKtpPhoto(null);
      setRSimPhoto(null);
      setRVehiclePhoto(null);
      setRPayNumber('');
      setRPayOwner('');
      setRPayProof(null);
      setRRegProof(null);
      setRegStep('form');
      setIsRegister(false);
      setDriverRecord(created);
      setToast('Pendaftaran terkirim! Status: Menunggu ACC Owner.');
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    } finally {
      setSubmittingReg(false);
    }
  };

  const logoutToLogin = () => {
    const lastPhone = driverRecord?.phone || phone;
    clearDriverSession();
    setDriverRecord(null);
    setOrders([]);
    setJastipOrders([]);
    setPending(null);
    setPass('');
    setError('');
    setIsRegister(false);
    if (rememberMe && lastPhone) {
      localStorage.setItem(DRIVER_PHONE_KEY, lastPhone);
      setPhone(lastPhone);
    } else if (!rememberMe) {
      setPhone('');
    }
  };

  const handleRegisterAgain = () => {
    const prev = driverRecord;
    clearDriverSession();
    setDriverRecord(null);
    setError('');
    if (prev) {
      setRName(prev.name);
      setRPhone(prev.phone);
      setRVehicle(prev.vehicle_type || 'Motor');
      setRPlate(prev.plate && prev.plate !== '-' ? prev.plate : '');
      setRKtpNum(prev.ktp_number || '');
    }
    setIsRegister(true);
  };

  const toggleOnline = async () => {
    if (!activeDriver) return;
    try {
      const { data, error: e } = await supabase
        .from('drivers')
        .update({ is_online: !activeDriver.is_online })
        .eq('id', activeDriver.id)
        .select()
        .single();
      if (e || !data) throw new Error('x');
      setDriverRecord(data as DriverRow);
      setToast(data.is_online ? 'Anda ONLINE - siap menerima Travel & Order Makanan' : 'Anda OFFLINE');
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  };

  const acceptTravel = async () => {
    if (!pending || !activeDriver) return;
    const o = pending.order;
    setPending(null);
    try {
      const { data, error: e } = await supabase
        .from('orders')
        .update({
          driver_id: activeDriver.id,
          status: o.status === 'Mencari Driver' ? 'Driver OTW' : o.status,
        })
        .eq('id', o.id)
        .select()
        .single();
      if (e) throw new Error('x');
      if (!data) return setToast('Order sudah diambil driver lain');
      setToast('Order Travel diambil! Jemput customer & terima bayaran saat tiba.');
      await loadAllWork(activeDriver);
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  };

  const rejectTravel = () => {
    setPending(null);
    setToast('Order dilewati');
  };

  const advanceTravel = async (o: OrderRow) => {
    const flow = ['Driver OTW', 'Driver Tiba', 'Dalam Perjalanan', 'Sampai'];
    const idx = flow.indexOf(o.status);
    if (idx < 0 || idx >= flow.length - 1) return;
    const next = flow[idx + 1];
    try {
      const patch =
        next === 'Sampai'
          ? { status: next, customer_paid_driver: true }
          : { status: next };
      const { error: e } = await supabase.from('orders').update(patch).eq('id', o.id);
      if (e) throw new Error('x');
      if (next === 'Sampai' && activeDriver) {
        const today = new Date().toISOString().slice(0, 10);
        const count = activeDriver.bonus_date === today ? activeDriver.trips_today + 1 : 1;
        await supabase
          .from('drivers')
          .update({ trips_today: count, bonus_date: today })
          .eq('id', activeDriver.id);
        setToast(`Trip Travel selesai! 100% hasil orderan ${formatRupiah(o.price)} milik Anda!`);
      }
      if (activeDriver) await reloadDriver(activeDriver.id);
    } catch {
      setError('Koneksi bermasalah, coba lagi');
    }
  };

  // Order Makanan (Sistem Driver Talangin Dulu)
  const claimJastip = async (j: JastipOrderRow) => {
    if (!activeDriver) return;
    await supabase
      .from('jastip_orders')
      .update({
        driver_id: activeDriver.id,
        driver_name: activeDriver.name,
        driver_plate: activeDriver.plate,
        driver_phone: activeDriver.phone,
        status: 'Menunggu Talangan',
      })
      .eq('id', j.id);
    await pushAiAlert({
      targetRole: 'store',
      targetId: j.store_id,
      title: `Driver ${activeDriver.name} mengambil orderan`,
      message: `Driver sedang menuju toko Anda untuk menalangi pesanan Rp ${formatRupiah(j.food_subtotal)} atas nama ${j.customer_name}.`,
      category: 'payment',
    });
    setToast('Orderan diambil! Bayar talangan ke toko terlebih dahulu.');
    await loadAllWork(activeDriver);
  };

  const handleTalanganProofUpload = async (orderId: string, file: File | null) => {
    if (!file) return;
    try {
      const url = await readImageFileAsDataUrl(file);
      setTalanganProofDraft((prev) => ({ ...prev, [orderId]: url }));
      setToast('Foto bukti bayar ke toko siap dikirim');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membaca foto');
    }
  };

  const payStoreTalangan = async (j: JastipOrderRow, method: 'Cash' | 'Transfer') => {
    if (!activeDriver) return;
    const proof = talanganProofDraft[j.id] || null;
    await supabase
      .from('jastip_orders')
      .update({
        driver_paid_store: true,
        driver_paid_store_method: method,
        driver_paid_store_proof: proof,
        status: 'Menunggu Konfirmasi Toko',
      })
      .eq('id', j.id);
    setTalanganProofDraft((prev) => {
      const next = { ...prev };
      delete next[j.id];
      return next;
    });
    await pushAiAlert({
      targetRole: 'store',
      targetId: j.store_id,
      title: `Driver ${activeDriver.name} sudah bayar ${formatRupiah(j.food_subtotal)}`,
      message: `Driver talangi ${formatRupiah(j.food_subtotal)} (${method}) untuk orderan ${j.customer_name}. Silakan konfirmasi & buatkan pesanan!`,
      category: 'payment',
    });
    setToast('Pembayaran talangan dilaporkan ke Toko! Tunggu konfirmasi Toko.');
    await loadAllWork(activeDriver);
  };

  const advanceJastip = async (j: JastipOrderRow) => {
    if (!activeDriver) return;
    let nextStatus = '';
    if (j.status === 'Dibuat') nextStatus = 'Driver Mengantar';
    else if (j.status === 'Driver Mengantar') nextStatus = 'Selesai';
    if (!nextStatus) return;

    const patch =
      nextStatus === 'Selesai'
        ? { status: nextStatus, customer_paid_driver: true }
        : { status: nextStatus };

    await supabase.from('jastip_orders').update(patch).eq('id', j.id);
    if (nextStatus === 'Selesai') {
      setToast(`Order selesai! 100% Ongkir ${formatRupiah(j.delivery_fee)} langsung milik Anda (Tanpa potongan)!`);
      await reloadDriver(activeDriver.id);
    } else {
      setToast('Status diperbarui: Sedang mengantar pesanan ke Customer!');
      await loadAllWork(activeDriver);
    }
  };

  // Ganti / Hapus rekening terkunci -> Langsung ke Owner untuk ACC (Tanpa OTP)
  const submitChangeAccount = async () => {
    if (!activeDriver) return;
    const cleanNum = chgNumber.replace(/[\s-]/g, '');
    if (cleanNum.length < 6) return setError('Isi nomor rekening/e-wallet baru');
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
        activeDriver.id,
      )
    ) {
      return setError('Nomor rekening baru sudah digunakan akun lain (1 Rekening = 1 Akun).');
    }

    const updatedPayout = {
      ...activeDriver.payout_account,
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
    await supabase
      .from('drivers')
      .update({ payout_account: updatedPayout })
      .eq('id', activeDriver.id);
    await logSecurityActivity({
      actorName: activeDriver.name,
      role: 'Driver',
      action: `Mengajukan ganti rekening ke ${chgProvider} ${cleanNum} (Alasan: ${chgReason.trim()})`,
      severity: 'warning',
    });
    await pushAiAlert({
      targetRole: 'owner',
      title: `Ajuan Ganti Rekening Driver ${activeDriver.name}`,
      message: `${activeDriver.name} mengajukan ganti rekening ke ${chgProvider} ${cleanNum} a/n ${chgOwner.trim()}. Alasan: ${chgReason.trim()}`,
      category: 'payment',
    });
    setChgNumber('');
    setChgOwner('');
    setChgProof(null);
    setChgReason('');
    setToast('Pengajuan ganti rekening dikirim ke Owner untuk ACC!');
    await reloadDriver(activeDriver.id);
  };

  const submitDeleteAccount = async () => {
    if (!activeDriver) return;
    if (delReason.trim().length < 3) return setError('Isi alasan hapus rekening');
    setError('');

    const updatedPayout = {
      ...activeDriver.payout_account,
      pendingChange: {
        action: 'delete' as const,
        provider: activeDriver.payout_account.provider,
        accountNumber: activeDriver.payout_account.accountNumber,
        ownerName: activeDriver.payout_account.ownerName,
        proofPhoto: null,
        reason: delReason.trim(),
        requestedAt: new Date().toISOString(),
      },
    };
    await supabase
      .from('drivers')
      .update({ payout_account: updatedPayout })
      .eq('id', activeDriver.id);
    await logSecurityActivity({
      actorName: activeDriver.name,
      role: 'Driver',
      action: `Mengajukan hapus rekening (${activeDriver.payout_account.provider} ${activeDriver.payout_account.accountNumber}). Alasan: ${delReason.trim()}`,
      severity: 'warning',
    });
    await pushAiAlert({
      targetRole: 'owner',
      title: `Ajuan Hapus Rekening Driver ${activeDriver.name}`,
      message: `${activeDriver.name} mengajukan hapus rekening. Alasan: ${delReason.trim()}`,
      category: 'payment',
    });
    setDelReason('');
    setShowDelForm(false);
    setToast('Pengajuan hapus rekening dikirim ke Owner untuk ACC!');
    await reloadDriver(activeDriver.id);
  };

  const sendChatMessage = async (body: string) => {
    if (!chatTarget || !body.trim()) return;
    await supabase.from('messages').insert({
      order_id: chatTarget.orderId,
      sender: 'Driver',
      body: body.trim(),
    });
    await loadMessages(chatTarget.orderId);
  };

  const unreadTravelCount = useMemo(() => {
    void readTick;
    if (!activeOrder) return 0;
    const myRead = getMyReadAt(activeOrder.id, 'Driver');
    const myReadMs = myRead ? new Date(myRead).getTime() : 0;
    return messages.filter(
      (m) =>
        m.order_id === activeOrder.id &&
        m.sender !== 'Driver' &&
        new Date(m.created_at).getTime() > myReadMs,
    ).length;
  }, [activeOrder, messages, readTick]);

  // Pendapatan Bersih Driver 100% (Tanpa Komisi, Tanpa Potongan)
  const financialEntries = useMemo(() => {
    const travelItems = myOrders
      .filter((o) => o.status === 'Sampai' || o.customer_paid_driver)
      .map((o) => ({
        id: o.id,
        type: 'Travel' as const,
        title: `${o.pickup} → ${o.destination}`,
        from: o.customer_name,
        gross: o.price,
        net: o.price,
        summaryLine: `Trip ini kamu terima penuh ${formatRupiah(o.price)} (100% milik Driver · Tanpa potongan)`,
        status: '100% Milik Anda',
        createdAt: o.created_at,
      }));

    const foodItems = jastipOrders
      .filter(
        (j) =>
          activeDriver &&
          j.driver_id === activeDriver.id &&
          (j.status === 'Selesai' || j.customer_paid_driver),
      )
      .map((j) => ({
        id: j.id,
        type: 'Order Makanan' as const,
        title: `${j.store_name} → ${j.delivery_address}`,
        from: j.customer_name,
        gross: j.delivery_fee,
        net: j.delivery_fee,
        summaryLine: `Trip ini kamu untung Ongkir penuh ${formatRupiah(j.delivery_fee)} (100% milik Driver · Tanpa potongan)`,
        status: '100% Milik Anda',
        createdAt: j.created_at,
      }));

    return [...travelItems, ...foodItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [myOrders, jastipOrders, activeDriver]);

  const totalDriverNet = useMemo(
    () => financialEntries.reduce((sum, f) => sum + f.net, 0),
    [financialEntries],
  );

  if (loading) return <div className="min-h-screen grid place-items-center text-slate-500">Memuat...</div>;

  // STATUS MENUNGGU ACC OWNER
  if (driverRecord && getDriverStatus(driverRecord) === 'pending') {
    const ownerPhone = loadSettings().finance.ownerPayout.accountNumber || '085612340000';
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-700 to-sky-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 mx-auto flex items-center justify-center">
            <Clock size={32} />
          </div>
          <div className="space-y-1">
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
              STATUS: MENUNGGU ACC OWNER
            </span>
            <h2 className="text-lg font-bold text-slate-800 pt-1">
              Menunggu Persetujuan Owner, silakan tunggu
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Driver belum bisa ambil orderan sebelum di-ACC Owner. Setelah di-ACC, Anda langsung masuk ke Dashboard Driver tanpa perlu isi No. WA & Password lagi.
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-left text-xs space-y-1 text-slate-700">
            <p>Nama: <b>{driverRecord.name}</b></p>
            <p>No. WA: <b>{driverRecord.phone}</b></p>
            <p>Kendaraan: <b>{driverRecord.vehicle_type || 'Mobil'}</b> ({driverRecord.plate})</p>
            <p>
              Pembayaran Pendaftaran: <b>{driverRecord.registration_payment_method || 'Transfer'} ({formatRupiah(driverRecord.registration_fee_amount ?? 50000)})</b>
            </p>
            <p>
              Rekening Utama: <b>{driverRecord.payout_account?.provider} {driverRecord.payout_account?.accountNumber}</b>
            </p>
          </div>
          <Btn
            onClick={() => reloadDriver(driverRecord.id, true)}
            disabled={checkingStatus}
            className="w-full flex items-center justify-center gap-2"
          >
            <RefreshCw size={15} className={checkingStatus ? 'animate-spin' : ''} />
            <span>{checkingStatus ? 'Memeriksa...' : 'Cek Status ACC Owner'}</span>
          </Btn>
          <a
            href={buildOwnerWaLink(
              ownerPhone,
              `Halo Owner, saya ${driverRecord.name} (${driverRecord.plate}) sudah daftar Driver WONG HAURGEULIS, mohon ACC pendaftarannya.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
          >
            <MessageCircle size={15} /> Chat Owner via WA
          </a>
          <div className="space-y-1">
            <button type="button" onClick={logoutToLogin} className="w-full text-xs text-sky-600 font-semibold py-1">
              Keluar / Ganti Akun
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
  if (driverRecord && (getDriverStatus(driverRecord) === 'rejected' || getDriverStatus(driverRecord) === 'blocked')) {
    const isBlocked = getDriverStatus(driverRecord) === 'blocked';
    const note =
      driverRecord.owner_note?.trim() ||
      driverRecord.rejection_reason?.trim() ||
      (isBlocked ? 'Akun driver dinonaktifkan sementara oleh Owner.' : 'Pendaftaran belum disetujui Owner.');

    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-700 to-sky-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center">
            {isBlocked ? <ShieldAlert size={32} /> : <AlertCircle size={32} />}
          </div>
          <h2 className="text-lg font-bold text-slate-800">
            {isBlocked ? 'Akun Driver Diblokir Owner' : 'Pendaftaran Ditolak Owner'}
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-left text-xs text-amber-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5"><Megaphone size={14} /> Note Owner:</p>
            <p>{note}</p>
          </div>
          {!isBlocked && (
            <Btn onClick={handleRegisterAgain} className="w-full !bg-sky-600 hover:!bg-sky-700">
              Daftar Lagi
            </Btn>
          )}
          <button type="button" onClick={logoutToLogin} className="w-full text-xs text-sky-600 font-semibold py-1">
            Masuk dengan Akun Lain
          </button>
          <button type="button" onClick={onLogout} className="w-full text-xs text-slate-400 py-1">
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  // BELUM LOGIN / DAFTAR BARU / LUPA PASSWORD
  if (!activeDriver) {
    if (showForgot) {
      return (
        <ForgotPasswordFlow
          role="Driver"
          initialPhone={phone}
          theme="sky"
          onBackToLogin={() => {
            setShowForgot(false);
            setIsRegister(false);
            setError('');
          }}
        />
      );
    }

    const ownerPayout = loadSettings().finance.ownerPayout;
    const regFee = loadSettings().finance.driverRegistrationFee || 50000;

    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-700 to-sky-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-7">
          <h2 className="text-xl font-bold text-center text-slate-800 mb-1">
            {isRegister
              ? regStep === 'payment'
                ? 'Biaya Pendaftaran Driver'
                : 'Daftar Jadi Driver (1x Saja)'
              : 'Masuk Driver'}
          </h2>
          <p className="text-xs text-slate-500 text-center mb-4">
            {isRegister
              ? regStep === 'payment'
                ? 'Bayar sekali saja, berlaku selamanya — hasil orderan 100% milik Anda'
                : '1 WA = 1 Driver, 1 Plat = 1 Driver, 1 KTP = 1 Driver'
              : 'Masuk dengan No. WA & password'}
          </p>

          <div className="space-y-3 max-h-[72vh] overflow-y-auto pr-1">
            {isRegister ? (
              regStep === 'form' ? (
                <>
                  <Field label="Nama Lengkap" value={rName} onChange={setRName} placeholder="Nama sesuai KTP" />
                  <Field label="No. WA" value={rPhone} onChange={setRPhone} placeholder="08..." />
                  <Field label="Password" value={rPass} onChange={setRPass} type="password" placeholder="Minimal 6 karakter" />
                  <div>
                    <span className="block text-xs font-semibold text-slate-600 mb-1.5">Jenis Kendaraan</span>
                    <div className="grid grid-cols-2 gap-2">
                      {(['Motor', 'Mobil'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setRVehicle(v)}
                          className={`py-2.5 rounded-xl border-2 text-xs font-bold transition ${
                            rVehicle === v
                              ? 'border-sky-600 bg-sky-50 text-sky-800'
                              : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field label="Plat Motor / Mobil" value={rPlate} onChange={setRPlate} placeholder="Contoh: E 21212 BA" />
                  <Field label="No. KTP (NIK)" value={rKtpNum} onChange={setRKtpNum} placeholder="3212xxxxxxxxxxxx" />

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center space-y-1.5">
                      <span className="block text-[10px] font-bold text-slate-700">Foto KTP</span>
                      {rKtpPhoto && <img src={rKtpPhoto} alt="KTP" className="w-full h-14 object-cover rounded-lg" />}
                      <label className="inline-flex items-center gap-1 cursor-pointer bg-sky-600 text-white text-[10px] font-bold px-2 py-1.5 rounded-lg">
                        <Upload size={11} /> {rKtpPhoto ? 'Ganti' : 'Upload'}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadPhoto(e.target.files?.[0] ?? null, 'ktp')} />
                      </label>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center space-y-1.5">
                      <span className="block text-[10px] font-bold text-slate-700">Foto SIM</span>
                      {rSimPhoto && <img src={rSimPhoto} alt="SIM" className="w-full h-14 object-cover rounded-lg" />}
                      <label className="inline-flex items-center gap-1 cursor-pointer bg-sky-600 text-white text-[10px] font-bold px-2 py-1.5 rounded-lg">
                        <Upload size={11} /> {rSimPhoto ? 'Ganti' : 'Upload'}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadPhoto(e.target.files?.[0] ?? null, 'sim')} />
                      </label>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center space-y-1.5">
                      <span className="block text-[10px] font-bold text-slate-700">Kendaraan+Plat</span>
                      {rVehiclePhoto && <img src={rVehiclePhoto} alt="Kendaraan" className="w-full h-14 object-cover rounded-lg" />}
                      <label className="inline-flex items-center gap-1 cursor-pointer bg-sky-600 text-white text-[10px] font-bold px-2 py-1.5 rounded-lg">
                        <Upload size={11} /> {rVehiclePhoto ? 'Ganti' : 'Upload'}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadPhoto(e.target.files?.[0] ?? null, 'vehicle')} />
                      </label>
                    </div>
                  </div>

                  {/* REKENING DANA / BANK UNTUK TERIMA BAYARAN CUSTOMER */}
                  <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3.5 space-y-2.5">
                    <p className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                      <Landmark size={14} /> Rekening DANA / Bank untuk terima bayaran dari Customer
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PAYOUT_PROVIDERS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setRPayProvider(p)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                            rPayProvider === p
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <Field
                      label={`Nomor ${rPayProvider}`}
                      value={rPayNumber}
                      onChange={setRPayNumber}
                      placeholder="Contoh: 081234567890"
                    />
                    <Field
                      label="Nama Pemilik Rekening"
                      value={rPayOwner}
                      onChange={setRPayOwner}
                      placeholder="Sesuai buku rekening / akun DANA"
                    />
                    <div className="bg-white border border-dashed border-sky-300 rounded-xl p-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {rPayProof && <img src={rPayProof} alt="Bukti Rekening" className="w-12 h-10 object-cover rounded-lg shrink-0" />}
                        <span className="text-[11px] text-slate-600 truncate">
                          {rPayProof ? 'Foto Rekening / SS DANA siap' : 'Foto Buku Rekening / SS (Opsional)'}
                        </span>
                      </div>
                      <label className="cursor-pointer bg-sky-600 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg shrink-0">
                        Upload
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadPhoto(e.target.files?.[0] ?? null, 'payout')} />
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="bg-gradient-to-br from-sky-700 to-blue-900 text-white rounded-2xl p-4 space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-sky-200">
                      Pendaftaran Driver WONG HAURGEULIS
                    </p>
                    <p className="text-sm font-extrabold leading-snug">
                      Biaya Pendaftaran Driver: {formatRupiah(regFee)} Sekali Bayar, Berlaku Selamanya, Hasil Orderan 100% Milik Kamu, Tanpa Komisi, Tanpa Potongan
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRegPayMethod('Cash');
                        setError('');
                      }}
                      className={`p-3 rounded-xl border-2 text-xs font-bold transition text-center ${
                        regPayMethod === 'Cash'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      💵 Bayar Cash ke Owner
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRegPayMethod('Transfer');
                        setError('');
                      }}
                      className={`p-3 rounded-xl border-2 text-xs font-bold transition text-center ${
                        regPayMethod === 'Transfer'
                          ? 'border-sky-600 bg-sky-50 text-sky-900'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      📱 Transfer ke Owner {formatRupiah(regFee)}
                    </button>
                  </div>

                  {regPayMethod === 'Transfer' ? (
                    <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3.5 space-y-2.5 text-xs">
                      <p className="font-bold text-sky-950">Transfer ke 1 Rekening Owner:</p>
                      <div className="bg-white border border-sky-200 rounded-xl p-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-slate-900 text-sm">
                            {ownerPayout.provider}: {ownerPayout.accountNumber}
                          </p>
                          <p className="text-slate-600">a/n {ownerPayout.ownerName}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(ownerPayout.accountNumber);
                            setToast(`Nomor ${ownerPayout.provider} disalin`);
                          }}
                          className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
                        >
                          <Copy size={12} /> Salin Nomor
                        </button>
                      </div>

                      <div className="bg-white border border-dashed border-sky-300 rounded-xl p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {rRegProof && <img src={rRegProof} alt="Bukti Transfer" className="w-12 h-12 object-cover rounded-lg shrink-0" />}
                          <span className="text-slate-700 font-semibold truncate">
                            {rRegProof ? '1 Foto Bukti Transfer siap' : 'Upload 1 Foto Bukti Transfer'}
                          </span>
                        </div>
                        <label className="cursor-pointer bg-sky-600 text-white font-bold px-3 py-1.5 rounded-lg shrink-0">
                          {rRegProof ? 'Ganti' : 'Upload Foto'}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadPhoto(e.target.files?.[0] ?? null, 'regProof')} />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs text-emerald-950 space-y-1">
                      <p className="font-bold">Bayar Cash ke Owner ({formatRupiah(regFee)})</p>
                      <p className="text-emerald-800">
                        Setelah klik daftar, silakan datang menemui Owner untuk menyerahkan uang pendaftaran {formatRupiah(regFee)}. Owner akan klik <b>Sudah Terima Cash</b> dan akun Anda langsung aktif!
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setRegStep('form');
                      setError('');
                    }}
                    className="w-full text-xs text-sky-700 font-bold py-1"
                  >
                    ← Kembali ubah data diri
                  </button>
                </div>
              )
            ) : (
              <>
                <Field label="No. HP / WhatsApp" value={phone} onChange={setPhone} placeholder="081234567890" />
                <div className="space-y-1.5">
                  <Field label="Password" value={pass} onChange={setPass} type="password" placeholder="Password Anda" />
                  <div className="flex items-center justify-between pt-0.5">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => toggleRememberMe(e.target.checked)}
                        className="w-4 h-4 accent-sky-600 rounded"
                      />
                      <span className="font-semibold">Ingat Saya</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setShowForgot(true);
                      }}
                      className="text-xs font-bold text-sky-600 hover:text-sky-800 hover:underline"
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
              </>
            )}
            <ErrorBox message={error} />
            <Btn
              onClick={
                isRegister
                  ? regStep === 'form'
                    ? validateAndProceedToPayment
                    : doRegister
                  : doLogin
              }
              disabled={(!isRegister && loginCooldown > 0) || submittingReg}
              className="w-full"
            >
              {!isRegister
                ? 'Masuk'
                : regStep === 'form'
                  ? 'Lanjut ke Pembayaran Pendaftaran'
                  : regPayMethod === 'Transfer'
                    ? `Saya Sudah Bayar ${formatRupiah(regFee)}`
                    : `Daftar & Bayar Cash ${formatRupiah(regFee)} ke Owner`}
            </Btn>
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setRegStep('form');
                setError('');
              }}
              className="w-full text-xs text-sky-600 hover:text-sky-800 font-semibold py-2"
            >
              {isRegister ? 'Sudah punya akun? Masuk di sini' : 'Belum punya akun? Daftar Driver Baru'}
            </button>
            <button onClick={onLogout} className="w-full text-xs text-slate-400 hover:text-slate-600 pb-1">
              Kembali ke Beranda
            </button>
          </div>
        </div>
        {toast && <Toast message={toast} onClose={() => setToast('')} />}
      </div>
    );
  }

  // JIKA CHAT SEDANG DIBUKA
  if (chatTarget) {
    return (
      <div className="min-h-screen bg-slate-100 p-4">
        <div className="max-w-md mx-auto">
          <ChatView
            order={{
              id: chatTarget.orderId,
              user_id: null,
              driver_id: activeDriver.id,
              route_id: null,
              customer_name: chatTarget.customerName,
              customer_phone: '-',
              pickup: chatTarget.pickup,
              destination: chatTarget.subtitle,
              car_type: activeDriver.vehicle_type || 'Mobil',
              price: 0,
              payment_method: 'Transfer Terstruktur',
              status: 'Aktif',
              is_carpool: false,
              rating: null,
              created_at: new Date().toISOString(),
            }}
            role="Driver"
            messages={messages}
            onSend={sendChatMessage}
            onBack={() => setChatTarget(null)}
            peerName={chatTarget.customerName}
            peerSub={chatTarget.subtitle}
            peerOnline={true}
            showPhone={false}
            fallbackLocation={chatTarget.pickup}
          />
        </div>
      </div>
    );
  }

  const pendingSeconds = pending ? Math.max(0, Math.ceil((pending.expires - Date.now()) / 1000)) : 0;

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <header className="bg-sky-800 text-white px-4 pt-4 pb-3 sticky top-0 z-30 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-bold leading-tight truncate">{activeDriver.name}</h1>
            <p className="text-[11px] text-sky-200 truncate">
              {activeDriver.vehicle_type || 'Mobil'} · {activeDriver.plate} · ★ {Number(activeDriver.rating).toFixed(1)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative bg-white/10 hover:bg-white/20 p-2 rounded-xl"
              aria-label="Notifikasi"
            >
              <Bell size={16} />
              {driverNotifSignal > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1.5 rounded-full">
                  {driverNotifSignal}
                </span>
              )}
            </button>
            <button type="button" onClick={onLogout} className="bg-white/10 hover:bg-white/20 px-2.5 py-2 rounded-xl text-[11px] font-semibold">
              Beranda
            </button>
            <button type="button" onClick={logoutToLogin} className="bg-white/15 hover:bg-white/25 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1">
              <LogOut size={14} /> Keluar
            </button>
          </div>
        </div>

        {/* Tab: Orderan Travel | Orderan Makanan | Riwayat Keuangan | Rekening */}
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1.5 mt-3">
          {(
            [
              ['travel', 'Orderan Travel', Navigation],
              ['jastip', 'Orderan Makanan', Utensils],
              ['finance', 'Riwayat Keuangan', ClipboardList],
              ['profile', 'Rekening', Landmark],
            ] as const
          ).map(([k, lbl, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`py-2 px-1 rounded-xl text-[10px] sm:text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                tab === k ? 'bg-white text-sky-800 shadow' : 'bg-white/10 text-sky-100 hover:bg-white/20'
              }`}
            >
              <Icon size={12} />
              <span className="truncate">{lbl}</span>
              {k === 'jastip' && (availableJastip.length > 0 || myActiveJastip.length > 0) && (
                <span className="bg-emerald-500 text-white text-[9px] px-1 rounded-full">
                  {availableJastip.length + myActiveJastip.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        <ErrorBox message={error} onRetry={() => activeDriver && loadAllWork(activeDriver)} />

        {/* TOMBOL ONLINE / OFFLINE BESAR */}
        <section
          className={`rounded-2xl shadow-md p-5 text-white ${
            activeDriver.is_online
              ? 'bg-gradient-to-br from-emerald-600 to-emerald-700'
              : 'bg-gradient-to-br from-slate-700 to-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs opacity-85">Status Siaga Driver</p>
              <p className="font-extrabold text-xl tracking-tight">
                {activeDriver.is_online ? 'ONLINE — Siap Terima Order' : 'OFFLINE'}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleOnline}
              className={`px-5 py-3 rounded-2xl font-extrabold text-sm shadow transition active:scale-95 ${
                activeDriver.is_online ? 'bg-white text-emerald-700' : 'bg-emerald-500 text-white'
              }`}
            >
              {activeDriver.is_online ? 'MATIKAN' : 'AKTIFKAN'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white/15 rounded-xl p-3">
              <p className="text-[11px] opacity-80">Pendapatan Bersih (100%)</p>
              <p className="font-bold tabular-nums">{formatRupiah(totalDriverNet)}</p>
            </div>
            <div className="bg-white/15 rounded-xl p-3">
              <p className="text-[11px] opacity-80">Total Trip Selesai</p>
              <p className="font-bold tabular-nums text-emerald-200">{financialEntries.length} order</p>
            </div>
          </div>
        </section>

        {/* Note Owner */}
        <section className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-900 space-y-1">
          <p className="flex items-start gap-2">
            <Megaphone size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <span><b>Pesan Owner:</b> {activeDriver.owner_note?.trim() || 'Siaga 24 jam dengan ramah & aman.'}</span>
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold pt-1">
            <CheckCircle2 size={12} /> Hasil orderan 100% milik Anda (Tanpa potongan apapun).
          </p>
        </section>

        {tab === 'travel' && (
          <>
            {pending && pending.order.driver_id === null && (
              <section className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-5 space-y-3">
                <p className="text-xs font-bold text-amber-700">ORDER TRAVEL MASUK · {pendingSeconds} dtk</p>
                <p className="font-bold text-slate-900">{pending.order.pickup} → {pending.order.destination}</p>
                <p className="text-xs text-slate-600">
                  {pending.order.car_type} · Total {formatRupiah(pending.order.price)} ({pending.order.payment_method})
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Btn variant="success" onClick={acceptTravel}>Ambil Order</Btn>
                  <Btn variant="danger" onClick={rejectTravel}>Lewati</Btn>
                </div>
              </section>
            )}

            {activeOrder ? (
              <section className="bg-white rounded-2xl shadow-md p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-slate-800">Orderan Travel Aktif</h2>
                  <span className="text-[11px] font-bold bg-sky-100 text-sky-800 px-2.5 py-1 rounded-full">{activeOrder.status}</span>
                </div>
                <MiniMap progress={0.5} label={activeOrder.status} />
                <div className="text-sm text-slate-600 space-y-1">
                  <p><MapPin size={13} className="inline mr-1 text-sky-600" />{activeOrder.pickup} → <b>{activeOrder.destination}</b></p>
                  <p>Customer: <b>{activeOrder.customer_name}</b></p>
                  <div className="bg-sky-50 border border-sky-200 rounded-xl p-2.5 text-xs space-y-0.5 mt-1">
                    <p className="font-bold text-sky-900 tabular-nums">
                      Tagihan Customer ({activeOrder.payment_method}): {formatRupiah(activeOrder.price)}
                    </p>
                    <p className="text-[11px] text-emerald-700 font-semibold">
                      100% hasil orderan langsung menjadi milik Anda.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <a href={mapsLink(activeOrder.pickup)} target="_blank" rel="noreferrer">
                    <span className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold py-2.5 rounded-xl transition">
                      <Navigation size={15} /> Maps
                    </span>
                  </a>
                  <Btn
                    variant={activeOrder.status === 'Dalam Perjalanan' ? 'success' : 'primary'}
                    onClick={() => advanceTravel(activeOrder)}
                    className="text-xs"
                  >
                    <CheckCircle2 size={15} className="inline mr-1" />
                    {activeOrder.status === 'Driver OTW'
                      ? 'Sudah Jemput'
                      : activeOrder.status === 'Driver Tiba'
                        ? 'Sedang Antar'
                        : `Customer Sudah Bayar ${formatRupiah(activeOrder.price)}`}
                  </Btn>
                  <button
                    type="button"
                    onClick={() =>
                      setChatTarget({
                        orderId: activeOrder.id,
                        customerName: activeOrder.customer_name,
                        subtitle: `${activeOrder.pickup} → ${activeOrder.destination}`,
                        pickup: activeOrder.pickup,
                      })
                    }
                    className="col-span-2 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl transition"
                  >
                    <MessageSquare size={15} /> Chat Customer
                    {unreadTravelCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{unreadTravelCount}</span>
                    )}
                  </button>
                </div>
              </section>
            ) : (
              <section className="bg-white rounded-2xl p-6 text-center text-xs text-slate-500">
                Belum ada orderan Travel aktif. Aktifkan status ONLINE untuk menerima order otomatis.
              </section>
            )}
          </>
        )}

        {tab === 'jastip' && (
          <section className="space-y-4">
            {myActiveJastip.length > 0 && (
              <div className="space-y-2.5">
                <h2 className="font-bold text-slate-900 text-sm">Orderan Makanan Saya</h2>
                {myActiveJastip.map((j) => {
                  const storeObj = storesMap[j.store_id];
                  const draftProof = talanganProofDraft[j.id];
                  return (
                    <div key={j.id} className="bg-white rounded-2xl p-4 shadow-sm border border-sky-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900">{j.store_name}</span>
                        <span className="text-[11px] font-bold bg-sky-100 text-sky-800 px-2.5 py-1 rounded-full">{j.status}</span>
                      </div>
                      <div className="text-xs text-slate-600 space-y-1">
                        {j.items.map((it, idx) => (
                          <p key={idx}>• {it.qty}x {it.name}</p>
                        ))}
                        <p>Antar ke: <b>{j.customer_name}</b> — {j.delivery_address}</p>
                        <p className="text-slate-700">
                          Cara Bayar Customer: <b>{j.payment_method || 'Cash ke Driver'}</b>
                        </p>
                        <p className="font-bold text-emerald-700 tabular-nums">
                          Tagih Total ke Customer saat sampai: {formatRupiah(j.total_price)} (Makanan {formatRupiah(j.food_subtotal)} + Ongkir {formatRupiah(j.delivery_fee)})
                        </p>
                      </div>

                      {/* LANGKAH 1: DRIVER TALANGIN KE TOKO */}
                      {!j.driver_paid_store && (
                        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2.5">
                          <div>
                            <p className="text-xs font-extrabold text-amber-950 tabular-nums">
                              Bayar ke Toko: {formatRupiah(j.food_subtotal)} (Harga Makanan saja, tanpa ongkir)
                            </p>
                            {storeObj?.payout_account && (
                              <p className="text-[11px] text-amber-800 mt-0.5">
                                Rekening Toko (jika Transfer): <b>{storeObj.payout_account.provider} {storeObj.payout_account.accountNumber}</b> a/n {storeObj.payout_account.ownerName}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 bg-white border border-dashed border-amber-300 rounded-xl p-2 text-[11px]">
                            <div className="flex items-center gap-2 min-w-0">
                              {draftProof && (
                                <img
                                  src={draftProof}
                                  alt="Bukti Talangan"
                                  onClick={() => setZoomProofUrl(draftProof)}
                                  className="w-9 h-9 rounded-lg object-cover border cursor-pointer shrink-0"
                                />
                              )}
                              <span className="text-slate-600 truncate">
                                {draftProof ? '1 Foto bukti talangan siap' : 'Upload 1 Foto Bukti Bayar (Opsional)'}
                              </span>
                            </div>
                            <label className="cursor-pointer bg-amber-600 text-white font-bold px-2.5 py-1 rounded-lg shrink-0">
                              {draftProof ? 'Ganti' : 'Foto'}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleTalanganProofUpload(j.id, e.target.files?.[0] ?? null)}
                              />
                            </label>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <Btn variant="success" onClick={() => payStoreTalangan(j, 'Cash')} className="text-[11px] !py-2">
                              Saya Sudah Bayar ke Toko - Cash
                            </Btn>
                            <Btn onClick={() => payStoreTalangan(j, 'Transfer')} className="text-[11px] !py-2 !bg-sky-600 hover:!bg-sky-700">
                              Saya Sudah Bayar ke Toko - Transfer
                            </Btn>
                          </div>
                        </div>
                      )}

                      {/* LANGKAH 2: MENUNGGU TOKO KONFIRMASI TALANGAN */}
                      {j.driver_paid_store && !j.store_confirmed_driver_paid && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 font-semibold">
                          Menunggu Toko konfirmasi uang talangan {formatRupiah(j.food_subtotal)} ({j.driver_paid_store_method || 'Cash'}) diterima...
                        </div>
                      )}

                      {/* LANGKAH 3 & 4: ANTAR & TAGIH CUSTOMER */}
                      <div className="grid grid-cols-2 gap-2">
                        {j.status === 'Dibuat' || j.status === 'Driver Mengantar' ? (
                          <Btn
                            variant={j.status === 'Driver Mengantar' ? 'success' : 'primary'}
                            onClick={() => advanceJastip(j)}
                            className="text-xs"
                          >
                            {j.status === 'Dibuat'
                              ? 'Sudah Ambil & Antar'
                              : `Customer Sudah Bayar ${formatRupiah(j.total_price)}`}
                          </Btn>
                        ) : (
                          <div className="bg-slate-100 text-slate-500 text-[11px] font-semibold rounded-xl flex items-center justify-center px-2 text-center">
                            {j.driver_paid_store ? 'Menunggu Toko' : 'Bayar ke Toko dulu'}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setChatTarget({
                              orderId: j.id,
                              customerName: j.customer_name,
                              subtitle: `Order Makanan ${j.store_name} → ${j.delivery_address}`,
                              pickup: j.store_name,
                            })
                          }
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                        >
                          <MessageSquare size={14} /> Chat Customer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2.5">
              <h2 className="font-bold text-slate-900 text-sm">Orderan Makanan Siap Diambil ({availableJastip.length})</h2>
              {availableJastip.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-400">
                  Belum ada Orderan Makanan yang siap diambil.
                </div>
              ) : (
                availableJastip.map((j) => (
                  <div key={j.id} className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-slate-900">{j.store_name}</span>
                      <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                        {j.payment_method || 'Cash ke Driver'}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-amber-900 bg-amber-50 rounded-xl px-3 py-2">
                      Ting! Orderan Baru! {j.store_name} {formatRupiah(j.food_subtotal)}, Talangin dulu ya!
                    </p>
                    <p className="text-xs text-slate-600">
                      Antar ke: <b>{j.delivery_address}</b> ({j.distance_km} km · ±{j.eta_minutes} mnt)
                    </p>
                    <p className="text-xs font-extrabold text-emerald-600 tabular-nums">
                      Ongkir Anda: {formatRupiah(j.delivery_fee)} · Tagih ke Customer: {formatRupiah(j.total_price)}
                    </p>
                    <Btn onClick={() => claimJastip(j)} variant="success" className="w-full text-xs">
                      Ambil Orderan Makanan
                    </Btn>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* RIWAYAT PENDAPATAN DRIVER 100% */}
        {tab === 'finance' && (
          <section className="space-y-4">
            <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-2">
              <p className="text-xs text-slate-300">Pendapatan Bersih Anda (100% Milik Driver)</p>
              <p className="text-3xl font-extrabold text-emerald-300 tabular-nums">{formatRupiah(totalDriverNet)}</p>
              <p className="text-xs text-slate-300">
                Dari {financialEntries.length} orderan selesai · Tanpa potongan apapun
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <ClipboardList size={17} className="text-sky-700" /> Rincian Pendapatan per Trip ({financialEntries.length})
              </h2>
              {financialEntries.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Belum ada trip selesai.</p>
              ) : (
                <div className="space-y-2.5">
                  {financialEntries.slice(0, financeLimit).map((item) => (
                    <div key={item.id} className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 text-xs space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">{item.type}: {item.title}</p>
                          <p className="text-slate-500">Customer: <b>{item.from}</b> · {new Date(item.createdAt).toLocaleString('id-ID')}</p>
                        </div>
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 bg-emerald-100 text-emerald-700">
                          {item.status}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-sky-900 bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5">
                        {item.summaryLine}
                      </p>
                    </div>
                  ))}
                  {financialEntries.length > financeLimit && (
                    <button
                      type="button"
                      onClick={() => setFinanceLimit((l) => l + 10)}
                      className="w-full py-2.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-xl"
                    >
                      Muat 10 Lagi ({financialEntries.length - financeLimit} tersisa)
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* PROFIL & REKENING TERKUNCI (GANTI / HAPUS LEWAT OWNER TANPA OTP) */}
        {tab === 'profile' && (
          <section className="space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Landmark size={16} className="text-sky-700" /> Rekening Utama Driver
                </h2>
                <span className="bg-slate-900 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Lock size={10} /> Terkunci
                </span>
              </div>
              {activeDriver.payout_account?.accountNumber ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                  <p>Bank / E-Wallet: <b>{activeDriver.payout_account.provider}</b></p>
                  <p>Nomor: <b>{activeDriver.payout_account.accountNumber}</b></p>
                  <p>Atas Nama: <b>{activeDriver.payout_account.ownerName}</b></p>
                  {activeDriver.payout_account.proofPhoto && (
                    <img
                      src={activeDriver.payout_account.proofPhoto}
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
              {activeDriver.payout_account?.pendingChange && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 space-y-0.5">
                  <p className="font-bold">
                    Menunggu ACC Owner ({activeDriver.payout_account.pendingChange.action === 'delete' ? 'Hapus Rekening' : 'Ganti Rekening'}):
                  </p>
                  {activeDriver.payout_account.pendingChange.action === 'delete' ? (
                    <p>Pengajuan penghapusan rekening utama.</p>
                  ) : (
                    <p>
                      Ke {activeDriver.payout_account.pendingChange.provider}{' '}
                      {activeDriver.payout_account.pendingChange.accountNumber} a/n{' '}
                      {activeDriver.payout_account.pendingChange.ownerName}.
                    </p>
                  )}
                  {activeDriver.payout_account.pendingChange.reason && (
                    <p className="text-[11px]">Alasan: <i>{activeDriver.payout_account.pendingChange.reason}</i></p>
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
                      chgProvider === p ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-50 text-slate-700 border-slate-200'
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
                <label className="cursor-pointer bg-sky-600 text-white font-bold px-3 py-1.5 rounded-lg">
                  Upload
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadPhoto(e.target.files?.[0] ?? null, 'chgPayout')} />
                </label>
              </div>
              <Field label="Alasan Ganti Rekening" value={chgReason} onChange={setChgReason} placeholder="Contoh: Rekening lama terblokir / ganti DANA baru" />
              <Btn onClick={submitChangeAccount} variant="success" className="w-full">
                Kirim ke Owner
              </Btn>
            </div>

            {activeDriver.payout_account?.accountNumber && (
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

      {/* Modal Notifikasi Driver (Pagination 10 per load) */}
      {notifOpen && (
        <Modal title="Notifikasi Driver" onClose={() => setNotifOpen(false)}>
          <div className="space-y-2.5 max-h-[70vh] overflow-y-auto text-xs">
            {availableJastip.map((j) => (
              <div key={j.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="font-bold text-amber-900">
                  Ting! Orderan Baru! {j.store_name} {formatRupiah(j.food_subtotal)}, Talangin dulu ya!
                </p>
              </div>
            ))}
            {alerts.slice(0, notifLimit).map((a) => (
              <div key={a.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="font-bold text-slate-900">{a.title}</p>
                <p className="text-slate-600 mt-0.5">{a.message}</p>
              </div>
            ))}
            {alerts.length === 0 && availableJastip.length === 0 && (
              <p className="text-center text-slate-400 py-4">Belum ada notifikasi baru.</p>
            )}
            {alerts.length > notifLimit && (
              <button
                type="button"
                onClick={() => setNotifLimit((l) => l + 10)}
                className="w-full py-2 text-xs font-bold text-sky-700 bg-sky-50 rounded-xl"
              >
                Muat 10 Notifikasi Lagi
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Modal Zoom Bukti */}
      {zoomProofUrl && (
        <Modal title="Foto Bukti" onClose={() => setZoomProofUrl(null)}>
          <div className="space-y-3">
            <img src={zoomProofUrl} alt="Bukti" className="w-full max-h-[65vh] object-contain rounded-xl bg-slate-100" />
            <Btn onClick={() => setZoomProofUrl(null)} className="w-full">
              <XCircle size={14} className="inline mr-1" /> Tutup
            </Btn>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}
