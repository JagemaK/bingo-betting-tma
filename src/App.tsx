import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  Zap,
  Volume2,
  VolumeX,
  Wallet as WalletIcon,
  Trophy,
  Flame,
  Layers,
  AlertCircle,
  ArrowLeft,
  Crown,
  ChevronLeft
} from 'lucide-react';

import {
  GameRoomState,
  PurchasedTicket,
  UserAccount,
  WinnerRecord,
  RoomSummary,
  CurrencyType,
  DailyJackpotPublicState
} from './types/bingo.js';
import { verifyWinningPatterns } from './utils/bingoRules.js';
import { BingoCard } from './components/BingoCard.js';
import { BallHopper } from './components/BallHopper.js';
import { PariMutuelHeader } from './components/PariMutuelHeader.js';
import { BACKEND_URL, apiUrl } from './config/api.js';
import { CardSelectionBoard } from './components/CardSelectionBoard.js';
import { ProvablyFairModal } from './components/ProvablyFairModal.js';
import { WalletModal } from './components/WalletModal.js';
import { HelpRulesModal } from './components/HelpRulesModal.js';
import { LeaderboardModal } from './components/LeaderboardModal.js';
import { ReferralModal } from './components/ReferralModal.js';
import { ContactModal } from './components/ContactModal.js';
import { TopHeader } from './components/TopHeader.js';
import { BottomNavDock } from './components/BottomNavDock.js';
import { LobbyView } from './components/LobbyView.js';
import { AuthModal, AuthModalMode } from './components/AuthModal.js';
import { UserProfileDrawer } from './components/UserProfileDrawer.js';
import { AdminDashboardModal } from './components/AdminDashboardModal.js';
import { DailyJackpotModal } from './components/DailyJackpotModal.js';
import { DailyJackpotEntryView } from './components/DailyJackpotEntryView.js';
import { soundService } from './services/soundService.js';
import { telegramSdk } from './services/telegramSdk.js';
import { useAuth } from './services/authContext.js';

export default function App() {
  const auth = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentView, setCurrentView] = useState<'lobby' | 'card_selection' | 'live_game' | 'daily_jackpot'>('lobby');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [currency, setCurrency] = useState<CurrencyType>('ETB');

  // Active Game Room State
  const [gameState, setGameState] = useState<GameRoomState | null>(null);
  const [user, setUser] = useState<UserAccount | null>(auth.user || null);
  const [userTickets, setUserTickets] = useState<PurchasedTicket[]>([]);
  const [activeCardIndex, setActiveCardIndex] = useState<number>(0);
  const [viewModeAllCards, setViewModeAllCards] = useState<boolean>(false);

  // Daubing and Settings State
  const [daubedMap, setDaubedMap] = useState<Record<string, Set<number>>>({});
  const [autoDaub, setAutoDaub] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [voiceCallerEnabled, setVoiceCallerEnabled] = useState<boolean>(true);

  // Modals & Drawer State
  const [activeModal, setActiveModal] = useState<
    'wallet' | 'provablyFair' | 'rules' | 'leaderboard' | 'referral' | 'contact' | 'admin' | 'daily_jackpot' | null
  >(null);
  const [dailyJackpotState, setDailyJackpotState] = useState<DailyJackpotPublicState | null>(null);
  const [walletInitialTab, setWalletInitialTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('register');
  const [profileDrawerOpen, setProfileDrawerOpen] = useState<boolean>(false);

  const [claimingTicketId, setClaimingTicketId] = useState<string | null>(null);
  const [recentWinAnnouncement, setRecentWinAnnouncement] = useState<WinnerRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const activeRoomIdRef = useRef<string | null>(activeRoomId);
  const currentViewRef = useRef<string>(currentView);
  const autoDaubRef = useRef<boolean>(autoDaub);
  const userRef = useRef<UserAccount | null>(user);

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    autoDaubRef.current = autoDaub;
  }, [autoDaub]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Synchronize authenticated user from centralized AuthContext
  useEffect(() => {
    setUser(auth.user || null);
  }, [auth.user]);

  // If Telegram reports NEW_USER or REGISTRATION_REQUIRED, prompt user to complete profile
  useEffect(() => {
    if (auth.status === 'NEW_USER' || auth.status === 'REGISTRATION_REQUIRED') {
      setAuthModalMode('tg_register');
      setAuthModalOpen(true);
    }
  }, [auth.status]);

  // Auth & Profile Handlers
  const handleOpenSignUp = (mode: AuthModalMode = 'register') => {
    soundService.playClick();
    telegramSdk.triggerHaptic('medium');
    const isTg = telegramSdk.isInsideTelegram() || Boolean(telegramSdk.getInitData()) || Boolean(auth.tempToken) || Boolean(auth.telegramUser);
    const targetMode = isTg ? 'tg_register' : mode;
    console.log('[App] handleOpenSignUp called. isInsideTelegram:', isTg, 'targetMode:', targetMode, 'authStatus:', auth.status);
    setAuthModalMode(targetMode);
    setAuthModalOpen(true);
  };

  const handleOpenLogin = () => {
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    setAuthModalMode('login');
    setAuthModalOpen(true);
  };

  const handleOpenProfile = () => {
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
    setProfileDrawerOpen(true);
  };

  const handleLoginSuccess = (newUser: UserAccount, token: string) => {
    setUser(newUser);
    auth.updateUser(newUser);
    if (token) {
      localStorage.setItem('bingo_auth_token', token);
      if (socketRef.current) {
        socketRef.current.auth = { token };
        socketRef.current.disconnect().connect();
      }
    }
  };

  const handleLogout = async () => {
    await auth.logout();
    setUser(null);
    setUserTickets([]);
    setDaubedMap({});
    setActiveModal(null);
    setProfileDrawerOpen(false);
    if (socketRef.current) {
      socketRef.current.auth = {};
      socketRef.current.disconnect().connect();
    }
  };

  const handleOpenDeposit = () => {
    if (!user) {
      handleOpenSignUp('register');
      return;
    }
    setWalletInitialTab('deposit');
    setActiveModal('wallet');
  };

  const handleOpenWithdraw = () => {
    if (!user) {
      handleOpenSignUp('register');
      return;
    }
    setWalletInitialTab('withdraw');
    setActiveModal('wallet');
  };

  const handleOpenHistory = () => {
    if (!user) {
      handleOpenSignUp('register');
      return;
    }
    setWalletInitialTab('history');
    setActiveModal('wallet');
  };

  // Initialize Telegram SDK & Lobby Rooms
  useEffect(() => {
    telegramSdk.init();

    fetch(apiUrl('/api/rooms'))
      .then((res) => res.json())
      .then((data) => {
        if (data.rooms) setRooms(data.rooms);
      })
      .catch(console.error);

    fetch(apiUrl('/api/daily-jackpot/current'))
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setDailyJackpotState(data);
      })
      .catch(console.error);
  }, []);

  // Synchronize WebSocket connection token when sessionToken updates
  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.auth = { token: auth.sessionToken || undefined };
      socketRef.current.disconnect().connect();
    }
  }, [auth.sessionToken]);

  // Initialize WebSocket Connection with Authenticated Session Token
  useEffect(() => {
    const token = auth.sessionToken || localStorage.getItem('bingo_auth_token');
    const s = io(BACKEND_URL, {
      auth: { token: token || undefined },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity
    });
    socketRef.current = s;
    setSocket(s);

    s.on('connect', () => {
      console.log('Connected to Bingo Multi-Room Server');
      const token = auth.sessionToken || localStorage.getItem('bingo_auth_token');
      if (token) {
        s.emit('AUTHENTICATE_SOCKET', { token });
      }
      if (activeRoomIdRef.current) {
        s.emit('JOIN_ROOM', { roomId: activeRoomIdRef.current });
      }
    });

    s.on('LOBBY_OVERVIEW', (summaries: RoomSummary[]) => {
      setRooms(summaries);
    });

    s.on('LOBBY_TICK', (data: { roomId: string; timeRemaining: number; isCountdownActive?: boolean; totalCardsSold?: number }) => {
      setGameState((prev) => {
        if (prev && prev.roomId === data.roomId) {
          return {
            ...prev,
            lobbyTimeRemaining: data.timeRemaining,
            isCountdownActive: data.isCountdownActive !== undefined ? data.isCountdownActive : prev.isCountdownActive,
            totalCardsSold: data.totalCardsSold !== undefined ? data.totalCardsSold : prev.totalCardsSold
          };
        }
        return prev;
      });
      setRooms((prev) =>
        prev.map((r) =>
          r.roomId === data.roomId
            ? {
                ...r,
                lobbyTimeRemaining: data.timeRemaining,
                isCountdownActive: data.isCountdownActive !== undefined ? data.isCountdownActive : r.isCountdownActive,
                totalCardsSold: data.totalCardsSold !== undefined ? data.totalCardsSold : r.totalCardsSold
              }
            : r
        )
      );
    });

    s.on('LOBBY_COUNTDOWN_STARTED', (data: { roomId: string; timeRemaining: number; totalCardsSold: number }) => {
      soundService.playLineChime();
      telegramSdk.triggerHaptic('medium');
      setGameState((prev) => {
        if (prev && prev.roomId === data.roomId) {
          return {
            ...prev,
            lobbyTimeRemaining: data.timeRemaining,
            isCountdownActive: true,
            totalCardsSold: data.totalCardsSold
          };
        }
        return prev;
      });
    });

    s.on('ROOM_STATE_UPDATE', (state: GameRoomState) => {
      setGameState(state);

      if (state.status === 'active' && currentViewRef.current === 'card_selection') {
        setCurrentView('live_game');
      } else if (state.status === 'lobby' && currentViewRef.current === 'live_game') {
        setCurrentView('card_selection');
      }
    });

    s.on('REGISTRATION_SUCCESS', (data: { phone: string; user: UserAccount; token?: string }) => {
      if (data && data.user) {
        setUser(data.user);
        if (data.token) {
          localStorage.setItem('bingo_auth_token', data.token);
        }
      }
    });

    // Real-time server push on deposit approvals, withdrawals, and balance updates
    s.on('WALLET_UPDATED', (data: { playerId: string; balance: number; reservedBalance?: number; type: string; amount: number; message?: string }) => {
      const current = userRef.current;
      if (current && (data.playerId === current.playerId || data.playerId === current.id)) {
        setUser((prev) => prev ? { ...prev, walletBalance: data.balance } : null);
        soundService.playJackpotFanfare();
        telegramSdk.triggerHaptic('success');
      }
    });

    s.on('DEPOSIT_REJECTED', (data: { playerId: string; message?: string }) => {
      const current = userRef.current;
      if (current && (data.playerId === current.playerId || data.playerId === current.id)) {
        soundService.playError();
        telegramSdk.triggerHaptic('error');
      }
    });

    s.on('DAILY_JACKPOT_UPDATED', (data: { roundId: string; cardsSold: number; maxCards: number; status: any }) => {
      setDailyJackpotState((prev) => prev ? { ...prev, cardsSold: data.cardsSold, status: data.status } : null);
    });

    s.on('DAILY_JACKPOT_EVALUATED', () => {
      fetch(apiUrl('/api/daily-jackpot/current'))
        .then(r => r.json())
        .then(d => { if (d.success) setDailyJackpotState(d); })
        .catch(console.error);
    });

    s.on('BALL_DRAWN', (data: { roomId: string; ball: { letter: 'B' | 'I' | 'N' | 'G' | 'O'; number: number }; ballIndex: number; drawnBalls: number[] }) => {
      soundService.playBallDrop();
      soundService.speakBall(data.ball.letter, data.ball.number);
      telegramSdk.triggerHaptic('light');

      setGameState((prev) => {
        if (prev && prev.roomId === data.roomId) {
          return {
            ...prev,
            currentBall: data.ball,
            drawnBalls: data.drawnBalls
          };
        }
        return prev;
      });

      if (autoDaubRef.current) {
        setDaubedMap((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((ticketId) => {
            const currentSet = new Set(next[ticketId]);
            currentSet.add(data.ball.number);
            next[ticketId] = currentSet;
          });
          return next;
        });
      }
    });

    s.on('GAME_STARTED', () => {
      soundService.playLineChime();
      telegramSdk.triggerHaptic('medium');
      setCurrentView('live_game');
    });

    s.on('BINGO_WINNER_ANNOUNCED', (data: { winner: WinnerRecord; payoutAmount: number }) => {
      setRecentWinAnnouncement(data.winner);

      // STRICT USER ISOLATION: Derive winner match ONLY from authenticated user
      const isMe = Boolean(
        userRef.current && data.winner.playerId === userRef.current.playerId
      );

      if (isMe) {
        soundService.playJackpotFanfare();
        telegramSdk.triggerHaptic('success');
        confetti({
          particleCount: 150,
          spread: 90,
          origin: { y: 0.6 }
        });
        // Sync user wallet balance immediately
        if (userRef.current) {
          const t = auth.sessionToken || localStorage.getItem('bingo_auth_token');
          fetch(apiUrl(`/api/user/${userRef.current.playerId}`), {
            headers: t ? { Authorization: `Bearer ${t}` } : {}
          })
            .then((res) => res.json())
            .then((d) => {
              if (d.user) setUser(d.user);
            })
            .catch(console.error);
        }
      } else {
        // Someone else won! Notify with pleasant chime, no false celebration
        soundService.playLineChime();
        telegramSdk.triggerHaptic('light');
      }

      setTimeout(() => {
        setRecentWinAnnouncement(null);
      }, 7000);
    });

    s.on('GAME_FINISHED', (data: { roomId: string; gameId: string; winners: WinnerRecord[]; serverSeedRevealed?: string; fullShuffledBallsRevealed?: number[] }) => {
      // STRICT USER ISOLATION: Check only authenticated user
      const didIWin = Boolean(
        userRef.current && data.winners.some((w) => w.playerId === userRef.current?.playerId)
      );

      if (didIWin) {
        soundService.playJackpotFanfare();
        telegramSdk.triggerHaptic('success');
      } else {
        soundService.playLineChime();
      }

      setGameState((prev) => {
        if (prev && prev.roomId === data.roomId) {
          return {
            ...prev,
            status: 'finished',
            winners: data.winners,
            serverSeedRevealed: data.serverSeedRevealed,
            fullShuffledBallsRevealed: data.fullShuffledBallsRevealed
          };
        }
        return prev;
      });
    });

    s.on('PHONE_VERIFIED', (data: { phone: string; success: boolean; user: UserAccount; token?: string }) => {
      if (data.success && data.user) {
        setUser(data.user);
        if (data.token) {
          localStorage.setItem('bingo_auth_token', data.token);
        }
        setAuthModalOpen(false);
        soundService.playJackpotFanfare();
        telegramSdk.triggerHaptic('success');
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 }
        });
      }
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Sync user tickets
  useEffect(() => {
    if (!gameState || !user) return;
    const myTickets = gameState.tickets.filter((t) => t.playerId === user.playerId);
    setUserTickets(myTickets);

    setDaubedMap((prev) => {
      const next = { ...prev };
      myTickets.forEach((t) => {
        if (!next[t.ticketId]) {
          const initSet = new Set<number>();
          initSet.add(0); // Center free
          if (autoDaub) {
            gameState.drawnBalls.forEach((b) => initSet.add(b));
          }
          next[t.ticketId] = initSet;
        }
      });
      return next;
    });
  }, [gameState?.gameId, gameState?.tickets?.length, user?.playerId, autoDaub]);

  const handleJoinRoom = (roomId: string) => {
    if (!user) {
      handleOpenSignUp('register');
      return;
    }
    if (!socket) return;
    setActiveRoomId(roomId);
    socket.emit('JOIN_ROOM', { roomId, playerId: user.playerId }, (res: any) => {
      if (res.success && res.state) {
        setGameState(res.state);
        if (res.state.status === 'active') {
          setCurrentView('live_game');
        } else {
          setCurrentView('card_selection');
        }
        soundService.playLineChime();
        telegramSdk.triggerHaptic('medium');
      }
    });
  };

  const handleLeaveRoom = () => {
    if (socket && activeRoomId) {
      socket.emit('LEAVE_ROOM', { roomId: activeRoomId });
    }
    setActiveRoomId(null);
    setGameState(null);
    setUserTickets([]);
    setCurrentView('lobby');
    soundService.playClick();
    telegramSdk.triggerHaptic('light');
  };

  const handleSelectCardNumber = (cardNumber: number) => {
    if (!user) {
      handleOpenSignUp('register');
      return;
    }
    if (!socket || !gameState || !activeRoomId) return;

    // Check if already locked by this player
    const alreadyLocked = userTickets.some((t) => t.cardNumber === cardNumber);
    if (alreadyLocked) return;

    if (user.walletBalance < gameState.betPerCard) {
      soundService.playError();
      setErrorMessage(`Insufficient balance (${user.walletBalance.toFixed(0)} Birr). Card costs ${gameState.betPerCard} Birr.`);
      setActiveModal('wallet');
      return;
    }

    socket.emit('SELECT_CARD_NUMBER', {
      roomId: activeRoomId,
      cardNumber
    }, (res: any) => {
      if (res.success) {
        soundService.playLineChime();
        telegramSdk.triggerHaptic('success');
        if (res.user) setUser(res.user);
        setErrorMessage(null);
      } else {
        soundService.playError();
        setErrorMessage(res.error || 'Failed to select card');
        setTimeout(() => setErrorMessage(null), 3000);
      }
    });
  };

  const handleLockMultipleCards = (cardNumbers: number[]) => {
    if (!user) {
      handleOpenSignUp('register');
      return;
    }
    if (!socket || !gameState || !activeRoomId) return;

    // Filter out cards already locked by this player
    const alreadyLockedSet = new Set(userTickets.map((t) => t.cardNumber));
    const uncommittedCards = cardNumbers.filter((n) => !alreadyLockedSet.has(n));

    if (uncommittedCards.length === 0) {
      soundService.playLineChime();
      return;
    }

    const totalCost = uncommittedCards.length * gameState.betPerCard;
    if (user.walletBalance < totalCost) {
      soundService.playError();
      setErrorMessage(`Insufficient balance (${user.walletBalance.toFixed(0)} Birr). Total needed for ${uncommittedCards.length} card(s) is ${totalCost} Birr.`);
      setActiveModal('wallet');
      return;
    }

    socket.emit('LOCK_MULTIPLE_CARDS', {
      roomId: activeRoomId,
      cardNumbers: uncommittedCards
    }, (res: any) => {
      if (res.success) {
        soundService.playLineChime();
        telegramSdk.triggerHaptic('success');
        if (res.user) setUser(res.user);
        setErrorMessage(null);
      } else {
        soundService.playError();
        setErrorMessage(res.error || 'Failed to lock cards');
        setTimeout(() => setErrorMessage(null), 4000);
      }
    });
  };

  const handleDeselectCardNumber = (cardNumber: number) => {
    if (!socket || !user || !gameState || !activeRoomId) return;

    socket.emit('DESELECT_CARD_NUMBER', {
      roomId: activeRoomId,
      cardNumber
    }, (res: any) => {
      if (res.success) {
        soundService.playClick();
        telegramSdk.triggerHaptic('light');
        if (res.user) setUser(res.user);
      } else {
        soundService.playError();
        setErrorMessage(res.error || 'Failed to deselect card');
        setTimeout(() => setErrorMessage(null), 3000);
      }
    });
  };

  const handleRandomSelectCards = (count: number) => {
    if (!user) {
      handleOpenSignUp('register');
      return;
    }
    if (!socket || !gameState || !activeRoomId) return;

    const totalCost = count * gameState.betPerCard;
    if (user.walletBalance < totalCost) {
      soundService.playError();
      setErrorMessage(`Insufficient balance (${user.walletBalance.toFixed(0)} Birr). Total cost: ${totalCost} Birr.`);
      setActiveModal('wallet');
      return;
    }

    socket.emit('RANDOM_SELECT_CARDS', {
      roomId: activeRoomId,
      count
    }, (res: any) => {
      if (res.success) {
        soundService.playLineChime();
        telegramSdk.triggerHaptic('success');
        if (res.user) setUser(res.user);
        setErrorMessage(null);
      } else {
        soundService.playError();
        setErrorMessage(res.error || 'Failed to pick cards');
        setTimeout(() => setErrorMessage(null), 3000);
      }
    });
  };

  const handleToggleDaub = (ticketId: string, num: number) => {
    setDaubedMap((prev) => {
      const currentSet = new Set(prev[ticketId] || [0]);
      if (currentSet.has(num)) {
        currentSet.delete(num);
      } else {
        currentSet.add(num);
      }
      return { ...prev, [ticketId]: currentSet };
    });
  };

  const handleClaimBingo = (ticketId: string) => {
    if (!user) {
      handleOpenSignUp('register');
      return;
    }
    if (!socket || !activeRoomId) return;
    setClaimingTicketId(ticketId);
    soundService.playClick();
    telegramSdk.triggerHaptic('heavy');

    socket.emit('CLAIM_BINGO', {
      roomId: activeRoomId,
      ticketId
    }, (res: any) => {
      setClaimingTicketId(null);
      if (res.success) {
        soundService.playJackpotFanfare();
        telegramSdk.triggerHaptic('success');
        if (res.user) setUser(res.user);
      } else {
        soundService.playError();
        setErrorMessage(res.message || 'Verification failed');
        setTimeout(() => setErrorMessage(null), 4000);
      }
    });
  };

  const checkTicketWinStatus = (ticket: PurchasedTicket) => {
    if (!gameState) return { hasWon: false, winningNumbers: new Set<number>() };
    const verification = verifyWinningPatterns(ticket.grid, gameState.drawnBalls);
    const winningNums = new Set<number>();
    if (verification.hasWon) {
      Object.values(verification.patterns).forEach((arr) => {
        arr.forEach((n) => winningNums.add(n));
      });
    }
    return { hasWon: verification.hasWon, winningNumbers: winningNums };
  };

  const formatStakeDisplay = (amount: number) => {
    return `${amount.toLocaleString()} Birr`;
  };

  const formatUserBalance = () => {
    if (!user || typeof user.walletBalance !== 'number') return '0 Birr';
    return `${user.walletBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Birr`;
  };

  const myTicketCardNumbers = userTickets
    .map((t) => t.cardNumber)
    .filter((n): n is number => typeof n === 'number');

  const activeTicket = userTickets[activeCardIndex] || userTickets[0] || null;
  const activeWinStatus = activeTicket ? checkTicketWinStatus(activeTicket) : { hasWon: false, winningNumbers: new Set<number>() };
  const anyWinningTicket = userTickets.find((t) => checkTicketWinStatus(t).hasWon);

  return (
    <div className="min-h-screen w-full bg-[#080808] text-white flex flex-col font-sans selection:bg-[#E8FF00] selection:text-black">
      {/* 1. View: Multi-Room Stake Browser */}
      {currentView === 'lobby' && (
        <LobbyView
          rooms={rooms}
          user={user}
          currency={currency}
          onSelectCurrency={setCurrency}
          onJoinRoom={handleJoinRoom}
          onOpenDailyJackpot={() => setCurrentView('daily_jackpot')}
          dailyJackpotState={dailyJackpotState}
          onOpenWallet={handleOpenDeposit}
          onOpenLeaderboard={() => setActiveModal('leaderboard')}
          onOpenReferral={() => setActiveModal('referral')}
          onOpenContact={() => setActiveModal('contact')}
          onOpenRules={() => setActiveModal('rules')}
          onOpenProvablyFair={() => setActiveModal('provablyFair')}
          onOpenSignUp={() => handleOpenSignUp('register')}
          onOpenLogin={handleOpenLogin}
          onOpenProfile={handleOpenProfile}
          onOpenMenu={handleOpenProfile}
          onOpenAdmin={() => setActiveModal('admin')}
          onRefresh={() => {
            fetch(apiUrl('/api/rooms')).then(r => r.json()).then(d => d.rooms && setRooms(d.rooms));
          }}
        />
      )}

      {/* 2. View: Card Selection Matrix */}
      {currentView === 'card_selection' && gameState && (
        <CardSelectionBoard
          roomState={gameState}
          user={user}
          currency={currency}
          myTicketCardNumbers={myTicketCardNumbers}
          errorMessage={errorMessage}
          onDismissError={() => setErrorMessage(null)}
          onSelectCard={handleSelectCardNumber}
          onDeselectCard={handleDeselectCardNumber}
          onLockMultipleCards={handleLockMultipleCards}
          onRandomSelect={handleRandomSelectCards}
          onBackToLobby={handleLeaveRoom}
          onOpenWallet={handleOpenDeposit}
          onOpenLeaderboard={() => setActiveModal('leaderboard')}
          onOpenReferral={() => setActiveModal('referral')}
          onOpenContact={() => setActiveModal('contact')}
          onOpenRules={() => setActiveModal('rules')}
          onOpenSignUp={() => handleOpenSignUp('register')}
          onOpenLogin={handleOpenLogin}
          onOpenProfile={handleOpenProfile}
          onOpenAdmin={() => setActiveModal('admin')}
          onSelectCurrency={setCurrency}
          onRefresh={() => {
            if (activeRoomId) {
              fetch(apiUrl(`/api/room/${activeRoomId}`)).then(r => r.json()).then(d => d && setGameState(d));
            }
          }}
        />
      )}

      {/* 3. View: Live 75-Ball Game Play & Daubing Table */}
      {currentView === 'live_game' && (
        <div className="w-full min-h-screen text-slate-100 flex flex-col relative overflow-x-hidden font-sans pb-28 aurora-bg">
          {/* Designer Top Sticky Header */}
          <TopHeader
            mode="live_game"
            user={user}
            roomName={gameState?.roomName}
            autoDaub={autoDaub}
            soundEnabled={soundEnabled}
            onToggleAutoDaub={() => {
              const n = !autoDaub;
              setAutoDaub(n);
              soundService.playClick();
              telegramSdk.triggerHaptic('light');
            }}
            onToggleSound={() => {
              const n = !soundEnabled;
              setSoundEnabled(n);
              soundService.setSoundEnabled(n);
            }}
            onBack={handleLeaveRoom}
            onOpenWallet={handleOpenDeposit}
            onOpenSignUp={() => handleOpenSignUp('register')}
            onOpenLogin={handleOpenLogin}
            onOpenProfile={handleOpenProfile}
            onOpenMenu={handleOpenProfile}
            onOpenAdmin={() => setActiveModal('admin')}
          />

          {/* Main Live Stage */}
          <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4 pb-28 flex-1 relative z-10">
            {/* Error Alert */}
            {errorMessage && (
              <div className="p-3 rounded-2xl text-xs flex items-center justify-between bg-rose-950/80 border border-rose-500/50 text-rose-200 shadow-xl backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <button onClick={() => setErrorMessage(null)} className="font-bold px-1.5 py-0.5 text-rose-400 hover:text-white cursor-pointer">✕</button>
              </div>
            )}

            {/* Winner Announcement Banner */}
            {recentWinAnnouncement && (
              <div className="p-3.5 rounded-2xl font-semibold text-xs flex items-center justify-between bg-gradient-to-r from-amber-500/20 via-pink-500/15 to-purple-500/20 border border-amber-400/40 border-t-white/50 backdrop-blur-xl shadow-glass-md animate-liquid-pulse">
                <div className="flex items-center gap-3">
                  <Trophy className="w-6 h-6 text-amber-300 flex-shrink-0" />
                  <div>
                    <div className="text-[10px] uppercase font-bold text-amber-400 leading-none mb-0.5">🎉 BINGO WINNER!</div>
                    <div className="text-white"><strong>{recentWinAnnouncement.username}</strong> won <strong className="text-amber-300">{formatStakeDisplay(recentWinAnnouncement.payoutAmount)}</strong>!</div>
                  </div>
                </div>
                <span className="text-xs px-3 py-1 rounded-full font-mono font-bold bg-white/10 text-amber-300 border border-amber-400/40 shadow-sm">
                  +{formatStakeDisplay(recentWinAnnouncement.payoutAmount)}
                </span>
              </div>
            )}

            {/* Game Finished Round Summary */}
            {gameState?.status === 'finished' && (
              <div className="p-4 rounded-3xl space-y-3 text-center bg-white/[0.05] border border-white/15 border-t-white/35 backdrop-blur-xl shadow-glass-md">
                <div className="flex items-center justify-center gap-2 font-display font-extrabold text-sm uppercase tracking-wide text-amber-300">
                  <Trophy className="w-5 h-5 fill-current" />
                  <span>Round Complete · All Prizes Awarded</span>
                </div>
                {gameState.winners.length > 0 ? (
                  <div className="space-y-2 py-1">
                    {gameState.winners.map((w, i) => (
                      <div key={i} className="p-2.5 rounded-xl flex items-center justify-between text-xs bg-white/[0.03] border border-white/[0.08]">
                        <div className="text-left font-semibold text-white">
                          <span>{w.username}</span>
                          <span className="text-[10px] ml-1.5 font-mono text-amber-400">({w.patternType})</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-400">+{formatStakeDisplay(w.payoutAmount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No winning claims this round.</p>
                )}
                <div className="pt-2 flex items-center justify-between text-xs text-slate-400 border-t border-white/10">
                  <span>Next round countdown starting...</span>
                  <button
                    onClick={() => setCurrentView('card_selection')}
                    className="liquid-btn liquid-btn-amber text-xs px-3 py-1.5 rounded-xl"
                  >
                    Select Cards →
                  </button>
                </div>
              </div>
            )}

            {/* Responsive 2-Column Grid on Desktop / Single-col on Mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Pot Header + Ball Hopper */}
              <div className="lg:col-span-5 space-y-4">
                {gameState && (
                  <PariMutuelHeader
                    gameState={gameState}
                    userCardCount={userTickets.length}
                    currency={currency}
                  />
                )}

                {gameState && (
                  <BallHopper
                    currentBall={gameState.currentBall}
                    drawnBalls={gameState.drawnBalls}
                    status={gameState.status}
                    soundEnabled={soundEnabled}
                    voiceCallerEnabled={voiceCallerEnabled}
                    onToggleSound={() => {
                      const n = !soundEnabled;
                      setSoundEnabled(n);
                      soundService.setSoundEnabled(n);
                    }}
                    onToggleVoice={() => {
                      const n = !voiceCallerEnabled;
                      setVoiceCallerEnabled(n);
                      soundService.setVoiceCallerEnabled(n);
                    }}
                  />
                )}
              </div>

              {/* Right Column: Multi-Card Switcher + Active Bingo Card */}
              <div className="lg:col-span-7 space-y-4">
                {userTickets.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {userTickets.map((t, idx) => {
                      const { hasWon } = checkTicketWinStatus(t);
                      return (
                        <button
                          key={t.ticketId}
                          onClick={() => {
                            setActiveCardIndex(idx);
                            soundService.playClick();
                            telegramSdk.triggerHaptic('light');
                          }}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 border ${
                            activeCardIndex === idx
                              ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-transparent shadow-glass-sm'
                              : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-white'
                          }`}
                        >
                          <span>Card #{t.cardNumber || idx + 1}</span>
                          {hasWon && <Flame className="w-3.5 h-3.5 text-rose-400 fill-current animate-bounce" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeTicket ? (
                  <div className="relative">
                    <BingoCard
                      cardId={activeTicket.ticketId}
                      grid={activeTicket.grid}
                      cardIndex={activeTicket.cardNumber || activeCardIndex + 1}
                      daubedNumbers={daubedMap[activeTicket.ticketId] || new Set([0])}
                      calledNumbers={new Set(gameState?.drawnBalls || [])}
                      winningPatternNumbers={activeWinStatus.winningNumbers}
                      isWinningCard={activeWinStatus.hasWon}
                      autoDaub={autoDaub}
                      onToggleDaub={(num) => handleToggleDaub(activeTicket.ticketId, num)}
                    />
                  </div>
                ) : (
                  <div className="p-8 rounded-3xl text-center space-y-3 bg-white/[0.04] border border-white/10 backdrop-blur-xl shadow-glass-sm text-slate-400">
                    <p className="text-sm">You are watching the live draw as a spectator.</p>
                    <button
                      onClick={() => setCurrentView('card_selection')}
                      className="liquid-btn liquid-btn-primary text-xs px-4 py-2 rounded-xl"
                    >
                      Join Next Round
                    </button>
                  </div>
                )}
              </div>
            </div>
          </main>

          {/* Fixed Bottom Claim Bingo Bar */}
          <footer className="fixed bottom-0 left-0 right-0 z-40 backdrop-blur-2xl p-3 max-w-2xl mx-auto px-4 bg-[#07090e]/95 border-t border-white/15 shadow-glass-xl rounded-t-2xl">
            {anyWinningTicket && gameState?.status === 'active' ? (
              <button
                onClick={() => handleClaimBingo(anyWinningTicket.ticketId)}
                disabled={claimingTicketId === anyWinningTicket.ticketId}
                className="w-full py-3.5 rounded-2xl font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500 text-white shadow-[0_0_24px_rgba(244,63,94,0.4)] animate-pulse"
              >
                <Flame className="w-5 h-5 fill-current animate-bounce" />
                <span>
                  {claimingTicketId === anyWinningTicket.ticketId
                    ? 'Verifying Claim with Server...'
                    : `Claim Bingo (Card #${anyWinningTicket.cardNumber || 1}) · Win ${formatStakeDisplay(gameState.winnerPayoutAmount)}!`}
                </span>
              </button>
            ) : (
              <div className="flex items-center justify-between text-xs px-2 py-0.5 text-slate-400">
                <div className="flex items-center gap-1.5 font-semibold">
                  <span className="text-white">{userTickets.length} Cards Active</span>
                  <span>•</span>
                  <span className="font-mono text-amber-300">
                    Bet: {formatStakeDisplay(userTickets.length * (gameState?.betPerCard || 10))}
                  </span>
                </div>
                <div className="flex items-center gap-1 font-mono font-bold">
                  <Trophy className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="text-emerald-400">Prize: {formatStakeDisplay(gameState?.winnerPayoutAmount || 0)} ({gameState?.winnerPayoutPercent || 80}%)</span>
                </div>
              </div>
            )}
          </footer>
        </div>
      )}

      {/* 4. View: Dedicated Full-Screen Daily Grand Jackpot Entry */}
      {currentView === 'daily_jackpot' && (
        <DailyJackpotEntryView
          user={user}
          token={auth.sessionToken || localStorage.getItem('bingo_auth_token') || ''}
          dailyJackpotState={dailyJackpotState}
          onBack={() => setCurrentView('lobby')}
          onOpenDeposit={handleOpenDeposit}
          onOpenSignUp={() => handleOpenSignUp('register')}
          onOpenAdmin={() => setActiveModal('admin')}
          onUpdateUser={(updatedUser) => {
            setUser(updatedUser);
            auth.updateUser(updatedUser);
          }}
          onTicketPurchased={() => {
            fetch(apiUrl('/api/daily-jackpot/current'))
              .then(r => r.json())
              .then(d => { if (d.success !== false) setDailyJackpotState(d); })
              .catch(() => {});
          }}
        />
      )}

      {/* Modals Container */}
      <WalletModal
        isOpen={activeModal === 'wallet'}
        initialTab={walletInitialTab}
        onClose={() => setActiveModal(null)}
        user={user}
        onUpdateUser={(updated) => setUser(updated)}
        onOpenSignUp={() => handleOpenSignUp('register')}
        onOpenLogin={handleOpenLogin}
      />

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleLoginSuccess}
        socket={socket}
      />

      <UserProfileDrawer
        isOpen={profileDrawerOpen}
        user={user}
        onClose={() => setProfileDrawerOpen(false)}
        onOpenDeposit={handleOpenDeposit}
        onOpenWithdraw={handleOpenWithdraw}
        onOpenHistory={handleOpenHistory}
        onOpenReferral={() => setActiveModal('referral')}
        onOpenRules={() => setActiveModal('rules')}
        onOpenProvablyFair={() => setActiveModal('provablyFair')}
        onOpenContact={() => setActiveModal('contact')}
        onOpenLogin={handleOpenLogin}
        onOpenSignUp={() => handleOpenSignUp('register')}
        onLogout={handleLogout}
        onOpenAdmin={() => setActiveModal('admin')}
      />

      <ProvablyFairModal
        isOpen={activeModal === 'provablyFair'}
        onClose={() => setActiveModal(null)}
        gameState={gameState || {
          roomId: '',
          roomName: '',
          gameId: '',
          betPerCard: 1,
          etbEquivalent: 10,
          rakePercent: 20,
          totalCatalogCards: 200,
          minCardsToStart: 5,
          status: 'lobby',
          lobbyTimeRemaining: 0,
          lobbyDuration: 20,
          isCountdownActive: false,
          drawIntervalMs: 3000,
          totalBallsToDraw: 75,
          houseRakeAmount: 0,
          currentBall: null,
          drawnBalls: [],
          commitmentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          totalPot: 0,
          playerPayoutPool: 0,
          winnerPayoutAmount: 0,
          winnerPayoutPercent: 80,
          isFivePlayerBonus: false,
          fullHousePot: 0,
          linePot: 0,
          fourCornersPot: 0,
          activePlayersCount: 0,
          totalCardsSold: 0,
          tickets: [],
          winners: []
        }}
      />

      <HelpRulesModal
        isOpen={activeModal === 'rules'}
        onClose={() => setActiveModal(null)}
      />

      <LeaderboardModal
        isOpen={activeModal === 'leaderboard'}
        onClose={() => setActiveModal(null)}
        currency={currency}
      />

      <ReferralModal
        isOpen={activeModal === 'referral'}
        onClose={() => setActiveModal(null)}
        user={user}
        currency={currency}
        onUpdateUser={(updated) => setUser(updated)}
        onOpenSignUp={() => handleOpenSignUp('register')}
      />

      <ContactModal
        isOpen={activeModal === 'contact'}
        onClose={() => setActiveModal(null)}
      />

      <AdminDashboardModal
        isOpen={activeModal === 'admin'}
        onClose={() => setActiveModal(null)}
        user={user}
        token={auth.sessionToken || localStorage.getItem('bingo_auth_token') || ''}
      />

      <DailyJackpotModal
        isOpen={activeModal === 'daily_jackpot'}
        onClose={() => setActiveModal(null)}
        user={user}
        onOpenWallet={handleOpenDeposit}
        onOpenSignUp={() => handleOpenSignUp('register')}
        onUpdateUser={(updatedUser) => {
          setUser(updatedUser);
          auth.updateUser(updatedUser);
        }}
      />
    </div>
  );
}
