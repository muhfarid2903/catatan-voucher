// === KONFIGURASI ===
// Isi dua nilai ini setelah membuat project di Supabase.
// Cara dapat: Supabase Dashboard → Project Settings → API
const SUPABASE_URL = 'https://bsdaplbfrctmmutaojik.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzZGFwbGJmcmN0bW11dGFvamlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDg2NTAsImV4cCI6MjA5MjY4NDY1MH0.q_JfVHRg2JxqqAseBvAVWWYYzCwfpUhPCocW64y31G8';

const HARGA_SETOR = 1500;
// Pihak tetap: SUPLIER drop voucher ke DEALER, DEALER setor balik ke SUPLIER.
const SUPLIER = 'warkopsaja';   // pihak yang drop voucher
const DEALER = 'anci';          // pihak yang jual & setor
// === AKHIR KONFIGURASI ===


const elApp = document.getElementById('app');
const elBelumSiap = document.getElementById('app-belum-siap');

if (SUPABASE_URL.startsWith('GANTI') || SUPABASE_ANON_KEY.startsWith('GANTI')) {
  elBelumSiap.classList.remove('hidden');
} else {
  elApp.classList.remove('hidden');
  jalankan();
}

function jalankan() {
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const elStatus = document.getElementById('status-koneksi');
  const elIdentitas = document.getElementById('identitas');
  const elDaftar = document.getElementById('daftar');
  const elDaftarHistori = document.getElementById('daftar-histori');
  const elTanggal = document.getElementById('input-tanggal');
  const elJumlah = document.getElementById('input-jumlah');
  const elBtn = document.getElementById('btn-tambah');

  document.getElementById('alur').textContent = `${SUPLIER} → ${DEALER}`;

  tampilkanIdentitas();
  setTanggalHariIni();
  muat();
  muatHistori();
  langgankanRealtime();

  elIdentitas.addEventListener('click', gantiNama);
  elBtn.addEventListener('click', tambah);
  elJumlah.addEventListener('keydown', e => { if (e.key === 'Enter') tambah(); });

  // ── Identitas (opsional, diisi sekali, tidak pernah nanya otomatis) ───────
  function getNama() { return (localStorage.getItem('nama_pengguna') || '').trim(); }

  function gantiNama() {
    const nama = (prompt('Nama Anda untuk histori (boleh dikosongkan):', getNama()) || '').trim();
    localStorage.setItem('nama_pengguna', nama);
    tampilkanIdentitas();
  }

  function tampilkanIdentitas() {
    const nama = getNama();
    elIdentitas.textContent = nama ? '👤 ' + nama : '👤';
  }

  function setTanggalHariIni() {
    const t = new Date();
    const yyyy = t.getFullYear();
    const mm = String(t.getMonth() + 1).padStart(2, '0');
    const dd = String(t.getDate()).padStart(2, '0');
    elTanggal.value = `${yyyy}-${mm}-${dd}`;
  }

  // ── Muat data ─────────────────────────────────────────────────────────────
  async function muat() {
    const { data, error } = await supabase
      .from('pengambilan')
      .select('*')
      .order('tanggal', { ascending: false })
      .order('dicatat_pada', { ascending: false });

    if (error) {
      elDaftar.innerHTML = `<div class="kosong">Gagal memuat: ${escapeHtml(error.message)}</div>`;
      elStatus.classList.add('gagal');
      return;
    }
    render(data || []);
  }

  async function muatHistori() {
    const { data, error } = await supabase
      .from('histori').select('*')
      .order('waktu', { ascending: false })
      .limit(200);
    if (error) {
      elDaftarHistori.innerHTML = `<div class="kosong">Gagal memuat histori: ${escapeHtml(error.message)}</div>`;
      return;
    }
    renderHistori(data || []);
  }

  function langgankanRealtime() {
    supabase
      .channel('semua-perubahan')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengambilan' }, muat)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'histori' }, muatHistori)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          elStatus.classList.add('tersambung');
          elStatus.classList.remove('gagal');
          elStatus.title = 'Tersambung — sinkron otomatis';
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          elStatus.classList.add('gagal');
          elStatus.classList.remove('tersambung');
          elStatus.title = 'Sinkronisasi terputus';
        }
      });
  }

  // ── Histori: catat tiap perubahan ────────────────────────────────────────
  async function catatHistori(aksi, keterangan, pengambilanId) {
    await supabase.from('histori').insert({
      aksi,
      keterangan,
      oleh: getNama() || '(tanpa nama)',
      pengambilan_id: pengambilanId || null,
    });
  }

  // ── Aksi ──────────────────────────────────────────────────────────────────
  async function tambah() {
    const tanggal = elTanggal.value;
    const jumlah = parseInt(elJumlah.value, 10);
    if (!tanggal || !jumlah || jumlah < 1) {
      alert('Isi tanggal dan jumlah voucher dengan benar.');
      return;
    }
    elBtn.disabled = true;
    elBtn.textContent = 'Menyimpan...';

    const { data, error } = await supabase
      .from('pengambilan')
      .insert({ tanggal, jumlah, sudah_dibayar: false })
      .select()
      .single();

    elBtn.disabled = false;
    elBtn.textContent = '+ Catat Pengambilan';

    if (error) { alert('Gagal menyimpan: ' + error.message); return; }

    elJumlah.value = '';
    elJumlah.focus();
    catatHistori('tambah', `${SUPLIER} drop ${deskripsi(data)} ke ${DEALER}`, data.id);
  }

  async function ubahStatus(item, sudahDibayar) {
    const { error } = await supabase
      .from('pengambilan')
      .update({ sudah_dibayar: sudahDibayar })
      .eq('id', item.id);
    if (error) { alert('Gagal mengubah status: ' + error.message); return; }

    const status = sudahDibayar
      ? `${DEALER} sudah setor ke ${SUPLIER}`
      : `Batal: ${DEALER} belum setor ke ${SUPLIER}`;
    catatHistori('ubah', `${status} — ${deskripsi(item)}`, item.id);
  }

  async function hapus(item) {
    if (!confirm('Hapus catatan ini? Tidak bisa dibatalkan.')) return;
    const { error } = await supabase.from('pengambilan').delete().eq('id', item.id);
    if (error) { alert('Gagal menghapus: ' + error.message); return; }
    catatHistori('hapus', `Hapus catatan — ${deskripsi(item)}`, item.id);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function render(items) {
    const r = hitungRingkasan(items);
    document.getElementById('total-voucher').textContent = r.totalVoucher;
    document.getElementById('total-setoran').textContent = rupiah(r.totalSetoran);
    document.getElementById('voucher-belum').textContent = r.voucherBelumDibayar;
    document.getElementById('piutang').textContent = rupiah(r.belumDibayar);

    if (!items.length) {
      elDaftar.innerHTML = '<div class="kosong">Belum ada catatan</div>';
      return;
    }
    elDaftar.innerHTML = '';
    for (const item of items) elDaftar.appendChild(buatBaris(item));
  }

  function buatBaris(item) {
    const total = item.jumlah * HARGA_SETOR;
    const div = document.createElement('div');
    div.className = 'item' + (item.sudah_dibayar ? ' dibayar' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!item.sudah_dibayar;
    cb.title = `Centang kalau ${DEALER} sudah setor ke ${SUPLIER}`;
    cb.addEventListener('change', () => ubahStatus(item, cb.checked));

    const info = document.createElement('div');
    info.className = 'item-info';

    const tgl = document.createElement('div');
    tgl.className = 'item-tanggal';
    tgl.textContent = tanggalIndonesia(item.tanggal);
    if (item.sudah_dibayar) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Disetor';
      tgl.appendChild(badge);
    }

    const pihak = document.createElement('div');
    pihak.className = 'item-pihak';
    pihak.textContent = `${SUPLIER} → ${DEALER}`;

    const detail = document.createElement('div');
    detail.className = 'item-detail';
    detail.textContent = `${item.jumlah} voucher · ${rupiah(total)}`;

    info.appendChild(tgl);
    info.appendChild(pihak);
    info.appendChild(detail);

    const btnHapus = document.createElement('button');
    btnHapus.className = 'item-hapus';
    btnHapus.innerHTML = '&times;';
    btnHapus.title = 'Hapus';
    btnHapus.addEventListener('click', () => hapus(item));

    div.appendChild(cb);
    div.appendChild(info);
    div.appendChild(btnHapus);
    return div;
  }

  function renderHistori(items) {
    if (!items.length) {
      elDaftarHistori.innerHTML = '<div class="kosong">Belum ada perubahan</div>';
      return;
    }
    elDaftarHistori.innerHTML = '';
    for (const h of items) {
      const div = document.createElement('div');
      div.className = 'histori-item aksi-' + h.aksi;

      const ket = document.createElement('div');
      ket.className = 'histori-ket';
      ket.textContent = h.keterangan;

      const meta = document.createElement('div');
      meta.className = 'histori-meta';
      meta.textContent = `${waktuIndonesia(h.waktu)} · ${h.oleh || '(tanpa nama)'}`;

      div.appendChild(ket);
      div.appendChild(meta);
      elDaftarHistori.appendChild(div);
    }
  }

  function deskripsi(item) {
    return `${item.jumlah} voucher (${tanggalIndonesia(item.tanggal)})`;
  }

  function hitungRingkasan(items) {
    let totalVoucher = 0, totalSetoran = 0, belumDibayar = 0, voucherBelumDibayar = 0;
    for (const item of items) {
      const total = item.jumlah * HARGA_SETOR;
      totalVoucher += item.jumlah;
      totalSetoran += total;
      if (!item.sudah_dibayar) {
        belumDibayar += total;
        voucherBelumDibayar += item.jumlah;
      }
    }
    return { totalVoucher, totalSetoran, belumDibayar, voucherBelumDibayar };
  }
}

function rupiah(angka) {
  return 'Rp ' + (angka || 0).toLocaleString('id-ID');
}

function tanggalIndonesia(yyyymmdd) {
  if (!yyyymmdd) return '';
  const [y, m, d] = String(yyyymmdd).split('-');
  const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${parseInt(d)} ${bulan[parseInt(m) - 1]} ${y}`;
}

function waktuIndonesia(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  const tgl = tanggalIndonesia(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`);
  const jam = `${String(t.getHours()).padStart(2,'0')}.${String(t.getMinutes()).padStart(2,'0')}`;
  return `${tgl}, ${jam}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
