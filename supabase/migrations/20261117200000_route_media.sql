-- Tambah kolom media & jadwal tampilan per rute untuk Rute Populer
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS eta_text text DEFAULT '15-20 mnt',
  ADD COLUMN IF NOT EXISTS default_car_type text DEFAULT 'Ekonomi';
