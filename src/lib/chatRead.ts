import { useEffect, useState } from 'react';

const READ_KEY = 'ti_chat_read';
type ChatRole = 'Customer' | 'Driver';
type ReadMap = Record<string, Partial<Record<ChatRole, string>>>;

function loadReadMap(): ReadMap {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ReadMap) : {};
  } catch {
    return {};
  }
}

export function markChatRead(orderId: string, role: ChatRole) {
  try {
    const map = loadReadMap();
    map[orderId] = { ...(map[orderId] ?? {}), [role]: new Date().toISOString() };
    localStorage.setItem(READ_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event('ti_chat_read_changed'));
  } catch {
    // Ignore storage errors
  }
}

export function getPeerReadAt(orderId: string, myRole: ChatRole): string | null {
  const peerRole: ChatRole = myRole === 'Customer' ? 'Driver' : 'Customer';
  const map = loadReadMap();
  return map[orderId]?.[peerRole] ?? null;
}

export function getMyReadAt(orderId: string, myRole: ChatRole): string | null {
  const map = loadReadMap();
  return map[orderId]?.[myRole] ?? null;
}

export function usePeerReadAt(orderId: string | null | undefined, myRole: ChatRole): string | null {
  const [readAt, setReadAt] = useState<string | null>(() => (orderId ? getPeerReadAt(orderId, myRole) : null));

  useEffect(() => {
    if (!orderId) {
      setReadAt(null);
      return;
    }
    const sync = () => setReadAt(getPeerReadAt(orderId, myRole));
    sync();
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === READ_KEY) sync();
    };
    window.addEventListener('ti_chat_read_changed', sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('ti_chat_read_changed', sync);
      window.removeEventListener('storage', onStorage);
    };
  }, [orderId, myRole]);

  return readAt;
}
