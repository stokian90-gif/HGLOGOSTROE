import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Landmark,
  Lock,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildOwnerWaLink, loadSettings } from '@/lib/settings';
import { DriverRow, StoreRow } from '@/lib/types';
import {
  checkOwnerPinInHistory,
  clearFailedLoginAttempts,
  evaluatePasswordStrength,
  formatHourDotMinute,
  getDeviceFingerprint,
  getOwnerSecurityState,
  logSecurityActivity,
  pushAiAlert,
  submitOwnerResetRequest,
  updateOwnerPin,
} from '@/lib/securityAi';
import { Btn, ErrorBox, Field } from '@/components/ui';

type ResetRole = 'Toko' | 'Driver' | 'Owner';

interface FoundActor {
  id: string;
  name: string;
  phone: string;
}

export default function ForgotPasswordFlow({
  role,
  initialPhone = '',
  theme = 'blue',
  onBackToLogin,
  onResetSuccess,
}: {
  role: ResetRole;
  initialPhone?: string;
  theme?: 'blue' | 'sky' | 'slate';
  onBackToLogin: () => void;
  onResetSuccess?: (payload: { phone: string; noticeBanner: string; waAlertText: string }) => void;
}) {
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [ownerAccVerify, setOwnerAccVerify] = useState('');
  const [ownerStep, setOwnerStep] = useState<'verify' | 'newpass'>('verify');
  const [requestedAccount, setRequestedAccount] = useState<FoundActor | null>(null);

  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const settings = loadSettings();
  const ownerPhone = settings.finance.ownerPayout.accountNumber || '085612340000';

  const bgGradient =
    theme === 'sky'
      ? 'from-sky-700 to-sky-900'
      : theme === 'slate'
        ? 'from-slate-800 to-slate-900'
        : 'from-blue-700 to-blue-900';
  const btnThemeClass =
    theme === 'sky'
      ? '!bg-sky-600 hover:!bg-sky-700'
      : theme === 'slate'
        ? '!bg-emerald-600 hover:!bg-emerald-700'
        : '!bg-blue-600 hover:!bg-blue-700';

  const handleActorResetRequest = async () => {
    if (role === 'Owner') return;
    const cleanPhone = phoneInput.replace(/[\s-]/g, '');
    if (!/^0\d{8,14}$/.test(cleanPhone)) {
      return setError('Masukkan Nomor WhatsApp yang valid (contoh: 0812xxxxxxxx)');
    }
    setError('');
    setBusy(true);
    try {
      const table = role === 'Driver' ? 'drivers' : 'stores';
      const { data } = await supabase
        .from(table)
        .select('*')
        .eq('phone', cleanPhone)
        .order('created_at', { ascending: false });
      const rows = (data as (DriverRow | StoreRow)[]) || [];
      if (rows.length === 0) {
        await logSecurityActivity({
          actorName: cleanPhone,
          role,
          action: `Gagal Ajukan Reset Password: No. WA ${cleanPhone} tidak terdaftar di ${role}`,
          severity: 'warning',
        });
        setError(`Nomor WA ${cleanPhone} tidak terdaftar pada akun ${role}.`);
        return;
      }

      const target = rows[0];
      await submitOwnerResetRequest({
        role,
        accountId: target.id,
        accountName: target.name,
        phone: target.phone,
      });

      setRequestedAccount({
        id: target.id,
        name: target.name,
        phone: target.phone,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleOwnerVerify = async () => {
    const cleanPhone = phoneInput.replace(/[\s-]/g, '');
    const cleanAcc = ownerAccVerify.replace(/[\s-]/g, '');
    const ownerSec = getOwnerSecurityState(ownerPhone);
    const acceptedPhones = Array.from(
      new Set([
        ownerSec.phone.replace(/[\s-]/g, ''),
        ownerPhone.replace(/[\s-]/g, ''),
        '085612340000',
      ]),
    );
    if (!acceptedPhones.includes(cleanPhone)) {
      return setError('Nomor WhatsApp Owner tidak sesuai.');
    }
    const expectedAcc = settings.finance.ownerPayout.accountNumber.replace(/[\s-]/g, '');
    if (cleanAcc !== expectedAcc) {
      await logSecurityActivity({
        actorName: 'Owner',
        role: 'Owner',
        action: 'Gagal verifikasi Lupa Password Owner: Nomor Rekening Utama tidak cocok',
        severity: 'critical',
      });
      return setError('Nomor Rekening Utama Owner tidak cocok.');
    }
    setError('');
    setOwnerStep('newpass');
  };

  const strength = evaluatePasswordStrength(newPass);

  const handleSaveOwnerNewPassword = async () => {
    setError('');
    if (!strength.valid) {
      return setError(strength.reason || 'Password baru tidak memenuhi syarat keamanan AI.');
    }
    if (newPass !== confirmPass) {
      return setError('Ulangi Password Baru harus sama persis.');
    }
    setBusy(true);
    try {
      const cleanPhone = phoneInput.replace(/[\s-]/g, '') || ownerPhone;
      const reused = await checkOwnerPinInHistory(newPass, cleanPhone);
      if (reused) {
        return setError('Password lama tidak bisa dipakai lagi! Tidak boleh sama dengan 3 password sebelumnya.');
      }
      const devFp = getDeviceFingerprint();
      await updateOwnerPin(newPass, cleanPhone);
      try {
        localStorage.setItem('ti_owner_trusted_devices', JSON.stringify([devFp]));
      } catch {
        // Ignore
      }
      clearFailedLoginAttempts('owner_admin');

      const jamStr = formatHourDotMinute();
      const alertText = `Password Owner baru saja diubah jam ${jamStr}.`;
      await logSecurityActivity({
        actorName: 'Owner / Admin',
        role: 'Owner',
        action: 'Berhasil ubah password Owner via verifikasi Rekening Utama',
        severity: 'info',
      });
      await pushAiAlert({
        targetRole: 'owner',
        title: 'Password Owner Diubah',
        message: alertText,
        category: 'password_reset',
      });
      onResetSuccess?.({
        phone: cleanPhone,
        noticeBanner: 'Password berhasil diubah! Silakan Masuk lagi',
        waAlertText: alertText,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`min-h-screen bg-gradient-to-b ${bgGradient} flex flex-col items-center justify-center p-4`}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-7 space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (role === 'Owner' && ownerStep === 'newpass') {
                setOwnerStep('verify');
                setError('');
              } else {
                onBackToLogin();
              }
            }}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
            aria-label="Kembali"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {role === 'Owner'
                ? ownerStep === 'verify'
                  ? 'Lupa Password Owner'
                  : 'Buat Password Baru Owner'
                : 'Lupa Password? Minta Reset ke Owner'}
            </h2>
            <p className="text-[11px] text-slate-500">
              {role === 'Owner'
                ? ownerStep === 'verify'
                  ? 'Verifikasi identitas Owner dengan Rekening Utama terdaftar'
                  : 'Minimal 6 karakter, wajib kombinasi huruf + angka'
                : 'Permintaan reset diproses langsung oleh Owner (Tanpa OTP)'}
            </p>
          </div>
        </div>

        {/* DRIVER / TOKO: AJUKAN RESET PASSWORD KE OWNER */}
        {role !== 'Owner' && !requestedAccount && (
          <div className="space-y-3">
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-sky-900">
              <ShieldCheck size={18} className="text-sky-600 shrink-0 mt-0.5" />
              <p>
                Masukkan No. WhatsApp {role} Anda. Pengajuan reset password akan dikirim ke <b>Dashboard Owner</b>, lalu Anda bisa langsung chat Owner via WhatsApp.
              </p>
            </div>

            <Field
              label={`No. WhatsApp ${role} Terdaftar`}
              value={phoneInput}
              onChange={setPhoneInput}
              placeholder="0812xxxxxxxx"
            />

            <ErrorBox message={error} />

            <Btn onClick={handleActorResetRequest} disabled={busy} className={`w-full ${btnThemeClass}`}>
              {busy ? 'Mengirim ke Owner...' : 'Kirim Pengajuan Reset ke Owner'}
            </Btn>
          </div>
        )}

        {/* DRIVER / TOKO: KONFIRMASI + CHAT OWNER VIA WA */}
        {role !== 'Owner' && requestedAccount && (
          <div className="space-y-3.5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2 text-xs text-emerald-950">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Pengajuan Reset Password Terkirim!</p>
                  <p className="text-emerald-900 mt-1 leading-relaxed">
                    Pengajuan reset password sudah dikirim ke Owner, hubungi Owner via WA untuk mempercepat!
                  </p>
                </div>
              </div>
              <div className="bg-white border border-emerald-200 rounded-xl p-2.5 text-[11px] text-slate-700">
                Akun: <b>{requestedAccount.name}</b> ({requestedAccount.phone})
              </div>
            </div>

            <a
              href={buildOwnerWaLink(
                ownerPhone,
                `Halo Owner, saya ${requestedAccount.name}, tolong resetkan password saya`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow transition"
            >
              <MessageCircle size={17} /> Chat Owner via WA
            </a>

            <Btn
              variant="ghost"
              onClick={onBackToLogin}
              className="w-full !bg-slate-100 !text-slate-700 hover:!bg-slate-200"
            >
              Kembali ke Halaman Login
            </Btn>
          </div>
        )}

        {/* OWNER: VERIFIKASI REKENING UTAMA */}
        {role === 'Owner' && ownerStep === 'verify' && (
          <div className="space-y-3">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-slate-700">
              <Landmark size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              <p>
                Untuk keamanan Owner, verifikasi nomor WhatsApp dan Nomor Rekening Utama Owner yang tersimpan di sistem.
              </p>
            </div>
            <Field
              label="No. WhatsApp Owner"
              value={phoneInput}
              onChange={setPhoneInput}
              placeholder="085612340000"
            />
            <Field
              label={`Nomor ${settings.finance.ownerPayout.provider} Utama Owner`}
              value={ownerAccVerify}
              onChange={setOwnerAccVerify}
              placeholder="Masukkan nomor rekening Owner"
            />
            <ErrorBox message={error} />
            <Btn onClick={handleOwnerVerify} className={`w-full ${btnThemeClass}`}>
              Verifikasi & Buat Password Baru
            </Btn>
          </div>
        )}

        {/* OWNER: BUAT PASSWORD BARU */}
        {role === 'Owner' && ownerStep === 'newpass' && (
          <div className="space-y-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 flex items-center gap-2">
              <KeyRound size={15} className="text-emerald-600 shrink-0" />
              <span>Mengubah password Owner / Admin</span>
            </div>

            <Field
              label="Password Baru"
              value={newPass}
              onChange={setNewPass}
              type="password"
              placeholder="Minimal 6 karakter (huruf + angka)"
            />

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">Kekuatan Password:</span>
                <span
                  className={`font-extrabold px-2 py-0.5 rounded-full text-[11px] ${
                    !newPass
                      ? 'bg-slate-200 text-slate-600'
                      : strength.level === 'Kuat'
                        ? 'bg-emerald-100 text-emerald-700'
                        : strength.level === 'Sedang'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-700'
                  }`}
                >
                  {newPass ? strength.level : 'Belum diisi'}
                </span>
              </div>
              <div className="text-[11px] space-y-0.5 text-slate-600">
                <p className={strength.hasMinLength ? 'text-emerald-700 font-semibold' : ''}>
                  {strength.hasMinLength ? '✓' : '•'} Minimal 6 karakter
                </p>
                <p className={strength.hasLetterAndNumber ? 'text-emerald-700 font-semibold' : ''}>
                  {strength.hasLetterAndNumber ? '✓' : '•'} Kombinasi huruf & angka
                </p>
                <p className="flex items-center gap-1">
                  <Lock size={11} className="text-slate-400" /> Tidak boleh sama dengan 3 password sebelumnya
                </p>
              </div>
            </div>

            <Field
              label="Ulangi Password Baru"
              value={confirmPass}
              onChange={setConfirmPass}
              type="password"
              placeholder="Ketik ulang password baru"
            />

            {confirmPass && newPass !== confirmPass && (
              <p className="text-xs text-red-600 flex items-center gap-1 font-semibold">
                <AlertTriangle size={13} /> Password ulang tidak cocok
              </p>
            )}
            {confirmPass && newPass === confirmPass && strength.valid && (
              <p className="text-xs text-emerald-700 flex items-center gap-1 font-semibold">
                <CheckCircle2 size={13} /> Password cocok & lolos pemeriksaan AI
              </p>
            )}

            <ErrorBox message={error} />

            <Btn onClick={handleSaveOwnerNewPassword} disabled={busy} className={`w-full ${btnThemeClass}`}>
              {busy ? 'Menyimpan...' : 'Simpan Password Baru'}
            </Btn>
          </div>
        )}

        <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <ShieldCheck size={13} className="text-emerald-600" /> Kontrol Penuh Owner · AI Security
          </span>
          <button type="button" onClick={onBackToLogin} className="text-blue-600 font-semibold">
            Kembali ke Login
          </button>
        </div>
      </div>
    </div>
  );
}
