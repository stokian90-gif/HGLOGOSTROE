import { TravelSettings } from '@/lib/settings';
import { OrderVerification } from '@/lib/types';

export function calculateFoodAccounting(params: {
  foodSubtotal: number;
  deliveryFee: number;
  settings: TravelSettings;
}): {
  ownerCommission: number;
  storeNet: number;
  driverNet: number;
  commissionBearer: 'driver' | 'store';
} {
  const { foodSubtotal, deliveryFee } = params;
  // 0% komisi: Driver talangin harga makanan penuh ke Toko, Ongkir 100% milik Driver.
  return {
    ownerCommission: 0,
    storeNet: foodSubtotal,
    driverNet: deliveryFee,
    commissionBearer: 'driver',
  };
}

export function calculateTravelAccounting(params: {
  totalPrice: number;
  settings: TravelSettings;
}): {
  ownerCommission: number;
  driverNet: number;
} {
  const { totalPrice } = params;
  // 0% komisi: hasil orderan Travel 100% milik Driver.
  return { ownerCommission: 0, driverNet: totalPrice };
}

export function createInitialVerification(type: 'travel' | 'food'): OrderVerification {
  return {
    customerConfirmed: false,
    driverConfirmed: false,
    storeConfirmed: type === 'travel',
    driverDisputed: false,
    storeDisputed: false,
    disputeNote: null,
    disputeBy: null,
    commissionStatus: 'Belum Masuk',
    remindedAt: null,
  };
}
