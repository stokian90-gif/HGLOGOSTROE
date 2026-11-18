import { useEffect, useState } from 'react';
import Home from '@/pages/Home';
import CustomerApp from '@/pages/CustomerApp';
import DriverApp from '@/pages/DriverApp';
import StoreApp from '@/pages/StoreApp';
import OwnerApp from '@/pages/OwnerApp';

type Role = 'customer' | 'driver' | 'store' | 'owner' | 'home';

export default function App() {
  const [role, setRole] = useState<Role>('customer');

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('role');
    if (
      param === 'customer' ||
      param === 'driver' ||
      param === 'store' ||
      param === 'owner' ||
      param === 'home'
    ) {
      setRole(param);
    }
  }, []);

  if (role === 'home') return <Home onPick={setRole} />;
  if (role === 'driver') return <DriverApp onLogout={() => setRole('customer')} />;
  if (role === 'store') return <StoreApp onLogout={() => setRole('customer')} />;
  if (role === 'owner') return <OwnerApp onLogout={() => setRole('customer')} />;
  return <CustomerApp onOpenRole={(r) => setRole(r)} />;
}
