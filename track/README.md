# Vercel Link Tracker

Dashboard redirect dan statistik klik berbasis Vercel Functions + Upstash Redis.

## Fitur
- Dashboard di `/dashbboorrddx?key=...` dengan autentikasi `DASHBOARD_KEY`
- Tambah, edit, dan hapus link tracking
- URL tracking `/go/slug`
- Total klik, total link, dan rata-rata klik
- Ringkasan klik hari ini dibanding kemarin (zona waktu Asia/Jakarta)
- Grafik klik 7 hari terakhir
- Top domain referrer dan statistik device (Mobile, Desktop, Tablet)
- Riwayat 100 atau 200 aktivitas terbaru
- Filter aktivitas berdasarkan periode dan link
- Tombol Copy Link
- Reset statistik dengan konfirmasi; data link tetap dipertahankan

## Environment Variables Vercel
Atur:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `DASHBOARD_KEY` — secret acak yang panjang (dipakai server untuk memvalidasi akses dashboard)
- `APP_BASE_URL` — opsional, domain aplikasi tanpa slash terakhir

## Deploy
1. Upload isi folder `track` ke repository GitHub yang terhubung ke Vercel.
2. Pastikan Root Directory Vercel menunjuk ke `track` (atau deploy folder `track` sebagai project).
3. Atur environment variables di Vercel.
4. Commit dan deploy ulang.

## Akses
- `/dashbboorrddx` tanpa key atau dengan key salah akan mengembalikan halaman 404 dengan status HTTP 404.
- File HTML dashboard disimpan di folder `private` dan disajikan hanya setelah key divalidasi server.
- Dashboard: `https://domain-kamu.vercel.app/dashbboorrddx?key=ISI_DASHBOARD_KEY`
- Tracking: `https://domain-kamu.vercel.app/go/slug`

## Endpoint
- `GET /api/stats?limit=100` atau `GET /api/stats?limit=200`
- `DELETE /api/stats/reset` — hanya menghapus statistik, tidak menghapus set `links` maupun data `link:<slug>`
- `GET/POST /api/links`
- `PATCH/DELETE /api/links/:slug`
- `GET /go/:slug` — redirect dan mencatat klik

Seluruh endpoint administrasi memerlukan header `x-dashboard-key`.

## Catatan data dan kompatibilitas
- IP asli tidak disimpan. Hash IP dipakai untuk deduplikasi selama 30 detik per slug.
- Bot dan preview crawler disaring berdasarkan User-Agent.
- Domain dan device mulai dihitung untuk klik baru setelah versi ini dideploy. Data lama yang belum memiliki agregat `domains`/`devices` tidak dapat dihitung ulang secara lengkap dari statistik agregat lama.
- Log per link menyimpan maksimum 200 aktivitas terbaru; dashboard menggabungkan log seluruh link dan menampilkan maksimum 200 aktivitas.
- Statistik harian menggunakan zona waktu Asia/Jakarta.
- Detail path/query referrer bergantung pada header `Referer` yang dikirim browser/situs sumber. Server tidak dapat memulihkan bagian yang tidak dikirim browser.
- Reset statistik menghapus penghitung klik, log aktivitas, agregat domain/device/sumber/keyword, agregat harian, serta key deduplikasi sementara. Link tracking, nama link, slug, dan URL tujuan tetap tersimpan.

## Perlindungan spam request

Endpoint redirect `/go/:slug` memiliki rate limit Redis (fixed window 60 detik) yang dijalankan secara atomik menggunakan Lua. Default: maksimal 30 request/menit per IP, 20 request/menit per kombinasi IP+slug, dan 1.200 request/menit secara global. Request yang melewati batas menerima HTTP `429` dan header `Retry-After`. Filter bot dan deduplikasi statistik 30 detik tetap berjalan. IP mentah tidak disimpan; key rate limit memakai hash IP dengan salt.

Environment variable opsional di Vercel:

- `TRACKER_IP_LIMIT` (default `30`)
- `TRACKER_LINK_IP_LIMIT` (default `20`)
- `TRACKER_GLOBAL_LIMIT` (default `1200`)
- `RATE_LIMIT_SALT` (salt acak panjang untuk hash IP; jika kosong memakai `DASHBOARD_KEY`)

Atur nilai limit sebagai bilangan bulat positif. Setelah mengubah environment variable, redeploy project. Rate limit pada fungsi server tetap menerima satu request sampai fungsi untuk menolak; untuk serangan volumetrik besar, aktifkan juga Vercel Firewall/WAF atau proteksi edge sebelum Function agar request diblokir sebelum mencapai Redis dan Function. Batas global yang terlalu rendah dapat menolak pengunjung normal saat trafik tinggi.

## Mencatat judul & URL lengkap halaman sumber (khusus AMP & landing page)

Browser modern sering memotong header `Referer` (hanya mengirim origin/domain).  
Header `Referer` **tidak pernah** berisi `document.title`.

Agar dashboard menampilkan data lengkap, halaman sumber (terutama AMP) harus mengirim parameter secara eksplisit:

### Parameter yang didukung

| Parameter | Fungsi | Contoh |
|-----------|--------|--------|
| `source_title` / `page_title` / `title` | Judul halaman sumber | `?source_title=CYOU%20Situs%20Gacor` |
| `source_url` / `source` / `ref` / `referrer` | Full URL halaman sumber (override Referer) | `?source_url=https%3A%2F%2Fampxxx.pages.dev%2Famp1%2F%3Fid%3Dwapreri` |

### Contoh pemakaian di AMP / HTML biasa

```html
<!-- Cara paling sederhana (disarankan untuk AMP) -->
<a href="https://cxsec-track.vercel.app/go/jpmax?source_title=CYOU%20!7%20Merkating%20Nonprofit%20Layanan%20Perlindungan%20Konsumen&source_url=https%3A%2F%2Fampksdj139.pages.dev%2Famp1%2F"
   target="_blank" rel="noopener">
  LOGIN / DAFTAR AKUN
</a>
```

### Contoh dengan amp-analytics (opsional, lebih dinamis)

Jika ingin judul dan URL diambil otomatis dari runtime AMP:

```html
<script async custom-element="amp-analytics" src="https://cdn.ampproject.org/v0/amp-analytics-0.1.js"></script>

<amp-analytics>
  <script type="application/json">
  {
    "requests": {
      "click": "https://cxsec-track.vercel.app/go/jpmax?source_title=${title}&source_url=${sourceUrl}"
    },
    "triggers": {
      "trackButtons": {
        "on": "click",
        "selector": "a.btn",
        "request": "click"
      }
    }
  }
  </script>
</amp-analytics>
```

> Catatan: `amp-analytics` mengirim request tracking, tapi user tetap perlu diklik ke link tujuan.  
> Cara paling praktis untuk kebanyakan kasus adalah hardcode `source_title` + `source_url` langsung di atribut `href`.

### Hasil di Dashboard

Setelah parameter dikirim, detail aktivitas akan menampilkan:

- **Judul halaman sumber** → dari `source_title`
- **Domain** → dari `source_url` atau Referer
- **Path / slug** → dari `source_url` atau Referer
- **Query** → dari `source_url` atau Referer
- **URL lengkap** → dari `source_url` (prioritas) atau Referer

Jika parameter tidak dikirim, field akan menampilkan "tidak dikirim" / "tidak tersedia".
