import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import {
  X,
  Shield,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Clock,
  Copy,
  Check,
  Phone,
  User,
  Activity,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Eye,
  ChevronRight,
  ExternalLink,
  Calendar,
  DollarSign,
  Wallet,
  History
} from 'lucide-react';
import {
  UserAccount,
  DepositRequest,
  WithdrawalRequest,
  AgentActivityLog
} from '../types/bingo.js';
import { apiUrl } from '../config/api.js';
import { soundService } from '../services/soundService.js';

interface AgentDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: UserAccount | null;
  token?: string | null;
  socket?: Socket | null;
}

type AgentTab = 'overview' | 'deposits' | 'withdrawals' | 'customers' | 'activity' | 'account';

export const AgentDashboardModal: React.FC<AgentDashboardModalProps> = ({
  isOpen,
  onClose,
  user,
  token,
  socket
}) => {
  const [activeTab, setActiveTab] = useState<AgentTab>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [highlightedTxId, setHighlightedTxId] = useState<string | null>(null);

  // Live real-time toast
  const [liveToast, setLiveToast] = useState<{ id: string; title: string; subtitle: string; type: 'deposit' | 'withdrawal' } | null>(null);

  // Agent profile from server
  const [agentProfile, setAgentProfile] = useState<{
    id: string;
    username: string;
    phone?: string;
    telebirr_number?: string;
    assigned_agent_name?: string;
    role: string;
    account_status: string;
    created_at?: string;
    last_login_at?: string;
    stats?: {
      deposits_processed: number;
      deposit_amount: number;
      withdrawals_processed: number;
      withdrawal_amount: number;
      today_deposits_count?: number;
      today_deposits_amount?: number;
      today_withdrawals_count?: number;
      today_withdrawals_amount?: number;
    };
  } | null>(null);

  // Operational Data
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [activityLogs, setActivityLogs] = useState<AgentActivityLog[]>([]);

  // Filter state
  const [depositFilter, setDepositFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [withdrawalFilter, setWithdrawalFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [depositSearch, setDepositSearch] = useState('');
  const [withdrawalSearch, setWithdrawalSearch] = useState('');

  // Customers Tab state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<any | null>(null);
  const [loadingCustomerDetail, setLoadingCustomerDetail] = useState(false);

  // Rejection Dialog State
  const [rejectDialog, setRejectDialog] = useState<{
    type: 'deposit' | 'withdrawal';
    id: string;
    username: string;
    amount: number;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const activeToken = token || localStorage.getItem('bingo_auth_token') || '';
    return {
      'Content-Type': 'application/json',
      ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
    };
  }, [token]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    soundService.playClick();
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fetchAgentProfile = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/staff/me'), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          setAgentProfile(data.user);
        }
      }
    } catch (e) {
      console.error('Failed to fetch staff profile:', e);
    }
  }, [getAuthHeaders]);

  const fetchDeposits = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/staff/deposits'), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.deposits)) {
          setDeposits(data.deposits);
        }
      }
    } catch (e) {
      console.error('Failed to fetch deposits:', e);
    }
  }, [getAuthHeaders]);

  const fetchWithdrawals = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/staff/withdrawals'), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.withdrawals)) {
          setWithdrawals(data.withdrawals);
        }
      }
    } catch (e) {
      console.error('Failed to fetch withdrawals:', e);
    }
  }, [getAuthHeaders]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/staff/my-activity'), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          setActivityLogs(data.logs);
        }
      }
    } catch (e) {
      console.error('Failed to fetch activity logs:', e);
    }
  }, [getAuthHeaders]);

  const fetchCustomers = useCallback(async (q = customerSearchQuery) => {
    setSearchingCustomers(true);
    try {
      const url = q.trim() ? `/api/staff/customers?search=${encodeURIComponent(q.trim())}` : '/api/staff/customers';
      const res = await fetch(apiUrl(url), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.customers)) {
          setCustomersList(data.customers);
        }
      }
    } catch (e) {
      console.error('Failed to fetch customers:', e);
    } finally {
      setSearchingCustomers(false);
    }
  }, [getAuthHeaders, customerSearchQuery]);

  const refreshAllData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await Promise.all([
        fetchAgentProfile(),
        fetchDeposits(),
        fetchWithdrawals(),
        fetchActivity(),
        fetchCustomers()
      ]);
    } catch (err: any) {
      setError(err.message || 'Error refreshing agent data');
    } finally {
      setRefreshing(false);
    }
  }, [fetchAgentProfile, fetchDeposits, fetchWithdrawals, fetchActivity, fetchCustomers]);

  useEffect(() => {
    if (isOpen) {
      refreshAllData();
    }
  }, [isOpen, refreshAllData]);

  // Real-time Socket.IO Integration
  useEffect(() => {
    if (!socket || !isOpen) return;

    // Handle new incoming deposit
    const handleDepositNew = (newDep: DepositRequest) => {
      soundService.playLineChime();
      setDeposits((prev) => {
        if (prev.some((d) => d.id === newDep.id)) return prev;
        return [newDep, ...prev];
      });
      setLiveToast({
        id: newDep.id,
        title: 'New Deposit Request',
        subtitle: `${newDep.username} • +${newDep.amount.toLocaleString()} ETB`,
        type: 'deposit'
      });
      setTimeout(() => setLiveToast((t) => (t?.id === newDep.id ? null : t)), 4500);
    };

    // Handle new incoming withdrawal
    const handleWithdrawalNew = (newWth: WithdrawalRequest) => {
      soundService.playLineChime();
      setWithdrawals((prev) => {
        if (prev.some((w) => w.id === newWth.id)) return prev;
        return [newWth, ...prev];
      });
      setLiveToast({
        id: newWth.id,
        title: 'New Withdrawal Request',
        subtitle: `${newWth.username} • -${newWth.amount.toLocaleString()} ETB`,
        type: 'withdrawal'
      });
      setTimeout(() => setLiveToast((t) => (t?.id === newWth.id ? null : t)), 4500);
    };

    // Concurrency protection: when any agent updates a deposit
    const handleDepositUpdated = (data: { id: string; status: string; deposit?: DepositRequest }) => {
      setDeposits((prev) =>
        prev.map((d) => (d.id === data.id ? { ...d, ...(data.deposit || {}), status: data.status as any } : d))
      );
      fetchAgentProfile();
    };

    // Concurrency protection: when any agent updates a withdrawal
    const handleWithdrawalUpdated = (data: { id: string; status: string; withdrawal?: WithdrawalRequest }) => {
      setWithdrawals((prev) =>
        prev.map((w) => (w.id === data.id ? { ...w, ...(data.withdrawal || {}), status: data.status as any } : w))
      );
      fetchAgentProfile();
    };

    // Automatic reconnect synchronization
    const handleReconnect = () => {
      fetchDeposits();
      fetchWithdrawals();
      fetchAgentProfile();
    };

    socket.on('deposit:new', handleDepositNew);
    socket.on('withdrawal:new', handleWithdrawalNew);
    socket.on('deposit:updated', handleDepositUpdated);
    socket.on('withdrawal:updated', handleWithdrawalUpdated);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('deposit:new', handleDepositNew);
      socket.off('withdrawal:new', handleWithdrawalNew);
      socket.off('deposit:updated', handleDepositUpdated);
      socket.off('withdrawal:updated', handleWithdrawalUpdated);
      socket.off('connect', handleReconnect);
    };
  }, [socket, isOpen, fetchDeposits, fetchWithdrawals, fetchAgentProfile]);

  // Debounce customer search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchCustomers(customerSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearchQuery, isOpen, fetchCustomers]);

  // Handle Approve Deposit (Idempotent)
  const handleApproveDeposit = async (dep: DepositRequest) => {
    if (processingId) return;
    setProcessingId(dep.id);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(apiUrl(`/api/staff/deposits/${dep.id}/approve`), {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to approve deposit');
      }
      soundService.playVictory();
      setSuccessMsg(`Deposit #${dep.id.slice(-6)} of ${dep.amount} ETB approved! Balance credited.`);
      await Promise.all([fetchDeposits(), fetchAgentProfile(), fetchActivity()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message || 'Error approving deposit');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Reject Deposit
  const handleConfirmRejectDeposit = async () => {
    if (!rejectDialog || processingId) return;
    setProcessingId(rejectDialog.id);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(apiUrl(`/api/staff/deposits/${rejectDialog.id}/reject`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: rejectionReason.trim() || 'Declined by agent' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reject deposit');
      }
      soundService.playClick();
      setSuccessMsg(`Deposit #${rejectDialog.id.slice(-6)} rejected.`);
      setRejectDialog(null);
      setRejectionReason('');
      await Promise.all([fetchDeposits(), fetchAgentProfile(), fetchActivity()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message || 'Error rejecting deposit');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Assign Deposit
  const handleAssignDeposit = async (depId: string) => {
    if (processingId) return;
    setProcessingId(depId);
    try {
      const res = await fetch(apiUrl(`/api/staff/deposits/${depId}/assign`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ agentId: user?.playerId })
      });
      if (res.ok) {
        await fetchDeposits();
        soundService.playClick();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Approve Withdrawal
  const handleApproveWithdrawal = async (wth: WithdrawalRequest) => {
    if (processingId) return;
    setProcessingId(wth.id);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(apiUrl(`/api/staff/withdrawals/${wth.id}/approve`), {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to approve withdrawal');
      }
      soundService.playVictory();
      setSuccessMsg(`Withdrawal #${wth.id.slice(-6)} of ${wth.amount} ETB approved & settled!`);
      await Promise.all([fetchWithdrawals(), fetchAgentProfile(), fetchActivity()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message || 'Error approving withdrawal');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Reject Withdrawal (Refunds User Balance)
  const handleConfirmRejectWithdrawal = async () => {
    if (!rejectDialog || processingId) return;
    setProcessingId(rejectDialog.id);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(apiUrl(`/api/staff/withdrawals/${rejectDialog.id}/reject`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: rejectionReason.trim() || 'Declined by agent' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reject withdrawal');
      }
      soundService.playClick();
      setSuccessMsg(`Withdrawal #${rejectDialog.id.slice(-6)} rejected. Reserved funds refunded to user balance.`);
      setRejectDialog(null);
      setRejectionReason('');
      await Promise.all([fetchWithdrawals(), fetchAgentProfile(), fetchActivity()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message || 'Error rejecting withdrawal');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Assign Withdrawal
  const handleAssignWithdrawal = async (wthId: string) => {
    if (processingId) return;
    setProcessingId(wthId);
    try {
      const res = await fetch(apiUrl(`/api/staff/withdrawals/${wthId}/assign`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ agentId: user?.playerId })
      });
      if (res.ok) {
        await fetchWithdrawals();
        soundService.playClick();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Inspect Customer Detail
  const handleViewCustomerDetail = async (customerId: string) => {
    setLoadingCustomerDetail(true);
    setSelectedCustomerDetail(null);
    try {
      const res = await fetch(apiUrl(`/api/staff/customers/${encodeURIComponent(customerId)}`), {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedCustomerDetail(data.details);
      } else {
        throw new Error(data.error || 'Customer profile not found');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingCustomerDetail(false);
    }
  };

  // Jump to specific transaction from Overview
  const handleJumpToTransaction = (type: 'deposit' | 'withdrawal', id: string) => {
    setHighlightedTxId(id);
    if (type === 'deposit') {
      setActiveTab('deposits');
      setDepositFilter('ALL');
      setDepositSearch('');
    } else {
      setActiveTab('withdrawals');
      setWithdrawalFilter('ALL');
      setWithdrawalSearch('');
    }
    setTimeout(() => {
      const element = document.getElementById(`tx-row-${id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  };

  // Filtered deposits & withdrawals
  const filteredDeposits = deposits.filter((dep) => {
    const matchesFilter = depositFilter === 'ALL' || dep.status === depositFilter;
    const matchesSearch =
      dep.username.toLowerCase().includes(depositSearch.toLowerCase()) ||
      (dep.referenceId && dep.referenceId.toLowerCase().includes(depositSearch.toLowerCase())) ||
      (dep.paymentPhone && dep.paymentPhone.includes(depositSearch));
    return matchesFilter && matchesSearch;
  });

  const filteredWithdrawals = withdrawals.filter((wth) => {
    const matchesFilter = withdrawalFilter === 'ALL' || wth.status === withdrawalFilter;
    const matchesSearch =
      wth.username.toLowerCase().includes(withdrawalSearch.toLowerCase()) ||
      (wth.address && wth.address.includes(withdrawalSearch)) ||
      (wth.referenceId && wth.referenceId.toLowerCase().includes(withdrawalSearch.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const pendingDeposits = deposits.filter((d) => d.status === 'PENDING');
  const pendingWithdrawals = withdrawals.filter((w) => w.status === 'PENDING');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#090b10] text-slate-100 flex flex-col overflow-hidden font-sans">
      {/* ──────────────── TOP CONTROL BAR ──────────────── */}
      <header className="h-14 bg-[#0d1017] border-b border-slate-800 px-4 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Agent Operations Desk</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ACTIVE AGENT
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                REAL-TIME SYNC
              </span>
            </div>
          </div>
        </div>

        {/* Live Workload Metric Strip */}
        <div className="hidden md:flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            <span className="text-slate-400">Pending Dep:</span>
            <span className={`font-bold ${pendingDeposits.length > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
              {pendingDeposits.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            <span className="text-slate-400">Pending Wth:</span>
            <span className={`font-bold ${pendingWithdrawals.length > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
              {pendingWithdrawals.length}
            </span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { soundService.playClick(); refreshAllData(); }}
            disabled={refreshing}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700"
            title="Refresh All Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <div className="hidden sm:block text-xs font-mono text-slate-300 px-2.5 py-1 rounded bg-slate-900 border border-slate-800">
            {agentProfile?.assigned_agent_name || user?.username}
          </div>

          <button
            onClick={() => { soundService.playClick(); onClose(); }}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </header>

      {/* Global Alerts Strip */}
      {error && (
        <div className="bg-rose-950/80 border-b border-rose-700/50 px-4 py-2 text-rose-200 text-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="font-bold text-rose-400 px-1">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-950/80 border-b border-emerald-700/50 px-4 py-2 text-emerald-200 text-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="font-bold text-emerald-400 px-1">✕</button>
        </div>
      )}

      {/* Real-Time Live Notification Toast */}
      {liveToast && (
        <div className="absolute top-16 right-4 z-50 p-3 rounded-xl bg-slate-900/95 border border-emerald-500/40 shadow-2xl text-xs flex items-center gap-3 animate-in slide-in-from-top-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            {liveToast.type === 'deposit' ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-bold text-white">{liveToast.title}</div>
            <div className="text-slate-300 font-mono text-[11px]">{liveToast.subtitle}</div>
          </div>
          <button onClick={() => setLiveToast(null)} className="text-slate-400 hover:text-white ml-2 text-xs">✕</button>
        </div>
      )}

      {/* ──────────────── TABS BAR ──────────────── */}
      <div className="bg-[#0d1017] border-b border-slate-800 px-4 py-2 flex items-center gap-1.5 overflow-x-auto custom-scrollbar shrink-0">
        <button
          onClick={() => { soundService.playClick(); setActiveTab('overview'); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 cursor-pointer transition-all ${
            activeTab === 'overview'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => { soundService.playClick(); setActiveTab('deposits'); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 cursor-pointer transition-all ${
            activeTab === 'deposits'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-400" />
          <span>Deposits</span>
          {pendingDeposits.length > 0 && (
            <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-emerald-500/30 text-emerald-300 font-bold">
              {pendingDeposits.length}
            </span>
          )}
        </button>

        <button
          onClick={() => { soundService.playClick(); setActiveTab('withdrawals'); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 cursor-pointer transition-all ${
            activeTab === 'withdrawals'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <ArrowUpFromLine className="w-3.5 h-3.5 text-amber-400" />
          <span>Withdrawals</span>
          {pendingWithdrawals.length > 0 && (
            <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-amber-500/30 text-amber-300 font-bold">
              {pendingWithdrawals.length}
            </span>
          )}
        </button>

        <button
          onClick={() => { soundService.playClick(); setActiveTab('customers'); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 cursor-pointer transition-all ${
            activeTab === 'customers'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <User className="w-3.5 h-3.5 text-cyan-400" />
          <span>Customer Support</span>
        </button>

        <button
          onClick={() => { soundService.playClick(); setActiveTab('activity'); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 cursor-pointer transition-all ${
            activeTab === 'activity'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <History className="w-3.5 h-3.5 text-indigo-400" />
          <span>My Activity</span>
          <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-slate-800 text-slate-300">
            {activityLogs.length}
          </span>
        </button>

        <button
          onClick={() => { soundService.playClick(); setActiveTab('account'); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 cursor-pointer transition-all ${
            activeTab === 'account'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Phone className="w-3.5 h-3.5 text-slate-400" />
          <span>My Account</span>
        </button>
      </div>

      {/* ──────────────── TAB CONTENT AREA ──────────────── */}
      <main className="flex-1 bg-[#090b10] overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Telebirr Receiving Number Banner */}
            <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest block">
                  AGENT TELEBIRR RECEIVER ACCOUNT
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono font-bold text-xl text-white tracking-wider">
                    {agentProfile?.telebirr_number || user?.telebirr_number || 'Not Assigned'}
                  </span>
                  {agentProfile?.telebirr_number && (
                    <button
                      onClick={() => copyToClipboard(agentProfile.telebirr_number!, 'agent_tb')}
                      className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 cursor-pointer"
                      title="Copy Number"
                    >
                      {copiedId === 'agent_tb' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
                <span className="text-xs text-slate-400 block mt-0.5">
                  Assigned Operator: <strong className="text-slate-200">{agentProfile?.assigned_agent_name || user?.username}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold">
                  STATUS: {agentProfile?.account_status || 'ACTIVE'}
                </span>
              </div>
            </div>

            {/* Real Workload KPI Cards */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                Workload & Real Operational Statistics
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div
                  onClick={() => setActiveTab('deposits')}
                  className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 cursor-pointer transition-all"
                >
                  <span className="text-[11px] text-slate-400 block">Pending Deposits</span>
                  <span className="text-2xl font-mono font-bold text-emerald-400 mt-1 block">
                    {pendingDeposits.length}
                  </span>
                  <span className="text-[10px] text-slate-400">Click to process →</span>
                </div>

                <div
                  onClick={() => setActiveTab('withdrawals')}
                  className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 cursor-pointer transition-all"
                >
                  <span className="text-[11px] text-slate-400 block">Pending Withdrawals</span>
                  <span className="text-2xl font-mono font-bold text-amber-400 mt-1 block">
                    {pendingWithdrawals.length}
                  </span>
                  <span className="text-[10px] text-slate-400">Click to process →</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Deposits Processed (Total)</span>
                  <span className="text-2xl font-mono font-bold text-white mt-1 block">
                    {agentProfile?.stats?.deposits_processed ?? deposits.filter((d) => d.status !== 'PENDING').length}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {((agentProfile?.stats?.deposit_amount ?? 0)).toLocaleString()} ETB volume
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Withdrawals Processed (Total)</span>
                  <span className="text-2xl font-mono font-bold text-white mt-1 block">
                    {agentProfile?.stats?.withdrawals_processed ?? withdrawals.filter((w) => w.status !== 'PENDING').length}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {((agentProfile?.stats?.withdrawal_amount ?? 0)).toLocaleString()} ETB volume
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive Recent Pending Requests List */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Newest Pending Requests ({pendingDeposits.length + pendingWithdrawals.length} items)
                </h3>
                <span className="text-[11px] text-slate-400">Click any request to jump directly to action</span>
              </div>

              <div className="border border-slate-800 rounded-xl bg-slate-950 overflow-hidden divide-y divide-slate-800/60 text-xs">
                {pendingDeposits.slice(0, 5).map((dep) => (
                  <div
                    key={dep.id}
                    onClick={() => handleJumpToTransaction('deposit', dep.id)}
                    className="p-3 hover:bg-slate-900/60 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                        <ArrowDownToLine className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          Deposit: <span className="text-emerald-300 font-bold">+{dep.amount.toLocaleString()} ETB</span> from{' '}
                          <strong>{dep.username}</strong>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Ref: {dep.referenceId || 'N/A'} • Submitted {new Date(dep.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 font-semibold text-[11px] flex items-center gap-1">
                      Process Deposit <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                ))}

                {pendingWithdrawals.slice(0, 5).map((wth) => (
                  <div
                    key={wth.id}
                    onClick={() => handleJumpToTransaction('withdrawal', wth.id)}
                    className="p-3 hover:bg-slate-900/60 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                        <ArrowUpFromLine className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          Withdrawal: <span className="text-amber-300 font-bold">-{wth.amount.toLocaleString()} ETB</span> to{' '}
                          <strong>{wth.username}</strong> ({wth.address})
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Requested {new Date(wth.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 font-semibold text-[11px] flex items-center gap-1">
                      Process Payout <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                ))}

                {pendingDeposits.length === 0 && pendingWithdrawals.length === 0 && (
                  <div className="p-8 text-center text-slate-400">
                    No pending financial transactions at this moment. You are all caught up!
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DEPOSITS */}
        {activeTab === 'deposits' && (
          <div className="space-y-4 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={depositSearch}
                    onChange={(e) => setDepositSearch(e.target.value)}
                    placeholder="Search ref ID, customer, phone..."
                    className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 w-56"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setDepositFilter(st)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                        depositFilter === st
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                          : 'text-slate-400 hover:text-white bg-slate-800/60'
                      }`}
                    >
                      {st} ({deposits.filter((d) => (st === 'ALL' ? true : d.status === st)).length})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Deposits Table */}
            <div className="border border-slate-800 rounded-xl bg-slate-950 overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Deposit ID</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Ref ID / Tx Code</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Submitted</th>
                    <th className="py-2.5 px-3">Processed By</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredDeposits.map((dep) => {
                    const isHighlighted = highlightedTxId === dep.id;
                    return (
                      <tr
                        key={dep.id}
                        id={`tx-row-${dep.id}`}
                        className={`transition-colors ${isHighlighted ? 'bg-emerald-950/40 ring-1 ring-emerald-500' : 'hover:bg-slate-900/40'}`}
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">{dep.id.slice(-8)}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-white">{dep.username}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{dep.customerPhone || ''}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-white flex items-center gap-1">
                          <span>{dep.referenceId || '—'}</span>
                          {dep.referenceId && (
                            <button
                              onClick={() => copyToClipboard(dep.referenceId || '', dep.id)}
                              className="text-slate-400 hover:text-white"
                              title="Copy Ref ID"
                            >
                              {copiedId === dep.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400 text-sm">
                          +{dep.amount.toLocaleString()} ETB
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              dep.status === 'APPROVED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : dep.status === 'REJECTED'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {dep.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[10px]">
                          {new Date(dep.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 text-[11px] font-mono">
                          {dep.processedBy || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {dep.status === 'PENDING' ? (
                            <div className="inline-flex items-center gap-1.5">
                              {dep.assignedAgentId !== user?.playerId && (
                                <button
                                  onClick={() => handleAssignDeposit(dep.id)}
                                  disabled={Boolean(processingId)}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                                >
                                  Claim
                                </button>
                              )}
                              <button
                                onClick={() => handleApproveDeposit(dep)}
                                disabled={Boolean(processingId)}
                                className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] cursor-pointer shadow-sm"
                              >
                                {processingId === dep.id ? 'Approving...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => {
                                  soundService.playClick();
                                  setRejectDialog({
                                    type: 'deposit',
                                    id: dep.id,
                                    username: dep.username,
                                    amount: dep.amount
                                  });
                                }}
                                disabled={Boolean(processingId)}
                                className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-semibold cursor-pointer"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">
                              Processed by {dep.processedBy || 'Staff'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredDeposits.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No deposits match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: WITHDRAWALS */}
        {activeTab === 'withdrawals' && (
          <div className="space-y-4 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={withdrawalSearch}
                    onChange={(e) => setWithdrawalSearch(e.target.value)}
                    placeholder="Search destination phone, customer..."
                    className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 w-56"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setWithdrawalFilter(st)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                        withdrawalFilter === st
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                          : 'text-slate-400 hover:text-white bg-slate-800/60'
                      }`}
                    >
                      {st} ({withdrawals.filter((w) => (st === 'ALL' ? true : w.status === st)).length})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Withdrawals Table */}
            <div className="border border-slate-800 rounded-xl bg-slate-950 overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Withdrawal ID</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Destination Telebirr Phone</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Requested At</th>
                    <th className="py-2.5 px-3">Processed By</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredWithdrawals.map((wth) => {
                    const isHighlighted = highlightedTxId === wth.id;
                    return (
                      <tr
                        key={wth.id}
                        id={`tx-row-${wth.id}`}
                        className={`transition-colors ${isHighlighted ? 'bg-amber-950/40 ring-1 ring-amber-500' : 'hover:bg-slate-900/40'}`}
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">{wth.id.slice(-8)}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-white">{wth.username}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{wth.customerPhone || ''}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-amber-300 flex items-center gap-1">
                          <span>{wth.address}</span>
                          <button
                            onClick={() => copyToClipboard(wth.address, wth.id)}
                            className="text-slate-400 hover:text-white"
                            title="Copy Phone"
                          >
                            {copiedId === wth.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400 text-sm">
                          -{wth.amount.toLocaleString()} ETB
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              wth.status === 'APPROVED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : wth.status === 'REJECTED'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {wth.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[10px]">
                          {new Date(wth.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 text-[11px] font-mono">
                          {wth.processedBy || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {wth.status === 'PENDING' ? (
                            <div className="inline-flex items-center gap-1.5">
                              {wth.assignedAgentId !== user?.playerId && (
                                <button
                                  onClick={() => handleAssignWithdrawal(wth.id)}
                                  disabled={Boolean(processingId)}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                                >
                                  Claim
                                </button>
                              )}
                              <button
                                onClick={() => handleApproveWithdrawal(wth)}
                                disabled={Boolean(processingId)}
                                className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] cursor-pointer shadow-sm"
                              >
                                {processingId === wth.id ? 'Approving...' : 'Approve Payout'}
                              </button>
                              <button
                                onClick={() => {
                                  soundService.playClick();
                                  setRejectDialog({
                                    type: 'withdrawal',
                                    id: wth.id,
                                    username: wth.username,
                                    amount: wth.amount
                                  });
                                }}
                                disabled={Boolean(processingId)}
                                className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-semibold cursor-pointer"
                              >
                                Reject & Refund
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">
                              Processed by {wth.processedBy || 'Staff'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredWithdrawals.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No withdrawals match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: CUSTOMER SUPPORT LOOKUP */}
        {activeTab === 'customers' && (
          <div className="space-y-4 max-w-5xl mx-auto">
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                Customer Support Lookup
              </h4>
              <p className="text-[11px] text-slate-400 mb-3">
                Search real customers by Phone number, Username, or User ID to verify balances and transaction history.
              </p>

              <div className="relative max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  placeholder="Search phone, username, or ID..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Customers Table */}
            <div className="border border-slate-800 rounded-xl bg-slate-950 overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Phone</th>
                    <th className="py-2.5 px-3">Account Status</th>
                    <th className="py-2.5 px-3 text-right">Available Balance</th>
                    <th className="py-2.5 px-3 text-right">Deposited</th>
                    <th className="py-2.5 px-3 text-right">Withdrawn</th>
                    <th className="py-2.5 px-3 text-center">Tickets (Bingo/Jackpot)</th>
                    <th className="py-2.5 px-3 text-center">Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {customersList.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-white">{c.username}</div>
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">{c.id}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">{c.phone || '—'}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.account_status === 'ACTIVE'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {c.account_status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                        {((c.balance ?? 0)).toLocaleString()} ETB
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                        {((c.total_deposited ?? 0)).toLocaleString()} ETB
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                        {((c.total_withdrawn ?? 0)).toLocaleString()} ETB
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-300">
                        {c.bingo_tickets_count || 0} / {c.jackpot_tickets_count || 0}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleViewCustomerDetail(c.id)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1 mx-auto"
                        >
                          <Eye className="w-3 h-3 text-cyan-400" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {customersList.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        {searchingCustomers ? 'Searching customer records...' : 'No customers match the query.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: MY ACTIVITY */}
        {activeTab === 'activity' && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                My Operational Audit Trail ({activityLogs.length} events logged)
              </span>
              <button
                onClick={fetchActivity}
                className="text-xs text-emerald-400 hover:underline cursor-pointer"
              >
                Refresh Audit Trail
              </button>
            </div>

            <div className="border border-slate-800 rounded-xl bg-slate-950 overflow-hidden divide-y divide-slate-800/60 text-xs">
              {activityLogs.map((log) => (
                <div key={log.id} className="p-3 flex items-center justify-between hover:bg-slate-900/40">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-slate-400 text-[11px]">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-800 text-slate-200">
                      {log.action}
                    </span>
                    {log.target_id && (
                      <span className="text-slate-300 font-mono text-[11px]">Target: {log.target_id}</span>
                    )}
                    {log.metadata?.reason && (
                      <span className="text-slate-400 italic">({log.metadata.reason})</span>
                    )}
                  </div>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {new Date(log.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
              {activityLogs.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  No activity records logged for your agent account yet.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: MY ACCOUNT */}
        {activeTab === 'account' && (
          <div className="max-w-xl mx-auto space-y-4">
            <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg">
                  {user?.username?.[0]?.toUpperCase() || 'A'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {agentProfile?.assigned_agent_name || user?.username}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400 font-mono">@{user?.username}</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                      {agentProfile?.account_status || 'ACTIVE'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase">Agent Phone</span>
                  <span className="font-mono font-bold text-slate-200 mt-1 block">
                    {agentProfile?.phone || 'Not configured'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase">Telebirr Payout Account</span>
                  <span className="font-mono font-bold text-emerald-400 mt-1 block">
                    {agentProfile?.telebirr_number || 'Not configured'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase">Account Created</span>
                  <span className="text-slate-300 mt-1 block">
                    {agentProfile?.created_at ? new Date(agentProfile.created_at).toLocaleDateString() : 'Active'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase">System Role</span>
                  <span className="text-slate-300 font-mono mt-1 block">AGENT / STAFF</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-400">
                <Shield className="w-3.5 h-3.5 text-emerald-400 inline mr-1" />
                Security notice: Agent accounts are managed by Platform Governance. Role and permissions cannot be altered locally.
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ──────────────── CUSTOMER DETAIL DRAWER ──────────────── */}
      {selectedCustomerDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[88vh] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">{selectedCustomerDetail.user.username}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {selectedCustomerDetail.user.account_status || 'ACTIVE'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">User ID: {selectedCustomerDetail.user.id}</span>
              </div>
              <button onClick={() => setSelectedCustomerDetail(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-xs">
              {/* Balances */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">Available Balance</span>
                  <span className="text-base font-mono font-bold text-emerald-400 mt-0.5 block">
                    {selectedCustomerDetail.user.balance.toLocaleString()} ETB
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">Total Deposited</span>
                  <span className="text-base font-mono font-bold text-white mt-0.5 block">
                    {selectedCustomerDetail.stats.total_deposited.toLocaleString()} ETB
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">Total Withdrawn</span>
                  <span className="text-base font-mono font-bold text-white mt-0.5 block">
                    {selectedCustomerDetail.stats.total_withdrawn.toLocaleString()} ETB
                  </span>
                </div>
              </div>

              {/* Deposit History */}
              <div>
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">Deposit History</h4>
                <div className="border border-slate-800 rounded-xl bg-slate-950 overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Amount</th>
                        <th className="py-2 px-3">Ref ID</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {selectedCustomerDetail.deposits.map((d: any) => (
                        <tr key={d.id}>
                          <td className="py-1.5 px-3 font-mono text-[10px] text-slate-400">{new Date(d.created_at).toLocaleString()}</td>
                          <td className="py-1.5 px-3 font-mono font-bold text-emerald-400">+{d.amount} ETB</td>
                          <td className="py-1.5 px-3 font-mono text-slate-300">{d.reference_id || '—'}</td>
                          <td className="py-1.5 px-3 font-semibold text-[10px]">{d.status}</td>
                        </tr>
                      ))}
                      {selectedCustomerDetail.deposits.length === 0 && (
                        <tr><td colSpan={4} className="py-3 text-center text-slate-400">No deposits recorded.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Withdrawal History */}
              <div>
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">Withdrawal History</h4>
                <div className="border border-slate-800 rounded-xl bg-slate-950 overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Amount</th>
                        <th className="py-2 px-3">Destination Phone</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {selectedCustomerDetail.withdrawals.map((w: any) => (
                        <tr key={w.id}>
                          <td className="py-1.5 px-3 font-mono text-[10px] text-slate-400">{new Date(w.created_at).toLocaleString()}</td>
                          <td className="py-1.5 px-3 font-mono font-bold text-amber-400">-{w.amount} ETB</td>
                          <td className="py-1.5 px-3 font-mono text-slate-300">{w.address}</td>
                          <td className="py-1.5 px-3 font-semibold text-[10px]">{w.status}</td>
                        </tr>
                      ))}
                      {selectedCustomerDetail.withdrawals.length === 0 && (
                        <tr><td colSpan={4} className="py-3 text-center text-slate-400">No withdrawals recorded.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── REJECTION MODAL ──────────────── */}
      {rejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Reject {rejectDialog.type === 'deposit' ? 'Deposit' : 'Withdrawal'} Request
            </h3>
            <p className="text-xs text-slate-300">
              Customer: <strong className="text-white">{rejectDialog.username}</strong> • Amount:{' '}
              <strong className="text-rose-400">{rejectDialog.amount} ETB</strong>
            </p>

            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">Reason for Rejection *</label>
              <textarea
                required
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Invalid transaction reference, destination account error..."
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => { setRejectDialog(null); setRejectionReason(''); }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={rejectDialog.type === 'deposit' ? handleConfirmRejectDeposit : handleConfirmRejectWithdrawal}
                disabled={Boolean(processingId) || !rejectionReason.trim()}
                className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
