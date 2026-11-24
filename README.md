# UEU Academic Radar

> Micro-SaaS pengingat deadline tugas kuliah otomatis via WhatsApp untuk mahasiswa Universitas Esa Unggul (UEU).

---

## 🏗️ Arsitektur Monorepo & Stack

```
ueu-academic-radar/
├── apps/
│   ├── api/             # Fastify + TypeScript + Prisma + BullMQ + node-ical + dayjs (WIB)
│   └── web/             # Next.js 15 (App Router) + Tailwind CSS + Lucide Icons
├── docker-compose.yml   # PostgreSQL 16, Redis 7 (Auth), WAHA (127.0.0.1:3005:3000)
├── .env.example         # Template konfigurasi environment
└── README.md
```

---

## 🚀 Panduan Menjalankan Sistem

### 1. Prasyarat & Service Pendukung
Pastikan Docker Desktop sudah aktif, lalu jalankan container database, Redis, dan WAHA:
```bash
docker compose up -d
```

### 2. Konfigurasi Variabel Lingkungan
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Sesuaikan konfigurasi bot:
- `NOTIFY_CHANNEL`: `"TELEGRAM"` (untuk pengujian lokal) atau `"WAHA"` (produksi).
- `TELEGRAM_BOT_TOKEN` & `TELEGRAM_TEST_CHAT_ID`: Token pengujian Telegram.
- `ADMIN_SECRET`: Kunci rahasia untuk mengakses Admin Panel `/admin`.
- `WA_BOT_NUMBER`: Nomor bot WhatsApp untuk reverse-initiated verification.

### 3. Migrasi Database & Instalasi Dependensi
```bash
npm install
npm --workspace=apps/api run prisma:generate
npx prisma db push --schema=apps/api/prisma/schema.prisma
```

### 4. Menjalankan Aplikasi dalam Mode Pengembangan
Jalankan backend API dan frontend Web secara bersamaan:
```bash
# Terminal 1: Backend API (Port 4000)
npm run dev:api

# Terminal 2: Frontend Next.js (Port 3000)
npm run dev:web
```

---

## 🔐 Fitur Keamanan & Anti-Spoofing

1. **Reverse-Initiated Verification**:
   - Mencegah spam/pendaftaran nomor WA orang lain.
   - Pendaftar menerima kode `VERIF-XXXX` dan tombol langsung ke `https://wa.me/...`.
   - Bot memverifikasi bahwa pengirim pesan cocok dengan nomor yang didaftarkan sebelum akun diaktifkan.
2. **HMAC-SHA256 Signed Magic Link**:
   - Mahasiswa mengakses dashboard tanpa username/password melalui link bertanda tangan digital: `/m/[token]`.
3. **AES-256-GCM Calendar Encryption**:
   - Seluruh konten file `.ics` dienkripsi dengan IV 12-byte acak sebelum disimpan ke PostgreSQL.
4. **Rate Limiting**:
   - `@fastify/rate-limit` membatasi maksimal 5 pendaftaran per 15 menit per IP.

---

## 📱 Alur Mahasiswa & Perintah WhatsApp

- **Daftar**: Upload file `.ics` dari kalender eLearning UEU, lalu kirimkan kode verifikasi ke bot WA.
- **Done**: Balas `DONE` di WA untuk menandai tugas terdekat telah selesai (radar tidak akan mengingatkan lagi).
- **Cek**: Balas `CEK` di WA untuk melihat rekap tugas aktif minggu ini beserta sisa waktu.
- **Perpanjang**: Mahasiswa dapat memperpanjang paket PRO via Admin Panel seharga Rp 10.000 / bulan.

---

## 🛡️ Admin Dashboard (`/admin`)

- Masuk dengan `ADMIN_SECRET`.
- Pantau metrik total user, pengguna PRO aktif, pembagian omzet 50:50, dan antrean verifikasi.
- Tombol aksi cepat: **+30 Hari PRO** dan **Hapus Pengguna**.
