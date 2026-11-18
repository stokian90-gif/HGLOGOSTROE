import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  MapPin,
  Phone,
  Send,
  User,
} from 'lucide-react';
import { MessageRow, OrderRow, mapsLink } from '@/lib/types';
import { markChatRead, usePeerReadAt } from '@/lib/chatRead';

interface ChatViewProps {
  order: OrderRow;
  role: 'Customer' | 'Driver';
  messages: MessageRow[];
  onSend: (body: string) => Promise<void>;
  onBack?: () => void;
  fullScreen?: boolean;
  peerName: string;
  peerSub: string;
  peerOnline?: boolean;
  peerPhone?: string | null;
  showPhone?: boolean;
  onMissingPhone?: () => void;
  fallbackLocation?: string;
}

function renderMessageBody(body: string, isMine: boolean) {
  const urlMatch = body.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) {
    return <p className="whitespace-pre-wrap break-words leading-relaxed">{body}</p>;
  }
  const url = urlMatch[0];
  const textBefore = body.replace(url, '').trim();
  return (
    <div className="space-y-1.5">
      {textBefore && <p className="whitespace-pre-wrap break-words leading-relaxed">{textBefore}</p>}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg underline-offset-2 ${
          isMine
            ? 'bg-white/20 text-white hover:bg-white/30'
            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
        }`}
      >
        <MapPin size={13} /> Buka Lokasi di Maps
      </a>
    </div>
  );
}

export default function ChatView({
  order,
  role,
  messages,
  onSend,
  onBack,
  fullScreen = false,
  peerName,
  peerSub,
  peerOnline = true,
  peerPhone,
  showPhone = true,
  onMissingPhone,
  fallbackLocation,
}: ChatViewProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [locating, setLocating] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const peerReadAt = usePeerReadAt(order.id, role);
  const peerRole = role === 'Customer' ? 'Driver' : 'Customer';

  // Tandai pesan sudah dibaca saat layar chat aktif atau ada pesan baru
  useEffect(() => {
    markChatRead(order.id, role);
  }, [order.id, role, messages.length]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    try {
      await onSend(clean);
      setText('');
    } finally {
      setSending(false);
    }
  };

  const handleShareLocation = async () => {
    if (locating || sending) return;
    setLocating(true);
    const sendFallback = async () => {
      const locText = fallbackLocation || order.pickup;
      await onSend(`Lokasi Saya (${locText}): ${mapsLink(locText)}`);
    };

    try {
      if (!('geolocation' in navigator)) {
        await sendFallback();
        return;
      }
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const lat = pos.coords.latitude.toFixed(6);
            const lng = pos.coords.longitude.toFixed(6);
            await onSend(`Lokasi Saya Saat Ini: https://maps.google.com/?q=${lat},${lng}`);
            resolve();
          },
          async () => {
            await sendFallback();
            resolve();
          },
          { enableHighAccuracy: true, timeout: 4500, maximumAge: 15000 },
        );
      });
    } finally {
      setLocating(false);
    }
  };

  const containerCls = fullScreen
    ? 'fixed inset-0 z-50 flex flex-col bg-slate-100'
    : 'flex flex-col bg-white rounded-2xl shadow-md overflow-hidden border border-slate-200 h-[72vh] min-h-[460px] max-h-[680px]';

  const initials = peerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className={containerCls}>
      {/* Header Chat */}
      <header className="bg-emerald-700 text-white px-3 py-3 flex items-center justify-between gap-2 shadow-md shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl hover:bg-white/15 active:scale-95 transition shrink-0"
              aria-label="Kembali"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-emerald-500/40 border-2 border-white/60 flex items-center justify-center font-bold text-sm text-white">
              {initials || <User size={18} />}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-emerald-700 ${
                peerOnline ? 'bg-emerald-400' : 'bg-slate-400'
              }`}
              title={peerOnline ? 'Online' : 'Offline'}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-bold text-sm truncate">{peerName}</h2>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${peerOnline ? 'bg-emerald-500/40 text-emerald-100' : 'bg-white/15 text-slate-200'}`}>
                {peerOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="text-[11px] text-emerald-100 truncate">{peerSub}</p>
          </div>
        </div>

        {showPhone &&
          (peerPhone ? (
            <a
              href={`tel:${peerPhone}`}
              className="bg-white/15 hover:bg-white/25 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition"
            >
              <Phone size={14} /> Telepon
            </a>
          ) : (
            <button
              type="button"
              onClick={onMissingPhone}
              className="bg-white/10 hover:bg-white/20 text-white/80 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition"
            >
              <Phone size={14} /> Telepon
            </button>
          ))}
      </header>

      {/* Ringkasan Order */}
      <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 text-xs text-emerald-900 flex items-center justify-between gap-2 shrink-0">
        <span className="truncate font-medium">
          Rute: {order.pickup} → {order.destination}
        </span>
        <span className="font-bold text-emerald-700 shrink-0">{order.status}</span>
      </div>

      {/* Isi Chat */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2.5 bg-[#efeae2]">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <p className="inline-block bg-white/80 text-slate-500 text-xs px-4 py-2 rounded-xl shadow-sm">
              Mulai chat di dalam aplikasi. Nomor HP Anda tetap aman.
            </p>
          </div>
        )}
        {messages.map((m, idx) => {
          const isMine = m.sender === role;
          const time = new Date(m.created_at).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          });
          const hasLaterPeerReply = messages.slice(idx + 1).some((later) => later.sender === peerRole);
          const isRead =
            Boolean(m.is_read) ||
            hasLaterPeerReply ||
            Boolean(peerReadAt && new Date(m.created_at).getTime() <= new Date(peerReadAt).getTime());

          return (
            <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[82%] px-3.5 py-2 text-sm shadow-sm ${
                  isMine
                    ? 'bg-emerald-600 text-white rounded-2xl rounded-br-sm'
                    : 'bg-white text-slate-800 rounded-2xl rounded-bl-sm'
                }`}
              >
                {renderMessageBody(m.body, isMine)}
                <div
                  className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                    isMine ? 'text-emerald-100/90' : 'text-slate-400'
                  }`}
                >
                  <span>{time}</span>
                  {isMine &&
                    (isRead ? (
                      <CheckCheck size={13} className="text-sky-200" aria-label="Terbaca" />
                    ) : (
                      <Check size={13} className="text-emerald-200/80" aria-label="Terkirim" />
                    ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Bawah */}
      <div className="bg-white border-t border-slate-200 p-3 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleShareLocation}
            disabled={locating || sending}
            className="inline-flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold px-3 py-1.5 rounded-xl transition active:scale-95 disabled:opacity-50"
          >
            <MapPin size={13} />
            {locating ? 'Mengambil lokasi...' : 'Share Lokasi Saya'}
          </button>
          <span className="text-[10px] text-slate-400">Chat aman di dalam aplikasi</span>
        </div>

        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ketik pesan..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:bg-white"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-1.5 transition active:scale-95 disabled:opacity-40"
          >
            <Send size={15} />
            Kirim
          </button>
        </div>
      </div>
    </div>
  );
}
