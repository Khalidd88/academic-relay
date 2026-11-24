'use client';

import React, { useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Lock,
  MessageCircle,
  ShieldCheck,
  Upload,
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type PreviewTab = 'h1' | 'h3' | 'done';

export default function HomePage() {
  const [nim, setNim] = useState('');
  const [name, setName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [icsFile, setIcsFile] = useState<File | null>(null);
  const [icsContent, setIcsContent] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<PreviewTab>('h1');

  const [verificationResult, setVerificationResult] = useState<{
    verificationCode: string;
    botNumber: string;
    waLink: string;
  } | null>(null);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.startsWith('08')) {
      val = '628' + val.slice(2);
    } else if (val.startsWith('8')) {
      val = '628' + val.slice(1);
    }
    setWhatsappNumber(val);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.ics')) {
      setErrorMsg('Format filenya harus .ics ya (hasil klik tombol Export di Moodle).');
      return;
    }

    setIcsFile(file);
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text.includes('BEGIN:VCALENDAR')) {
        setErrorMsg('Isi file tidak terbaca sebagai kalender Moodle. Coba export ulang ya.');
        setIcsFile(null);
        setIcsContent('');
        return;
      }
      setIcsContent(text);
    };
    reader.onerror = () => setErrorMsg('Gagal membaca file kalender.');
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!nim.trim()) return setErrorMsg('NIM wajib diisi dulu ya.');
    if (!name.trim()) return setErrorMsg('Nama panggilan wajib diisi.');
    if (!whatsappNumber.startsWith('628') || whatsappNumber.length < 10) {
      return setErrorMsg('Nomor WhatsApp tidak valid. Contoh yang benar: 081234567890.');
    }
    if (!icsContent) {
      return setErrorMsg('Jangan lupa unggah file kalender .ics dari eLearning UEU.');
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nim: nim.trim(),
          name: name.trim(),
          whatsappNumber: whatsappNumber.trim(),
          icsContent: icsContent.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan saat pendaftaran.');

      setVerificationResult({
        verificationCode: data.verificationCode,
        botNumber: data.botNumber,
        waLink: data.waLink,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghubungi server. Coba lagi sebentar ya.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!verificationResult) return;
    navigator.clipboard.writeText(verificationResult.verificationCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#18181B] selection:bg-blue-100 selection:text-blue-900">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* LEFT COLUMN: Warm Editorial Pitch + Authentic WhatsApp Preview */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-white border border-stone-200/90 text-xs font-medium text-stone-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600" />
              </span>
              <span>Khusus Mahasiswa UEU (Bekasi, Kebon Jeruk &amp; Citra Raya)</span>
            </div>

            <h1 className="text-4xl sm:text-[48px] font-bold tracking-[-0.03em] leading-[1.08] text-[#18181B] mb-5">
              Biar kuis &amp; tugas eLearning{' '}
              <span className="text-[#1D4ED8]">nggak pernah kelewat lagi.</span>
            </h1>

            <p className="text-[15px] sm:text-[17px] text-stone-600 leading-relaxed max-w-xl mb-8">
              Bot otomatis mengingatkan jadwal penutupan tugas di{' '}
              <strong className="font-semibold text-stone-800">H-1 hari</strong> dan{' '}
              <strong className="font-semibold text-stone-800">H-3 jam</strong> langsung ke WhatsApp. Cukup unggah file kalender Moodle sekali, tanpa perlu kasih password SSO kampus.
            </p>

            {/* Interactive WhatsApp Preview Card */}
            <div className="bg-white rounded-2xl border border-stone-200/90 shadow-[0_8px_30px_rgba(24,24,27,0.04)] overflow-hidden mb-8">
              {/* Interactive Tab Bar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 bg-stone-50/70 gap-2 flex-wrap">
                <span className="text-xs font-semibold text-stone-700">
                  Coba lihat cara kerja botnya:
                </span>
                <div className="inline-flex bg-stone-200/60 p-0.5 rounded-lg">
                  {(
                    [
                      { id: 'h1', label: 'Notif H-1' },
                      { id: 'h3', label: 'Mepet H-3 Jam' },
                      { id: 'done', label: 'Balas DONE' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                        activeTab === tab.id
                          ? 'bg-white text-[#1D4ED8] shadow-sm'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Authentic WhatsApp Chat Surface */}
              <div className="bg-[#EFEAE2] p-4 sm:p-5">
                <div className="bg-[#0B141A] text-white px-4 py-2.5 rounded-t-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#1D4ED8] text-white text-xs font-bold flex items-center justify-center">
                      UR
                    </div>
                    <div>
                      <p className="text-xs font-semibold leading-tight">UEU Academic Radar</p>
                      <p className="text-[10px] text-emerald-400">online</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-stone-400">WhatsApp Bot</span>
                </div>

                <div className="bg-[#EFEAE2] border-x border-b border-black/5 rounded-b-xl p-4 min-h-[205px] flex flex-col justify-center">
                  {activeTab === 'h1' && (
                    <div
                      key="h1"
                      className="bg-white text-stone-900 rounded-xl rounded-tl-none p-3.5 shadow-sm max-w-[92%] text-xs leading-relaxed transition-all duration-300"
                    >
                      <p className="font-semibold text-stone-950 mb-2">
                        Halo Khalid! Ini 2 deadline terdekat minggu ini:
                      </p>
                      <div className="space-y-2 text-stone-700">
                        <p>
                          1. <strong className="text-stone-950">QUIZ sesi 8 closes</strong>
                          <br />
                          <span className="text-[11px] text-stone-500">
                            Selasa, 24 Nov 2026 • 23:59 WIB (1 hari 4 jam lagi)
                          </span>
                        </p>
                        <p>
                          2. <strong className="text-stone-950">PROYEK 2 | Laporan Individu Jigsaw</strong>
                          <br />
                          <span className="text-[11px] text-stone-500">
                            Kamis, 26 Nov 2026 • 12:00 WIB (2 hari 16 jam lagi)
                          </span>
                        </p>
                      </div>
                      <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-500">
                        <span>Balas DONE kalau sudah kumpul • CEK untuk rekap</span>
                        <span>19:42</span>
                      </div>
                    </div>
                  )}

                  {activeTab === 'h3' && (
                    <div
                      key="h3"
                      className="bg-white text-stone-900 rounded-xl rounded-tl-none p-3.5 shadow-sm max-w-[92%] text-xs leading-relaxed border-l-4 border-[#1D4ED8] transition-all duration-300"
                    >
                      <p className="font-bold text-[#1D4ED8] mb-1">
                        PENGINGAT TERAKHIR — SISA 3 JAM
                      </p>
                      <p className="text-stone-950 font-semibold">
                        8.12 Graded Quiz for Technology closes
                      </p>
                      <p className="text-[11px] text-stone-600 mt-1">
                        Portal ditutup hari ini pukul 15:30 WIB. Yuk langsung kerjakan sebelum terkunci otomatis!
                      </p>
                      <div className="mt-2 flex justify-end text-[10px] text-stone-400">
                        12:30
                      </div>
                    </div>
                  )}

                  {activeTab === 'done' && (
                    <div key="done" className="flex flex-col gap-2.5 transition-all duration-300">
                      <div className="self-end bg-[#D9FDD3] text-stone-900 rounded-xl rounded-tr-none px-3.5 py-2 shadow-sm text-xs flex items-end gap-2">
                        <span className="font-semibold">DONE</span>
                        <span className="text-[10px] text-stone-500 flex items-center gap-0.5">
                          20:14
                          <CheckCheck className="w-3.5 h-3.5 text-[#1D4ED8]" />
                        </span>
                      </div>
                      <div className="bg-white text-stone-900 rounded-xl rounded-tl-none p-3.5 shadow-sm max-w-[90%] text-xs leading-relaxed">
                        <p>
                          Sip! <strong className="text-stone-950">QUIZ sesi 8 closes</strong> ditandai selesai. Bot nggak bakal ganggu kamu lagi untuk tugas ini.
                        </p>
                        <div className="mt-1.5 flex justify-end text-[10px] text-stone-400">
                          20:14
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Honest Local Credibility Bar */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-stone-600 px-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#1D4ED8]" />
                <span>Dibuat oleh Mahasiswa SI UEU</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#1D4ED8]" />
                <span>Enkripsi AES-256 • Tanpa Password SSO</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#1D4ED8]" />
                <span>Gratis 14 Hari, lalu Rp 10rb/bln</span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Tactile Registration / Verification Card */}
          <div className="lg:col-span-5 w-full">
            {!verificationResult ? (
              <div className="bg-white rounded-2xl border border-stone-200/90 shadow-[0_12px_40px_rgba(24,24,27,0.06)] p-6 sm:p-7">
                <div className="mb-6">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h2 className="text-xl font-bold tracking-tight text-[#18181B]">
                      Daftar Gratis 14 Hari
                    </h2>
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1D4ED8]">
                      30 Detik
                    </span>
                  </div>
                  <p className="text-xs text-stone-500">
                    Isi data singkat di bawah, lalu konfirmasi sekali lewat WhatsApp.
                  </p>
                </div>

                {errorMsg && (
                  <div className="mb-5 p-3.5 bg-red-50 border border-red-200/80 rounded-xl text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                        NIM
                      </label>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        placeholder="20260803036"
                        value={nim}
                        onChange={(e) => setNim(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] border border-stone-200 text-sm text-stone-900 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#1D4ED8] transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                        Nama Panggilan
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Khalid"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] border border-stone-200 text-sm text-stone-900 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#1D4ED8] transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Nomor WhatsApp Aktif
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="08xxxxxxxxxx"
                      value={whatsappNumber}
                      onChange={handlePhoneChange}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] border border-stone-200 text-sm text-stone-900 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#1D4ED8] transition-all"
                    />
                    <p className="text-[11px] text-stone-400 mt-1">
                      Ketik mulai dari 08, sistem otomatis ubah ke format 628.
                    </p>
                  </div>

                  {/* ICS Upload + Friendly Visual Guide */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-stone-700">
                        File Kalender Moodle (.ics)
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowGuide(!showGuide)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:text-blue-800 transition-colors"
                      >
                        <span>{showGuide ? 'Tutup panduan' : 'Bingung cara ambilnya?'}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            showGuide ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>

                    {showGuide && (
                      <div className="mb-3 bg-[#FAF9F6] border border-stone-200 rounded-xl p-3.5 text-xs text-stone-700 space-y-2.5">
                        <p className="font-semibold text-stone-900">
                          Ikuti 3 langkah ini (jangan salah pilih ya):
                        </p>
                        <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                          <li>
                            Login dulu lalu klik:{' '}
                            <a
                              href="https://elearning.esaunggul.ac.id/calendar/export.php"
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#1D4ED8] font-semibold underline inline-flex items-center gap-0.5"
                            >
                              Buka Export Kalender UEU <ExternalLink className="w-3 h-3" />
                            </a>
                          </li>
                          <li>Pilih 2 bulatan ini di halaman eLearning:</li>
                        </ol>

                        {/* Mini Visual Reference of Moodle Options */}
                        <div className="bg-white border border-stone-200 rounded-lg p-2.5 space-y-1.5 text-[11px]">
                          <div className="flex items-center gap-2 text-stone-900 font-medium">
                            <span className="w-3 h-3 rounded-full border-4 border-[#1D4ED8] inline-block" />
                            <span>Events to export: <strong>All events</strong></span>
                          </div>
                          <div className="flex items-center gap-2 text-stone-900 font-medium">
                            <span className="w-3 h-3 rounded-full border-4 border-[#1D4ED8] inline-block" />
                            <span>Time period: <strong>Recent and next 60 days</strong></span>
                          </div>
                        </div>

                        <p className="text-[11px] text-stone-600">
                          3. Klik tombol <strong className="text-stone-900">Export</strong> (bukan Get calendar URL). File{' '}
                          <code className="bg-stone-200/70 px-1 py-0.5 rounded font-mono text-[10px]">
                            icalexport.ics
                          </code>{' '}
                          akan terunduh, lalu pilih file itu di bawah.
                        </p>
                      </div>
                    )}

                    <input
                      type="file"
                      id="ics-upload"
                      accept=".ics"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <label
                      htmlFor="ics-upload"
                      className={`cursor-pointer flex items-center gap-3.5 p-4 rounded-xl border-2 border-dashed transition-all duration-200 ${
                        icsFile
                          ? 'bg-blue-50/50 border-[#1D4ED8]'
                          : 'bg-[#FAF9F6] border-stone-300 hover:border-[#1D4ED8] hover:bg-blue-50/30'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                          icsFile
                            ? 'bg-[#1D4ED8] text-white'
                            : 'bg-white border border-stone-200 text-stone-500'
                        }`}
                      >
                        {icsFile ? <FileText className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        {icsFile ? (
                          <>
                            <p className="text-sm font-semibold text-stone-900 truncate">
                              {icsFile.name}
                            </p>
                            <p className="text-[11px] text-[#1D4ED8] font-medium">
                              {(icsFile.size / 1024).toFixed(1)} KB siap diproses • klik untuk ganti
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-stone-800">
                              Unggah file <span className="text-[#1D4ED8] font-mono">.ics</span>
                            </p>
                            <p className="text-[11px] text-stone-500">
                              Klik di sini untuk pilih icalexport.ics dari HP/laptop
                            </p>
                          </>
                        )}
                      </div>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 bg-[#1D4ED8] hover:bg-blue-800 active:scale-[0.99] text-white font-semibold py-3.5 px-4 rounded-xl shadow-[0_4px_14px_rgba(29,78,216,0.28)] hover:shadow-[0_6px_20px_rgba(29,78,216,0.35)] transition-all duration-200 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Menyiapkan kode verifikasi...</span>
                      </>
                    ) : (
                      <>
                        <span>Lanjut Aktivasi via WhatsApp</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-stone-500 text-center leading-relaxed pt-1">
                    Aman dari spam: bot baru aktif setelah kamu mengirim kode konfirmasi dari WhatsApp-mu sendiri.
                  </p>
                </form>
              </div>
            ) : (
              /* Reverse-Initiated Verification Card */
              <div className="bg-white rounded-2xl border-2 border-[#1D4ED8] shadow-[0_12px_40px_rgba(29,78,216,0.1)] p-6 sm:p-7">
                <div className="w-11 h-11 bg-blue-50 border border-blue-100 text-[#1D4ED8] rounded-xl flex items-center justify-center mb-4">
                  <MessageCircle className="w-5 h-5" />
                </div>

                <h2 className="text-xl font-bold tracking-tight text-[#18181B]">
                  Tinggal 1 klik lagi di WhatsApp
                </h2>
                <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
                  Kirim kode di bawah dari nomor yang kamu daftarkan agar sistem memastikan akun ini benar milikmu (berlaku 15 menit).
                </p>

                <div className="my-5 bg-[#FAF9F6] border border-stone-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Kode Aktivasi
                    </p>
                    <p className="text-2xl font-mono font-bold text-stone-950 tracking-wider mt-0.5">
                      {verificationResult.verificationCode}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-stone-200 hover:bg-stone-100 text-xs font-medium text-stone-700 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>

                <a
                  href={verificationResult.waLink}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full bg-[#1D4ED8] hover:bg-blue-800 active:scale-[0.99] text-white font-semibold py-3.5 px-4 rounded-xl shadow-[0_4px_14px_rgba(29,78,216,0.28)] transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Buka WhatsApp &amp; Kirim Kode</span>
                  <ArrowRight className="w-4 h-4" />
                </a>

                <p className="text-[11px] text-center text-stone-500 mt-3 leading-relaxed">
                  Begitu kamu tekan Kirim di WhatsApp, bot langsung membalas pesan sambutan + 3 deadline terdekatmu.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}