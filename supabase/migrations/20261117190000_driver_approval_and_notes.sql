/*
# Tambah kontrol persetujuan driver & catatan owner
*/

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS vehicle_type text NOT NULL DEFAULT 'Mobil',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS owner_note text,
  ADD COLUMN IF NOT EXISTS rejection_reason text;
