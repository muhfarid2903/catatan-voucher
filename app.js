// === KONFIGURASI ===
// Isi dua nilai ini setelah membuat project di Supabase.
// Cara dapat: Supabase Dashboard → Project Settings → API
const SUPABASE_URL = 'https://bsdaplbfrctmmutaojik.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzZGFwbGJmcmN0bW11dGFvamlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDg2NTAsImV4cCI6MjA5MjY4NDY1MH0.q_JfVHRg2JxqqAseBvAVWWYYzCwfpUhPCocW64y31G8';

const HARGA_SETOR = 1500;
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
  const elDaftar = document.getElementById('daftar');
  const elTanggal = document.getElementById('input-tanggal');
  const elJumlah = document.getElementById('input-jumlah');
  const elBtn = document.getElementById('btn-tambah');

  setTanggalHariIni();
  muat();
  langgankanRealtime();

  elBtn.addEventListener('click', tambah);
  elJumlah.addEventListener('keydown', e => {
    if (e.key === 'Enter') tambah();
  });

  function setTanggalHariIni() {
    const t = new Date();
    const yyyy = t.getFullYear();
    const mm = String(t.getMonth() + 1).padStart(2, '0');
    const dd = String(t.getDate()).padStart(2, '0');
    elTanggal.value = `${yyyy}-${mm}-${dd}`;
  }

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

  function langgankanRealtime() {
    supabase
      .channel('pengambilan-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pengambilan' },
        () => muat()
      )
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

  async function tambah() {
    const tanggal = elTanggal.value;
    const jumlah = parseInt(elJumlah.value, 10);
    if (!tanggal || !jumlah || jumlah < 1) {
      alert('Isi tanggal dan jumlah voucher dengan benar.');
      return;
    }
    elBtn.disabled = true;
    elBtn.textContent = 'Menyimpan...';

    const { error } = await supabase
      .from('pengambilan')
      .insert({ tanggal, jumlah, sudah_dibayar: false });

    elBtn.disabled = false;
    elBtn.textContent = '+ Catat Pengambilan';

    if (error) {
      alert('Gagal menyimpan: ' + error.message);
      return;
    }
    elJumlah.value = '';
    elJumlah.focus();
  }

  async function ubahStatus(id, sudahDibayar) {
    const { error } = await supabase
      .from('pengambilan')
      .update({ sudah_dibayar: sudahDibayar })
      .eq('id', id);
    if (error) alert('Gagal mengubah status: ' + error.message);
  }

  async function hapus(id) {
    if (!confirm('Hapus catatan ini? Tidak bisa dibatalkan.')) return;
    const { error } = await supabase.from('pengambilan').delete().eq('id', id);
    if (error) alert('Gagal menghapus: ' + error.message);
  }

  function render(items) {
    const ringkasan = hitungRingkasan(items);
    document.getElementById('total-voucher').textContent = ringkasan.totalVoucher;
    document.getElementById('total-setoran').textContent = rupiah(ringkasan.totalSetoran);
    document.getElementById('voucher-belum').textContent = ringkasan.voucherBelumDibayar;
    document.getElementById('piutang').textContent = rupiah(ringkasan.belumDibayar);

    if (!items.length) {
      elDaftar.innerHTML = '<div class="kosong">Belum ada catatan</div>';
      return;
    }

    elDaftar.innerHTML = '';
    for (const item of items) {
      elDaftar.appendChild(buatBaris(item));
    }
  }

  function buatBaris(item) {
    const total = item.jumlah * HARGA_SETOR;
    const div = document.createElement('div');
    div.className = 'item' + (item.sudah_dibayar ? ' dibayar' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!item.sudah_dibayar;
    cb.addEventListener('change', () => ubahStatus(item.id, cb.checked));

    const info = document.createElement('div');
    info.className = 'item-info';
    const tgl = document.createElement('div');
    tgl.className = 'item-tanggal';
    tgl.textContent = tanggalIndonesia(item.tanggal);
    if (item.sudah_dibayar) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Lunas';
      tgl.appendChild(badge);
    }
    const detail = document.createElement('div');
    detail.className = 'item-detail';
    detail.textContent = `${item.jumlah} voucher · ${rupiah(total)}`;
    info.appendChild(tgl);
    info.appendChild(detail);

    const btnHapus = document.createElement('button');
    btnHapus.className = 'item-hapus';
    btnHapus.innerHTML = '&times;';
    btnHapus.title = 'Hapus';
    btnHapus.addEventListener('click', () => hapus(item.id));

    div.appendChild(cb);
    div.appendChild(info);
    div.appendChild(btnHapus);
    return div;
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
