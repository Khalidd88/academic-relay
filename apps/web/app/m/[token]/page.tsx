'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const ADMIN_WA_NUMBER = process.env.NEXT_PUBLIC_ADMIN_WA || '6281234567890';

interface TaskItem {
  uid: string;
  title: string;
  description: string;
  deadline: string;
  deadlineFormatted: string;
  isPast: boolean;
  hoursUntilDeadline: number;
  timeRemainingText: string;
  isDone: boolean;
}

interface UserDashboardData {
  nim: string;
  name: string;
  whatsappNumber: string;
  planStatus: 'TRIAL' | 'PRO' | 'FREE';
  expiredAt: string;
  isExpired: boolean;
  daysRemaining: number;
  hoursRemaining: number;
  tasks: TaskItem[];
}

type TaskFilter = 'active' | 'done' | 'past';

function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s\]\)>"']+/i);
  return match ? match[0] : null;
}

export default function UserMagicDashboardPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [data, setData] = useState<UserDashboardData | null>(null);

  // Task view states
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('active');
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  // Update ICS modal & state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newIcsFile, setNewIcsFile] = useState<File | null>(null);
  const [newIcsContent, setNewIcsContent] = useState('');
  const [updatingIcs, setUpdatingIcs] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');

  // Pro Upgrade modal state
  const [showProModal, setShowProModal] = useState(false);
  const [selectedBilling, setSelectedBilling] = useState<'monthly' | 'semester'>('monthly');
  const [copiedAccount, setCopiedAccount] = useState(false);

  const fetchDashboardData = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (silent) setRefreshing(true);
      else setLoading(true);
      setErrorMsg('');

      try {
        const res = await fetch(`${API_BASE_URL}/api/me?token=${encodeURIComponent(token)}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || 'Gagal memuat dashboard mahasiswa.');
        }

        setData(json);
      } catch (err: any) {
        setErrorMsg(err.message || 'Magic Link tidak valid atau sudah kedaluwarsa.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');
    if (!file.name.endsWith('.ics')) {
      setUploadError('Format file harus .ics hasil export kalender eLearning UEU.');
      setNewIcsFile(null);
      setNewIcsContent('');
      return;
    }

    setNewIcsFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text.includes('BEGIN:VCALENDAR')) {
        setUploadError('File tidak valid. Pastikan file berasal dari menu Export Kalender Moodle.');
        setNewIcsFile(null);
        setNewIcsContent('');
        return;
      }
      setNewIcsContent(text);
    };
    reader.onerror = () => setUploadError('Gagal membaca file kalender.');
    reader.readAsText(file);
  };

  const handleUpdateIcs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIcsContent) return;

    setUpdatingIcs(true);
    setUploadError('');
    setUpdateSuccess('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/me/update-ics?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icsContent: newIcsContent }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal memperbarui jadwal kalender.');
      }

      setUpdateSuccess('Jadwal terbaru berhasil disinkronkan!');
      setTimeout(() => {
        setShowUploadModal(false);
        setUpdateSuccess('');
        setNewIcsFile(null);
        setNewIcsContent('');
        fetchDashboardData(true);
      }, 1200);
    } catch (err: any) {
      setUploadError(err.message || 'Terjadi kesalahan saat menyimpan kalender.');
    } finally {
      setUpdatingIcs(false);
    }
  };

  const handleCopyAccount = () => {
    navigator.clipboard.writeText('081234567890');
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#18181B]">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 py-24 text-center flex-1 flex flex-col items-center justify-center">
          <div className="w-7 h-7 border-2 border-[#1D4ED8] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-stone-500 font-medium">
            Memverifikasi akses &amp; memuat jadwal kuliah...
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#18181B]">
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-20 text-center flex-1 flex flex-col items-center justify-center">
          <div className="w-11 h-11 bg-red-50 border border-red-200/80 text-red-600 rounded-xl flex items-center justify-center mb-4">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-[#18181B] mb-1">Tautan Tidak Valid</h2>
          <p className="text-xs text-stone-600 leading-relaxed mb-6">
            {errorMsg || 'Magic Link ini sudah kedaluwarsa atau tanda tangan digitalnya tidak cocok.'}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 bg-[#1D4ED8] hover:bg-blue-800 text-white text-xs font-semibold py-2.5 px-5 rounded-xl transition-colors"
          >
            <span>Kembali ke Halaman Utama</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const activeTasks = data.tasks.filter((t) => !t.isPast && !t.isDone);
  const doneTasks = data.tasks.filter((t) => !t.isPast && t.isDone);
  const pastTasks = data.tasks.filter((t) => t.isPast);

  const displayedTasks =
    taskFilter === 'active' ? activeTasks : taskFilter === 'done' ? doneTasks : pastTasks;

  const waConfirmMessage =
    selectedBilling === 'monthly'
      ? `Halo Admin UEU Academic Radar, saya mau aktivasi Paket PRO Bulanan (Rp 15.000) untuk NIM: ${data.nim} (${data.name}). Berikut bukti transfernya:`
      : `Halo Admin UEU Academic Radar, saya mau aktivasi Paket PRO 1 Semester (Rp 45.000) untuk NIM: ${data.nim} (${data.name}). Berikut bukti transfernya:`;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#18181B] selection:bg-blue-100 selection:text-blue-900">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex-1 w-full space-y-6">
        {/* COMPACT IDENTITY & SUBSCRIPTION BAR */}
        <section className="bg-white border border-stone-200/90 rounded-2xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(24,24,27,0.03)]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#18181B]">
                  {data.name}
                </h1>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    data.planStatus === 'PRO'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : data.planStatus === 'TRIAL'
                      ? 'bg-blue-50 text-[#1D4ED8] border border-blue-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  {data.planStatus === 'PRO'
                    ? 'PRO AKTIF'
                    : data.planStatus === 'TRIAL'
                    ? 'TRIAL 14 HARI'
                    : 'MASA AKTIF HABIS'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                <span className="font-mono text-stone-700">{data.nim}</span>
                <span>•</span>
                <span className="font-mono">+{data.whatsappNumber}</span>
                <span>•</span>
                <span>
                  {data.isExpired ? (
                    <span className="text-red-600 font-semibold">Berakhir</span>
                  ) : (
                    <>
                      Sisa <strong className="text-stone-800">{data.daysRemaining} hari</strong> (s.d.{' '}
                      {new Date(data.expiredAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      )
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setUploadError('');
                  setShowUploadModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 bg-[#FAF9F6] hover:bg-stone-100 text-xs font-semibold text-stone-800 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-[#1D4ED8]" />
                <span>Update .ics</span>
              </button>

              {data.planStatus !== 'PRO' && (
                <button
                  type="button"
                  onClick={() => setShowProModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 active:scale-[0.99] text-white text-xs font-semibold shadow-sm transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Perpanjang PRO</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* TASKS WORKSPACE (Above the Fold on Mobile) */}
        <section className="bg-white border border-stone-200/90 rounded-2xl shadow-[0_2px_12px_rgba(24,24,27,0.03)] overflow-hidden">
          {/* Workspace Header & Filter Tabs */}
          <div className="p-4 sm:p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#1D4ED8]" />
              <h2 className="text-sm font-bold text-[#18181B]">Jadwal &amp; Deadline eLearning</h2>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2">
              <div className="inline-flex bg-stone-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setTaskFilter('active')}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                    taskFilter === 'active'
                      ? 'bg-white text-[#18181B] shadow-sm'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  <span>Aktif</span>
                  <span className="font-mono text-[10px] bg-blue-50 text-[#1D4ED8] px-1.5 py-0.2 rounded">
                    {activeTasks.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTaskFilter('done')}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                    taskFilter === 'done'
                      ? 'bg-white text-[#18181B] shadow-sm'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  <span>Selesai</span>
                  <span className="font-mono text-[10px] text-stone-500">{doneTasks.length}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTaskFilter('past')}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                    taskFilter === 'past'
                      ? 'bg-white text-[#18181B] shadow-sm'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  <span>Lewat</span>
                  <span className="font-mono text-[10px] text-stone-500">{pastTasks.length}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => fetchDashboardData(true)}
                disabled={refreshing}
                className="p-2 rounded-xl border border-stone-200 text-stone-500 hover:text-stone-900 hover:bg-stone-50 transition-colors"
                title="Muat ulang jadwal"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Task List */}
          {displayedTasks.length === 0 ? (
            <div className="py-14 px-4 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-stone-800">
                {taskFilter === 'active'
                  ? 'Semua tugas aktif sudah beres!'
                  : taskFilter === 'done'
                  ? 'Belum ada tugas yang ditandai selesai'
                  : 'Tidak ada riwayat tugas yang terlewat'}
              </p>
              <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                {taskFilter === 'active'
                  ? 'Kalau dosen baru menambahkan kuis atau tugas di Moodle, klik Update .ics di atas.'
                  : 'Balas DONE di chat WhatsApp bot untuk menandai tugas terdekat sebagai selesai.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {displayedTasks.map((task) => {
                const isExpanded = expandedUid === task.uid;
                const taskUrl = extractFirstUrl(task.description);
                const isUrgent = !task.isPast && !task.isDone && task.hoursUntilDeadline <= 24;
                const isSoon =
                  !task.isPast &&
                  !task.isDone &&
                  task.hoursUntilDeadline > 24 &&
                  task.hoursUntilDeadline <= 72;

                return (
                  <div
                    key={task.uid}
                    className={`p-4 sm:p-5 transition-colors ${
                      isExpanded ? 'bg-[#FAF9F6]/70' : 'hover:bg-stone-50/60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div
                        onClick={() => setExpandedUid(isExpanded ? null : task.uid)}
                        className="flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                              task.isDone
                                ? 'bg-emerald-500'
                                : task.isPast
                                ? 'bg-stone-300'
                                : isUrgent
                                ? 'bg-red-500'
                                : isSoon
                                ? 'bg-[#1D4ED8]'
                                : 'bg-stone-400'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <h3
                              className={`text-sm font-semibold leading-snug ${
                                task.isDone
                                  ? 'text-stone-500 line-through'
                                  : 'text-[#18181B]'
                              }`}
                            >
                              {task.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500 mt-1">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 text-stone-400" />
                                {task.deadlineFormatted}
                              </span>
                              {task.description && (
                                <span className="inline-flex items-center gap-0.5 text-[#1D4ED8] font-medium">
                                  <span>{isExpanded ? 'Tutup detail' : 'Lihat instruksi'}</span>
                                  <ChevronDown
                                    className={`w-3 h-3 transition-transform ${
                                      isExpanded ? 'rotate-180' : ''
                                    }`}
                                  />
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pl-4 sm:pl-0 shrink-0">
                        {taskUrl && !task.isPast && (
                          <a
                            href={taskUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-200 bg-white hover:border-[#1D4ED8] hover:text-[#1D4ED8] text-[11px] font-semibold text-stone-700 transition-colors"
                          >
                            <span>Buka Portal</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        <span
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                            task.isDone
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                              : task.isPast
                              ? 'bg-stone-100 text-stone-500'
                              : isUrgent
                              ? 'bg-red-50 text-red-700 border border-red-200/80'
                              : 'bg-blue-50 text-[#1D4ED8] border border-blue-100'
                          }`}
                        >
                          {task.isDone ? 'Selesai' : task.timeRemainingText}
                        </span>
                      </div>
                    </div>

                    {/* Expandable Full Moodle Description */}
                    {isExpanded && task.description && (
                      <div className="mt-3 ml-4 p-3.5 rounded-xl bg-white border border-stone-200/90 text-xs text-stone-700 whitespace-pre-line leading-relaxed">
                        {task.description}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom Bot Command Helper */}
          <div className="px-5 py-3.5 bg-[#FAF9F6] border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-stone-600">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-3.5 h-3.5 text-[#1D4ED8] flex-shrink-0" />
              <span>
                Balas <code className="font-mono font-bold text-stone-900 bg-white border border-stone-200 px-1.5 py-0.5 rounded">DONE</code> di WhatsApp untuk mematikan alarm tugas terdekat, atau{' '}
                <code className="font-mono font-bold text-stone-900 bg-white border border-stone-200 px-1.5 py-0.5 rounded">CEK</code> untuk rekap cepat.
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* =====================================================================
          MODAL: UPDATE .ICS FILE
         ===================================================================== */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base text-[#18181B]">Perbarui Jadwal (.ics)</h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed mb-4">
              Unduh ulang file kalender dari{' '}
              <a
                href="https://elearning.esaunggul.ac.id/calendar/export.php"
                target="_blank"
                rel="noreferrer"
                className="text-[#1D4ED8] font-semibold underline inline-flex items-center gap-0.5"
              >
                eLearning UEU <ExternalLink className="w-3 h-3" />
              </a>{' '}
              (pilih <strong>All events</strong> &amp; <strong>Recent and next 60 days</strong>), lalu unggah di bawah ini.
            </p>

            {uploadError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {updateSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{updateSuccess}</span>
              </div>
            ) : (
              <form onSubmit={handleUpdateIcs} className="space-y-4">
                <input
                  type="file"
                  id="modal-ics-upload"
                  accept=".ics"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="modal-ics-upload"
                  className={`cursor-pointer flex items-center gap-3 p-4 rounded-xl border-2 border-dashed transition-colors ${
                    newIcsFile
                      ? 'bg-blue-50/50 border-[#1D4ED8]'
                      : 'bg-[#FAF9F6] border-stone-300 hover:border-[#1D4ED8]'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      newIcsFile ? 'bg-[#1D4ED8] text-white' : 'bg-white border border-stone-200 text-stone-500'
                    }`}
                  >
                    {newIcsFile ? <FileText className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    {newIcsFile ? (
                      <>
                        <p className="text-xs font-semibold text-stone-900 truncate">{newIcsFile.name}</p>
                        <p className="text-[11px] text-[#1D4ED8]">Siap disinkronkan</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-stone-800">Pilih file icalexport.ics baru</p>
                        <p className="text-[11px] text-stone-500">Klik di sini untuk mencari file</p>
                      </>
                    )}
                  </div>
                </label>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={!newIcsContent || updatingIcs}
                    className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                  >
                    {updatingIcs ? 'Menyimpan...' : 'Simpan Jadwal'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: UPGRADE TO PRO (Consistent Cobalt Blue Theme)
         ===================================================================== */}
      {showProModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1D4ED8] flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#18181B]">Lanjut Paket PRO</h3>
                  <p className="text-[11px] text-stone-500">Pengingat tanpa batas sepanjang kuliah</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Plan Duration Selector */}
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <button
                type="button"
                onClick={() => setSelectedBilling('monthly')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  selectedBilling === 'monthly'
                    ? 'border-[#1D4ED8] bg-blue-50/40 ring-1 ring-[#1D4ED8]'
                    : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <p className="text-[11px] font-semibold text-stone-500">Bulanan (30 Hari)</p>
                <p className="text-lg font-bold text-[#18181B] mt-0.5">Rp 15.000</p>
                <p className="text-[10px] text-stone-500 mt-0.5">Rp 500 / hari</p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedBilling('semester')}
                className={`p-3.5 rounded-xl border text-left transition-all relative ${
                  selectedBilling === 'semester'
                    ? 'border-[#1D4ED8] bg-blue-50/40 ring-1 ring-[#1D4ED8]'
                    : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <span className="absolute -top-2 right-2.5 bg-[#1D4ED8] text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                  Hemat 25%
                </span>
                <p className="text-[11px] font-semibold text-stone-500">1 Semester (4 Bln)</p>
                <p className="text-lg font-bold text-[#18181B] mt-0.5">Rp 45.000</p>
                <p className="text-[10px] text-emerald-700 font-medium mt-0.5">Rp 11.250 / bulan</p>
              </button>
            </div>

            <div className="space-y-2 text-xs text-stone-700 mb-5">
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#1D4ED8] flex-shrink-0" />
                <span>Direct Link 1-klik buka &amp; kumpul tugas di eLearning UEU</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#1D4ED8] flex-shrink-0" />
                <span>Pengingat prioritas H-1 hari &amp; H-3 jam semua mata kuliah</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#1D4ED8] flex-shrink-0" />
                <span>Update file kalender .ics kapan saja tanpa batas</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#1D4ED8] flex-shrink-0" />
                <span>Perintah interaktif DONE &amp; CEK langsung di WhatsApp</span>
              </div>
            </div>

            {/* Payment Transfer Box */}
            <div className="bg-[#FAF9F6] border border-stone-200 rounded-xl p-3.5 mb-5 text-xs">
              <p className="font-semibold text-stone-800 mb-1.5">Transfer E-Wallet (GoPay / DANA / OVO):</p>
              <div className="flex items-center justify-between bg-white border border-stone-200 rounded-lg px-3 py-2">
                <div>
                  <p className="font-mono font-bold text-stone-900">0812-3456-7890</p>
                  <p className="text-[10px] text-stone-500">a.n. UEU Academic Radar</p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyAccount}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-stone-200 hover:bg-stone-50 text-[11px] font-medium text-stone-700"
                >
                  {copiedAccount ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-700">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <a
              href={`https://wa.me/${ADMIN_WA_NUMBER}?text=${encodeURIComponent(waConfirmMessage)}`}
              target="_blank"
              rel="noreferrer"
              className="w-full bg-[#1D4ED8] hover:bg-blue-800 text-white text-xs font-semibold py-3 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              <span>Kirim Bukti Transfer ke WhatsApp Admin</span>
            </a>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}