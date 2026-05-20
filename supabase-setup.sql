-- Skema database untuk Catatan Voucher
-- Jalankan di Supabase: SQL Editor → New Query → tempel & Run
-- File ini AMAN dijalankan ulang (idempotent).

-- ── Catatan pengambilan: warkopsaja drop voucher ke anci, anci setor balik ──
create table if not exists pengambilan (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  jumlah integer not null check (jumlah > 0),
  sudah_dibayar boolean not null default false,   -- anci sudah setor ke warkopsaja?
  dicatat_pada timestamptz not null default now()
);
create index if not exists pengambilan_tanggal_idx on pengambilan (tanggal desc);

-- ── Histori perubahan (audit log) ───────────────────────────────────────────
-- Tanpa FK ke pengambilan supaya log tetap utuh walau catatannya dihapus.
create table if not exists histori (
  id uuid primary key default gen_random_uuid(),
  waktu timestamptz not null default now(),
  aksi text not null,            -- 'tambah' | 'ubah' | 'hapus'
  oleh text,                     -- nama operator (opsional)
  pengambilan_id uuid,           -- referensi catatan (boleh kosong untuk hapus)
  keterangan text not null       -- ringkasan perubahan untuk dibaca manusia
);
create index if not exists histori_waktu_idx on histori (waktu desc);

-- ── Row Level Security: akses publik via anon key ───────────────────────────
-- Keamanan: jangan share URL aplikasi ke sembarang orang.
do $$
declare t text;
begin
  foreach t in array array['pengambilan','histori'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "akses_publik" on %I', t);
    execute format(
      'create policy "akses_publik" on %I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

-- ── Realtime: perubahan langsung muncul di semua HP ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['pengambilan','histori'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
