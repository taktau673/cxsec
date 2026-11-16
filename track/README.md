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
- `DASHBOARD_KEY` — secret acak yang panjang
- `APP_BASE_URL` — opsional, domain aplikasi tanpa slash terakhir

## Deploy
1. Upload isi folder `track` ke repository GitHub yang terhubung ke Vercel.
2. Pastikan Root Directory Vercel menunjuk ke `track` (atau deploy folder `track` sebagai project).
3. Atur environment variables di Vercel.
4. Commit dan deploy ulang.

## Akses
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
