# Vercel Link Tracker

Dashboard dengan akses key melalui query `?key=...`, pada alamat khusus `/dashbboorrddx`.

## Fitur
- Dashboard di `/dashbboorrddx?key=...` dengan key akses
- Endpoint statistik dan pengelolaan link juga dilindungi key di header server-side
- Tambah, edit, hapus link
- URL tracking berbentuk `/go/slug`
- Total klik per link dan keseluruhan
- Grafik klik harian 7 hari terakhir
- Riwayat klik terbaru
- Redis sebagai penyimpanan

## Environment Variables Vercel
Tambahkan:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `APP_BASE_URL` (domain Vercel/custom domain tanpa slash terakhir)

`DASHBOARD_KEY` — wajib diisi dengan secret akses dashboard. Contoh jika ingin URL `?key=aksezz`, isi nilainya `aksezz`. Gunakan key yang lebih panjang dan acak untuk deployment publik.

## Deploy
1. Ekstrak ZIP.
2. Upload seluruh isi folder project ke repository GitHub yang terhubung ke Vercel, dengan mempertahankan struktur folder.
3. Commit perubahan.
4. Tunggu deployment otomatis selesai dengan status Ready. Jika tidak otomatis, buka Deployments lalu redeploy deployment terbaru.

## Akses
- Dashboard: `https://domain-kamu.vercel.app/dashbboorrddx?key=aksezz` (jika `DASHBOARD_KEY=aksezz`)
- Tracking: `https://domain-kamu.vercel.app/go/slug`

## Catatan keamanan
Dashboard memakai key yang disimpan sementara di sessionStorage browser dan dikirim ke API melalui header. Query key dibersihkan dari address bar setelah dibaca. Endpoint statistik, tambah, edit, dan hapus link memvalidasi key di server. Tetap gunakan secret acak yang panjang; key yang dibagikan melalui URL dapat terlihat di riwayat browser atau log hosting.

Sistem menghitung request ke endpoint redirect; bot dan preview tautan juga bisa ikut tercatat. Statistik harian memakai UTC. Log menyimpan waktu, referrer, dan user-agent; IP tidak disimpan.


## Detail referrer

Riwayat klik menyimpan domain, path, query string, dan URL referrer lengkap berdasarkan header `Referer` yang diterima server. Browser atau website sumber dapat membatasi header ini (misalnya hanya mengirim origin), sehingga path/query tidak selalu tersedia. Server tidak dapat memulihkan bagian URL yang tidak dikirim.
