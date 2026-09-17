import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Shield,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  Receipt,
  Gamepad2,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Sliders,
  DollarSign,
  UserCheck,
  UserX,
  Clock,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  ExternalLink,
  Menu,
  LayoutDashboard,
  MoreHorizontal,
  ArrowRight,
  Loader2,
  Ban,
  ShieldAlert,
  Sparkles,
  Filter,
  Phone,
  Hash,
  Calendar,
  AlertCircle,
  Trophy
} from 'lucide-react';
import {
  UserAccount,
  DepositRequest,
  WithdrawalRequest,
  AuditLogRecord,
  LedgerEntry,
  AdminUserDetail,
  RoomSummary,
  DailyJackpotAdminState
} from '../types/bingo.js';
import { apiUrl } from '../config/api.js';
import { soundService } from '../services/soundService.js';
import { telegramSdk } from '../services/telegramSdk.js';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken?: string | null;
  token?: string | null;
  user?: UserAccount | null;
}

type AdminTab = 'overview' | 'deposits' | 'withdrawals' | 'users' | 'transactions' | 'games' | 'audit_logs' | 'daily_jackpot';

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  isOpen,
  onClose,
  sessionToken,
  token: propToken,
  user
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // In-flight processing state to block double-clicks and show spinners
  const [processingActionId, setProcessingActionId] = useState<string | null>(null);

  // Data Collections
  const [users, setUsers] = useState<AdminUserDetail[]>([]);
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [dailyJackpotAdmin, setDailyJackpotAdmin] = useState<DailyJackpotAdminState | null>(null);
  const [evaluatingJackpot, setEvaluatingJackpot] = useState<boolean>(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [txTypeFilter, setTxTypeFilter] = useState<string>('ALL');

  // Pagination for Users
  const [usersPage, setUsersPage] = useState<number>(1);
  const USERS_PER_PAGE = 10;

  // Mobile Navigation Drawer ("More" menu)
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Item Details Drawers
  const [selectedDeposit, setSelectedDeposit] = useState<DepositRequest | null>(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogRecord | null>(null);

  // Rejection Dialog State
  const [rejectDialog, setRejectDialog] = useState<{
    type: 'deposit' | 'withdrawal';
    id: string;
    targetName: string;
    amount: number;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  // Manual Adjustment Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState<boolean>(false);
  const [adjustTargetId, setAdjustTargetId] = useState<string>('');
  const [adjustAmount, setAdjustAmount] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [isAdjusting, setIsAdjusting] = useState<boolean>(false);

  // Copy-to-clipboard state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const token = propToken || sessionToken || localStorage.getItem('bingo_auth_token');

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }), [token]);

  // Load initial tab data or load overview data on open
  useEffect(() => {
    if (isOpen) {
      loadTabData(activeTab);
      // Preload deposits & withdrawals for badges if on another tab
      if (activeTab === 'overview') {
        preloadOverviewData();
      }
    }
  }, [isOpen, activeTab]);

  // Reset pagination when search query or filter changes
  useEffect(() => {
    setUsersPage(1);
  }, [searchQuery, filterStatus]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const preloadOverviewData = async () => {
    try {
      const [depRes, withRes, userRes, roomRes, jackRes] = await Promise.all([
        fetch(apiUrl('/api/admin/deposits'), { headers: authHeaders }),
        fetch(apiUrl('/api/admin/withdrawals'), { headers: authHeaders }),
        fetch(apiUrl('/api/admin/users'), { headers: authHeaders }),
        fetch(apiUrl('/api/admin/games'), { headers: authHeaders }),
        fetch(apiUrl('/api/admin/daily-jackpot'), { headers: authHeaders })
      ]);
      if (depRes.ok) {
        const d = await depRes.json();
        setDeposits(d.deposits || []);
      }
      if (withRes.ok) {
        const w = await withRes.json();
        setWithdrawals(w.withdrawals || []);
      }
      if (userRes.ok) {
        const u = await userRes.json();
        setUsers(u.users || []);
      }
      if (roomRes.ok) {
        const r = await roomRes.json();
        setRooms(r.rooms || []);
      }
      if (jackRes.ok) {
        const j = await jackRes.json();
        setDailyJackpotAdmin(j);
      }
    } catch (e) {
      console.error('Failed to preload overview metrics:', e);
    }
  };

  const loadTabData = async (tab: AdminTab) => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'overview') {
        await preloadOverviewData();
      } else if (tab === 'users') {
        const res = await fetch(apiUrl('/api/admin/users'), { headers: authHeaders });
        if (!res.ok) throw new Error('Failed to load users');
        const d = await res.json();
        setUsers(d.users || []);
      } else if (tab === 'deposits') {
        const res = await fetch(apiUrl('/api/admin/deposits'), { headers: authHeaders });
        if (!res.ok) throw new Error('Failed to load deposits');
        const d = await res.json();
        setDeposits(d.deposits || []);
      } else if (tab === 'withdrawals') {
        const res = await fetch(apiUrl('/api/admin/withdrawals'), { headers: authHeaders });
        if (!res.ok) throw new Error('Failed to load withdrawals');
        const d = await res.json();
        setWithdrawals(d.withdrawals || []);
      } else if (tab === 'transactions') {
        const res = await fetch(apiUrl('/api/admin/transactions'), { headers: authHeaders });
        if (!res.ok) throw new Error('Failed to load transactions');
        const d = await res.json();
        setTransactions(d.entries || []);
      } else if (tab === 'games') {
        const res = await fetch(apiUrl('/api/admin/games'), { headers: authHeaders });
        if (!res.ok) throw new Error('Failed to load games');
        const d = await res.json();
        setRooms(d.rooms || []);
      } else if (tab === 'audit_logs') {
        const res = await fetch(apiUrl('/api/admin/audit-logs'), { headers: authHeaders });
        if (!res.ok) throw new Error('Failed to load audit logs');
        const d = await res.json();
        setAuditLogs(d.auditLogs || []);
      } else if (tab === 'daily_jackpot') {
        const res = await fetch(apiUrl('/api/admin/daily-jackpot'), { headers: authHeaders });
        if (!res.ok) throw new Error('Failed to load Daily Grand Jackpot data');
        const d = await res.json();
        setDailyJackpotAdmin(d);
      }
    } catch (err: any) {
      setError(err.message || 'Authorization failed or network error');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerJackpotEvaluation = async () => {
    if (processingActionId || evaluatingJackpot) return;
    setEvaluatingJackpot(true);
    setError(null);
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');
    try {
      const res = await fetch(apiUrl('/api/admin/daily-jackpot/evaluate'), {
        method: 'POST',
        headers: authHeaders
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to evaluate jackpot');
      setSuccessMsg(d.message || 'Jackpot evaluation completed');
      setTimeout(() => setSuccessMsg(null), 4000);
      // Refresh jackpot data
      const refreshRes = await fetch(apiUrl('/api/admin/daily-jackpot'), { headers: authHeaders });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setDailyJackpotAdmin(data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to evaluate jackpot');
    } finally {
      setEvaluatingJackpot(false);
    }
  };

  const handleRefreshCurrentTab = async () => {
    setRefreshing(true);
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    await loadTabData(activeTab);
    setRefreshing(false);
  };

  // ==================== ACTIONS WITH INSTANT IN-PLACE UPDATES ====================

  const handleApproveDeposit = async (deposit: DepositRequest) => {
    const actionKey = `dep_approve_${deposit.id}`;
    if (processingActionId) return; // Prevent double-clicks
    setProcessingActionId(actionKey);
    setError(null);
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');

    try {
      const res = await fetch(apiUrl(`/api/admin/deposits/${deposit.id}/approve`), {
        method: 'POST',
        headers: authHeaders
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve deposit');

      // IN-PLACE STATE UPDATE: Update the deposit record immediately
      const now = new Date().toISOString();
      setDeposits((prev) =>
        prev.map((d) =>
          d.id === deposit.id
            ? { ...d, status: 'APPROVED', processedAt: now, processedBy: user?.username || 'admin' }
            : d
        )
      );

      // Also update selected deposit drawer if open
      if (selectedDeposit?.id === deposit.id) {
        setSelectedDeposit((prev) => (prev ? { ...prev, status: 'APPROVED', processedAt: now } : null));
      }

      soundService.playLineChime();
      telegramSdk.triggerHaptic('success');
      setSuccessMsg(`Deposit ${deposit.id} approved (${deposit.amount} ETB credited)!`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (e: any) {
      soundService.playError();
      telegramSdk.triggerHaptic('error');
      setError(e.message);
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleConfirmRejectDeposit = async () => {
    if (!rejectDialog || rejectDialog.type !== 'deposit') return;
    const { id } = rejectDialog;
    const actionKey = `dep_reject_${id}`;
    if (processingActionId) return;
    setProcessingActionId(actionKey);
    setError(null);

    const finalReason = rejectReason.trim() || 'Declined by administrator';

    try {
      const res = await fetch(apiUrl(`/api/admin/deposits/${id}/reject`), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ reason: finalReason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject deposit');

      const now = new Date().toISOString();
      setDeposits((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, status: 'REJECTED', processedAt: now, rejectionReason: finalReason }
            : d
        )
      );

      if (selectedDeposit?.id === id) {
        setSelectedDeposit((prev) => (prev ? { ...prev, status: 'REJECTED', rejectionReason: finalReason } : null));
      }

      soundService.playClick();
      telegramSdk.triggerHaptic('light');
      setSuccessMsg(`Deposit ${id} rejected.`);
      setRejectDialog(null);
      setRejectReason('');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleApproveWithdrawal = async (withdrawal: WithdrawalRequest) => {
    const actionKey = `with_approve_${withdrawal.id}`;
    if (processingActionId) return;
    setProcessingActionId(actionKey);
    setError(null);
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');

    try {
      const res = await fetch(apiUrl(`/api/admin/withdrawals/${withdrawal.id}/approve`), {
        method: 'POST',
        headers: authHeaders
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve withdrawal');

      const now = new Date().toISOString();
      setWithdrawals((prev) =>
        prev.map((w) =>
          w.id === withdrawal.id
            ? { ...w, status: 'APPROVED', processedAt: now, processedBy: user?.username || 'admin' }
            : w
        )
      );

      if (selectedWithdrawal?.id === withdrawal.id) {
        setSelectedWithdrawal((prev) => (prev ? { ...prev, status: 'APPROVED', processedAt: now } : null));
      }

      soundService.playLineChime();
      telegramSdk.triggerHaptic('success');
      setSuccessMsg(`Withdrawal ${withdrawal.id} approved & processed (${withdrawal.amount} ETB)!`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (e: any) {
      soundService.playError();
      telegramSdk.triggerHaptic('error');
      setError(e.message);
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleConfirmRejectWithdrawal = async () => {
    if (!rejectDialog || rejectDialog.type !== 'withdrawal') return;
    const { id } = rejectDialog;
    const actionKey = `with_reject_${id}`;
    if (processingActionId) return;
    setProcessingActionId(actionKey);
    setError(null);

    const finalReason = rejectReason.trim() || 'Declined by administrator';

    try {
      const res = await fetch(apiUrl(`/api/admin/withdrawals/${id}/reject`), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ reason: finalReason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject withdrawal');

      const now = new Date().toISOString();
      setWithdrawals((prev) =>
        prev.map((w) =>
          w.id === id
            ? { ...w, status: 'REJECTED', processedAt: now, rejectionReason: finalReason }
            : w
        )
      );

      if (selectedWithdrawal?.id === id) {
        setSelectedWithdrawal((prev) => (prev ? { ...prev, status: 'REJECTED', rejectionReason: finalReason } : null));
      }

      soundService.playClick();
      telegramSdk.triggerHaptic('light');
      setSuccessMsg(`Withdrawal ${id} rejected & reserved balance refunded.`);
      setRejectDialog(null);
      setRejectReason('');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleUpdateUserStatus = async (playerId: string, status: 'ACTIVE' | 'SUSPENDED' | 'BANNED') => {
    if (processingActionId) return;
    setProcessingActionId(`user_status_${playerId}`);
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${playerId}/status`), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ status })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to update user');

      setUsers((prev) =>
        prev.map((u) => (u.playerId === playerId || u.id === playerId ? { ...u, account_status: status } : u))
      );

      setSuccessMsg(`Player ${playerId} is now ${status}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleManualAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(adjustAmount);
    if (!adjustTargetId || isNaN(amt) || !adjustReason) {
      setError('Target player ID, numeric amount, and reason are required');
      return;
    }
    setIsAdjusting(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/admin/balance-adjustment'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          targetPlayerId: adjustTargetId.trim(),
          amount: amt,
          reason: adjustReason.trim()
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to adjust balance');

      setUsers((prev) =>
        prev.map((u) =>
          u.playerId === adjustTargetId || u.id === adjustTargetId
            ? { ...u, walletBalance: d.newBalance }
            : u
        )
      );

      setSuccessMsg(`Balance adjusted by ${amt > 0 ? '+' : ''}${amt} ETB for ${adjustTargetId}`);
      setAdjustTargetId('');
      setAdjustAmount('');
      setAdjustReason('');
      setAdjustModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsAdjusting(false);
    }
  };

  // ==================== COMPUTED METRICS & FILTERING ====================

  const pendingDepositsCount = useMemo(
    () => deposits.filter((d) => d.status === 'PENDING').length,
    [deposits]
  );
  const pendingWithdrawalsCount = useMemo(
    () => withdrawals.filter((w) => w.status === 'PENDING').length,
    [withdrawals]
  );

  const totalUserBalance = useMemo(
    () => users.reduce((acc, u) => acc + (u.walletBalance || 0), 0),
    [users]
  );

  const filteredDeposits = useMemo(() => {
    return deposits.filter((d) => {
      const matchesStatus = filterStatus === 'ALL' || d.status === filterStatus;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        d.username.toLowerCase().includes(q) ||
        d.playerId.toLowerCase().includes(q) ||
        (d.referenceId && d.referenceId.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [deposits, filterStatus, searchQuery]);

  const filteredWithdrawals = useMemo(() => {
    return withdrawals.filter((w) => {
      const matchesStatus = filterStatus === 'ALL' || w.status === filterStatus;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        w.username.toLowerCase().includes(q) ||
        w.playerId.toLowerCase().includes(q) ||
        (w.address && w.address.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [withdrawals, filterStatus, searchQuery]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesStatus = filterStatus === 'ALL' || u.account_status === filterStatus;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        u.username.toLowerCase().includes(q) ||
        u.playerId.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q) ||
        (u.telegram_id && u.telegram_id.toLowerCase().includes(q)) ||
        (u.phone && u.phone.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [users, filterStatus, searchQuery]);

  const paginatedUsers = useMemo(() => {
    const start = (usersPage - 1) * USERS_PER_PAGE;
    return filteredUsers.slice(start, start + USERS_PER_PAGE);
  }, [filteredUsers, usersPage]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesType = txTypeFilter === 'ALL' || t.type.toLowerCase() === txTypeFilter.toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        t.username.toLowerCase().includes(q) ||
        t.playerId.toLowerCase().includes(q) ||
        (t.referenceId && t.referenceId.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [transactions, txTypeFilter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#080808] text-slate-100 flex flex-col h-full w-full overflow-hidden select-none font-sans safe-top safe-bottom">
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TOP STICKY APPLICATION BAR                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <header className="w-full bg-[#0D0D0D] border-b border-white/[0.08] px-3 sm:px-6 py-2.5 flex items-center justify-between flex-shrink-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 flex-shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            <Shield className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 leading-none">
              <span className="font-arcade font-black text-sm tracking-tight text-white uppercase">
                BINGO<span className="text-[#E8FF00]">.BET</span>
              </span>
              <span className="text-[9px] font-arcade font-bold px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 uppercase">
                ROOT
              </span>
            </div>
            <div className="text-[10px] font-arcade text-white/50 tracking-wider hidden sm:block">
              BACK-OFFICE FINANCIAL & COMPLIANCE PANEL
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Pending Counter Pills */}
          {(pendingDepositsCount > 0 || pendingWithdrawalsCount > 0) && (
            <div className="hidden md:flex items-center gap-1.5">
              {pendingDepositsCount > 0 && (
                <button
                  onClick={() => {
                    setActiveTab('deposits');
                    setFilterStatus('PENDING');
                  }}
                  className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer animate-pulse"
                >
                  <ArrowDownToLine className="w-3 h-3" />
                  <span>{pendingDepositsCount} PENDING DEP</span>
                </button>
              )}
              {pendingWithdrawalsCount > 0 && (
                <button
                  onClick={() => {
                    setActiveTab('withdrawals');
                    setFilterStatus('PENDING');
                  }}
                  className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-300 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer animate-pulse"
                >
                  <ArrowUpFromLine className="w-3 h-3" />
                  <span>{pendingWithdrawalsCount} PENDING WITH</span>
                </button>
              )}
            </div>
          )}

          {/* Refresh Tab Button */}
          <button
            onClick={handleRefreshCurrentTab}
            disabled={refreshing || loading}
            title="Refresh current section"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all cursor-pointer active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#E8FF00]' : ''}`} />
          </button>

          {/* Exit Admin Dashboard Button */}
          <button
            onClick={() => {
              soundService.playClick();
              telegramSdk.triggerHaptic('light');
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white font-arcade font-bold text-xs transition-all cursor-pointer active:scale-95"
          >
            <span className="hidden sm:inline">EXIT</span>
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* SUCCESS & ERROR TOASTS                                      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {successMsg && (
        <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-4 py-2 flex items-center gap-2 text-emerald-300 text-xs font-arcade font-bold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="bg-rose-500/15 border-b border-rose-500/30 px-4 py-2 flex items-center justify-between text-rose-300 text-xs font-arcade font-bold animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-white/50 hover:text-white text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MAIN LAYOUT: SIDEBAR (DESKTOP) + CONTENT (DESKTOP/MOBILE)   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* DESKTOP SIDEBAR (>= 1024px) */}
        <aside className="hidden lg:flex flex-col w-64 bg-[#0B0B0B] border-r border-white/[0.08] flex-shrink-0">
          <div className="p-4 space-y-1.5">
            <span className="text-[10px] font-arcade font-black text-white/40 uppercase tracking-wider block px-2 pb-1">
              NAVIGATION
            </span>

            {/* Nav Item: Overview */}
            <button
              onClick={() => {
                setActiveTab('overview');
                soundService.playClick();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-arcade font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4" />
                <span>Overview</span>
              </div>
            </button>

            {/* Nav Item: Deposits */}
            <button
              onClick={() => {
                setActiveTab('deposits');
                soundService.playClick();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-arcade font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'deposits'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ArrowDownToLine className="w-4 h-4" />
                <span>Deposits</span>
              </div>
              {pendingDepositsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-amber-400 text-black text-[10px] font-black animate-pulse">
                  {pendingDepositsCount}
                </span>
              )}
            </button>

            {/* Nav Item: Withdrawals */}
            <button
              onClick={() => {
                setActiveTab('withdrawals');
                soundService.playClick();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-arcade font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'withdrawals'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ArrowUpFromLine className="w-4 h-4" />
                <span>Withdrawals</span>
              </div>
              {pendingWithdrawalsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-rose-400 text-black text-[10px] font-black animate-pulse">
                  {pendingWithdrawalsCount}
                </span>
              )}
            </button>

            {/* Nav Item: Users */}
            <button
              onClick={() => {
                setActiveTab('users');
                soundService.playClick();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-arcade font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>Users</span>
              </div>
              <span className="text-[10px] font-mono text-white/40">{users.length}</span>
            </button>

            {/* Nav Item: Transactions */}
            <button
              onClick={() => {
                setActiveTab('transactions');
                soundService.playClick();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-arcade font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'transactions'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Receipt className="w-4 h-4" />
                <span>Transactions</span>
              </div>
            </button>

            {/* Nav Item: Games/Rooms */}
            <button
              onClick={() => {
                setActiveTab('games');
                soundService.playClick();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-arcade font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'games'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Gamepad2 className="w-4 h-4" />
                <span>Games & Rooms</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">{rooms.length}</span>
            </button>

            {/* Nav Item: Audit Logs */}
            <button
              onClick={() => {
                setActiveTab('audit_logs');
                soundService.playClick();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-arcade font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'audit_logs'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4" />
                <span>Audit Logs</span>
              </div>
            </button>

            {/* Nav Item: Daily Grand Jackpot */}
            <button
              onClick={() => {
                setActiveTab('daily_jackpot');
                soundService.playClick();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-arcade font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'daily_jackpot'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Daily Jackpot</span>
              </div>
              {dailyJackpotAdmin && (
                <span className="text-[10px] font-mono text-amber-300 font-bold">
                  {dailyJackpotAdmin.currentRound.cards_sold}/200
                </span>
              )}
            </button>
          </div>

          {/* Sidebar Footer Info */}
          <div className="mt-auto p-4 border-t border-white/[0.08] space-y-2">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-arcade text-white/50">
                <span>GATEWAY</span>
                <span className="text-emerald-400 font-mono font-bold">TELEBIRR ONLY</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-arcade text-white/50">
                <span>DATABASE</span>
                <span className="text-white font-mono">SQLITE WAL</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-arcade text-white/50">
                <span>TX INTEGRITY</span>
                <span className="text-emerald-400 font-mono">ATOMIC 6.8ms</span>
              </div>
            </div>

            <button
              onClick={() => setAdjustModalOpen(true)}
              className="w-full py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-arcade font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>MANUAL BALANCE ADJUST</span>
            </button>
          </div>
        </aside>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* MAIN SCROLLABLE CONTENT VIEW                                */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto pb-24 lg:pb-8">
          <div className="max-w-7xl w-full mx-auto p-3 sm:p-6 space-y-4">

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 1. TAB: OVERVIEW                                        */}
            {/* ═══════════════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
              <div className="space-y-4 animate-fadeIn">
                {/* Pending Actions Urgent Banners */}
                {pendingDepositsCount > 0 && (
                  <div
                    onClick={() => {
                      setActiveTab('deposits');
                      setFilterStatus('PENDING');
                    }}
                    className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-between cursor-pointer hover:bg-amber-500/20 transition-all shadow-[0_0_15px_rgba(245,158,11,0.15)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-400 text-black flex items-center justify-center font-black">
                        <ArrowDownToLine className="w-5 h-5 animate-bounce" />
                      </div>
                      <div>
                        <div className="font-arcade font-black text-sm text-amber-300">
                          {pendingDepositsCount} PENDING DEPOSIT REQUEST{pendingDepositsCount > 1 ? 'S' : ''}
                        </div>
                        <div className="text-[10px] text-white/70">
                          Players are waiting for Telebirr deposit approvals. Tap to review now.
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  </div>
                )}

                {pendingWithdrawalsCount > 0 && (
                  <div
                    onClick={() => {
                      setActiveTab('withdrawals');
                      setFilterStatus('PENDING');
                    }}
                    className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-400/40 flex items-center justify-between cursor-pointer hover:bg-rose-500/20 transition-all shadow-[0_0_15px_rgba(244,63,94,0.15)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-rose-400 text-black flex items-center justify-center font-black">
                        <ArrowUpFromLine className="w-5 h-5 animate-bounce" />
                      </div>
                      <div>
                        <div className="font-arcade font-black text-sm text-rose-300">
                          {pendingWithdrawalsCount} PENDING WITHDRAWAL REQUEST{pendingWithdrawalsCount > 1 ? 'S' : ''}
                        </div>
                        <div className="text-[10px] text-white/70">
                          Cashout payouts awaiting admin confirmation. Tap to review now.
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-rose-400 flex-shrink-0" />
                  </div>
                )}

                {/* KPI Metrics Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 space-y-1">
                    <div className="text-[10px] font-arcade text-white/50 uppercase">TOTAL PLAYERS</div>
                    <div className="font-arcade font-black text-xl text-white">{users.length}</div>
                    <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                      <UserCheck className="w-3 h-3" />
                      <span>{users.filter(u => u.account_status === 'ACTIVE').length} Active</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 space-y-1">
                    <div className="text-[10px] font-arcade text-white/50 uppercase">TOTAL USER BALANCES</div>
                    <div className="font-arcade font-black text-xl text-[#E8FF00]">
                      {totalUserBalance.toLocaleString()} <span className="text-xs">ETB</span>
                    </div>
                    <div className="text-[10px] text-white/40 font-mono">Platform liability</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 space-y-1">
                    <div className="text-[10px] font-arcade text-white/50 uppercase">ACTIVE ROOMS</div>
                    <div className="font-arcade font-black text-xl text-white">{rooms.length}</div>
                    <div className="text-[10px] text-emerald-400 font-mono">75-Ball Multi-Room</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 space-y-1">
                    <div className="text-[10px] font-arcade text-white/50 uppercase">AUDIT COMPLIANCE</div>
                    <div className="font-arcade font-black text-xl text-emerald-400">100%</div>
                    <div className="text-[10px] text-white/40 font-mono">Immutable SQLite</div>
                  </div>
                </div>

                {/* Quick Action Navigation Tiles */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    onClick={() => setActiveTab('deposits')}
                    className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 hover:border-amber-400/50 flex items-center justify-between text-left transition-all cursor-pointer"
                  >
                    <div>
                      <div className="font-arcade font-black text-xs text-amber-300 uppercase">
                        DEPOSIT VERIFICATION
                      </div>
                      <div className="text-[11px] text-white/60 mt-0.5">
                        {pendingDepositsCount} pending • Telebirr reference checks
                      </div>
                    </div>
                    <ArrowDownToLine className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  </button>

                  <button
                    onClick={() => setActiveTab('withdrawals')}
                    className="p-4 rounded-2xl bg-gradient-to-br from-rose-500/10 to-transparent border border-rose-500/20 hover:border-rose-400/50 flex items-center justify-between text-left transition-all cursor-pointer"
                  >
                    <div>
                      <div className="font-arcade font-black text-xs text-rose-300 uppercase">
                        WITHDRAWAL CASHOUTS
                      </div>
                      <div className="text-[11px] text-white/60 mt-0.5">
                        {pendingWithdrawalsCount} pending • Telebirr phone payouts
                      </div>
                    </div>
                    <ArrowUpFromLine className="w-5 h-5 text-rose-400 flex-shrink-0" />
                  </button>

                  <button
                    onClick={() => setActiveTab('users')}
                    className="p-4 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20 hover:border-cyan-400/50 flex items-center justify-between text-left transition-all cursor-pointer"
                  >
                    <div>
                      <div className="font-arcade font-black text-xs text-cyan-300 uppercase">
                        USER MANAGEMENT
                      </div>
                      <div className="text-[11px] text-white/60 mt-0.5">
                        {users.length} registered • Ban, suspend or inspect
                      </div>
                    </div>
                    <Users className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                  </button>
                </div>

                {/* Daily Grand Jackpot Overview Widget */}
                {dailyJackpotAdmin && dailyJackpotAdmin.currentRound && (
                  <div
                    onClick={() => {
                      setActiveTab('daily_jackpot');
                      soundService.playClick();
                    }}
                    className="p-4 rounded-2xl bg-[#141414] border border-amber-400/30 hover:border-amber-400/60 transition-all cursor-pointer space-y-3 shadow-[0_0_15px_rgba(245,158,11,0.08)]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-400 text-black flex items-center justify-center font-black">
                          <Trophy className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-arcade font-black text-xs text-amber-300 uppercase flex items-center gap-2">
                            <span>DAILY GRAND JACKPOT</span>
                            <span className="px-1.5 py-0.5 rounded text-[8px] bg-amber-400/20 text-amber-300 border border-amber-400/30 font-mono">
                              12:00 PM CUTOFF
                            </span>
                          </div>
                          <div className="text-[10px] text-white/50 font-mono">
                            Round: {dailyJackpotAdmin.currentRound.round_id || dailyJackpotAdmin.currentRound.id} • {dailyJackpotAdmin.currentRound.jackpot_date || dailyJackpotAdmin.currentRound.date_str} (Africa/Addis_Ababa)
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-arcade font-bold uppercase ${
                          dailyJackpotAdmin.currentRound.status === 'REGISTRATION_OPEN'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : dailyJackpotAdmin.currentRound.status === 'POSTPONED'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-white/10 text-white/70'
                        }`}>
                          {dailyJackpotAdmin.currentRound.status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-white/40" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/5 text-xs font-mono">
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="text-[9px] text-white/40 uppercase">Cards Sold</div>
                        <div className="text-white font-bold">{dailyJackpotAdmin.currentRound.cards_sold ?? 0} / 200</div>
                        <div className="text-[9px] text-white/30">Min: 100 required</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="text-[9px] text-white/40 uppercase">Gross Sales</div>
                        <div className="text-amber-300 font-bold">{((dailyJackpotAdmin.currentRound.gross_card_sales ?? dailyJackpotAdmin.currentRound.gross_sales ?? 0)).toLocaleString()} ETB</div>
                        <div className="text-[9px] text-white/30">@ 999 ETB/card</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="text-[9px] text-white/40 uppercase">Prize Pool</div>
                        <div className="text-emerald-400 font-bold">{((dailyJackpotAdmin.currentRound.calculatedJackpot ?? dailyJackpotAdmin.currentRound.calculated_jackpot ?? dailyJackpotAdmin.currentRound.jackpot_amount ?? 0)).toLocaleString()} ETB</div>
                        <div className="text-[9px] text-white/30">Authoritative prize</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="text-[9px] text-white/40 uppercase">Platform Cut</div>
                        <div className="text-[#E8FF00] font-bold">{((dailyJackpotAdmin.currentRound.platform_retained_amount ?? dailyJackpotAdmin.currentRound.calculatedPlatformRetained ?? 0)).toLocaleString()} ETB</div>
                        <div className="text-[9px] text-white/30">Admin accounting only</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 2. TAB: DEPOSITS (RESPONSIVE CARDS + DESKTOP TABLE)     */}
            {/* ═══════════════════════════════════════════════════════ */}
            {activeTab === 'deposits' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <h2 className="text-base font-arcade font-black text-amber-300 uppercase tracking-wide">
                      Deposit Requests Management
                    </h2>
                    <p className="text-[11px] text-white/50">
                      Verify Telebirr SMS Reference IDs and approve or reject player deposits
                    </p>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
                      <button
                        key={st}
                        onClick={() => setFilterStatus(st)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-arcade font-bold cursor-pointer transition-all ${
                          filterStatus === st
                            ? 'bg-amber-400 text-black shadow-sm'
                            : 'bg-white/5 text-white/60 hover:text-white border border-white/10'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search by player, telegram ID, or reference number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#121212] border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-amber-400/50"
                  />
                </div>

                {/* MOBILE CARDS VIEW (< 1024px) */}
                <div className="lg:hidden space-y-2.5">
                  {filteredDeposits.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-white/[0.02] border border-white/10 text-white/40 text-xs">
                      No deposit requests found matching your filter.
                    </div>
                  ) : (
                    filteredDeposits.map((d) => {
                      const isProcessingThis = processingActionId === `dep_approve_${d.id}`;
                      return (
                        <div
                          key={d.id}
                          className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 hover:border-white/20 transition-all space-y-3"
                        >
                          {/* Card Top: Status & Date */}
                          <div className="flex items-center justify-between">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider ${
                                d.status === 'APPROVED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : d.status === 'PENDING'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40 animate-pulse'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {d.status}
                            </span>
                            <span className="text-[10px] font-mono text-white/40">
                              {new Date(d.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {/* Card Body: Player & Amount */}
                          <div className="flex items-baseline justify-between">
                            <div>
                              <div className="font-arcade font-bold text-sm text-white">{d.username}</div>
                              <div className="text-[10px] font-mono text-white/40">{d.playerId}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-arcade font-black text-base text-emerald-400">
                                +{d.amount.toLocaleString()} ETB
                              </div>
                              <div className="text-[10px] text-white/50">{d.paymentMethod}</div>
                            </div>
                          </div>

                          {/* Reference Number Pill with 1-tap Copy */}
                          {d.referenceId && (
                            <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] text-white/40 font-mono">REF:</span>
                                <span className="text-xs font-mono font-bold text-amber-300 truncate">
                                  {d.referenceId}
                                </span>
                              </div>
                              <button
                                onClick={() => copyToClipboard(d.referenceId || '', `ref_${d.id}`)}
                                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[10px] text-white/70 hover:text-white flex items-center gap-1 cursor-pointer"
                              >
                                {copiedKey === `ref_${d.id}` ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400 font-bold">COPIED</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>COPY</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}

                          {/* Card Actions: Accessible & Never Cut Off */}
                          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                            <button
                              onClick={() => setSelectedDeposit(d)}
                              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 font-arcade text-xs font-bold cursor-pointer"
                            >
                              DETAILS
                            </button>

                            {d.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() =>
                                    setRejectDialog({
                                      type: 'deposit',
                                      id: d.id,
                                      targetName: d.username,
                                      amount: d.amount
                                    })
                                  }
                                  disabled={Boolean(processingActionId)}
                                  className="flex-1 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-arcade text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                                >
                                  REJECT
                                </button>
                                <button
                                  onClick={() => handleApproveDeposit(d)}
                                  disabled={Boolean(processingActionId)}
                                  className="flex-1 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-arcade text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                                >
                                  {isProcessingThis ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span>APPROVING...</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>APPROVE</span>
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* DESKTOP TABLE VIEW (>= 1024px) */}
                <div className="hidden lg:block rounded-2xl border border-white/10 overflow-hidden bg-[#111111]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-arcade font-bold uppercase text-[10px]">
                        <th className="p-3.5">Request ID</th>
                        <th className="p-3.5">Player</th>
                        <th className="p-3.5">Amount</th>
                        <th className="p-3.5">Method & Reference</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5">Submitted</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredDeposits.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-white/40 font-mono">
                            No deposit requests found matching your filter.
                          </td>
                        </tr>
                      ) : (
                        filteredDeposits.map((d) => {
                          const isProcessingThis = processingActionId === `dep_approve_${d.id}`;
                          return (
                            <tr key={d.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="p-3.5 font-mono text-[11px] text-white/50">
                                <div className="flex items-center gap-1">
                                  <span>{d.id.slice(0, 14)}...</span>
                                  <button
                                    onClick={() => copyToClipboard(d.id, `id_${d.id}`)}
                                    title="Copy Request ID"
                                    className="p-1 hover:text-white text-white/40"
                                  >
                                    {copiedKey === `id_${d.id}` ? (
                                      <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              </td>
                              <td className="p-3.5">
                                <div className="font-arcade font-bold text-white">{d.username}</div>
                                <div className="text-[10px] font-mono text-white/40">{d.playerId}</div>
                              </td>
                              <td className="p-3.5 font-mono font-bold text-emerald-400 text-sm">
                                +{d.amount.toLocaleString()} ETB
                              </td>
                              <td className="p-3.5">
                                <div className="font-semibold text-slate-300">{d.paymentMethod}</div>
                                {d.referenceId && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[10px] font-mono text-amber-300 font-bold">
                                      Ref: {d.referenceId}
                                    </span>
                                    <button
                                      onClick={() => copyToClipboard(d.referenceId || '', `tref_${d.id}`)}
                                      className="text-white/40 hover:text-white"
                                    >
                                      {copiedKey === `tref_${d.id}` ? (
                                        <Check className="w-3 h-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="p-3.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                    d.status === 'APPROVED'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : d.status === 'PENDING'
                                      ? 'bg-amber-500/20 text-amber-300 animate-pulse'
                                      : 'bg-rose-500/20 text-rose-300'
                                  }`}
                                >
                                  {d.status}
                                </span>
                              </td>
                              <td className="p-3.5 text-[11px] text-white/40 font-mono">
                                {new Date(d.createdAt).toLocaleString()}
                              </td>
                              <td className="p-3.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => setSelectedDeposit(d)}
                                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 font-arcade text-xs font-bold"
                                  >
                                    Details
                                  </button>
                                  {d.status === 'PENDING' && (
                                    <>
                                      <button
                                        onClick={() =>
                                          setRejectDialog({
                                            type: 'deposit',
                                            id: d.id,
                                            targetName: d.username,
                                            amount: d.amount
                                          })
                                        }
                                        disabled={Boolean(processingActionId)}
                                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold cursor-pointer disabled:opacity-50"
                                      >
                                        Reject
                                      </button>
                                      <button
                                        onClick={() => handleApproveDeposit(d)}
                                        disabled={Boolean(processingActionId)}
                                        className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                      >
                                        {isProcessingThis ? (
                                          <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span>Approving...</span>
                                          </>
                                        ) : (
                                          <span>Approve</span>
                                        )}
                                      </button>
                                    </>
                                  )}
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
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 3. TAB: WITHDRAWALS (RESPONSIVE CARDS + DESKTOP TABLE)  */}
            {/* ═══════════════════════════════════════════════════════ */}
            {activeTab === 'withdrawals' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <h2 className="text-base font-arcade font-black text-rose-300 uppercase tracking-wide">
                      Withdrawal Requests Management
                    </h2>
                    <p className="text-[11px] text-white/50">
                      Process Telebirr cashout payouts or reject to refund reserved balance
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
                      <button
                        key={st}
                        onClick={() => setFilterStatus(st)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-arcade font-bold cursor-pointer transition-all ${
                          filterStatus === st
                            ? 'bg-rose-500 text-white shadow-sm'
                            : 'bg-white/5 text-white/60 hover:text-white border border-white/10'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search by player, telegram ID, or Telebirr phone number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#121212] border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-rose-400/50"
                  />
                </div>

                {/* MOBILE CARDS VIEW (< 1024px) */}
                <div className="lg:hidden space-y-2.5">
                  {filteredWithdrawals.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-white/[0.02] border border-white/10 text-white/40 text-xs">
                      No withdrawal requests found matching your filter.
                    </div>
                  ) : (
                    filteredWithdrawals.map((w) => {
                      const isProcessingThis = processingActionId === `with_approve_${w.id}`;
                      return (
                        <div
                          key={w.id}
                          className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 hover:border-white/20 transition-all space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider ${
                                w.status === 'APPROVED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : w.status === 'PENDING'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40 animate-pulse'
                                  : 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                              }`}
                            >
                              {w.status}
                            </span>
                            <span className="text-[10px] font-mono text-white/40">
                              {new Date(w.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className="flex items-baseline justify-between">
                            <div>
                              <div className="font-arcade font-bold text-sm text-white">{w.username}</div>
                              <div className="text-[10px] font-mono text-white/40">{w.playerId}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-arcade font-black text-base text-rose-400">
                                -{w.amount.toLocaleString()} ETB
                              </div>
                              <div className="text-[10px] text-white/50">Telebirr Cashout</div>
                            </div>
                          </div>

                          {/* Destination Phone Pill */}
                          <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Phone className="w-3.5 h-3.5 text-rose-400" />
                              <span className="text-[10px] text-white/40 font-mono">PAY TO:</span>
                              <span className="text-xs font-mono font-bold text-white truncate">
                                {w.address}
                              </span>
                            </div>
                            <button
                              onClick={() => copyToClipboard(w.address, `phone_${w.id}`)}
                              className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[10px] text-white/70 hover:text-white flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === `phone_${w.id}` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400 font-bold">COPIED</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>COPY</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                            <button
                              onClick={() => setSelectedWithdrawal(w)}
                              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 font-arcade text-xs font-bold cursor-pointer"
                            >
                              DETAILS
                            </button>

                            {w.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() =>
                                    setRejectDialog({
                                      type: 'withdrawal',
                                      id: w.id,
                                      targetName: w.username,
                                      amount: w.amount
                                    })
                                  }
                                  disabled={Boolean(processingActionId)}
                                  className="flex-1 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-arcade text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                                >
                                  REJECT
                                </button>
                                <button
                                  onClick={() => handleApproveWithdrawal(w)}
                                  disabled={Boolean(processingActionId)}
                                  className="flex-1 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-arcade text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                                >
                                  {isProcessingThis ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span>APPROVING...</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>APPROVE</span>
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* DESKTOP TABLE VIEW (>= 1024px) */}
                <div className="hidden lg:block rounded-2xl border border-white/10 overflow-hidden bg-[#111111]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-arcade font-bold uppercase text-[10px]">
                        <th className="p-3.5">Request ID</th>
                        <th className="p-3.5">Player</th>
                        <th className="p-3.5">Amount</th>
                        <th className="p-3.5">Destination Phone</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5">Submitted</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredWithdrawals.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-white/40 font-mono">
                            No withdrawal requests found.
                          </td>
                        </tr>
                      ) : (
                        filteredWithdrawals.map((w) => {
                          const isProcessingThis = processingActionId === `with_approve_${w.id}`;
                          return (
                            <tr key={w.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="p-3.5 font-mono text-[11px] text-white/50">
                                {w.id.slice(0, 14)}...
                              </td>
                              <td className="p-3.5">
                                <div className="font-arcade font-bold text-white">{w.username}</div>
                                <div className="text-[10px] font-mono text-white/40">{w.playerId}</div>
                              </td>
                              <td className="p-3.5 font-mono font-bold text-rose-400 text-sm">
                                -{w.amount.toLocaleString()} ETB
                              </td>
                              <td className="p-3.5 font-mono font-bold text-white">
                                <div className="flex items-center gap-1.5">
                                  <span>{w.address}</span>
                                  <button
                                    onClick={() => copyToClipboard(w.address, `tphone_${w.id}`)}
                                    className="text-white/40 hover:text-white"
                                  >
                                    {copiedKey === `tphone_${w.id}` ? (
                                      <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              </td>
                              <td className="p-3.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                    w.status === 'APPROVED'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : w.status === 'PENDING'
                                      ? 'bg-rose-500/20 text-rose-300 animate-pulse'
                                      : 'bg-slate-500/20 text-slate-300'
                                  }`}
                                >
                                  {w.status}
                                </span>
                              </td>
                              <td className="p-3.5 text-[11px] text-white/40 font-mono">
                                {new Date(w.createdAt).toLocaleString()}
                              </td>
                              <td className="p-3.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => setSelectedWithdrawal(w)}
                                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 font-arcade text-xs font-bold"
                                  >
                                    Details
                                  </button>
                                  {w.status === 'PENDING' && (
                                    <>
                                      <button
                                        onClick={() =>
                                          setRejectDialog({
                                            type: 'withdrawal',
                                            id: w.id,
                                            targetName: w.username,
                                            amount: w.amount
                                          })
                                        }
                                        disabled={Boolean(processingActionId)}
                                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold cursor-pointer disabled:opacity-50"
                                      >
                                        Reject
                                      </button>
                                      <button
                                        onClick={() => handleApproveWithdrawal(w)}
                                        disabled={Boolean(processingActionId)}
                                        className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                      >
                                        {isProcessingThis ? (
                                          <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span>Approving...</span>
                                          </>
                                        ) : (
                                          <span>Approve</span>
                                        )}
                                      </button>
                                    </>
                                  )}
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
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 4. TAB: USERS (PAGINATED + SEARCH + RESPONSIVE)         */}
            {/* ═══════════════════════════════════════════════════════ */}
            {activeTab === 'users' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <h2 className="text-base font-arcade font-black text-cyan-300 uppercase tracking-wide">
                      Player Accounts Management
                    </h2>
                    <p className="text-[11px] text-white/50">
                      View balances, inspect Telegram IDs, and manage player permissions
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAdjustModalOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/30 text-amber-300 font-arcade text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Adjust Balance</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {['ALL', 'ACTIVE', 'SUSPENDED', 'BANNED'].map((st) => (
                        <button
                          key={st}
                          onClick={() => setFilterStatus(st)}
                          className={`px-2 py-1 rounded-lg text-xs font-arcade font-bold cursor-pointer transition-all ${
                            filterStatus === st
                              ? 'bg-cyan-500 text-black shadow-sm'
                              : 'bg-white/5 text-white/60 hover:text-white border border-white/10'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search by username, Telegram ID, user ID, or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#121212] border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-cyan-400/50"
                  />
                </div>

                {/* MOBILE USER CARDS (< 1024px) */}
                <div className="lg:hidden space-y-2.5">
                  {paginatedUsers.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-white/[0.02] border border-white/10 text-white/40 text-xs">
                      No users match your criteria.
                    </div>
                  ) : (
                    paginatedUsers.map((u) => {
                      const isTargetProcessing = processingActionId === `user_status_${u.playerId}`;
                      return (
                        <div
                          key={u.id}
                          className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 hover:border-white/20 transition-all space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center font-arcade font-black text-cyan-300 text-xs">
                                {u.username.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-arcade font-bold text-sm text-white flex items-center gap-1.5">
                                  <span>{u.username}</span>
                                  {u.role === 'ADMIN' && (
                                    <span className="text-[8px] font-arcade px-1 rounded bg-amber-400 text-black font-black">
                                      ADMIN
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] font-mono text-white/40">
                                  TG: {u.telegram_id || 'None'}
                                </div>
                              </div>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                                u.account_status === 'ACTIVE'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : u.account_status === 'SUSPENDED'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {u.account_status}
                            </span>
                          </div>

                          <div className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5 text-xs font-mono">
                            <span className="text-white/40">WALLET BALANCE:</span>
                            <span className="font-bold text-[#E8FF00] text-sm">
                              {u.walletBalance.toLocaleString()} ETB
                            </span>
                          </div>

                          {/* Quick Moderation Actions */}
                          <div className="flex items-center gap-1.5 pt-1">
                            {u.account_status !== 'ACTIVE' ? (
                              <button
                                onClick={() => handleUpdateUserStatus(u.playerId || u.id, 'ACTIVE')}
                                disabled={isTargetProcessing}
                                className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-arcade font-bold"
                              >
                                ACTIVATE
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleUpdateUserStatus(u.playerId || u.id, 'SUSPENDED')}
                                  disabled={isTargetProcessing}
                                  className="flex-1 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-arcade font-bold"
                                >
                                  SUSPEND
                                </button>
                                <button
                                  onClick={() => handleUpdateUserStatus(u.playerId || u.id, 'BANNED')}
                                  disabled={isTargetProcessing}
                                  className="flex-1 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-arcade font-bold"
                                >
                                  BAN
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => {
                                setAdjustTargetId(u.playerId || u.id);
                                setAdjustModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-xs font-arcade font-bold"
                            >
                              ADJUST
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* DESKTOP TABLE VIEW (>= 1024px) */}
                <div className="hidden lg:block rounded-2xl border border-white/10 overflow-hidden bg-[#111111]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-arcade font-bold uppercase text-[10px]">
                        <th className="p-3.5">User</th>
                        <th className="p-3.5">Telegram ID</th>
                        <th className="p-3.5">Phone</th>
                        <th className="p-3.5">Balance</th>
                        <th className="p-3.5">Role</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {paginatedUsers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-white/40 font-mono">
                            No users found.
                          </td>
                        </tr>
                      ) : (
                        paginatedUsers.map((u) => {
                          const isTargetProcessing = processingActionId === `user_status_${u.playerId}`;
                          return (
                            <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="p-3.5">
                                <div className="font-arcade font-bold text-white">{u.username}</div>
                                <div className="text-[10px] font-mono text-white/40">{u.id}</div>
                              </td>
                              <td className="p-3.5 font-mono text-white/70">{u.telegram_id || '—'}</td>
                              <td className="p-3.5 font-mono text-white/70">{u.phone || '—'}</td>
                              <td className="p-3.5 font-mono font-bold text-[#E8FF00] text-sm">
                                {u.walletBalance.toLocaleString()} ETB
                              </td>
                              <td className="p-3.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                    u.role === 'ADMIN'
                                      ? 'bg-amber-400 text-black'
                                      : 'bg-white/10 text-white/60'
                                  }`}
                                >
                                  {u.role}
                                </span>
                              </td>
                              <td className="p-3.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                    u.account_status === 'ACTIVE'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : u.account_status === 'SUSPENDED'
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : 'bg-rose-500/20 text-rose-300'
                                  }`}
                                >
                                  {u.account_status}
                                </span>
                              </td>
                              <td className="p-3.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {u.account_status !== 'ACTIVE' ? (
                                    <button
                                      onClick={() => handleUpdateUserStatus(u.playerId || u.id, 'ACTIVE')}
                                      disabled={isTargetProcessing}
                                      className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-arcade text-xs font-bold"
                                    >
                                      Activate
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => handleUpdateUserStatus(u.playerId || u.id, 'SUSPENDED')}
                                        disabled={isTargetProcessing}
                                        className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-arcade text-xs font-bold"
                                      >
                                        Suspend
                                      </button>
                                      <button
                                        onClick={() => handleUpdateUserStatus(u.playerId || u.id, 'BANNED')}
                                        disabled={isTargetProcessing}
                                        className="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-arcade text-xs font-bold"
                                      >
                                        Ban
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => {
                                      setAdjustTargetId(u.playerId || u.id);
                                      setAdjustModalOpen(true);
                                    }}
                                    className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/70 font-arcade text-xs font-bold"
                                  >
                                    Adjust
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

                {/* Pagination Controls */}
                {totalUserPages > 1 && (
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-[#111111] border border-white/10 text-xs font-arcade">
                    <span className="text-white/40">
                      Showing page {usersPage} of {totalUserPages} ({filteredUsers.length} total)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                        disabled={usersPage === 1}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Prev</span>
                      </button>
                      <button
                        onClick={() => setUsersPage((p) => Math.min(totalUserPages, p + 1))}
                        disabled={usersPage >= totalUserPages}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 5. TAB: TRANSACTIONS (FILTERABLE LEDGER)                */}
            {/* ═══════════════════════════════════════════════════════ */}
            {activeTab === 'transactions' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <h2 className="text-base font-arcade font-black text-[#E8FF00] uppercase tracking-wide">
                      Global Financial Ledger Audit
                    </h2>
                    <p className="text-[11px] text-white/50">
                      Immutable double-entry transaction journal across all players
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {['ALL', 'DEPOSIT', 'WITHDRAWAL', 'BUY_IN', 'WIN_PAYOUT', 'BONUS', 'REFUND'].map((ty) => (
                      <button
                        key={ty}
                        onClick={() => setTxTypeFilter(ty)}
                        className={`px-2 py-1 rounded-lg text-xs font-arcade font-bold cursor-pointer transition-all ${
                          txTypeFilter === ty
                            ? 'bg-[#E8FF00] text-black shadow-sm'
                            : 'bg-white/5 text-white/60 hover:text-white border border-white/10'
                        }`}
                      >
                        {ty}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search by player or reference ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#121212] border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#E8FF00]/50"
                  />
                </div>

                {/* MOBILE LIST VIEW */}
                <div className="lg:hidden space-y-2">
                  {filteredTransactions.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-white/[0.02] border border-white/10 text-white/40 text-xs">
                      No ledger transactions found.
                    </div>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3 rounded-2xl bg-[#111111] border border-white/10 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-white/10 text-white/80">
                            {tx.type}
                          </span>
                          <span className="text-[10px] font-mono text-white/40">
                            {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <div className="font-arcade font-bold text-sm text-white">{tx.username}</div>
                          <div
                            className={`font-arcade font-black text-sm ${
                              tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {tx.amount >= 0 ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()} ETB
                          </div>
                        </div>
                        <div className="text-[10px] text-white/50 truncate">{tx.description}</div>
                      </div>
                    ))
                  )}
                </div>

                {/* DESKTOP TABLE VIEW */}
                <div className="hidden lg:block rounded-2xl border border-white/10 overflow-hidden bg-[#111111]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-arcade font-bold uppercase text-[10px]">
                        <th className="p-3.5">Tx ID</th>
                        <th className="p-3.5">Player</th>
                        <th className="p-3.5">Type</th>
                        <th className="p-3.5">Amount</th>
                        <th className="p-3.5">Before → After</th>
                        <th className="p-3.5">Description</th>
                        <th className="p-3.5">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {filteredTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-white/[0.02]">
                          <td className="p-3.5 text-[11px] text-white/40">{tx.id.slice(0, 12)}...</td>
                          <td className="p-3.5 font-arcade text-white font-bold">{tx.username}</td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-white/10 text-white/80">
                              {tx.type}
                            </span>
                          </td>
                          <td
                            className={`p-3.5 font-bold ${
                              tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {tx.amount >= 0 ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()} ETB
                          </td>
                          <td className="p-3.5 text-white/50">
                            {tx.balanceBefore.toLocaleString()} → {tx.balanceAfter.toLocaleString()}
                          </td>
                          <td className="p-3.5 text-white/70 max-w-xs truncate font-sans text-xs">
                            {tx.description}
                          </td>
                          <td className="p-3.5 text-[11px] text-white/40">
                            {new Date(tx.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 6. TAB: GAMES & ROOMS (LIVE ENGINE MONITORING)          */}
            {/* ═══════════════════════════════════════════════════════ */}
            {activeTab === 'games' && (
              <div className="space-y-4 animate-fadeIn">
                <div>
                  <h2 className="text-base font-arcade font-black text-purple-300 uppercase tracking-wide">
                    Live Game Rooms & Engine Monitoring
                  </h2>
                  <p className="text-[11px] text-white/50">
                    Real-time status of 75-Ball bingo pools, active players, and ball caller state
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {rooms.map((r) => (
                    <div
                      key={r.roomId}
                      className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-arcade font-bold text-sm text-white">{r.roomName || r.roomId}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                            r.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-300 animate-pulse'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="p-2 rounded-xl bg-black/40">
                          <div className="text-[10px] text-white/40">BET / CARD</div>
                          <div className="font-bold text-[#E8FF00]">{r.betPerCard} ETB</div>
                        </div>
                        <div className="p-2 rounded-xl bg-black/40">
                          <div className="text-[10px] text-white/40">CARDS SOLD</div>
                          <div className="font-bold text-white">{r.totalCardsSold}</div>
                        </div>
                        <div className="p-2 rounded-xl bg-black/40">
                          <div className="text-[10px] text-white/40">PRIZE POOL</div>
                          <div className="font-bold text-emerald-400">{(r.totalPot || r.playerPayoutPool || 0).toLocaleString()} ETB</div>
                        </div>
                        <div className="p-2 rounded-xl bg-black/40">
                          <div className="text-[10px] text-white/40">COUNTDOWN</div>
                          <div className="font-bold text-white">{r.lobbyTimeRemaining}s</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 7. TAB: AUDIT LOGS (IMMUTABLE ADMINISTRATIVE RECORD)    */}
            {/* ═══════════════════════════════════════════════════════ */}
            {activeTab === 'audit_logs' && (
              <div className="space-y-4 animate-fadeIn">
                <div>
                  <h2 className="text-base font-arcade font-black text-amber-300 uppercase tracking-wide">
                    Administrative Compliance Audit Trail
                  </h2>
                  <p className="text-[11px] text-white/50">
                    Immutable security log of every administrative decision and balance adjustment
                  </p>
                </div>

                {/* Mobile Cards */}
                <div className="lg:hidden space-y-2">
                  {auditLogs.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-white/[0.02] border border-white/10 text-white/40 text-xs">
                      No audit logs recorded.
                    </div>
                  ) : (
                    auditLogs.map((log) => (
                      <div
                        key={log.id}
                        onClick={() => setSelectedAuditLog(log)}
                        className="p-3 rounded-2xl bg-[#111111] border border-white/10 hover:border-white/20 transition-all space-y-1.5 cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-amber-400/20 text-amber-300">
                            {log.action}
                          </span>
                          <span className="text-[10px] font-mono text-white/40">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-white">
                          Admin: <span className="text-amber-300 font-bold">{log.admin_user_id}</span>
                        </div>
                        <div className="text-[10px] font-mono text-white/50 truncate">
                          Target: {log.target_user_id || 'System'}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Desktop Table */}
                <div className="hidden lg:block rounded-2xl border border-white/10 overflow-hidden bg-[#111111]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-arcade font-bold uppercase text-[10px]">
                        <th className="p-3.5">Log ID</th>
                        <th className="p-3.5">Action</th>
                        <th className="p-3.5">Admin ID</th>
                        <th className="p-3.5">Target User</th>
                        <th className="p-3.5">Target Record</th>
                        <th className="p-3.5">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {auditLogs.map((log) => (
                        <tr
                          key={log.id}
                          onClick={() => setSelectedAuditLog(log)}
                          className="hover:bg-white/[0.02] cursor-pointer"
                        >
                          <td className="p-3.5 text-[11px] text-white/40">{log.id.slice(0, 12)}...</td>
                          <td className="p-3.5 font-bold text-amber-300">{log.action}</td>
                          <td className="p-3.5 text-white/80">{log.admin_user_id}</td>
                          <td className="p-3.5 text-white/60">{log.target_user_id || '—'}</td>
                          <td className="p-3.5 text-white/40">{log.target_record_id || '—'}</td>
                          <td className="p-3.5 text-[11px] text-white/40">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 8. TAB: DAILY GRAND JACKPOT                            */}
            {/* ═══════════════════════════════════════════════════════ */}
            {activeTab === 'daily_jackpot' && (
              <div className="space-y-4 animate-fadeIn">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-arcade font-black text-amber-300 uppercase tracking-wide flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-amber-400" />
                      <span>Daily Grand Jackpot Management</span>
                    </h2>
                    <p className="text-[11px] text-white/50">
                      Authoritative daily lottery scheduled at 12:00 PM Africa/Addis_Ababa (UTC+3)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTriggerJackpotEvaluation}
                      disabled={evaluatingJackpot}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 disabled:opacity-50 text-black font-arcade font-black text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                    >
                      {evaluatingJackpot ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>EVALUATING...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>EVALUATE JACKPOT NOW</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleRefreshCurrentTab}
                      disabled={refreshing}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-all cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {!dailyJackpotAdmin ? (
                  <div className="p-12 text-center rounded-2xl bg-[#111111] border border-white/10 space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" />
                    <div className="font-arcade text-xs text-white/50">Loading Daily Grand Jackpot state...</div>
                  </div>
                ) : (
                  <>
                    {/* Current Round Financial Card */}
                    <div className="p-5 rounded-2xl bg-[#121212] border border-amber-400/30 space-y-4 shadow-[0_0_20px_rgba(245,158,11,0.06)]">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-arcade font-black text-sm text-white">
                              ROUND {dailyJackpotAdmin.currentRound.round_id || dailyJackpotAdmin.currentRound.id}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-arcade font-bold uppercase ${
                              dailyJackpotAdmin.currentRound.status === 'REGISTRATION_OPEN'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : dailyJackpotAdmin.currentRound.status === 'POSTPONED'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : dailyJackpotAdmin.currentRound.status === 'COMPLETED'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            }`}>
                              {dailyJackpotAdmin.currentRound.status}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-white/50">
                            Calendar Date: {dailyJackpotAdmin.currentRound.jackpot_date || dailyJackpotAdmin.currentRound.date_str} • Official Cutoff: {dailyJackpotAdmin.currentRound.cutoff_time || dailyJackpotAdmin.currentRound.cutoff_at ? new Date(dailyJackpotAdmin.currentRound.cutoff_time || dailyJackpotAdmin.currentRound.cutoff_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '12:00 PM'} (Addis Ababa)
                          </div>
                        </div>

                        {(dailyJackpotAdmin.currentRound.cards_sold ?? 0) < 100 && (
                          <div className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-mono flex items-center gap-1.5 self-start sm:self-auto">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{100 - (dailyJackpotAdmin.currentRound.cards_sold ?? 0)} more cards needed to avoid postponement</span>
                          </div>
                        )}
                      </div>

                      {/* Financial Metrics Grid */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                          <div className="text-[10px] font-arcade text-white/50 uppercase">CARDS SOLD</div>
                          <div className="font-arcade font-black text-xl text-white">
                            {dailyJackpotAdmin.currentRound.cards_sold ?? 0} <span className="text-xs text-white/40">/ 200</span>
                          </div>
                          <div className="text-[10px] text-white/40 font-mono">
                            {(((dailyJackpotAdmin.currentRound.cards_sold ?? 0) / 200) * 100).toFixed(1)}% capacity filled
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                          <div className="text-[10px] font-arcade text-white/50 uppercase">GROSS SALES</div>
                          <div className="font-arcade font-black text-xl text-amber-300">
                            {((dailyJackpotAdmin.currentRound.gross_card_sales ?? dailyJackpotAdmin.currentRound.gross_sales ?? 0)).toLocaleString()} <span className="text-xs">ETB</span>
                          </div>
                          <div className="text-[10px] text-white/40 font-mono">
                            {dailyJackpotAdmin.currentRound.cards_sold ?? 0} cards × 999 ETB
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                          <div className="text-[10px] font-arcade text-white/50 uppercase">CALCULATED JACKPOT</div>
                          <div className="font-arcade font-black text-xl text-emerald-400">
                            {((dailyJackpotAdmin.currentRound.calculatedJackpot ?? dailyJackpotAdmin.currentRound.calculated_jackpot ?? dailyJackpotAdmin.currentRound.jackpot_amount ?? 0)).toLocaleString()} <span className="text-xs">ETB</span>
                          </div>
                          <div className="text-[10px] text-emerald-400/70 font-mono">
                            Authoritative Player Prize
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                          <div className="text-[10px] font-arcade text-white/50 uppercase">PLATFORM CUT</div>
                          <div className="font-arcade font-black text-xl text-[#E8FF00]">
                            {((dailyJackpotAdmin.currentRound.platform_retained_amount ?? dailyJackpotAdmin.currentRound.calculatedPlatformRetained ?? 0)).toLocaleString()} <span className="text-xs">ETB</span>
                          </div>
                          <div className="text-[10px] text-white/40 font-mono">
                            Internal retained amount
                          </div>
                        </div>
                      </div>

                      {/* Postponement & Winner Notifications */}
                      {dailyJackpotAdmin.currentRound.status === 'POSTPONED' && (
                        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                          <div className="space-y-1 text-xs">
                            <div className="font-arcade font-bold text-amber-300 uppercase">
                              ROUND POSTPONED: MINIMUM 100 CARDS NOT REACHED
                            </div>
                            <div className="text-white/70">
                              Fewer than 100 cards were sold before 12:00 PM cutoff. In accordance with platform policy, no winner was selected, no funds were disbursed, and players' purchased cards roll over safely to the next daily check.
                            </div>
                            {(dailyJackpotAdmin.currentRound.postponed_reason || dailyJackpotAdmin.currentRound.postponement_reason) && (
                              <div className="text-amber-400/80 font-mono text-[11px]">
                                Note: {dailyJackpotAdmin.currentRound.postponed_reason || dailyJackpotAdmin.currentRound.postponement_reason}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {dailyJackpotAdmin.currentRound.winner_user_id && (
                        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <div className="space-y-1 text-xs">
                            <div className="font-arcade font-bold text-emerald-300 uppercase">
                              WINNER SELECTED & PAID
                            </div>
                            <div className="font-mono text-white/80">
                              Winner Player ID: <span className="text-amber-300 font-bold">{dailyJackpotAdmin.currentRound.winner_user_id}</span> • Ticket #{dailyJackpotAdmin.currentRound.winner_card_number}
                            </div>
                            <div className="font-mono text-emerald-400 font-bold">
                              Paid Amount: {((dailyJackpotAdmin.currentRound.calculatedJackpot ?? dailyJackpotAdmin.currentRound.calculated_jackpot ?? dailyJackpotAdmin.currentRound.jackpot_amount ?? 0)).toLocaleString()} ETB via atomic ledger payout
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Business Rules Summary Banner */}
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-white/50 space-y-1 font-mono">
                        <div className="font-bold text-white/70 uppercase">Daily Grand Jackpot Policy:</div>
                        <div>• Price: 999 ETB / card | Capacity: 200 cards max | Cutoff: 12:00 PM Africa/Addis_Ababa</div>
                        <div>• 100–110 cards: 100,000 ETB fixed prize</div>
                        <div>• 111–160 cards: (Cards × 999) - 10,000 ETB platform retention</div>
                        <div>• 161–200 cards: 150,000 ETB maximum prize cap (excess retained by platform)</div>
                        <div>• Platform retention details are strictly hidden from player-facing endpoints.</div>
                      </div>
                    </div>

                    {/* Past Rounds History Table */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-arcade font-bold text-white uppercase tracking-wider">
                        Daily Grand Jackpot History
                      </h3>

                      {/* Mobile Cards for History */}
                      <div className="lg:hidden space-y-2">
                        {dailyJackpotAdmin.history.length === 0 ? (
                          <div className="p-6 text-center rounded-2xl bg-white/[0.02] border border-white/10 text-white/40 text-xs">
                            No jackpot history recorded yet.
                          </div>
                        ) : (
                          dailyJackpotAdmin.history.map((rd) => (
                            <div
                              key={rd.id}
                              className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-arcade font-bold text-xs text-white">
                                  {rd.round_id || rd.id}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                                  rd.status === 'COMPLETED'
                                    ? 'bg-blue-500/20 text-blue-300'
                                    : rd.status === 'POSTPONED'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-emerald-500/20 text-emerald-400'
                                }`}>
                                  {rd.status}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                <div>
                                  <span className="text-white/40 text-[10px]">CARDS: </span>
                                  <span className="text-white font-bold">{rd.cards_sold ?? 0} / 200</span>
                                </div>
                                <div>
                                  <span className="text-white/40 text-[10px]">SALES: </span>
                                  <span className="text-amber-300 font-bold">{((rd.gross_card_sales ?? rd.gross_sales ?? 0)).toLocaleString()} ETB</span>
                                </div>
                                <div>
                                  <span className="text-white/40 text-[10px]">PRIZE: </span>
                                  <span className="text-emerald-400 font-bold">{((rd.calculated_jackpot ?? rd.jackpot_amount ?? 0)).toLocaleString()} ETB</span>
                                </div>
                                <div>
                                  <span className="text-white/40 text-[10px]">CUT: </span>
                                  <span className="text-[#E8FF00] font-bold">{((rd.platform_retained_amount ?? rd.calculatedPlatformRetained ?? 0)).toLocaleString()} ETB</span>
                                </div>
                              </div>

                              {rd.winner_user_id && (
                                <div className="text-[11px] font-mono text-emerald-400/80 pt-1 border-t border-white/5">
                                  Winner: {rd.winner_user_id} (Ticket #{rd.winner_card_number})
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>

                      {/* Desktop Table for History */}
                      <div className="hidden lg:block rounded-2xl border border-white/10 overflow-hidden bg-[#111111]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-arcade font-bold uppercase text-[10px]">
                              <th className="p-3.5">Round ID</th>
                              <th className="p-3.5">Date</th>
                              <th className="p-3.5">Status</th>
                              <th className="p-3.5">Cards Sold</th>
                              <th className="p-3.5">Gross Sales</th>
                              <th className="p-3.5">Jackpot Prize</th>
                              <th className="p-3.5">Platform Cut</th>
                              <th className="p-3.5">Winner</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 font-mono">
                            {dailyJackpotAdmin.history.map((rd) => (
                              <tr key={rd.id} className="hover:bg-white/[0.02]">
                                <td className="p-3.5 text-white font-bold">{rd.round_id || rd.id}</td>
                                <td className="p-3.5 text-white/70">{rd.jackpot_date || rd.date_str}</td>
                                <td className="p-3.5">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                                    rd.status === 'COMPLETED'
                                      ? 'bg-blue-500/20 text-blue-300'
                                      : rd.status === 'POSTPONED'
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : 'bg-emerald-500/20 text-emerald-400'
                                  }`}>
                                    {rd.status}
                                  </span>
                                </td>
                                <td className="p-3.5 text-white font-bold">{rd.cards_sold ?? 0} / 200</td>
                                <td className="p-3.5 text-amber-300">{((rd.gross_card_sales ?? rd.gross_sales ?? 0)).toLocaleString()} ETB</td>
                                <td className="p-3.5 text-emerald-400 font-bold">{((rd.calculated_jackpot ?? rd.jackpot_amount ?? 0)).toLocaleString()} ETB</td>
                                <td className="p-3.5 text-[#E8FF00]">{((rd.platform_retained_amount ?? rd.calculatedPlatformRetained ?? 0)).toLocaleString()} ETB</td>
                                <td className="p-3.5 text-white/70">
                                  {rd.winner_user_id ? (
                                    <span className="text-emerald-400">
                                      {rd.winner_user_id} (#{rd.winner_card_number})
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MOBILE BOTTOM NAVIGATION DOCK (< 1024px)                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <nav
        aria-label="Admin Mobile Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 bg-[#0D0D0D]/95 backdrop-blur-xl border-t border-white/[0.08] px-2 py-1.5 flex items-center justify-around z-30 safe-bottom"
      >
        <button
          onClick={() => {
            setActiveTab('overview');
            soundService.playClick();
          }}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'overview' ? 'text-amber-400 font-bold' : 'text-white/40 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span className="text-[9px] font-arcade">OVERVIEW</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('deposits');
            soundService.playClick();
          }}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all relative cursor-pointer ${
            activeTab === 'deposits' ? 'text-amber-400 font-bold' : 'text-white/40 hover:text-white'
          }`}
        >
          <ArrowDownToLine className="w-4 h-4" />
          <span className="text-[9px] font-arcade">DEPOSITS</span>
          {pendingDepositsCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-400 text-black text-[9px] font-black flex items-center justify-center animate-pulse">
              {pendingDepositsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('withdrawals');
            soundService.playClick();
          }}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all relative cursor-pointer ${
            activeTab === 'withdrawals' ? 'text-amber-400 font-bold' : 'text-white/40 hover:text-white'
          }`}
        >
          <ArrowUpFromLine className="w-4 h-4" />
          <span className="text-[9px] font-arcade">CASHOUTS</span>
          {pendingWithdrawalsCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-400 text-black text-[9px] font-black flex items-center justify-center animate-pulse">
              {pendingWithdrawalsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('users');
            soundService.playClick();
          }}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'users' ? 'text-amber-400 font-bold' : 'text-white/40 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span className="text-[9px] font-arcade">USERS</span>
        </button>

        <button
          onClick={() => {
            setMobileMenuOpen(true);
            soundService.playClick();
          }}
          className="flex flex-col items-center gap-1 p-2 rounded-xl text-white/40 hover:text-white transition-all cursor-pointer"
        >
          <MoreHorizontal className="w-4 h-4" />
          <span className="text-[9px] font-arcade">MORE</span>
        </button>
      </nav>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MOBILE "MORE" BOTTOM DRAWER                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-fadeIn">
          <div className="bg-[#121212] border-t border-white/10 rounded-t-3xl p-5 space-y-3 animate-slideUp">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="font-arcade font-black text-sm text-white uppercase">ADDITIONAL SECTIONS</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-white/50 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <button
                onClick={() => {
                  setActiveTab('transactions');
                  setMobileMenuOpen(false);
                }}
                className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-3 font-arcade text-xs font-bold text-white text-left"
              >
                <Receipt className="w-4 h-4 text-[#E8FF00]" />
                <span>Financial Ledger Journal</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('games');
                  setMobileMenuOpen(false);
                }}
                className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-3 font-arcade text-xs font-bold text-white text-left"
              >
                <Gamepad2 className="w-4 h-4 text-purple-400" />
                <span>Live Game Rooms & Engine</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('audit_logs');
                  setMobileMenuOpen(false);
                }}
                className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-3 font-arcade text-xs font-bold text-white text-left"
              >
                <Shield className="w-4 h-4 text-amber-400" />
                <span>Security Audit Logs</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('daily_jackpot');
                  setMobileMenuOpen(false);
                }}
                className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-3 font-arcade text-xs font-bold text-white text-left"
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Daily Grand Jackpot</span>
              </button>

              <button
                onClick={() => {
                  setAdjustModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full p-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 flex items-center gap-3 font-arcade text-xs font-bold text-amber-300 text-left"
              >
                <DollarSign className="w-4 h-4" />
                <span>Manual Player Balance Adjustment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DEPOSIT DETAILS BOTTOM SHEET / SLIDE-OVER                  */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {selectedDeposit && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-[#121212] border border-white/10 w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-slideUp">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="w-4 h-4 text-amber-400" />
                <span className="font-arcade font-black text-sm text-white uppercase">DEPOSIT DETAILS</span>
              </div>
              <button onClick={() => setSelectedDeposit(null)} className="p-1 text-white/50 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-xl bg-black/50 border border-white/5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-white/40">STATUS:</span>
                  <span
                    className={`font-bold uppercase ${
                      selectedDeposit.status === 'APPROVED'
                        ? 'text-emerald-400'
                        : selectedDeposit.status === 'PENDING'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {selectedDeposit.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">AMOUNT:</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    +{selectedDeposit.amount.toLocaleString()} ETB
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">PAYMENT METHOD:</span>
                  <span className="font-bold text-white">{selectedDeposit.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">TELEBIRR REF:</span>
                  <span className="font-bold text-amber-300">{selectedDeposit.referenceId || 'None'}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-black/50 border border-white/5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-white/40">PLAYER NAME:</span>
                  <span className="font-bold text-white font-sans">{selectedDeposit.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">PLAYER ID:</span>
                  <span className="text-white/70">{selectedDeposit.playerId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">REQUEST ID:</span>
                  <span className="text-white/70 text-[10px]">{selectedDeposit.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">SUBMITTED AT:</span>
                  <span className="text-white/70">{new Date(selectedDeposit.createdAt).toLocaleString()}</span>
                </div>
                {selectedDeposit.processedAt && (
                  <div className="flex justify-between">
                    <span className="text-white/40">PROCESSED AT:</span>
                    <span className="text-white/70">{new Date(selectedDeposit.processedAt).toLocaleString()}</span>
                  </div>
                )}
                {selectedDeposit.rejectionReason && (
                  <div className="flex justify-between">
                    <span className="text-white/40">REASON:</span>
                    <span className="text-rose-400">{selectedDeposit.rejectionReason}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedDeposit.status === 'PENDING' && (
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => {
                    setRejectDialog({
                      type: 'deposit',
                      id: selectedDeposit.id,
                      targetName: selectedDeposit.username,
                      amount: selectedDeposit.amount
                    });
                  }}
                  disabled={Boolean(processingActionId)}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-arcade text-xs font-bold cursor-pointer"
                >
                  REJECT
                </button>
                <button
                  onClick={() => handleApproveDeposit(selectedDeposit)}
                  disabled={Boolean(processingActionId)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-arcade text-xs font-bold cursor-pointer flex items-center justify-center gap-1"
                >
                  {processingActionId === `dep_approve_${selectedDeposit.id}` ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>APPROVING...</span>
                    </>
                  ) : (
                    <span>APPROVE DEPOSIT</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* WITHDRAWAL DETAILS BOTTOM SHEET / SLIDE-OVER                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {selectedWithdrawal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-[#121212] border border-white/10 w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-slideUp">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <ArrowUpFromLine className="w-4 h-4 text-rose-400" />
                <span className="font-arcade font-black text-sm text-white uppercase">WITHDRAWAL DETAILS</span>
              </div>
              <button onClick={() => setSelectedWithdrawal(null)} className="p-1 text-white/50 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-xl bg-black/50 border border-white/5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-white/40">STATUS:</span>
                  <span
                    className={`font-bold uppercase ${
                      selectedWithdrawal.status === 'APPROVED'
                        ? 'text-emerald-400'
                        : selectedWithdrawal.status === 'PENDING'
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {selectedWithdrawal.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">CASHOUT AMOUNT:</span>
                  <span className="font-bold text-rose-400 text-sm">
                    -{selectedWithdrawal.amount.toLocaleString()} ETB
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">TELEBIRR DESTINATION:</span>
                  <span className="font-bold text-white">{selectedWithdrawal.address}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-black/50 border border-white/5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-white/40">PLAYER NAME:</span>
                  <span className="font-bold text-white font-sans">{selectedWithdrawal.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">PLAYER ID:</span>
                  <span className="text-white/70">{selectedWithdrawal.playerId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">REQUEST ID:</span>
                  <span className="text-white/70 text-[10px]">{selectedWithdrawal.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">SUBMITTED AT:</span>
                  <span className="text-white/70">{new Date(selectedWithdrawal.createdAt).toLocaleString()}</span>
                </div>
                {selectedWithdrawal.rejectionReason && (
                  <div className="flex justify-between">
                    <span className="text-white/40">REASON:</span>
                    <span className="text-rose-400">{selectedWithdrawal.rejectionReason}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedWithdrawal.status === 'PENDING' && (
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => {
                    setRejectDialog({
                      type: 'withdrawal',
                      id: selectedWithdrawal.id,
                      targetName: selectedWithdrawal.username,
                      amount: selectedWithdrawal.amount
                    });
                  }}
                  disabled={Boolean(processingActionId)}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-arcade text-xs font-bold cursor-pointer"
                >
                  REJECT & REFUND
                </button>
                <button
                  onClick={() => handleApproveWithdrawal(selectedWithdrawal)}
                  disabled={Boolean(processingActionId)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-arcade text-xs font-bold cursor-pointer flex items-center justify-center gap-1"
                >
                  {processingActionId === `with_approve_${selectedWithdrawal.id}` ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>APPROVING...</span>
                    </>
                  ) : (
                    <span>APPROVE CASHOUT</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* REJECTION REASON DIALOG (CLEAN REPLACEMENT FOR WINDOW.PROMPT)*/}
      {/* ═══════════════════════════════════════════════════════════ */}
      {rejectDialog && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#121212] border border-white/10 w-full max-w-md rounded-3xl p-5 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertCircle className="w-5 h-5" />
                <span className="font-arcade font-black text-sm uppercase">
                  REJECT {rejectDialog.type.toUpperCase()}
                </span>
              </div>
              <button onClick={() => setRejectDialog(null)} className="p-1 text-white/50 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-white/70 font-sans">
              Rejecting {rejectDialog.type} of{' '}
              <span className="font-bold text-white">{rejectDialog.amount} ETB</span> for player{' '}
              <span className="font-bold text-white">{rejectDialog.targetName}</span>.
              {rejectDialog.type === 'withdrawal' && (
                <span className="text-amber-300 block mt-1">
                  Note: The reserved balance will be automatically refunded back to the player.
                </span>
              )}
            </div>

            {/* Quick preset reasons */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-arcade text-white/40 uppercase block">SELECT REASON PRESET:</span>
              {[
                'Invalid Telebirr reference ID',
                'Reference ID not found on Telebirr statement',
                'Amount deposited does not match request',
                'Duplicate reference ID submission'
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRejectReason(preset)}
                  className={`w-full text-left px-3 py-1.5 rounded-xl border text-[11px] font-sans transition-all cursor-pointer ${
                    rejectReason === preset
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Custom reason input */}
            <div>
              <input
                type="text"
                placeholder="Or type custom rejection reason..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-rose-400/50 font-sans"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectDialog(null)}
                className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-arcade text-xs font-bold cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={
                  rejectDialog.type === 'deposit' ? handleConfirmRejectDeposit : handleConfirmRejectWithdrawal
                }
                disabled={Boolean(processingActionId)}
                className="flex-1 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-arcade text-xs font-bold cursor-pointer shadow-lg shadow-rose-500/20"
              >
                CONFIRM REJECT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MANUAL BALANCE ADJUSTMENT MODAL                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {adjustModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#121212] border border-white/10 w-full max-w-md rounded-3xl p-5 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-amber-400">
                <DollarSign className="w-5 h-5" />
                <span className="font-arcade font-black text-sm uppercase">MANUAL BALANCE ADJUSTMENT</span>
              </div>
              <button onClick={() => setAdjustModalOpen(false)} className="p-1 text-white/50 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualAdjustmentSubmit} className="space-y-3 font-sans text-xs">
              <div>
                <label className="text-[10px] font-arcade text-white/50 uppercase block mb-1">
                  TARGET PLAYER ID OR USER ID:
                </label>
                <input
                  type="text"
                  placeholder="e.g. tg_6872045981 or usr_0001"
                  value={adjustTargetId}
                  onChange={(e) => setAdjustTargetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-amber-400/50 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-arcade text-white/50 uppercase block mb-1">
                  ADJUSTMENT AMOUNT (ETB):
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="Positive to credit (+100), Negative to debit (-50)"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-amber-400/50 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-arcade text-white/50 uppercase block mb-1">
                  AUDIT LOG REASON:
                </label>
                <input
                  type="text"
                  placeholder="Mandatory justification for compliance..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-amber-400/50"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-arcade text-xs font-bold cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isAdjusting}
                  className="flex-1 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-arcade text-xs font-black cursor-pointer disabled:opacity-50"
                >
                  {isAdjusting ? 'ADJUSTING...' : 'APPLY ADJUSTMENT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
