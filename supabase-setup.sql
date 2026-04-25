-- Skema database untuk Catatan Voucher
-- Jalankan di Supabase: SQL Editor → New Query → tempel & Run

create table if not exists pengambilan (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  jumlah integer not null check (jumlah > 0),
  sudah_dibayar boolean not null default false,
  dicatat_pada timestamptz not null default now()
);

create index if not exists pengambilan_tanggal_idx on pengambilan (tanggal desc);

-- Aktifkan Row Level Security
alter table pengambilan enable row level security;

-- Izinkan akses publik (anyone with anon key bisa baca/tulis)
-- Keamanan: jangan share URL aplikasi ke sembarang orang
drop policy if exists "akses_publik" on pengambilan;
create policy "akses_publik" on pengambilan
  for all
  to anon
  using (true)
  with check (true);

-- Aktifkan realtime supaya perubahan langsung muncul di semua HP
alter publication supabase_realtime add table pengambilan;
