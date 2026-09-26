import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import {
  X,
  Shield,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  Receipt,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  DollarSign,
  UserCheck,
  UserX,
  Clock,
  Copy,
  Check,
  Menu,
  LayoutDashboard,
  Loader2,
  Ban,
  Phone,
  Calendar,
  AlertCircle,
  Trophy,
  Sliders,
  CreditCard,
  Plus,
  Play,
  RotateCcw,
  ExternalLink,
  Filter,
  ChevronRight,
  Eye,
  KeyRound,
  Edit2,
  Trash2,
  UserPlus,
  Power,
  Activity,
  History,
  Info
} from 'lucide-react';
import {
  UserAccount,
  DepositRequest,
  WithdrawalRequest,
  AdminUserDetail,
  PaymentAccount,
  PaymentAccountLog,
  AgentPerformance,
  AgentActivityLog,
  WeekendJackpotPlayer,
  WeekendJackpotRoundSummary,
  WeekendJackpotConfig,
  SuperAdminOverviewStats,
  ReconciliationReport
} from '../types/bingo.js';
import { apiUrl } from '../config/api.js';
import { soundService } from '../services/soundService.js';

interface SuperAdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: UserAccount | null;
  token?: string | null;
  socket?: Socket | null;
}

type SuperAdminTab =
  | 'overview'
  | 'agents'
  | 'users'
  | 'finance_deposits'
  | 'finance_withdrawals'
  | 'finance_payment_numbers'
  | 'finance_reconciliation'
  | 'weekend_jackpot'
  | 'weekend_jackpot_players'
  | 'weekend_jackpot_history'
  | 'weekend_jackpot_settings'
  | 'audit_logs';

export const SuperAdminDashboardModal: React.FC<SuperAdminDashboardModalProps> = ({
  isOpen,
  onClose,
  user,
  token,
  socket
}) => {
  const [activeTab, setActiveTab] = useState<SuperAdminTab>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Real-time toast state
  const [liveToast, setLiveToast] = useState<{ id: string; title: string; subtitle: string; type: 'deposit' | 'withdrawal' | 'info' } | null>(null);

  // Data states
  const [overviewStats, setOverviewStats] = useState<SuperAdminOverviewStats | null>(null);
  const [agents, setAgents] = useState<AgentPerformance[]>([]);
  const [usersList, setUsersList] = useState<AdminUserDetail[]>([]);
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<PaymentAccountLog[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);
  const [auditLogs, setAuditLogs] = useState<AgentActivityLog[]>([]);

  // Jackpot states
  const [jackpotConfig, setJackpotConfig] = useState<WeekendJackpotConfig | null>(null);
  const [jackpotHistory, setJackpotHistory] = useState<WeekendJackpotRoundSummary[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [jackpotPlayers, setJackpotPlayers] = useState<WeekendJackpotPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [currentRoundState, setCurrentRoundState] = useState<any>(null);

  // Search & filter states
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const [agentStatusFilter, setAgentStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'DELETED'>('ALL');
  const [depositFilter, setDepositFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [withdrawalFilter, setWithdrawalFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [depositSearchQuery, setDepositSearchQuery] = useState('');
  const [withdrawalSearchQuery, setWithdrawalSearchQuery] = useState('');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  // Modals & Drawers
  const [showAddAgentModal, setShowAddAgentModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentPerformance | null>(null);
  const [agentForm, setAgentForm] = useState({
    username: '',
    phone: '',
    password: '',
    telebirr_number: '',
    assigned_agent_name: '',
    role: 'AGENT' as 'AGENT' | 'SUPER_ADMIN'
  });

  const [deleteAgentTarget, setDeleteAgentTarget] = useState<AgentPerformance | null>(null);
  const [deleteAgentReason, setDeleteAgentReason] = useState('');

  const [resetPasswordAgent, setResetPasswordAgent] = useState<AgentPerformance | null>(null);
  const [newAgentPassword, setNewAgentPassword] = useState('');

  const [inspectAgentTransactions, setInspectAgentTransactions] = useState<{ agent: AgentPerformance; deposits: any[]; withdrawals: any[] } | null>(null);
  const [inspectAgentActivity, setInspectAgentActivity] = useState<{ agent: AgentPerformance; logs: any[] } | null>(null);

  // Payment Accounts Modals
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [editingPaymentAccount, setEditingPaymentAccount] = useState<PaymentAccount | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    provider: 'Telebirr',
    account_name: '',
    phone_number: '',
    assigned_agent_id: '',
    instructions: 'Send deposit via Telebirr and enter transaction reference below.'
  });

  const [deletePaymentTarget, setDeletePaymentTarget] = useState<PaymentAccount | null>(null);
  const [deletePaymentReason, setDeletePaymentReason] = useState('');

  // User Management Drawers & Modals
  const [selectedUserDetail, setSelectedUserDetail] = useState<any | null>(null);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<AdminUserDetail | null>(null);
  const [deleteUserReason, setDeleteUserReason] = useState('');
  const [statusChangeUserTarget, setStatusChangeUserTarget] = useState<AdminUserDetail | null>(null);
  const [targetUserNewStatus, setTargetUserNewStatus] = useState<string>('ACTIVE');
  const [userStatusReason, setUserStatusReason] = useState('');

  // Rejection dialog
  const [rejectDialog, setRejectDialog] = useState<{
    type: 'deposit' | 'withdrawal';
    id: string;
    username: string;
    amount: number;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Config edit state
  const [configEditForm, setConfigEditForm] = useState<{
    day_of_week: string;
    start_time: string;
    min_cards: number;
    max_cards: number;
    card_price: number;
  } | null>(null);

  const [copiedText, setCopiedText] = useState<string | null>(null);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const activeToken = token || localStorage.getItem('bingo_auth_token') || '';
    return {
      'Content-Type': 'application/json',
      ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
    };
  }, [token]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    soundService.playClick();
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Fetch functions
  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/super-admin/overview'), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success) setOverviewStats(data.stats);
      }
    } catch (e) {
      console.error(e);
    }
  }, [getAuthHeaders]);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/super-admin/agents'), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.agents)) setAgents(data.agents);
      }
    } catch (e) {
      console.error(e);
    }
  }, [getAuthHeaders]);

  const fetchUsers = useCallback(async (query = userSearchQuery) => {
    try {
      const q = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : '';
      const res = await fetch(apiUrl(`/api/super-admin/users${q}`), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) setUsersList(data.users);
      }
    } catch (e) {
      console.error(e);
    }
  }, [getAuthHeaders, userSearchQuery]);

  const fetchDeposits = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/staff/deposits'), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.deposits)) setDeposits(data.deposits);
      }
    } catch (e) {
      console.error(e);
    }
  }, [getAuthHeaders]);

  const fetchWithdrawals = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/staff/withdrawals'), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.withdrawals)) setWithdrawals(data.withdrawals);
      }
    } catch (e) {
      console.error(e);
    }
  }, [getAuthHeaders]);

  const fetchPaymentAccounts = useCallback(async () => {
    try {
      const [resAcc, resLogs] = await Promise.all([
        fetch(apiUrl('/api/super-admin/payment-accounts'), { headers: getAuthHeaders() }),
        fetch(apiUrl('/api/super-admin/payment-accounts/logs'), { headers: getAuthHeaders() })
      ]);
      if (resAcc.ok) {
        const data = await resAcc.json();
        if (data.success && Array.isArray(data.accounts)) setPaymentAccounts(data.accounts);
      }
      if (resLogs.ok) {
        const data = await resLogs.json();
        if (data.success && Array.isArray(data.logs)) setPaymentLogs(data.logs);
      }
    } catch (e) {
      console.error(e);
    }
  }, [getAuthHeaders]);

  const fetchReconciliation = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/super-admin/reconciliation'), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.report) setReconciliation(data.report);
      }
    } catch (e) {
      console.error(e);
    }
  }, [getAuthHeaders]);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/super-admin/audit-logs'), { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) setAuditLogs(data.logs);
      }
    } catch (e) {
      console.error(e);
    }
  }, [getAuthHeaders]);

  const fetchJackpotData = useCallback(async () => {
    try {
      const [resCfg, resRounds] = await Promise.all([
        fetch(apiUrl('/api/super-admin/jackpot/config'), { headers: getAuthHeaders() }),
        fetch(apiUrl('/api/super-admin/jackpot/rounds'), { headers: getAuthHeaders() })
      ]);
      if (resCfg.ok) {
        const data = await resCfg.json();
        if (data.success && data.config) {
          setJackpotConfig(data.config);
          setConfigEditForm({
            day_of_week: data.config.day_of_week || 'Sunday',
            start_time: data.config.start_time || '20:00',
            min_cards: data.config.min_cards || 1,
            max_cards: data.config.max_cards || 20,
            card_price: data.config.card_price || 20
          });
        }
      }
      if (resRounds.ok) {
        const data = await resRounds.json();
        if (data.success) {
          if (Array.isArray(data.rounds)) setJackpotHistory(data.rounds);
          if (data.currentRound) setCurrentRoundState(data.currentRound);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [getAuthHeaders]);

  const fetchJackpotPlayers = async (roundId: string) => {
    setLoadingPlayers(true);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/jackpot/rounds/${roundId}/players`), {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.players)) {
          setJackpotPlayers(data.players);
          setSelectedRoundId(roundId);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPlayers(false);
    }
  };

  const refreshAllData = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchOverview(),
      fetchAgents(),
      fetchUsers(),
      fetchDeposits(),
      fetchWithdrawals(),
      fetchPaymentAccounts(),
      fetchReconciliation(),
      fetchAuditLogs(),
      fetchJackpotData()
    ]);
    setRefreshing(false);
  };

  useEffect(() => {
    if (isOpen) {
      refreshAllData();
    }
  }, [isOpen]);

  // Real-time Socket.IO Listeners
  useEffect(() => {
    if (!socket || !isOpen) return;

    const handleDepositNew = (dep: DepositRequest) => {
      soundService.playLineChime();
      setDeposits((prev) => {
        if (prev.some((d) => d.id === dep.id)) return prev;
        return [dep, ...prev];
      });
      setOverviewStats((prev) => prev ? { ...prev, pending_deposits: prev.pending_deposits + 1 } : prev);
      setLiveToast({
        id: dep.id,
        title: 'New Deposit Request',
        subtitle: `${dep.username} • +${dep.amount.toLocaleString()} ETB`,
        type: 'deposit'
      });
      setTimeout(() => setLiveToast((t) => (t?.id === dep.id ? null : t)), 4000);
    };

    const handleWithdrawalNew = (wth: WithdrawalRequest) => {
      soundService.playLineChime();
      setWithdrawals((prev) => {
        if (prev.some((w) => w.id === wth.id)) return prev;
        return [wth, ...prev];
      });
      setOverviewStats((prev) => prev ? { ...prev, pending_withdrawals: prev.pending_withdrawals + 1 } : prev);
      setLiveToast({
        id: wth.id,
        title: 'New Withdrawal Request',
        subtitle: `${wth.username} • -${wth.amount.toLocaleString()} ETB`,
        type: 'withdrawal'
      });
      setTimeout(() => setLiveToast((t) => (t?.id === wth.id ? null : t)), 4000);
    };

    const handleDepositUpdated = (data: { id: string; status: string; deposit?: DepositRequest }) => {
      setDeposits((prev) =>
        prev.map((d) => (d.id === data.id ? { ...d, ...(data.deposit || {}), status: data.status as any } : d))
      );
      fetchOverview();
    };

    const handleWithdrawalUpdated = (data: { id: string; status: string; withdrawal?: WithdrawalRequest }) => {
      setWithdrawals((prev) =>
        prev.map((w) => (w.id === data.id ? { ...w, ...(data.withdrawal || {}), status: data.status as any } : w))
      );
      fetchOverview();
    };

    const handlePaymentUpdated = () => {
      fetchPaymentAccounts();
    };

    socket.on('deposit:new', handleDepositNew);
    socket.on('withdrawal:new', handleWithdrawalNew);
    socket.on('deposit:updated', handleDepositUpdated);
    socket.on('withdrawal:updated', handleWithdrawalUpdated);
    socket.on('payment:updated', handlePaymentUpdated);

    // Reconnection synchronization
    const handleReconnect = () => {
      refreshAllData();
    };
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('deposit:new', handleDepositNew);
      socket.off('withdrawal:new', handleWithdrawalNew);
      socket.off('deposit:updated', handleDepositUpdated);
      socket.off('withdrawal:updated', handleWithdrawalUpdated);
      socket.off('payment:updated', handlePaymentUpdated);
      socket.off('connect', handleReconnect);
    };
  }, [socket, isOpen, refreshAllData]);

  // Debounced search for users
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchUsers(userSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearchQuery, isOpen, fetchUsers]);

  // ---------------- AGENT ACTIONS ----------------
  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessingId('save_agent');
    setError(null);
    try {
      const isEdit = Boolean(editingAgent);
      const url = isEdit
        ? apiUrl(`/api/super-admin/agents/${editingAgent!.agent_id}`)
        : apiUrl('/api/super-admin/agents');
      const method = isEdit ? 'PUT' : 'POST';

      const payload: any = {
        username: agentForm.username,
        phone: agentForm.phone,
        telebirr_number: agentForm.telebirr_number,
        assigned_agent_name: agentForm.assigned_agent_name,
        role: agentForm.role
      };
      if (!isEdit && agentForm.password) payload.password = agentForm.password;

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save agent');

      soundService.playVictory();
      setSuccessMsg(isEdit ? 'Agent updated successfully' : 'New agent created successfully');
      setShowAddAgentModal(false);
      setEditingAgent(null);
      setAgentForm({ username: '', phone: '', password: '', telebirr_number: '', assigned_agent_name: '', role: 'AGENT' });
      await Promise.all([fetchAgents(), fetchOverview()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleToggleAgentStatus = async (agent: AgentPerformance) => {
    setProcessingId(`status_${agent.agent_id}`);
    setError(null);
    const newStatus = agent.account_status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const res = await fetch(apiUrl(`/api/super-admin/agents/${agent.agent_id}`), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ account_status: newStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update agent status');

      soundService.playClick();
      setSuccessMsg(`Agent status changed to ${newStatus}`);
      await Promise.all([fetchAgents(), fetchOverview()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRestoreAgent = async (agentId: string) => {
    setProcessingId(`restore_${agentId}`);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/agents/${agentId}/restore`), {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to restore agent');

      soundService.playVictory();
      setSuccessMsg('Agent restored and reactivated successfully');
      await Promise.all([fetchAgents(), fetchOverview()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteAgent = async () => {
    if (!deleteAgentTarget) return;
    setProcessingId(`del_${deleteAgentTarget.agent_id}`);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/agents/${deleteAgentTarget.agent_id}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: deleteAgentReason || 'Agent removed by Super Admin' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete agent');

      soundService.playClick();
      setSuccessMsg(data.message || 'Agent deleted successfully');
      setDeleteAgentTarget(null);
      setDeleteAgentReason('');
      await Promise.all([fetchAgents(), fetchOverview(), fetchAuditLogs()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordAgent || !newAgentPassword) return;
    setProcessingId(`pwd_${resetPasswordAgent.agent_id}`);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/agents/${resetPasswordAgent.agent_id}/reset-password`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ newPassword: newAgentPassword })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reset password');

      soundService.playVictory();
      setSuccessMsg(`Credentials for ${resetPasswordAgent.username} updated successfully.`);
      setResetPasswordAgent(null);
      setNewAgentPassword('');
      await fetchAuditLogs();
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleViewAgentTransactions = async (agent: AgentPerformance) => {
    setProcessingId(`tx_${agent.agent_id}`);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/agents/${agent.agent_id}/transactions`), {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setInspectAgentTransactions({ agent, deposits: data.deposits || [], withdrawals: data.withdrawals || [] });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleViewAgentActivity = async (agent: AgentPerformance) => {
    setProcessingId(`act_${agent.agent_id}`);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/agents/${agent.agent_id}/activity`), {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setInspectAgentActivity({ agent, logs: data.logs || [] });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  };

  // ---------------- PAYMENT NUMBERS ACTIONS ----------------
  const handleSavePaymentAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessingId('save_payment');
    setError(null);
    try {
      const isEdit = Boolean(editingPaymentAccount);
      const url = isEdit
        ? apiUrl(`/api/super-admin/payment-accounts/${editingPaymentAccount!.id}`)
        : apiUrl('/api/super-admin/payment-accounts');
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(paymentForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save payment account');

      soundService.playVictory();
      setSuccessMsg(isEdit ? 'Payment account updated' : 'Payment account created');
      setShowAddPaymentModal(false);
      setEditingPaymentAccount(null);
      setPaymentForm({ provider: 'Telebirr', account_name: '', phone_number: '', assigned_agent_id: '', instructions: '' });
      await Promise.all([fetchPaymentAccounts(), fetchAuditLogs()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleActivatePaymentAccount = async (accId: string) => {
    setProcessingId(`act_pay_${accId}`);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/payment-accounts/${accId}/activate`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: 'Activated by Super Admin' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to activate account');

      soundService.playVictory();
      setSuccessMsg('Active Telebirr deposit number updated across platform!');
      await Promise.all([fetchPaymentAccounts(), fetchAuditLogs()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeactivatePaymentAccount = async (accId: string) => {
    setProcessingId(`deact_pay_${accId}`);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/payment-accounts/${accId}/deactivate`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: 'Deactivated by Super Admin' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to deactivate account');

      soundService.playClick();
      setSuccessMsg('Payment account deactivated');
      await Promise.all([fetchPaymentAccounts(), fetchAuditLogs()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeletePaymentAccount = async () => {
    if (!deletePaymentTarget) return;
    setProcessingId(`del_pay_${deletePaymentTarget.id}`);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/payment-accounts/${deletePaymentTarget.id}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: deletePaymentReason || 'Payment account removed' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete payment account');

      soundService.playClick();
      setSuccessMsg(data.message || 'Payment account removed');
      setDeletePaymentTarget(null);
      setDeletePaymentReason('');
      await Promise.all([fetchPaymentAccounts(), fetchAuditLogs()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // ---------------- USER ACCOUNT ACTIONS ----------------
  const handleViewUserDetail = async (userId: string) => {
    setLoadingUserDetail(true);
    setSelectedUserDetail(null);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/users/${userId}/details`), {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedUserDetail(data.details);
      } else {
        throw new Error(data.error || 'User details not found');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingUserDetail(false);
    }
  };

  const handleUpdateUserStatus = async () => {
    if (!statusChangeUserTarget) return;
    setProcessingId(`stat_usr_${statusChangeUserTarget.id}`);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/users/${statusChangeUserTarget.id}/status`), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: targetUserNewStatus, reason: userStatusReason })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update user status');

      soundService.playClick();
      setSuccessMsg(`Customer account marked as ${targetUserNewStatus}`);
      setStatusChangeUserTarget(null);
      setUserStatusReason('');
      await Promise.all([fetchUsers(), fetchOverview(), fetchAuditLogs()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setProcessingId(`del_usr_${deleteUserTarget.id}`);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/users/${deleteUserTarget.id}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: deleteUserReason || 'Customer requested closure' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete user account');

      soundService.playClick();
      setSuccessMsg(data.message || 'Customer account deleted safely');
      setDeleteUserTarget(null);
      setDeleteUserReason('');
      if (selectedUserDetail?.user?.id === deleteUserTarget.id) setSelectedUserDetail(null);
      await Promise.all([fetchUsers(), fetchOverview(), fetchAuditLogs()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // ---------------- DEPOSIT & WITHDRAWAL PROCESSING ----------------
  const handleApproveDeposit = async (dep: DepositRequest) => {
    setProcessingId(dep.id);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/staff/deposits/${dep.id}/approve`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ note: 'Approved by Super Admin' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Approval failed');

      soundService.playVictory();
      setSuccessMsg(`Deposit #${dep.id.slice(-6)} approved (+${dep.amount} ETB credited).`);
      await Promise.all([fetchDeposits(), fetchOverview(), fetchAuditLogs()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmRejection = async () => {
    if (!rejectDialog || !rejectionReason.trim()) return;
    const { type, id } = rejectDialog;
    setProcessingId(id);
    setError(null);
    try {
      const endpoint = type === 'deposit'
        ? `/api/staff/deposits/${id}/reject`
        : `/api/staff/withdrawals/${id}/reject`;

      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: rejectionReason.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Rejection failed');

      soundService.playClick();
      setSuccessMsg(`${type === 'deposit' ? 'Deposit' : 'Withdrawal'} #${id.slice(-6)} rejected.`);
      setRejectDialog(null);
      setRejectionReason('');
      if (type === 'deposit') await fetchDeposits();
      else await fetchWithdrawals();
      await Promise.all([fetchOverview(), fetchAuditLogs()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveWithdrawal = async (wth: WithdrawalRequest) => {
    setProcessingId(wth.id);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/staff/withdrawals/${wth.id}/approve`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ note: 'Approved by Super Admin' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Approval failed');

      soundService.playVictory();
      setSuccessMsg(`Withdrawal #${wth.id.slice(-6)} payout approved.`);
      await Promise.all([fetchWithdrawals(), fetchOverview(), fetchAuditLogs()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // ---------------- JACKPOT SETTINGS ----------------
  const handleSaveJackpotConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configEditForm) return;
    setProcessingId('save_jackpot_config');
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/super-admin/jackpot/config'), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(configEditForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update jackpot configuration');

      soundService.playVictory();
      setSuccessMsg('Weekend Jackpot parameters updated successfully.');
      setJackpotConfig(data.config);
      await Promise.all([fetchJackpotData(), fetchAuditLogs()]);
    } catch (err: any) {
      soundService.playError();
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Filtered lists
  const filteredAgents = agents.filter((a) => {
    const matchesSearch =
      a.username.toLowerCase().includes(agentSearchQuery.toLowerCase()) ||
      (a.phone && a.phone.includes(agentSearchQuery)) ||
      (a.telebirr_number && a.telebirr_number.includes(agentSearchQuery));
    const matchesStatus =
      agentStatusFilter === 'ALL'
        ? true
        : a.account_status === agentStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredDeposits = deposits.filter((d) => {
    const matchesFilter = depositFilter === 'ALL' || d.status === depositFilter;
    const matchesSearch =
      d.username.toLowerCase().includes(depositSearchQuery.toLowerCase()) ||
      (d.referenceId && d.referenceId.toLowerCase().includes(depositSearchQuery.toLowerCase())) ||
      (d.paymentPhone && d.paymentPhone.includes(depositSearchQuery));
    return matchesFilter && matchesSearch;
  });

  const filteredWithdrawals = withdrawals.filter((w) => {
    const matchesFilter = withdrawalFilter === 'ALL' || w.status === withdrawalFilter;
    const matchesSearch =
      w.username.toLowerCase().includes(withdrawalSearchQuery.toLowerCase()) ||
      (w.address && w.address.includes(withdrawalSearchQuery)) ||
      (w.referenceId && w.referenceId.toLowerCase().includes(withdrawalSearchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (!auditSearchQuery.trim()) return true;
    const q = auditSearchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.actor_id.toLowerCase().includes(q) ||
      (log.target_id && log.target_id.toLowerCase().includes(q)) ||
      (log.target_user_id && log.target_user_id.toLowerCase().includes(q))
    );
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#090b10] text-slate-100 flex flex-col overflow-hidden font-sans">
      {/* ──────────────── TOP CONTROL BAR ──────────────── */}
      <header className="h-14 bg-[#0d1017] border-b border-slate-800/80 px-4 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white tracking-wide">BingoBet Operations</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                SUPER ADMIN
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                LIVE SOCKET
              </span>
            </div>
          </div>
        </div>

        {/* Center Live Workload Metric Strip */}
        <div className="hidden lg:flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            <span className="text-slate-400">Pending Dep:</span>
            <span className={`font-bold ${overviewStats && overviewStats.pending_deposits > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
              {overviewStats?.pending_deposits ?? deposits.filter((d) => d.status === 'PENDING').length}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            <span className="text-slate-400">Pending Wth:</span>
            <span className={`font-bold ${overviewStats && overviewStats.pending_withdrawals > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
              {overviewStats?.pending_withdrawals ?? withdrawals.filter((w) => w.status === 'PENDING').length}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            <span className="text-slate-400">Active Agents:</span>
            <span className="font-bold text-emerald-400">
              {overviewStats?.active_agents ?? agents.filter((a) => a.account_status === 'ACTIVE').length}
            </span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { soundService.playClick(); refreshAllData(); }}
            disabled={refreshing}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700/60"
            title="Refresh All Real Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <div className="hidden sm:block text-xs font-medium text-slate-400 px-2 py-1 rounded bg-slate-900 border border-slate-800">
            {user?.username || 'Super Admin'}
          </div>

          <button
            onClick={() => { soundService.playClick(); onClose(); }}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exit Console</span>
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

      {/* Live Toast Floating Pill */}
      {liveToast && (
        <div className="absolute top-16 right-4 z-50 p-3 rounded-xl bg-slate-900/95 border border-emerald-500/40 shadow-2xl text-xs flex items-center gap-3 animate-in slide-in-from-top-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="font-bold text-white">{liveToast.title}</div>
            <div className="text-slate-300 font-mono text-[11px]">{liveToast.subtitle}</div>
          </div>
          <button onClick={() => setLiveToast(null)} className="text-slate-400 hover:text-white ml-2 text-xs">✕</button>
        </div>
      )}

      {/* ──────────────── DESKTOP SIDEBAR + CONTENT LAYOUT ──────────────── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full md:w-60 bg-[#0d1017] border-b md:border-b-0 md:border-r border-slate-800/80 flex md:flex-col overflow-x-auto md:overflow-y-auto custom-scrollbar p-2.5 gap-1 shrink-0">
          {/* Group: Core */}
          <div className="hidden md:block px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Management
          </div>
          <button
            onClick={() => { soundService.playClick(); setActiveTab('overview'); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap text-left ${
              activeTab === 'overview'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => { soundService.playClick(); setActiveTab('agents'); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-all cursor-pointer whitespace-nowrap text-left ${
              activeTab === 'agents'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4 shrink-0" />
              <span>Agents</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
              {agents.length}
            </span>
          </button>

          <button
            onClick={() => { soundService.playClick(); setActiveTab('users'); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-all cursor-pointer whitespace-nowrap text-left ${
              activeTab === 'users'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>User Accounts</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
              {overviewStats?.total_users ?? usersList.length}
            </span>
          </button>

          {/* Group: Finance */}
          <div className="hidden md:block px-3 pt-4 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Finance & Payments
          </div>
          <button
            onClick={() => { soundService.playClick(); setActiveTab('finance_deposits'); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-all cursor-pointer whitespace-nowrap text-left ${
              activeTab === 'finance_deposits'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ArrowDownToLine className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Deposits</span>
            </div>
            {deposits.filter((d) => d.status === 'PENDING').length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/30 text-emerald-300 font-bold">
                {deposits.filter((d) => d.status === 'PENDING').length}
              </span>
            )}
          </button>

          <button
            onClick={() => { soundService.playClick(); setActiveTab('finance_withdrawals'); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-all cursor-pointer whitespace-nowrap text-left ${
              activeTab === 'finance_withdrawals'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ArrowUpFromLine className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Withdrawals</span>
            </div>
            {withdrawals.filter((w) => w.status === 'PENDING').length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/30 text-amber-300 font-bold">
                {withdrawals.filter((w) => w.status === 'PENDING').length}
              </span>
            )}
          </button>

          <button
            onClick={() => { soundService.playClick(); setActiveTab('finance_payment_numbers'); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-all cursor-pointer whitespace-nowrap text-left ${
              activeTab === 'finance_payment_numbers'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CreditCard className="w-4 h-4 shrink-0 text-cyan-400" />
              <span>Payment Numbers</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
              {paymentAccounts.length}
            </span>
          </button>

          <button
            onClick={() => { soundService.playClick(); setActiveTab('finance_reconciliation'); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap text-left ${
              activeTab === 'finance_reconciliation'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <Receipt className="w-4 h-4 shrink-0 text-indigo-400" />
            <span>Reconciliation</span>
          </button>

          {/* Group: Jackpot */}
          <div className="hidden md:block px-3 pt-4 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Jackpot Governance
          </div>
          <button
            onClick={() => { soundService.playClick(); setActiveTab('weekend_jackpot'); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap text-left ${
              activeTab === 'weekend_jackpot'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4 shrink-0 text-yellow-400" />
            <span>Weekend Jackpot</span>
          </button>

          <button
            onClick={() => { soundService.playClick(); setActiveTab('weekend_jackpot_players'); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap text-left ${
              activeTab === 'weekend_jackpot_players'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 shrink-0 text-yellow-300" />
            <span>Jackpot Players</span>
          </button>

          <button
            onClick={() => { soundService.playClick(); setActiveTab('weekend_jackpot_settings'); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap text-left ${
              activeTab === 'weekend_jackpot_settings'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4 shrink-0 text-slate-400" />
            <span>Jackpot Rules</span>
          </button>

          {/* Group: Audit */}
          <div className="hidden md:block px-3 pt-4 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Compliance
          </div>
          <button
            onClick={() => { soundService.playClick(); setActiveTab('audit_logs'); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-all cursor-pointer whitespace-nowrap text-left ${
              activeTab === 'audit_logs'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0 text-slate-400" />
            <span>Audit Trail</span>
          </button>
        </aside>

        {/* ──────────────── MAIN CONTENT PANE ──────────────── */}
        <main className="flex-1 bg-[#090b10] overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Financial Summary Strip */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  Financial Workload & Settlement
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">Pending Deposits</span>
                    <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
                      {overviewStats?.pending_deposits ?? deposits.filter((d) => d.status === 'PENDING').length}
                    </span>
                    <span className="text-[10px] text-slate-400">Awaiting Agent review</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">Pending Withdrawals</span>
                    <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">
                      {overviewStats?.pending_withdrawals ?? withdrawals.filter((w) => w.status === 'PENDING').length}
                    </span>
                    <span className="text-[10px] text-slate-400">Awaiting payout confirmation</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">Today's Inflow</span>
                    <span className="text-xl font-bold font-mono text-white mt-1 block">
                      {((overviewStats?.today_deposited_amount ?? 0)).toLocaleString()} ETB
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {overviewStats?.today_approved_deposits ?? 0} approved deposits
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">Today's Outflow</span>
                    <span className="text-xl font-bold font-mono text-white mt-1 block">
                      {((overviewStats?.today_withdrawn_amount ?? 0)).toLocaleString()} ETB
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {overviewStats?.today_completed_withdrawals ?? 0} completed payouts
                    </span>
                  </div>
                </div>
              </div>

              {/* Operations Metrics */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  Platform Operations
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">Active Agents</span>
                    <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
                      {overviewStats?.active_agents ?? agents.filter((a) => a.account_status === 'ACTIVE').length}
                    </span>
                    <span className="text-[10px] text-slate-400">Processing live requests</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">Total Customers</span>
                    <span className="text-xl font-bold font-mono text-white mt-1 block">
                      {overviewStats?.total_users ?? usersList.length}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      +{overviewStats?.new_users_today ?? 0} registered today
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">Jackpot Players Today</span>
                    <span className="text-xl font-bold font-mono text-yellow-400 mt-1 block">
                      {overviewStats?.current_jackpot_players ?? 0}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {overviewStats?.current_jackpot_cards_sold ?? 0} cards purchased
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">Active Telebirr Account</span>
                    <span className="text-base font-bold font-mono text-cyan-400 mt-1.5 block truncate">
                      {paymentAccounts.find((p) => p.active)?.phone_number || 'None Active'}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate block">
                      {paymentAccounts.find((p) => p.active)?.account_name || 'Set primary number'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recent Operational Audit Feed */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Recent Real Platform Events
                  </h3>
                  <button
                    onClick={() => setActiveTab('audit_logs')}
                    className="text-xs text-emerald-400 hover:underline cursor-pointer"
                  >
                    View All Audit Logs →
                  </button>
                </div>
                <div className="border border-slate-800 rounded-xl bg-slate-950/80 overflow-hidden">
                  {auditLogs.slice(0, 8).map((log) => (
                    <div
                      key={log.id}
                      className="px-4 py-2.5 border-b border-slate-800/60 last:border-b-0 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 font-mono text-[11px]">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-800 text-slate-200">
                          {log.action}
                        </span>
                        <span className="text-slate-300">
                          Actor: <strong className="text-white">{log.actor_id}</strong>
                        </span>
                        {log.metadata?.reason && (
                          <span className="text-slate-400 text-[11px] truncate max-w-xs">
                            ({log.metadata.reason})
                          </span>
                        )}
                      </div>
                      <span className="text-slate-400 font-mono text-[10px]">
                        {new Date(log.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                  {auditLogs.length === 0 && (
                    <div className="p-6 text-center text-slate-400 text-xs">No audit events recorded yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: AGENTS MANAGEMENT */}
          {activeTab === 'agents' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={agentSearchQuery}
                      onChange={(e) => setAgentSearchQuery(e.target.value)}
                      placeholder="Search username, phone..."
                      className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 w-52"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {(['ALL', 'ACTIVE', 'SUSPENDED', 'DELETED'] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setAgentStatusFilter(st)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                          agentStatusFilter === st
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                            : 'text-slate-400 hover:text-white bg-slate-800/60'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setEditingAgent(null);
                    setAgentForm({ username: '', phone: '', password: '', telebirr_number: '', assigned_agent_name: '', role: 'AGENT' });
                    setShowAddAgentModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Create Agent</span>
                </button>
              </div>

              {/* High Density Agent Table */}
              <div className="border border-slate-800 rounded-xl bg-slate-950/80 overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Agent</th>
                      <th className="py-2.5 px-3">Phone</th>
                      <th className="py-2.5 px-3">Telebirr Account</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Processed (Dep/Wth)</th>
                      <th className="py-2.5 px-3 text-right">Volume Processed</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredAgents.map((ag) => (
                      <tr key={ag.agent_id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-white">{ag.username}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {ag.assigned_agent_name || ag.username}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">{ag.phone || '—'}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">{ag.telebirr_number || '—'}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              ag.account_status === 'ACTIVE'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : ag.account_status === 'SUSPENDED'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {ag.account_status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span className="text-emerald-400">{ag.deposits_processed || 0}</span> /{' '}
                          <span className="text-amber-400">{ag.withdrawals_processed || 0}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                          {((ag.deposit_amount || 0) + (ag.withdrawal_amount || 0)).toLocaleString()} ETB
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleViewAgentTransactions(ag)}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                              title="View Processed Transactions"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleViewAgentActivity(ag)}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                              title="View Activity Audit Log"
                            >
                              <Activity className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                setEditingAgent(ag);
                                setAgentForm({
                                  username: ag.username,
                                  phone: ag.phone || '',
                                  password: '',
                                  telebirr_number: ag.telebirr_number || '',
                                  assigned_agent_name: ag.assigned_agent_name || '',
                                  role: 'AGENT'
                                });
                                setShowAddAgentModal(true);
                              }}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                              title="Edit Agent Details"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                setResetPasswordAgent(ag);
                                setNewAgentPassword('');
                              }}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300"
                              title="Reset Credentials"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>

                            {ag.account_status !== 'DELETED' ? (
                              <>
                                <button
                                  onClick={() => handleToggleAgentStatus(ag)}
                                  className={`p-1 rounded ${
                                    ag.account_status === 'ACTIVE'
                                      ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
                                      : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                                  }`}
                                  title={ag.account_status === 'ACTIVE' ? 'Suspend Agent' : 'Activate Agent'}
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => {
                                    setDeleteAgentTarget(ag);
                                    setDeleteAgentReason('');
                                  }}
                                  className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold"
                                  title="Delete Agent"
                                >
                                  Delete Agent
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleRestoreAgent(ag.agent_id)}
                                className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold"
                                title="Restore Agent"
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredAgents.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No agent accounts match the specified criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: PAYMENT NUMBERS (FULL CRUD) */}
          {activeTab === 'finance_payment_numbers' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Telebirr Payment Accounts</h4>
                  <p className="text-[11px] text-slate-400">
                    Manage active deposit receiver accounts. Past transactions retain the exact account used at payment time.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingPaymentAccount(null);
                    setPaymentForm({
                      provider: 'Telebirr',
                      account_name: '',
                      phone_number: '',
                      assigned_agent_id: '',
                      instructions: 'Send deposit via Telebirr and enter transaction reference below.'
                    });
                    setShowAddPaymentModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Payment Number</span>
                </button>
              </div>

              {/* Payment Accounts Table */}
              <div className="border border-slate-800 rounded-xl bg-slate-950/80 overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Provider</th>
                      <th className="py-2.5 px-3">Account Name</th>
                      <th className="py-2.5 px-3">Phone / Account No</th>
                      <th className="py-2.5 px-3">Assigned Agent</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Created / Updated</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {paymentAccounts.map((acc) => {
                      const isActive = Boolean(acc.active);
                      return (
                        <tr key={acc.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-white">{acc.provider}</td>
                          <td className="py-2.5 px-3 text-slate-200">{acc.account_name}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">{acc.phone_number}</td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {acc.assigned_agent_name ? (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]">
                                {acc.assigned_agent_name}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {isActive ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                ACTIVE PRIMARY
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">
                                INACTIVE
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 font-mono text-[10px]">
                            {acc.created_at ? new Date(acc.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              {!isActive && (
                                <button
                                  onClick={() => handleActivatePaymentAccount(acc.id)}
                                  disabled={Boolean(processingId)}
                                  className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold cursor-pointer"
                                >
                                  Set Active
                                </button>
                              )}

                              {isActive && (
                                <button
                                  onClick={() => handleDeactivatePaymentAccount(acc.id)}
                                  disabled={Boolean(processingId)}
                                  className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-semibold cursor-pointer"
                                >
                                  Deactivate
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setEditingPaymentAccount(acc);
                                  setPaymentForm({
                                    provider: acc.provider || 'Telebirr',
                                    account_name: acc.account_name,
                                    phone_number: acc.phone_number,
                                    assigned_agent_id: acc.assigned_agent_id || '',
                                    instructions: acc.instructions || ''
                                  });
                                  setShowAddPaymentModal(true);
                                }}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => {
                                  setDeletePaymentTarget(acc);
                                  setDeletePaymentReason('');
                                }}
                                className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Payment Account Change Audit Trail */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Payment Number Audit Logs
                </h4>
                <div className="border border-slate-800 rounded-xl bg-slate-950/80 overflow-hidden text-xs">
                  {paymentLogs.slice(0, 10).map((log) => (
                    <div
                      key={log.id}
                      className="px-4 py-2 border-b border-slate-800/60 last:border-b-0 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-400 text-[11px]">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                        <span className="font-semibold text-slate-200">{log.action}</span>
                        {log.old_number && log.new_number && (
                          <span className="font-mono text-slate-300">
                            {log.old_number} → <strong className="text-emerald-400">{log.new_number}</strong>
                          </span>
                        )}
                        {log.note && <span className="text-slate-400 italic">({log.note})</span>}
                      </div>
                      <span className="text-slate-400 text-[11px]">Admin: {log.changed_by}</span>
                    </div>
                  ))}
                  {paymentLogs.length === 0 && (
                    <div className="p-4 text-center text-slate-400 text-xs">No payment account changes logged yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: USER ACCOUNT MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <div className="relative w-full">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder="Search by Username, Phone number, or User ID..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  {userSearchQuery && (
                    <button
                      onClick={() => setUserSearchQuery('')}
                      className="text-xs text-slate-400 hover:text-white px-2 py-1"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="text-xs text-slate-400 font-mono">
                  Showing {usersList.length} matching customers
                </div>
              </div>

              {/* Users Table */}
              <div className="border border-slate-800 rounded-xl bg-slate-950/80 overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Phone</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Balance</th>
                      <th className="py-2.5 px-3 text-right">Deposits</th>
                      <th className="py-2.5 px-3 text-right">Withdrawals</th>
                      <th className="py-2.5 px-3 text-center">Bingo / Jackpot</th>
                      <th className="py-2.5 px-3">Registered</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-white">{u.username}</div>
                          <div className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">{u.id}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">{u.phone || '—'}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.account_status === 'ACTIVE'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : u.account_status === 'SUSPENDED'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {u.account_status || 'ACTIVE'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                          {((u.balance ?? 0)).toLocaleString()} ETB
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                          {((u.total_deposited ?? 0)).toLocaleString()} ETB
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                          {((u.total_withdrawn ?? 0)).toLocaleString()} ETB
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-300">
                          <span>{u.bingo_tickets_count || 0}</span> / <span>{u.jackpot_tickets_count || 0}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[10px] font-mono">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleViewUserDetail(u.id)}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1"
                              title="Inspect Full Customer Profile & Records"
                            >
                              <Eye className="w-3 h-3 text-emerald-400" />
                              <span>Profile</span>
                            </button>

                            <button
                              onClick={() => {
                                setStatusChangeUserTarget(u);
                                setTargetUserNewStatus(u.account_status || 'ACTIVE');
                                setUserStatusReason('');
                              }}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                              title="Update Status"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>

                            <button
                              onClick={() => {
                                setDeleteUserTarget(u);
                                setDeleteUserReason('');
                              }}
                              className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold"
                              title="Delete Account"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {usersList.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          No users found matching query.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: DEPOSITS DESK */}
          {activeTab === 'finance_deposits' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={depositSearchQuery}
                      onChange={(e) => setDepositSearchQuery(e.target.value)}
                      placeholder="Search ref ID, user, phone..."
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
              <div className="border border-slate-800 rounded-xl bg-slate-950/80 overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Deposit ID</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Ref ID / Tx Code</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Destination Telebirr</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Submitted</th>
                      <th className="py-2.5 px-3">Processed By</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredDeposits.map((dep) => (
                      <tr key={dep.id} className="hover:bg-slate-900/40 transition-colors">
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
                              title="Copy Ref"
                            >
                              {copiedText === dep.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400 text-sm">
                          +{dep.amount.toLocaleString()} ETB
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">{dep.paymentPhone || 'Primary Telebirr'}</td>
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
                              <button
                                onClick={() => handleApproveDeposit(dep)}
                                disabled={Boolean(processingId)}
                                className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] cursor-pointer shadow-sm"
                              >
                                Approve
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
                            <span className="text-slate-400 text-[11px] italic">Settled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredDeposits.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          No deposit records match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: WITHDRAWALS DESK */}
          {activeTab === 'finance_withdrawals' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={withdrawalSearchQuery}
                      onChange={(e) => setWithdrawalSearchQuery(e.target.value)}
                      placeholder="Search phone, user, ref..."
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
              <div className="border border-slate-800 rounded-xl bg-slate-950/80 overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Withdrawal ID</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Payout Destination Phone</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Requested At</th>
                      <th className="py-2.5 px-3">Processed By</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredWithdrawals.map((wth) => (
                      <tr key={wth.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">{wth.id.slice(-8)}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-white">{wth.username}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{wth.customerPhone || ''}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-amber-300">{wth.address}</td>
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
                              <button
                                onClick={() => handleApproveWithdrawal(wth)}
                                disabled={Boolean(processingId)}
                                className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] cursor-pointer shadow-sm"
                              >
                                Approve Payout
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
                            <span className="text-slate-400 text-[11px] italic">Settled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredWithdrawals.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          No withdrawal records match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: RECONCILIATION */}
          {activeTab === 'finance_reconciliation' && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                  Financial Settlement & Reconciliation Audit
                </h4>
                <p className="text-[11px] text-slate-400">
                  Total ledger transactions vs payment gateway requests. All transaction records are cross-checked for idempotency.
                </p>
                {reconciliation && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase">Settled Volume</span>
                      <span className="text-base font-bold font-mono text-emerald-400 mt-0.5 block">
                        {reconciliation.summary.approved_amount.toLocaleString()} ETB
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase">Approved Counts</span>
                      <span className="text-base font-bold font-mono text-white mt-0.5 block">
                        {reconciliation.summary.approved_count} txs
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase">Rejected Volume</span>
                      <span className="text-base font-bold font-mono text-rose-400 mt-0.5 block">
                        {reconciliation.summary.rejected_amount.toLocaleString()} ETB
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase">Discrepancies</span>
                      <span className={`text-base font-bold font-mono mt-0.5 block ${reconciliation.summary.discrepancy_count > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {reconciliation.summary.discrepancy_count} detected
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Transactions List */}
              <div className="border border-slate-800 rounded-xl bg-slate-950/80 overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Transaction ID</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Ref ID</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Agent</th>
                      <th className="py-2.5 px-3">Discrepancy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {reconciliation?.transactions.slice(0, 50).map((t) => (
                      <tr key={t.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.type === 'DEPOSIT' ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'
                            }`}
                          >
                            {t.type}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">{t.id.slice(-8)}</td>
                        <td className="py-2 px-3 text-slate-200">{t.username}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-white">
                          {t.amount.toLocaleString()} ETB
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-300">{t.reference_id || '—'}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.status === 'APPROVED' ? 'text-emerald-300' : t.status === 'REJECTED' ? 'text-rose-300' : 'text-amber-300'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{t.processed_by || '—'}</td>
                        <td className="py-2 px-3">
                          {t.has_discrepancy ? (
                            <span className="text-rose-400 text-[10px] font-semibold">⚠️ {t.discrepancy_note}</span>
                          ) : (
                            <span className="text-emerald-400 text-[10px]">Verified Clean</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: WEEKEND JACKPOT GOVERNANCE */}
          {activeTab === 'weekend_jackpot' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">Current Round</span>
                  <span className="text-base font-bold font-mono text-yellow-400 mt-1 block">
                    {currentRoundState?.roundId || 'daily-jackpot-current'}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    Status: <strong className="text-emerald-400">{currentRoundState?.status || 'ACTIVE'}</strong>
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">Current Prize Pool</span>
                  <span className="text-xl font-bold font-mono text-yellow-400 mt-1 block">
                    {((currentRoundState?.prizePool ?? jackpotConfig?.card_price ?? 0)).toLocaleString()} ETB
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    {currentRoundState?.cardsSold ?? 0} cards purchased
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-semibold">Schedule</span>
                    <span className="text-xs font-bold text-white mt-1 block">
                      Every {jackpotConfig?.day_of_week || 'Sunday'} at {jackpotConfig?.start_time || '20:00'}
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveTab('weekend_jackpot_settings')}
                    className="text-xs text-yellow-400 hover:underline text-left cursor-pointer mt-2"
                  >
                    Edit jackpot schedule & card price →
                  </button>
                </div>
              </div>

              {/* Rounds Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Jackpot Round History
                </h4>
                <div className="border border-slate-800 rounded-xl bg-slate-950/80 overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Round ID</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3 text-right">Cards Sold</th>
                        <th className="py-2.5 px-3 text-right">Prize Pool</th>
                        <th className="py-2.5 px-3">Winner</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-center">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {jackpotHistory.map((r) => (
                        <tr key={r.round_id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="py-2 px-3 font-mono font-bold text-white">{r.round_id}</td>
                          <td className="py-2 px-3 text-slate-300 font-mono text-[11px]">{r.date}</td>
                          <td className="py-2 px-3 text-right font-mono text-slate-200">{r.cards_sold}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-yellow-400">
                            {r.prize_pool.toLocaleString()} ETB
                          </td>
                          <td className="py-2 px-3">
                            {r.winner_username ? (
                              <span className="font-semibold text-emerald-400">
                                👑 {r.winner_username} (#{r.winner_card_number})
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">No winner yet</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                r.status === 'COMPLETED' ? 'text-emerald-300 bg-emerald-500/10' : 'text-yellow-300 bg-yellow-500/10'
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => {
                                fetchJackpotPlayers(r.round_id);
                                setActiveTab('weekend_jackpot_players');
                              }}
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
                            >
                              View Real Players
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: JACKPOT PLAYERS (REAL DATA ONLY) */}
          {activeTab === 'weekend_jackpot_players' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Participating Players: {selectedRoundId || currentRoundState?.roundId || 'Current Round'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Real players only. Every ticket shown is verified against the database ledger.
                  </p>
                </div>
                <button
                  onClick={() => fetchJackpotPlayers(selectedRoundId || currentRoundState?.roundId || 'daily-jackpot-current')}
                  disabled={loadingPlayers}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  {loadingPlayers ? 'Refreshing...' : 'Refresh Participants'}
                </button>
              </div>

              <div className="border border-slate-800 rounded-xl bg-slate-950/80 overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Player</th>
                      <th className="py-2.5 px-3">Phone</th>
                      <th className="py-2.5 px-3 text-right">Cards Purchased</th>
                      <th className="py-2.5 px-3 text-right">Total Spent</th>
                      <th className="py-2.5 px-3">Card Numbers</th>
                      <th className="py-2.5 px-3">First Purchase</th>
                      <th className="py-2.5 px-3">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {jackpotPlayers.map((p) => (
                      <tr key={p.user_id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2 px-3">
                          <div className="font-semibold text-white">{p.username}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{p.user_id}</div>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-300">{p.phone || '—'}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-white">{p.cards_count}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-yellow-400">
                          {p.total_spent.toLocaleString()} ETB
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-300">
                          {p.card_numbers ? p.card_numbers.join(', ') : '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-400 font-mono text-[10px]">
                          {new Date(p.first_purchase_at).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-3">
                          {p.is_winner ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              👑 WINNER
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Participant</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {jackpotPlayers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No real players have purchased tickets for this round yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: JACKPOT SETTINGS */}
          {activeTab === 'weekend_jackpot_settings' && (
            <div className="max-w-xl space-y-4">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">
                  Jackpot Configuration Parameters
                </h4>
                {configEditForm && (
                  <form onSubmit={handleSaveJackpotConfig} className="space-y-3.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-medium text-slate-400 block mb-1">Draw Day</label>
                        <select
                          value={configEditForm.day_of_week}
                          onChange={(e) => setConfigEditForm({ ...configEditForm, day_of_week: e.target.value })}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                        >
                          <option value="Friday">Friday</option>
                          <option value="Saturday">Saturday</option>
                          <option value="Sunday">Sunday</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-slate-400 block mb-1">Start Time (EAT)</label>
                        <input
                          type="time"
                          value={configEditForm.start_time}
                          onChange={(e) => setConfigEditForm({ ...configEditForm, start_time: e.target.value })}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] font-medium text-slate-400 block mb-1">Card Price (ETB)</label>
                        <input
                          type="number"
                          value={configEditForm.card_price}
                          onChange={(e) => setConfigEditForm({ ...configEditForm, card_price: Number(e.target.value) })}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                          min={1}
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-slate-400 block mb-1">Min Cards</label>
                        <input
                          type="number"
                          value={configEditForm.min_cards}
                          onChange={(e) => setConfigEditForm({ ...configEditForm, min_cards: Number(e.target.value) })}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                          min={1}
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-slate-400 block mb-1">Max Cards / Player</label>
                        <input
                          type="number"
                          value={configEditForm.max_cards}
                          onChange={(e) => setConfigEditForm({ ...configEditForm, max_cards: Number(e.target.value) })}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                          min={1}
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={Boolean(processingId)}
                        className="px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold text-xs cursor-pointer shadow-sm"
                      >
                        Save Jackpot Parameters
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB: AUDIT LOGS */}
          {activeTab === 'audit_logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    placeholder="Filter by action or actor..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  {filteredAuditLogs.length} audit records
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl bg-slate-950/80 overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Actor (Role)</th>
                      <th className="py-2.5 px-3">Target ID</th>
                      <th className="py-2.5 px-3">Metadata / Details</th>
                      <th className="py-2.5 px-3">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2 px-3 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-800 text-slate-200">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-200 font-medium">
                          {log.actor_id}{' '}
                          <span className="text-[10px] text-slate-400 font-mono">({log.actor_role})</span>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">
                          {log.target_id || log.target_user_id || '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-300 font-mono text-[10px] max-w-xs truncate">
                          {log.metadata ? JSON.stringify(log.metadata) : '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-400 font-mono text-[10px]">
                          {log.ip_address || '—'}
                        </td>
                      </tr>
                    ))}
                    {filteredAuditLogs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No audit records found matching query.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ──────────────── MODALS & CONFIRMATION DIALOGS ──────────────── */}

      {/* 1. Add / Edit Agent Modal */}
      {showAddAgentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {editingAgent ? 'Edit Agent Profile' : 'Create New Agent Account'}
              </h3>
              <button
                onClick={() => { setShowAddAgentModal(false); setEditingAgent(null); }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAgent} className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Username *</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingAgent)}
                  value={agentForm.username}
                  onChange={(e) => setAgentForm({ ...agentForm, username: e.target.value })}
                  placeholder="e.g. AbebeAgent"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Display Name</label>
                <input
                  type="text"
                  value={agentForm.assigned_agent_name}
                  onChange={(e) => setAgentForm({ ...agentForm, assigned_agent_name: e.target.value })}
                  placeholder="e.g. Abebe Kebede"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Agent Phone Number</label>
                <input
                  type="text"
                  value={agentForm.phone}
                  onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })}
                  placeholder="e.g. +251911223344"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Assigned Telebirr Number</label>
                <input
                  type="text"
                  value={agentForm.telebirr_number}
                  onChange={(e) => setAgentForm({ ...agentForm, telebirr_number: e.target.value })}
                  placeholder="e.g. 0911223344"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                />
              </div>

              {!editingAgent && (
                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Temporary Password *</label>
                  <input
                    type="password"
                    required
                    value={agentForm.password}
                    onChange={(e) => setAgentForm({ ...agentForm, password: e.target.value })}
                    placeholder="Min 6 characters"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                  />
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowAddAgentModal(false); setEditingAgent(null); }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(processingId)}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                >
                  {editingAgent ? 'Save Changes' : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Delete Agent Safe Confirmation Modal */}
      {deleteAgentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Delete Agent Account?
              </h3>
            </div>

            <div className="text-xs text-slate-300 space-y-2">
              <p>
                Target Agent: <strong className="text-white font-mono">{deleteAgentTarget.username}</strong>
              </p>
              <p className="text-rose-300/90 font-medium">
                This agent will immediately lose dashboard access and will no longer be able to log in or process transactions.
              </p>
              {((deleteAgentTarget.deposits_processed || 0) + (deleteAgentTarget.withdrawals_processed || 0)) > 0 ? (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                  <Info className="w-3.5 h-3.5 text-cyan-400 inline mr-1" />
                  <strong>Financial History Safe Guard:</strong> This agent has processed{' '}
                  <span className="text-emerald-400 font-mono font-bold">
                    {(deleteAgentTarget.deposits_processed || 0) + (deleteAgentTarget.withdrawals_processed || 0)}
                  </span>{' '}
                  financial transactions. The account will be <strong>archived and deactivated</strong>. All transaction links and audit trails remain permanently preserved.
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                  This agent has no processed financial transactions and will be permanently removed.
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">Reason for Deletion</label>
              <input
                type="text"
                value={deleteAgentReason}
                onChange={(e) => setDeleteAgentReason(e.target.value)}
                placeholder="e.g. Staff departure, role rotation..."
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteAgentTarget(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAgent}
                disabled={Boolean(processingId)}
                className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs"
              >
                Confirm Delete Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Reset Agent Password Modal */}
      {resetPasswordAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Reset Credentials for {resetPasswordAgent.username}
              </h3>
              <button onClick={() => setResetPasswordAgent(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">New Password *</label>
                <input
                  type="password"
                  required
                  value={newAgentPassword}
                  onChange={(e) => setNewAgentPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setResetPasswordAgent(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(processingId)}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  Update Credentials
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Agent Transactions Drawer */}
      {inspectAgentTransactions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Transactions Processed by {inspectAgentTransactions.agent.username}
                </h3>
                <span className="text-[11px] text-slate-400">
                  {inspectAgentTransactions.deposits.length} deposits • {inspectAgentTransactions.withdrawals.length} withdrawals
                </span>
              </div>
              <button onClick={() => setInspectAgentTransactions(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-xs">
              <div>
                <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2">Deposits</h4>
                <div className="space-y-1.5">
                  {inspectAgentTransactions.deposits.map((d: any) => (
                    <div key={d.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-white">{d.username}</span>
                        <span className="text-[10px] text-slate-400 font-mono ml-2">Ref: {d.reference_id || 'N/A'}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-emerald-400">+{d.amount} ETB</span>
                        <span className="text-[10px] text-slate-400 block">{d.status}</span>
                      </div>
                    </div>
                  ))}
                  {inspectAgentTransactions.deposits.length === 0 && (
                    <div className="text-slate-400 italic">No deposits processed by this agent.</div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-2">Withdrawals</h4>
                <div className="space-y-1.5">
                  {inspectAgentTransactions.withdrawals.map((w: any) => (
                    <div key={w.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-white">{w.username}</span>
                        <span className="text-[10px] text-slate-400 font-mono ml-2">Dest: {w.address}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-amber-400">-{w.amount} ETB</span>
                        <span className="text-[10px] text-slate-400 block">{w.status}</span>
                      </div>
                    </div>
                  ))}
                  {inspectAgentTransactions.withdrawals.length === 0 && (
                    <div className="text-slate-400 italic">No withdrawals processed by this agent.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Agent Activity Audit Drawer */}
      {inspectAgentActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Audit Activity: {inspectAgentActivity.agent.username}
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">
                  {inspectAgentActivity.logs.length} logged events
                </span>
              </div>
              <button onClick={() => setInspectAgentActivity(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar text-xs">
              {inspectAgentActivity.logs.map((log: any) => (
                <div key={log.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-emerald-300 mr-2">{log.action}</span>
                    <span className="text-slate-400 text-[11px]">{log.target_id || ''}</span>
                    {log.metadata?.reason && (
                      <div className="text-[11px] text-slate-300 mt-0.5">Note: {log.metadata.reason}</div>
                    )}
                  </div>
                  <span className="text-slate-400 font-mono text-[10px] whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
              {inspectAgentActivity.logs.length === 0 && (
                <div className="p-4 text-center text-slate-400">No activity recorded for this agent.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Add / Edit Payment Account Modal */}
      {showAddPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {editingPaymentAccount ? 'Edit Payment Account' : 'Add Telebirr Payment Number'}
              </h3>
              <button
                onClick={() => { setShowAddPaymentModal(false); setEditingPaymentAccount(null); }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePaymentAccount} className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Provider *</label>
                <input
                  type="text"
                  required
                  value={paymentForm.provider}
                  onChange={(e) => setPaymentForm({ ...paymentForm, provider: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Account Holder Name *</label>
                <input
                  type="text"
                  required
                  value={paymentForm.account_name}
                  onChange={(e) => setPaymentForm({ ...paymentForm, account_name: e.target.value })}
                  placeholder="e.g. Bingo Platform Ops"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Phone Number / Account *</label>
                <input
                  type="text"
                  required
                  value={paymentForm.phone_number}
                  onChange={(e) => setPaymentForm({ ...paymentForm, phone_number: e.target.value })}
                  placeholder="e.g. 0911223344"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Assigned Agent (Optional)</label>
                <select
                  value={paymentForm.assigned_agent_id}
                  onChange={(e) => setPaymentForm({ ...paymentForm, assigned_agent_id: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                >
                  <option value="">None (Platform-wide)</option>
                  {agents.map((ag) => (
                    <option key={ag.agent_id} value={ag.agent_id}>
                      {ag.username} ({ag.phone || 'No phone'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Deposit Instructions</label>
                <textarea
                  value={paymentForm.instructions}
                  onChange={(e) => setPaymentForm({ ...paymentForm, instructions: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowAddPaymentModal(false); setEditingPaymentAccount(null); }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(processingId)}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                >
                  {editingPaymentAccount ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Delete Payment Account Safe Dialog */}
      {deletePaymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Delete Payment Account?
              </h3>
            </div>

            <div className="text-xs text-slate-300 space-y-2">
              <p>
                Account: <strong className="text-white font-mono">{deletePaymentTarget.phone_number}</strong> ({deletePaymentTarget.account_name})
              </p>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                <Info className="w-3.5 h-3.5 text-cyan-400 inline mr-1" />
                <strong>Historical Integrity Notice:</strong> If this number was used in previous customer deposits, it will be <strong>safely archived</strong>. Previous deposits will continue to display this exact number in their audit receipts.
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">Reason for Removal</label>
              <input
                type="text"
                value={deletePaymentReason}
                onChange={(e) => setDeletePaymentReason(e.target.value)}
                placeholder="e.g. Account retired, replacement SIM..."
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletePaymentTarget(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePaymentAccount}
                disabled={Boolean(processingId)}
                className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Customer Profile Detailed History Drawer */}
      {selectedUserDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">{selectedUserDetail.user.username}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {selectedUserDetail.user.account_status || 'ACTIVE'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">User ID: {selectedUserDetail.user.id}</span>
              </div>
              <button onClick={() => setSelectedUserDetail(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-xs">
              {/* Financial Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">Wallet Balance</span>
                  <span className="text-lg font-mono font-bold text-emerald-400 mt-0.5 block">
                    {selectedUserDetail.user.balance.toLocaleString()} ETB
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">Total Deposited</span>
                  <span className="text-base font-mono font-bold text-white mt-0.5 block">
                    {selectedUserDetail.stats.total_deposited.toLocaleString()} ETB
                  </span>
                  <span className="text-[10px] text-slate-400">{selectedUserDetail.stats.deposit_count} deposits</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">Total Withdrawn</span>
                  <span className="text-base font-mono font-bold text-white mt-0.5 block">
                    {selectedUserDetail.stats.total_withdrawn.toLocaleString()} ETB
                  </span>
                  <span className="text-[10px] text-slate-400">{selectedUserDetail.stats.withdrawal_count} payouts</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">Bingo / Jackpot</span>
                  <span className="text-base font-mono font-bold text-yellow-400 mt-0.5 block">
                    {selectedUserDetail.stats.bingo_tickets_count} / {selectedUserDetail.stats.jackpot_tickets_count}
                  </span>
                  <span className="text-[10px] text-slate-400">Wins: {selectedUserDetail.stats.wins_count || 0}</span>
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
                        <th className="py-2 px-3">Agent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {selectedUserDetail.deposits.map((d: any) => (
                        <tr key={d.id}>
                          <td className="py-1.5 px-3 font-mono text-[10px] text-slate-400">{new Date(d.created_at).toLocaleString()}</td>
                          <td className="py-1.5 px-3 font-mono font-bold text-emerald-400">+{d.amount} ETB</td>
                          <td className="py-1.5 px-3 font-mono text-slate-300">{d.reference_id || '—'}</td>
                          <td className="py-1.5 px-3 font-semibold text-[10px]">{d.status}</td>
                          <td className="py-1.5 px-3 font-mono text-[10px] text-slate-400">{d.processed_by || '—'}</td>
                        </tr>
                      ))}
                      {selectedUserDetail.deposits.length === 0 && (
                        <tr><td colSpan={5} className="py-3 text-center text-slate-400">No deposits recorded.</td></tr>
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
                        <th className="py-2 px-3">Destination</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Agent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {selectedUserDetail.withdrawals.map((w: any) => (
                        <tr key={w.id}>
                          <td className="py-1.5 px-3 font-mono text-[10px] text-slate-400">{new Date(w.created_at).toLocaleString()}</td>
                          <td className="py-1.5 px-3 font-mono font-bold text-amber-400">-{w.amount} ETB</td>
                          <td className="py-1.5 px-3 font-mono text-slate-300">{w.address}</td>
                          <td className="py-1.5 px-3 font-semibold text-[10px]">{w.status}</td>
                          <td className="py-1.5 px-3 font-mono text-[10px] text-slate-400">{w.processed_by || '—'}</td>
                        </tr>
                      ))}
                      {selectedUserDetail.withdrawals.length === 0 && (
                        <tr><td colSpan={5} className="py-3 text-center text-slate-400">No withdrawals recorded.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ledger Transactions */}
              <div>
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Recent Ledger Audit Transactions</h4>
                <div className="border border-slate-800 rounded-xl bg-slate-950 overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                        <th className="py-2 px-3 text-right">Balance After</th>
                        <th className="py-2 px-3">Reference / Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {selectedUserDetail.recentTransactions.map((tx: any) => (
                        <tr key={tx.id}>
                          <td className="py-1.5 px-3 font-mono text-[10px] text-slate-400">{new Date(tx.created_at).toLocaleString()}</td>
                          <td className="py-1.5 px-3 font-mono font-bold text-[10px]">{tx.type}</td>
                          <td className={`py-1.5 px-3 text-right font-mono font-bold ${tx.amount >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {tx.amount > 0 ? `+${tx.amount}` : tx.amount} ETB
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono text-slate-200">{tx.balance_after} ETB</td>
                          <td className="py-1.5 px-3 text-slate-400 font-mono text-[10px] truncate max-w-xs">{tx.description || tx.reference_id || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. User Account Status Change Dialog */}
      {statusChangeUserTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Update Status for {statusChangeUserTarget.username}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Target Account Status</label>
                <select
                  value={targetUserNewStatus}
                  onChange={(e) => setTargetUserNewStatus(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="DEACTIVATED">DEACTIVATED</option>
                  <option value="DELETION_REQUESTED">DELETION_REQUESTED</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Reason</label>
                <input
                  type="text"
                  value={userStatusReason}
                  onChange={(e) => setUserStatusReason(e.target.value)}
                  placeholder="e.g. Identity verification pending..."
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setStatusChangeUserTarget(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateUserStatus}
                disabled={Boolean(processingId)}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
              >
                Update Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. Delete User Account Safe Confirmation Dialog */}
      {deleteUserTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Delete Customer Account?
              </h3>
            </div>

            <div className="text-xs text-slate-300 space-y-2">
              <p>
                Customer: <strong className="text-white font-mono">{deleteUserTarget.username}</strong> ({deleteUserTarget.id})
              </p>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                <Info className="w-3.5 h-3.5 text-cyan-400 inline mr-1" />
                <strong>Financial & Audit History Safeguard:</strong> This will permanently disable this customer's login access. Financial, ticket, and transaction records required for auditing will be permanently preserved in the ledger.
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">Reason for Deletion</label>
              <input
                type="text"
                value={deleteUserReason}
                onChange={(e) => setDeleteUserReason(e.target.value)}
                placeholder="e.g. Customer requested deletion / Fraud prevention..."
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteUserTarget(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={Boolean(processingId)}
                className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs"
              >
                Confirm Delete Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. Transaction Rejection Modal */}
      {rejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Reject {rejectDialog.type === 'deposit' ? 'Deposit' : 'Withdrawal'} Request
            </h3>
            <p className="text-xs text-slate-300">
              User: <strong className="text-white">{rejectDialog.username}</strong> • Amount:{' '}
              <strong className="text-rose-400">{rejectDialog.amount} ETB</strong>
            </p>

            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">Reason for Rejection *</label>
              <textarea
                required
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Invalid Telebirr reference code, payout number mismatch..."
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
                onClick={handleConfirmRejection}
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
