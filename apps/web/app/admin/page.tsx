'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  Award,
  BarChart3,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // Auto-lock 15 menit tidak aktif

interface UserRecord {
  nim: string;
  name: string;
  whatsappNumber: string;
  planStatus: 'TRIAL' | 'PRO' | 'FREE';
  expiredAt: string;
  createdAt: string;
  _count?: {
    notificationLogs: number;
  };
}

interface AdminOverviewData {
  totalUsers: number;
  trialUsers: number;
  freeUsers: number;
  activeProUsers: number;
  pendingVerifications: number;
  notificationsSentToday: number;
  notificationsTotal: number;
  estimatedRevenue: number;
  revenueSplit5050: number;
  dailyRegistrations: Array<{
    date: string;
    label: string;
    count: number;
  }>;
  planBreakdown: {
    pro: number;
    trial: number;
    free: number;
  };
  systemHealth: {
    channel: string;
    botNumber: string;
    serverTimeWib: string;
    nodeEnv: string;
  };
  users: UserRecord[];
}

type NavTab = 'overview' | 'users' | 'revenue' | 'system';

type ConfirmModalState =
  | { type: 'pro'; nim: string; name: string }
  | { type: 'delete'; nim: string; name: string }
  | null;

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

export default function AdminDashboardPage() {
  const [adminSecret, setAdminSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [data, setData] = useState<AdminOverviewData | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlanTab, setSelectedPlanTab] = useState<'ALL' | 'PRO' | 'TRIAL' | 'FREE'>('ALL');
  const [activeNav, setActiveNav] = useState<NavTab>('overview');
  const [lastRefreshedTime, setLastRefreshedTime] = useState('');

  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  const handleLogout = useCallback((reason?: string) => {
    sessionStorage.removeItem('admin_secret');
    setIsAuthenticated(false);
    setData(null);
    setAdminSecret('');
    setConfirmModal(null);
    if (reason) setErrorMsg(reason);
  }, []);

  const fetchAdminData = useCallback(async (secret: string) => {
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/overview`, {
        headers: { 'x-admin-secret': secret },
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Kunci admin tidak valid.');
      }

      setData(json);
      setIsAuthenticated(true);
      sessionStorage.setItem('admin_secret', secret);
      setLastRefreshedTime(
        new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal terhubung ke server API.');
      setIsAuthenticated(false);
      sessionStorage.removeItem('admin_secret');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-login jika sessionStorage masih aktif
  useEffect(() => {
    const storedSecret = sessionStorage.getItem('admin_secret');
    if (storedSecret) {
      setAdminSecret(storedSecret);
      fetchAdminData(storedSecret);
    }
  }, [fetchAdminData]);

  // Idle auto-lock 15 menit untuk keamanan sesi admin
  useEffect(() => {
    if (!isAuthenticated) return;

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        handleLogout('Sesi dikunci otomatis karena tidak ada aktivitas selama 15 menit.');
      }, IDLE_TIMEOUT_MS);
    };

    const events = ['mousemove', 'keydown', 'click', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [isAuthenticated, handleLogout]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSecret.trim()) return;
    fetchAdminData(adminSecret.trim());
  };

  const executeConfirmAction = async () => {
    if (!confirmModal) return;
    const { type, nim } = confirmModal;

    setActionLoading(nim);
    setConfirmModal(null);

    try {
      const endpoint =
        type === 'pro'
          ? `${API_BASE_URL}/api/admin/users/${nim}/activate-pro`
          : `${API_BASE_URL}/api/admin/users/${nim}`;

      const res = await fetch(endpoint, {
        method: type === 'pro' ? 'POST' : 'DELETE',
        headers: { 'x-admin-secret': adminSecret },
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Aksi gagal dijalankan.');

      showToast(
        'success',
        json.message || (type === 'pro' ? `PRO +30 hari aktif untuk ${nim}.` : `User ${nim} dihapus.`)
      );
      fetchAdminData(adminSecret);
    } catch (err: any) {
      showToast('error', err.message || 'Gagal memproses permintaan.');
    } finally {
      setActionLoading(null);
    }
  };

  // =========================================================================
  // LOGIN VIEW (Clean, Focused, Zero Leaks)
  // =========================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] flex flex-col justify-center items-center px-4">
        <div className="max-w-sm w-full bg-white border border-stone-200/90 rounded-2xl p-7 shadow-[0_12px_40px_rgba(24,24,27,0.06)]">
          <div className="mb-6">
            <div className="w-10 h-10 bg-blue-50 border border-blue-100 text-[#1D4ED8] rounded-xl flex items-center justify-center mb-4">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[#18181B]">Admin Control</h1>
            <p className="text-xs text-stone-500 mt-1">
              Masukkan Admin Secret Key untuk mengakses panel UEU Academic Radar.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200/80 rounded-xl text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Secret Key
              </label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={adminSecret}
                  onChange={(e) => setAdminSecret(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#FAF9F6] border border-stone-200 text-sm text-stone-900 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#1D4ED8] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                  aria-label="Toggle visibility"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1D4ED8] hover:bg-blue-800 active:scale-[0.99] text-white font-semibold py-2.5 px-4 rounded-xl text-sm shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <span>Buka Panel Admin</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
            <Link href="/" className="hover:text-[#1D4ED8] transition-colors">
              ← Beranda Publik
            </Link>
            <span className="font-mono text-[10px] text-stone-400">Auto-lock 15m</span>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // COMPUTED DATA
  // =========================================================================
  const usersList = data?.users || [];
  const filteredUsers = usersList.filter((u) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      u.nim.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.whatsappNumber.includes(q);

    if (!matchesSearch) return false;
    if (selectedPlanTab === 'ALL') return true;
    return u.planStatus === selectedPlanTab;
  });

  const proUsersList = usersList.filter((u) => u.planStatus === 'PRO');
  const maxDayCount = Math.max(1, ...(data?.dailyRegistrations.map((d) => d.count) || [1]));
  const total7Days = data?.dailyRegistrations.reduce((acc, curr) => acc + curr.count, 0) || 0;
  const proConversionRate = data?.totalUsers
    ? Math.round((data.activeProUsers / data.totalUsers) * 100)
    : 0;

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'users', label: 'Mahasiswa', icon: <Users className="w-4 h-4" />, badge: data?.totalUsers || 0 },
    { id: 'revenue', label: 'Keuangan 50:50', icon: <Wallet className="w-4 h-4" /> },
    { id: 'system', label: 'Sistem', icon: <ShieldCheck className="w-4 h-4" /> },
  ];

  // Reusable Student Table Component
  const renderUserTable = (list: UserRecord[], compactTitle?: string) => (
    <div className="bg-white border border-stone-200/90 rounded-2xl shadow-[0_2px_12px_rgba(24,24,27,0.03)] overflow-hidden">
      <div className="p-5 border-b border-stone-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-[#18181B]">
            {compactTitle || 'Manajemen Mahasiswa & Lisensi'}
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Menampilkan {list.length} dari {usersList.length} akun terdaftar
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {!compactTitle && (
            <div className="inline-flex bg-stone-100 p-1 rounded-xl text-xs font-semibold">
              {(['ALL', 'PRO', 'TRIAL', 'FREE'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSelectedPlanTab(tab)}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    selectedPlanTab === tab
                      ? 'bg-white text-[#18181B] shadow-sm'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  {tab === 'ALL' ? 'Semua' : tab}
                </button>
              ))}
            </div>
          )}

          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Cari NIM, Nama, WA..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#FAF9F6] border border-stone-200 text-xs text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-[#1D4ED8]"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#FAF9F6] text-stone-500 border-b border-stone-200/80">
            <tr>
              <th className="py-3 px-4 font-semibold">Mahasiswa</th>
              <th className="py-3 px-4 font-semibold">WhatsApp</th>
              <th className="py-3 px-4 font-semibold">Paket</th>
              <th className="py-3 px-4 font-semibold">Masa Aktif</th>
              <th className="py-3 px-4 font-semibold">Log Notif</th>
              <th className="py-3 px-4 font-semibold text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-stone-400">
                  <Users className="w-7 h-7 text-stone-300 mx-auto mb-2" />
                  <p className="font-semibold text-stone-600 text-sm">Belum ada data yang cocok</p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Coba ubah filter paket atau kata kunci pencarian.
                  </p>
                </td>
              </tr>
            ) : (
              list.map((u) => {
                const isExpired = new Date(u.expiredAt).getTime() < Date.now();
                const daysLeft = Math.max(
                  0,
                  Math.ceil((new Date(u.expiredAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                );

                return (
                  <tr key={u.nim} className="hover:bg-stone-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-[#18181B] block">{u.name}</span>
                      <span className="font-mono text-[11px] text-stone-500 block">{u.nim}</span>
                    </td>

                    <td className="py-3.5 px-4 font-mono">
                      <a
                        href={`https://wa.me/${u.whatsappNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-stone-700 hover:text-[#1D4ED8] inline-flex items-center gap-1"
                      >
                        +{u.whatsappNumber}
                        <ArrowUpRight className="w-3 h-3 text-stone-400" />
                      </a>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          u.planStatus === 'PRO'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : u.planStatus === 'TRIAL'
                            ? 'bg-blue-50 text-[#1D4ED8] border border-blue-200'
                            : 'bg-stone-100 text-stone-600 border border-stone-200'
                        }`}
                      >
                        {u.planStatus}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={isExpired ? 'text-red-600 font-semibold' : 'text-stone-800 font-medium'}>
                        {new Date(u.expiredAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                      </span>
                      <span className="text-[10px] text-stone-400 block mt-0.5">
                        {isExpired ? 'Kedaluwarsa' : `${daysLeft} hari lagi`}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono text-stone-700 bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                        {u._count?.notificationLogs ?? 0}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmModal({ type: 'pro', nim: u.nim, name: u.name })}
                          disabled={actionLoading === u.nim}
                          className="bg-blue-50 hover:bg-[#1D4ED8] text-[#1D4ED8] hover:text-white border border-blue-200/80 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>+30H PRO</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmModal({ type: 'delete', nim: u.nim, name: u.name })}
                          disabled={actionLoading === u.nim}
                          className="text-stone-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          title="Hapus Mahasiswa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // =========================================================================
  // MAIN AUTHENTICATED SHELL
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] flex flex-col md:flex-row">
      {/* DESKTOP SIDEBAR (Hidden on Mobile so content loads immediately) */}
      <aside className="hidden md:flex w-60 bg-white border-r border-stone-200/90 flex-col justify-between shrink-0 sticky top-0 h-screen">
        <div>
          <div className="h-16 px-5 border-b border-stone-100 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#1D4ED8] text-white flex items-center justify-center text-xs font-bold">
              UR
            </span>
            <div>
              <span className="font-bold text-sm tracking-tight text-[#18181B] block leading-tight">
                Academic Radar
              </span>
              <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block">
                Admin Console
              </span>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeNav === item.id
                    ? 'bg-blue-50 text-[#1D4ED8]'
                    : 'text-stone-600 hover:bg-stone-100/70 hover:text-stone-900'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className="ml-auto bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded-md text-[10px] font-mono">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-stone-100 space-y-3">
          <div className="bg-[#FAF9F6] border border-stone-200/80 rounded-xl p-3 text-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-semibold text-stone-800 text-[11px]">API Online</span>
            </div>
            <p className="text-[10px] text-stone-500 font-mono truncate">
              Channel: {data?.systemHealth?.channel || 'TELEGRAM'}
            </p>
          </div>

          <div className="flex items-center justify-between text-xs px-1">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-stone-500 hover:text-[#1D4ED8] font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Web Publik</span>
            </a>
            <button
              type="button"
              onClick={() => handleLogout()}
              className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT COLUMN */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER (Mobile + Desktop) */}
        <header className="bg-white/90 backdrop-blur border-b border-stone-200/90 sticky top-0 z-30">
          <div className="h-14 md:h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="md:hidden w-7 h-7 rounded-lg bg-[#1D4ED8] text-white flex items-center justify-center text-[11px] font-bold">
                UR
              </span>
              <div className="text-xs">
                <span className="text-stone-400 hidden sm:inline">Admin / </span>
                <span className="font-bold text-[#18181B]">
                  {navItems.find((n) => n.id === activeNav)?.label}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {lastRefreshedTime && (
                <span className="text-[11px] font-mono text-stone-400 hidden sm:inline">
                  {lastRefreshedTime}
                </span>
              )}
              <button
                type="button"
                onClick={() => fetchAdminData(adminSecret)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-700 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                type="button"
                onClick={() => handleLogout()}
                className="md:hidden p-1.5 rounded-xl border border-stone-200 text-red-600 hover:bg-red-50"
                aria-label="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* MOBILE HORIZONTAL TAB BAR */}
          <div className="md:hidden flex items-center gap-1.5 px-4 pb-2.5 overflow-x-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeNav === item.id
                    ? 'bg-[#1D4ED8] text-white'
                    : 'bg-stone-100 text-stone-600'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </header>

        {/* PAGE BODY */}
        <main className="p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
          {/* ===============================================================
              TAB 1: OVERVIEW
             =============================================================== */}
          {activeNav === 'overview' && (
            <>
              {/* 4 KPI CARDS */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between text-stone-500 mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide">Mahasiswa</span>
                    <Users className="w-4 h-4 text-[#1D4ED8]" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#18181B]">
                    {data?.totalUsers || 0}
                  </p>
                  <p className="text-[11px] text-stone-500 mt-1">
                    {data?.trialUsers || 0} sedang TRIAL
                  </p>
                </div>

                <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between text-stone-500 mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide">PRO Aktif</span>
                    <Award className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#18181B]">
                      {data?.activeProUsers || 0}
                    </p>
                    <span className="text-xs font-semibold text-emerald-600">{proConversionRate}%</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">Rp 10.000 / bulan</p>
                </div>

                <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between text-stone-500 mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide">Omzet</span>
                    <DollarSign className="w-4 h-4 text-[#1D4ED8]" />
                  </div>
                  <p className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B]">
                    Rp {(data?.estimatedRevenue || 0).toLocaleString('id-ID')}
                  </p>
                  <p className="text-[11px] text-emerald-700 font-medium mt-1">
                    Split 50:50 → Rp {(data?.revenueSplit5050 || 0).toLocaleString('id-ID')}
                  </p>
                </div>

                <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between text-stone-500 mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide">Notif Hari Ini</span>
                    <MessageSquare className="w-4 h-4 text-stone-500" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#18181B]">
                    {data?.notificationsSentToday || 0}
                  </p>
                  <p className="text-[11px] text-stone-500 mt-1">
                    Total {data?.notificationsTotal || 0} terkirim
                  </p>
                </div>
              </div>

              {/* CHART + DISTRIBUTION */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* 7-Day Registration Chart (Accurate 0-height baseline & always-readable counts) */}
                <div className="lg:col-span-2 bg-white border border-stone-200/90 rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#1D4ED8]" />
                        <span>Registrasi 7 Hari Terakhir</span>
                      </h3>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Jumlah mahasiswa baru yang berhasil verifikasi WA
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-stone-700 bg-stone-100 px-2.5 py-1 rounded-lg">
                      {total7Days} total
                    </span>
                  </div>

                  <div className="h-44 flex items-end gap-2 sm:gap-4 pt-4 border-b border-stone-100 pb-2">
                    {(data?.dailyRegistrations || []).map((day, idx) => {
                      const heightPct = day.count === 0 ? 0 : Math.max(8, Math.round((day.count / maxDayCount) * 100));
                      const isToday = idx === (data?.dailyRegistrations.length || 0) - 1;

                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                          <span
                            className={`text-[11px] font-mono font-semibold ${
                              day.count > 0 ? 'text-stone-700' : 'text-stone-300'
                            }`}
                          >
                            {day.count}
                          </span>
                          <div className="w-full max-w-[38px] h-full flex items-end">
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-full rounded-t-lg transition-all duration-300 ${
                                day.count === 0
                                  ? 'h-[3px] bg-stone-200 rounded-full'
                                  : isToday
                                  ? 'bg-[#1D4ED8]'
                                  : 'bg-blue-200 hover:bg-blue-300'
                              }`}
                            />
                          </div>
                          <span className="text-[10px] font-medium text-stone-500 whitespace-nowrap">
                            {day.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Plan Distribution */}
                <div className="bg-white border border-stone-200/90 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#18181B] mb-4">Distribusi Paket</h3>

                    <div className="w-full h-2.5 bg-stone-100 rounded-full overflow-hidden flex mb-5">
                      <div
                        style={{
                          width: `${data?.totalUsers ? (data.activeProUsers / data.totalUsers) * 100 : 0}%`,
                        }}
                        className="bg-emerald-500 h-full"
                      />
                      <div
                        style={{
                          width: `${data?.totalUsers ? (data.trialUsers / data.totalUsers) * 100 : 0}%`,
                        }}
                        className="bg-[#1D4ED8] h-full"
                      />
                      <div
                        style={{
                          width: `${data?.totalUsers ? (data.freeUsers / data.totalUsers) * 100 : 0}%`,
                        }}
                        className="bg-stone-300 h-full"
                      />
                    </div>

                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-stone-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          PRO Aktif
                        </span>
                        <span className="font-mono font-bold text-[#18181B]">{data?.activeProUsers || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-stone-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#1D4ED8]" />
                          TRIAL 14 Hari
                        </span>
                        <span className="font-mono font-bold text-[#18181B]">{data?.trialUsers || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-stone-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-stone-300" />
                          Expired / FREE
                        </span>
                        <span className="font-mono font-bold text-stone-500">{data?.freeUsers || 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-stone-100 flex items-center justify-between text-xs">
                    <span className="text-stone-500">Pending Verif WA (15m)</span>
                    <span className="font-mono font-bold text-stone-800 bg-stone-100 px-2 py-0.5 rounded-md">
                      {data?.pendingVerifications || 0}
                    </span>
                  </div>
                </div>
              </div>

              {renderUserTable(filteredUsers)}
            </>
          )}

          {/* ===============================================================
              TAB 2: MAHASISWA (Fokus penuh pada manajemen user)
             =============================================================== */}
          {activeNav === 'users' && renderUserTable(filteredUsers)}

          {/* ===============================================================
              TAB 3: KEUANGAN & BAGI HASIL 50:50
             =============================================================== */}
          {activeNav === 'revenue' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-stone-200/90 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-stone-500 mb-1">Total Omzet PRO Aktif</p>
                  <p className="text-3xl font-bold tracking-tight text-[#18181B]">
                    Rp {(data?.estimatedRevenue || 0).toLocaleString('id-ID')}
                  </p>
                  <p className="text-xs text-stone-500 mt-1.5">
                    {data?.activeProUsers || 0} pelanggan × Rp 10.000
                  </p>
                </div>

                <div className="bg-white border border-emerald-200 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-emerald-700 mb-1">Jatah Founder A (50%)</p>
                  <p className="text-3xl font-bold tracking-tight text-emerald-700">
                    Rp {(data?.revenueSplit5050 || 0).toLocaleString('id-ID')}
                  </p>
                  <p className="text-xs text-stone-500 mt-1.5">Estimasi pembagian bersih</p>
                </div>

                <div className="bg-white border border-blue-200 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-[#1D4ED8] mb-1">Jatah Partner B (50%)</p>
                  <p className="text-3xl font-bold tracking-tight text-[#1D4ED8]">
                    Rp {(data?.revenueSplit5050 || 0).toLocaleString('id-ID')}
                  </p>
                  <p className="text-xs text-stone-500 mt-1.5">Estimasi pembagian bersih</p>
                </div>
              </div>

              {renderUserTable(proUsersList, 'Daftar Pelanggan PRO Aktif')}
            </div>
          )}

          {/* ===============================================================
              TAB 4: STATUS SISTEM & GATEWAY
             =============================================================== */}
          {activeNav === 'system' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-stone-200/90 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#18181B]">Gateway & Runtime</h3>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Operasional
                  </span>
                </div>

                <dl className="divide-y divide-stone-100 text-xs">
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-stone-500">Channel Aktif</dt>
                    <dd className="font-mono font-semibold text-[#18181B]">
                      {data?.systemHealth?.channel || '-'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-stone-500">Nomor Bot</dt>
                    <dd className="font-mono font-semibold text-[#18181B]">
                      {data?.systemHealth?.botNumber || '-'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-stone-500">Waktu Server (WIB)</dt>
                    <dd className="font-mono font-semibold text-[#18181B]">
                      {data?.systemHealth?.serverTimeWib || '-'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-stone-500">Environment</dt>
                    <dd className="font-mono font-semibold text-[#18181B]">
                      {data?.systemHealth?.nodeEnv || 'development'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="bg-white border border-stone-200/90 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-[#18181B]">Keamanan & Anti-Abuse</h3>
                <dl className="divide-y divide-stone-100 text-xs">
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-stone-500">Verifikasi Registrasi</dt>
                    <dd className="font-semibold text-emerald-700">Reverse-Initiated (VERIF-XXXX)</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-stone-500">Enkripsi Kalender</dt>
                    <dd className="font-mono font-semibold text-[#18181B]">AES-256-GCM</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-stone-500">Pending Verifikasi Aktif</dt>
                    <dd className="font-mono font-semibold text-[#18181B]">
                      {data?.pendingVerifications || 0} antrean
                    </dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-stone-500">Auto-Lock Sesi Admin</dt>
                    <dd className="font-mono font-semibold text-[#18181B]">15 menit idle</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* =========================================================================
          CUSTOM CONFIRMATION MODAL (Replaces browser confirm())
         ========================================================================= */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="text-base font-bold text-[#18181B]">
                {confirmModal.type === 'pro' ? 'Aktifkan Paket PRO?' : 'Hapus Mahasiswa Permanen?'}
              </h3>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed mb-5">
              {confirmModal.type === 'pro' ? (
                <>
                  Status <strong className="text-stone-900">{confirmModal.name}</strong> (
                  <span className="font-mono">{confirmModal.nim}</span>) akan diperpanjang{' '}
                  <strong>+30 hari PRO</strong> dan bot otomatis mengirim konfirmasi ke WhatsApp.
                </>
              ) : (
                <>
                  Data <strong className="text-stone-900">{confirmModal.name}</strong> (
                  <span className="font-mono">{confirmModal.nim}</span>) beserta seluruh jadwal dan log notifikasi akan dihapus permanen.
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeConfirmAction}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors ${
                  confirmModal.type === 'pro'
                    ? 'bg-[#1D4ED8] hover:bg-blue-800'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {confirmModal.type === 'pro' ? 'Ya, Aktifkan PRO' : 'Ya, Hapus Permanen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TOAST NOTIFICATION (Replaces browser alert())
         ========================================================================= */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold ${
              toast.type === 'success'
                ? 'bg-[#18181B] text-white border-stone-800'
                : 'bg-red-600 text-white border-red-700'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-white flex-shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}