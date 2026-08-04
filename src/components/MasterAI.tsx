import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Volume2,
  VolumeX,
  Languages,
  LineChart,
  ImagePlus,
  X,
  ChevronDown,
  Check,
  Sparkles,
  Plus,
  History,
  Trash2,
  Layers,
  Waves,
  Crosshair,
  GitBranch,
  Shield,
  BookOpen,
  ScanSearch,
  Map,
  Split,
  Box,
  Eye,
  CandlestickChart,
  GraduationCap,
  Brain,
  Swords,
  HelpCircle,
  Target,
  Mic2,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import {
  MASTER_AI_LANGUAGES,
  MASTER_AI_MODEL_ID,
  askMasterAi,
  fetchMasterAiStatus,
  getChartVisionPrompt,
  getMasterAiLanguage,
  getMasterAiWelcome,
  getMasterAiSorryMessage,
  describeMasterAiFailure,
  getTradingBlockMessage,
  isHindiLang,
  isHinglishLang,
  isTradingRelated,
  isCasualGreeting,
  isPoliteAck,
  shouldUseWebSearch,
  buildMasterMarketContext,
  detectExplicitLanguageRequest,
  hasActiveDeskThread,
  getHumanGreetingReply,
  loadAutoSpeak,
  loadLanguageMode,
  loadSelectedLanguage,
  resolveMasterAiLanguage,
  saveAutoSpeak,
  saveLanguageMode,
  saveSelectedLanguage,
  isJournalReviewQuestion,
  buildJournalContextForAi,
  type ChatHistoryItem,
  type MasterAiLangCode,
  type MasterAiLangMode,
  type MasterAiLanguage,
} from '../services/masterAiService';
import {
  deleteChat,
  formatChatTime,
  loadActiveChat,
  persistActiveChat,
  startNewChat,
  switchChat,
  type ChatChartAttachment,
  type ChatDeskScope,
  type ChatMessage,
  type ChatSessionMeta,
} from '../services/masterAiChatStore';
import ChatMarkdown from './ChatMarkdown';
import HunterMark from './HunterMark';
import ChatChartPanel from './masterai/ChatChartPanel';
import { parseChartAnnotations } from '../utils/chartAnnotations';
import {
  detectChartRequest,
  detectInstrumentMention,
  isChartMarkupRequest,
  tradingViewSymbolLabel,
  type TvInterval,
} from '../utils/tradingViewSymbols';
import {
  MASTER_AI_IMAGE_ACCEPT,
  prepareChartImageForAi,
} from '../services/masterAiImage';
import { API_SERVER_READY_EVENT } from '../services/apiAutoConnect';
import { OPENROUTER_KEY_UPDATED_EVENT } from '../services/openRouterKey';
import { loadLocalTrades } from '../services/journalSyncService';
import { consumeHunterPendingPrompt } from '../services/journalAiAssist';
import { useAuth } from '../hooks/useAuth';
import { AI_PRODUCT_NAME } from '../constants/brandLabels';
import {
  MENTOR_CHAT_PROMPTS,
  WOLF_CHAT_PROMPTS,
  WOLF_CHART_PROMPTS,
  deskPromptHint,
  deskPromptLabel,
  deskPromptText,
  type DeskPrompt,
} from '../constants/wolfAiPrompts';
import {
  MENTOR_MODES,
  loadMentorMode,
  loadRoomMode,
  saveMentorMode,
  saveRoomMode,
  type MentorMode,
} from '../services/mentorModes';
import {
  buildDrillFromDetective,
  isDrillAnswerCorrect,
  saveDrillResult,
  type DetectiveCard,
  type MentorDrill,
} from '../services/mentorDrills';
import { fetchMentorDetective } from '../services/mentorDetective';
import {
  buildTraderSkillProfile,
  trainingPlanPrompt,
} from '../services/traderSkillProfile';

type Message = ChatMessage;

const ROOM_ROLE_TITLES = [
  'Mentor',
  'Market Scanner',
  'Risk Manager',
  'Psychology Coach',
  'Strategy Coach',
] as const;

function parseRoomSections(text: string): { title: string; body: string }[] | null {
  const parts = text.split(/^###\s+/m);
  if (parts.length < 3) return null;
  const sections: { title: string; body: string }[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    const nl = parts[i].indexOf('\n');
    const title = (nl >= 0 ? parts[i].slice(0, nl) : parts[i]).trim();
    let body = (nl >= 0 ? parts[i].slice(nl + 1) : '').trim();
    body = body.replace(/```wolfchart[\s\S]*$/i, '').trim();
    if (ROOM_ROLE_TITLES.some((t) => t.toLowerCase() === title.toLowerCase())) {
      sections.push({ title, body });
    }
  }
  return sections.length >= 2 ? sections : null;
}

const CHAT_PROMPT_ICONS: Record<string, LucideIcon> = {
  challenge: Swords,
  invalidate: HelpCircle,
  'why-wait': Target,
  'chart-quiz': Target,
  'training-plan': GraduationCap,
  structure: Layers,
  liquidity: Waves,
  zones: Crosshair,
  mtf: GitBranch,
  risk: Shield,
  journal: BookOpen,
};

export type MasterAiDesk = 'hunter' | 'mentor';

const CHART_PROMPT_ICONS: Record<string, LucideIcon> = {
  full: ScanSearch,
  aoi: Map,
  liq: Waves,
  scenarios: Split,
  levels: Crosshair,
  sr: Layers,
  bias: GitBranch,
  ob: Box,
  'mtf-chart': Eye,
};

/** Wolf AI (Hunter) analysis chat — training desk lives in MentorAI / Wolf Mentor. */
export default function MasterAI(_props?: { desk?: MasterAiDesk }) {
  const isMentor = false;
  const chatScope: ChatDeskScope = 'hunter';
  const deskPrompts = WOLF_CHAT_PROMPTS;
  const { user } = useAuth();
  const initialMode = loadLanguageMode();
  const initialLang =
    initialMode === 'auto'
      ? getMasterAiLanguage(loadSelectedLanguage())
      : getMasterAiLanguage(initialMode);
  const [langMode, setLangMode] = useState<MasterAiLangMode>(initialMode);
  const [selectedLang, setSelectedLang] = useState<MasterAiLanguage>(initialLang);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [langQuery, setLangQuery] = useState('');
  const langMenuRef = useRef<HTMLDivElement>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);
  const chartPromptRef = useRef<HTMLDivElement>(null);
  const welcomeText =
    isMentor
      ? 'Mentor AI training desk — I quiz you from the live chart and tape. Answer with process only (no chase). Pick a mode and I will punch questions.'
      : initialMode === 'auto'
        ? 'Auto language on — type in any language and Hunter replies in the same one. Ask about NIFTY/BTC for live tape, or share a chart for structure.'
        : getMasterAiWelcome(initialLang.code);
  const [boot] = useState(() => loadActiveChat(welcomeText, chatScope));
  const [activeChatId, setActiveChatId] = useState(boot.activeId);
  const [chatSessions, setChatSessions] = useState<ChatSessionMeta[]>(boot.sessions);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chartPromptOpen, setChartPromptOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(boot.messages);
  const [inputText, setInputText] = useState('');
  const hindi = isHindiLang(selectedLang.code);
  const useHiPrompts = hindi || isHinglishLang(selectedLang.code);
  const [autoSpeak, setAutoSpeak] = useState(loadAutoSpeak);
  const [mentorMode, setMentorMode] = useState<MentorMode>(loadMentorMode);
  const [roomMode, setRoomMode] = useState(() => (isMentor ? loadRoomMode() : false));
  const [detective, setDetective] = useState<DetectiveCard | null>(null);
  const [activeDrill, setActiveDrill] = useState<MentorDrill | null>(null);
  const [skillTick, setSkillTick] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [aiStatus, setAiStatus] = useState({ configured: false, message: 'Checking AI…' });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);
  const [isAnalyzingChart, setIsAnalyzingChart] = useState(false);
  // Last chart settings the user landed on — seeds the next chart card.
  const [chartSymbol, setChartSymbol] = useState('NSE:NIFTY');
  const [chartInterval, setChartInterval] = useState<TvInterval>('15');
  const [chartStudy, setChartStudy] = useState('none');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const analyzingRef = useRef(false);
  const recognitionRef = useRef<{ start: () => void; stop: () => void; lang: string } | null>(null);
  const handleSendRef = useRef<(text?: string, opts?: { trainingGrade?: boolean }) => void>(() => {});
  const ownerKey = user?.id || user?.email || 'guest';
  const skillProfile = useMemo(
    () => buildTraderSkillProfile(ownerKey, user),
    [ownerKey, user, skillTick, messages.length],
  );

  useEffect(() => {
    if (!isMentor) return;
    let cancelled = false;
    const load = async () => {
      const card = await fetchMentorDetective(chartSymbol, chartInterval);
      if (!cancelled) setDetective(card);
    };
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [isMentor, chartSymbol, chartInterval]);

  // Mentor always trains: punch a chart drill when tape updates / on a timer.
  useEffect(() => {
    if (!isMentor || !detective || activeDrill || isThinking) return;
    const t = window.setTimeout(() => {
      setActiveDrill(buildDrillFromDetective(detective));
    }, 8_000);
    return () => window.clearTimeout(t);
  }, [isMentor, detective?.symbol, detective?.ltp, detective?.zone, activeDrill, isThinking]);

  useEffect(() => {
    if (!isMentor || !detective || isThinking) return;
    const t = window.setInterval(() => {
      setActiveDrill((prev) => prev ?? buildDrillFromDetective(detective));
    }, 45_000);
    return () => window.clearInterval(t);
  }, [isMentor, detective, isThinking]);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;

  const currentWelcomeText = () =>
    isMentor
      ? 'Mentor AI training desk — I quiz you from the live chart and tape. Answer with process only (no chase).'
      : langMode === 'auto'
        ? 'Auto language on — type in any language and Hunter replies in the same one. Ask about NIFTY/BTC for live tape, or share a chart for structure.'
        : getMasterAiWelcome(selectedLang.code);

  useEffect(() => {
    const refresh = () => void fetchMasterAiStatus().then(setAiStatus);
    refresh();
    window.addEventListener(OPENROUTER_KEY_UPDATED_EVENT, refresh);
    window.addEventListener(API_SERVER_READY_EVENT, refresh);
    return () => {
      window.removeEventListener(OPENROUTER_KEY_UPDATED_EVENT, refresh);
      window.removeEventListener(API_SERVER_READY_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    type SpeechRecognitionInstance = {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      stop: () => void;
      onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
    };
    type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

    const W = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SpeechRecognitionCtor = W.SpeechRecognition ?? W.webkitSpeechRecognition;

    if (SpeechRecognitionCtor) {
      const rec = new SpeechRecognitionCtor();
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (event: { results: { 0: { 0: { transcript: string } } } }) => {
        const transcript = event.results[0]?.[0]?.transcript ?? '';
          setInputText(transcript);
          setIsListening(false);
        if (transcript.trim()) void handleSendRef.current(transcript);
        };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      }
      synthRef.current = window.speechSynthesis;
  }, []);

  useEffect(() => {
    const pane = chatAreaRef.current;
    if (!pane) return;
    // Empty / New Chat desk: keep Hunter logo at top (scrollIntoView was yanking mobile)
    const emptyDesk = messages.length <= 1 && !isThinking;
    if (emptyDesk) {
      pane.scrollTop = 0;
      return;
    }
    pane.scrollTo({
      top: pane.scrollHeight,
      behavior: isThinking ? 'auto' : 'smooth',
    });
  }, [messages, isThinking]);

  useEffect(() => {
    setChatSessions(persistActiveChat(activeChatIdRef.current, messages, chatScope));
  }, [messages]);

  useEffect(() => {
    if (!historyOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!historyMenuRef.current?.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHistoryOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [historyOpen]);

  useEffect(() => {
    if (!chartPromptOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!chartPromptRef.current?.contains(e.target as Node)) {
        setChartPromptOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChartPromptOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [chartPromptOpen]);

  useEffect(() => {
    if (selectedImage) {
      setChartPromptOpen(true);
      setLangMenuOpen(false);
      setHistoryOpen(false);
    } else {
      setChartPromptOpen(false);
    }
  }, [selectedImage]);

  const speakText = useCallback(
    (text: string) => {
      if (!synthRef.current) return;
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = isHinglishLang(selectedLang.code) ? 'hi-IN' : selectedLang.code;
      utterance.rate = hindi ? 0.88 : 0.95;
      utterance.pitch = 0.9; // slightly lower = more male-sounding
      const voices = synthRef.current.getVoices();
      const langPrefix = selectedLang.code.slice(0, 2);
      const maleHint = /male|man|ravi|amit|hemant|google UK English Male|google हिंदी|microsoft.*male|david|mark|rishi/i;
      const preferred =
        voices.find((v) => maleHint.test(v.name) && (v.lang === selectedLang.code || v.lang.startsWith(langPrefix) || v.lang.startsWith('hi'))) ??
        voices.find((v) => maleHint.test(v.name)) ??
        voices.find((v) => v.lang === selectedLang.code) ??
        voices.find((v) => v.lang.startsWith(langPrefix) && /hindi|india|hi-/i.test(v.name)) ??
        voices.find((v) => v.lang.startsWith(langPrefix));
      if (preferred) utterance.voice = preferred;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      synthRef.current.speak(utterance);
    },
    [selectedLang.code, hindi],
  );

  const onLanguageChange = (value: string) => {
    if (value === 'auto') {
      setLangMode('auto');
      saveLanguageMode('auto');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === 'welcome'
            ? {
                ...m,
                text: isMentor
                  ? 'Mentor AI training desk — I quiz you from the live chart and tape. Answer with process only (no chase).'
                  : 'Auto language on — type in any language and Hunter replies in the same one. Share a chart for structure analysis.',
              }
            : m,
        ),
      );
      setLangMenuOpen(false);
      setLangQuery('');
      return;
    }
    const code = value as MasterAiLangCode;
    const lang = getMasterAiLanguage(code);
    setLangMode(code);
    setSelectedLang(lang);
    saveLanguageMode(code);
    saveSelectedLanguage(code);
    setMessages((prev) =>
      prev.map((m) => (m.id === 'welcome' ? { ...m, text: getMasterAiWelcome(code) } : m)),
    );
    setLangMenuOpen(false);
    setLangQuery('');
  };

  useEffect(() => {
    if (!langMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!langMenuRef.current?.contains(e.target as Node)) {
        setLangMenuOpen(false);
        setLangQuery('');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLangMenuOpen(false);
        setLangQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [langMenuOpen]);

  const langGroups = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    const match = (l: MasterAiLanguage) =>
      !q ||
      l.name.toLowerCase().includes(q) ||
      l.nativeLabel.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q);
    return [
      { id: 'popular', label: 'Popular', items: MASTER_AI_LANGUAGES.filter((l) => l.group === 'popular' && match(l)) },
      { id: 'india', label: 'India & South Asia', items: MASTER_AI_LANGUAGES.filter((l) => l.group === 'india' && match(l)) },
      { id: 'world', label: 'World', items: MASTER_AI_LANGUAGES.filter((l) => l.group === 'world' && match(l)) },
    ].filter((g) => g.items.length > 0);
  }, [langQuery]);

  const clearSelectedImage = () => {
    setSelectedImage(null);
    setSelectedImageName('');
    setImageError(null);
    setChartPromptOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const applyDeskPrompt = (p: DeskPrompt, opts?: { send?: boolean }) => {
    let text = deskPromptText(p, useHiPrompts);
    if (p.id === 'training-plan' || text === 'MY_TRAINING_PLAN') {
      text = trainingPlanPrompt(skillProfile);
    }
    setInputText(text);
    setChartPromptOpen(false);
    queueMicrotask(() => {
      const el = document.querySelector('.mai-chat__textarea') as HTMLTextAreaElement | null;
      if (el) {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
        el.focus();
      }
    });
    if (opts?.send) void handleSendRef.current(text);
  };

  const answerDrill = (optionId: string) => {
    if (!activeDrill) return;
    const correct = isDrillAnswerCorrect(activeDrill, optionId);
    saveDrillResult(
      {
        drillId: activeDrill.id,
        chosenId: optionId,
        correct,
        at: new Date().toISOString(),
        symbol: activeDrill.symbol,
      },
      ownerKey,
    );
    setSkillTick((n) => n + 1);
    const chosen = activeDrill.options.find((o) => o.id === optionId)?.label || optionId;
    const gradeMsg = [
      `[DECISION TRAINING] My choice: ${chosen} (${optionId}).`,
      `Drill: ${activeDrill.question}`,
      `Correct process key: ${activeDrill.correctId}.`,
      `Brief reason key: ${activeDrill.reason}`,
      'Grade my process. No Entry/Stop/Target.',
    ].join('\n');
    setActiveDrill(null);
    void handleSendRef.current(gradeMsg, { trainingGrade: true });
  };

  const speakDetectiveBriefing = () => {
    if (!detective) return;
    const line = [
      `${detective.symbol} market briefing.`,
      `Trend ${detective.trend}.`,
      `Zone ${detective.zone}.`,
      `Liquidity: ${detective.liquidity}.`,
      `Institutional area: ${detective.institutionalZone}.`,
      `Volatility ${detective.volatility}.`,
      `Process: ${detective.bestAction}.`,
      `Confidence ${detective.confidence} percent — evidence score, not win rate.`,
    ].join(' ');
    speakText(line);
  };

  const handleNewChat = () => {
    if (isThinking) return;
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
    clearSelectedImage();
    setInputText('');
    setHistoryOpen(false);
    const next = startNewChat(activeChatId, messages, currentWelcomeText(), chatScope);
    setActiveChatId(next.activeId);
    setMessages(next.messages);
    setChatSessions(next.sessions);
    requestAnimationFrame(() => {
      if (chatAreaRef.current) chatAreaRef.current.scrollTop = 0;
    });
  };

  const handleOpenChat = (id: string) => {
    if (id === activeChatId || isThinking) {
      setHistoryOpen(false);
      return;
    }
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
    clearSelectedImage();
    setInputText('');
    const next = switchChat(activeChatId, messages, id, currentWelcomeText(), chatScope);
    if (!next) return;
    setActiveChatId(next.activeId);
    setMessages(next.messages);
    setChatSessions(next.sessions);
    setHistoryOpen(false);
  };

  const handleDeleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isThinking) return;
    const next = deleteChat(activeChatId, id, currentWelcomeText(), chatScope);
    setActiveChatId(next.activeId);
    setMessages(next.messages);
    setChatSessions(next.sessions);
    if (id === activeChatId) {
      clearSelectedImage();
      setInputText('');
    }
  };

  const processChartFile = async (file: File) => {
    if (analyzingRef.current) return;
    setImageError(null);
    try {
      const { dataUrl, fileName } = await prepareChartImageForAi(file);
      setSelectedImage(dataUrl);
      setSelectedImageName(fileName);
    } catch (err) {
      // "Unsupported format" / "max 14 MB" tell the user what to change; the
      // generic line only tells them something broke.
      setImageError(
        err instanceof Error && err.message
          ? err.message
          : getMasterAiSorryMessage(selectedLang.code, 'image'),
      );
      clearSelectedImage();
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void processChartFile(file);
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          void processChartFile(file);
        }
        break;
      }
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void processChartFile(file);
  };

  /** Charts live in the transcript as their own card, right where they were asked for. */
  const makeChartMessage = useCallback(
    (chart: ChatChartAttachment): Message => ({
      id: `${Date.now()}-chart-${Math.random().toString(36).slice(2, 7)}`,
      role: 'trafi',
      text: '',
      timestamp: new Date(),
      chart,
    }),
    [],
  );

  const updateChartMessage = useCallback((id: string, patch: Partial<ChatChartAttachment>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id && m.chart ? { ...m, chart: { ...m.chart, ...patch } } : m)),
    );
    // Remember the last setup so the next card opens on the same instrument.
    if (patch.symbol) setChartSymbol(patch.symbol);
    if (patch.interval) setChartInterval(patch.interval);
    if (patch.study) setChartStudy(patch.study);
  }, []);

  const removeChartMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addChartCard = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      makeChartMessage({ symbol: chartSymbol, interval: chartInterval, study: chartStudy }),
    ]);
  }, [makeChartMessage, chartSymbol, chartInterval, chartStudy]);

  // Mentor desk always keeps a live chart so quizzes come from tape + structure.
  useEffect(() => {
    if (!isMentor) return;
    setMessages((prev) => {
      if (prev.some((m) => m.chart)) return prev;
      return [
        ...prev,
        makeChartMessage({ symbol: chartSymbol, interval: chartInterval, study: chartStudy }),
      ];
    });
  }, [isMentor, activeChatId, makeChartMessage, chartSymbol, chartInterval, chartStudy]);

  // Periodic AI quiz punch from open chart (Mentor only).
  useEffect(() => {
    if (!isMentor) return;
    const t = window.setInterval(() => {
      if (analyzingRef.current || activeDrill) return;
      const quiz = MENTOR_CHAT_PROMPTS.find((p) => p.id === 'chart-quiz');
      if (quiz) void handleSendRef.current(deskPromptText(quiz, false));
    }, 150_000);
    return () => window.clearInterval(t);
  }, [isMentor, activeDrill]);

  const handleSend = async (
    textOverride?: string,
    opts?: { imageDataUrl?: string | null; imageName?: string; trainingGrade?: boolean },
  ) => {
    // One request at a time — parallel sends interleave replies out of order.
    if (analyzingRef.current) return;
    const text = textOverride ?? inputText;
    const imageDataUrl = opts?.imageDataUrl ?? selectedImage;
    const imageName = opts?.imageName ?? selectedImageName;
    const hasImage = Boolean(imageDataUrl);
    const userNote = text.trim();
    const userText =
      userNote ||
      (hasImage
        ? hindi
          ? `Chart analysis: ${imageName}`
          : `Chart analysis: ${imageName}`
        : '');

    if (!userText && !hasImage) return;

    // Every market question gets a live chart beside the answer — AI draws on it
    // automatically. Concept lessons ("RSI kya hota hai") and journal reviews stay
    // text-only so they are not forced onto a random ticker.
    let chartMsg: Message | null = null;
    let chartMessageId: string | null = null;
    let chartTarget: ChatChartAttachment | null = null;
    if (!hasImage) {
      const chartReq = detectChartRequest(userText);
      const mentioned = chartReq ? null : detectInstrumentMention(userText);
      const lastChart = [...messages].reverse().find((m) => m.chart);
      const marksExisting = !chartReq && !mentioned && isChartMarkupRequest(userText);
      const conceptOnly =
        /\b(kya\s+(hai|hota|hoti)|what\s+is|what\s+are|explain|samjha|samjhao|meaning|definition|difference|kaise\s+kaam)\b/i.test(
          userText,
        ) && !mentioned && !chartReq && !marksExisting;
      const journalOnly = isJournalReviewQuestion(userText);
      // No ticker named → reuse last/on-screen chart, else default NIFTY so the
      // answer always has a canvas to draw on.
      const autoMarketChart =
        !chartReq &&
        !mentioned &&
        !marksExisting &&
        !conceptOnly &&
        !journalOnly &&
        isTradingRelated(userText);
      const symbol =
        chartReq?.tvSymbol ||
        mentioned ||
        (marksExisting || autoMarketChart
          ? lastChart?.chart?.symbol || chartSymbol || 'NSE:NIFTY'
          : '') ||
        (chartReq ? chartSymbol : '');

      if (symbol) {
        const interval =
          marksExisting || autoMarketChart
            ? lastChart?.chart?.interval ?? chartInterval
            : chartReq?.interval ?? chartInterval;
        const study = chartReq?.study ?? chartStudy;
        setChartSymbol(symbol);
        setChartInterval(interval);
        setChartStudy(study);

        // An immediate follow-up marks up the card still on screen; once the
        // conversation has moved on, the answer needs a chart of its own or the
        // markings land somewhere the user has already scrolled past.
        const stillOnScreen =
          lastChart !== undefined && messages.slice(-3).some((m) => m.id === lastChart.id);
        if (!chartReq && stillOnScreen && lastChart?.chart?.symbol === symbol) {
          chartMessageId = lastChart.id;
        } else {
          chartMsg = makeChartMessage({ symbol, interval, study });
          chartMessageId = chartMsg.id;
        }
        chartTarget = { symbol, interval, study };
      }
    }

    // Greetings / short thanks — no chart needed
    if (!hasImage && (isCasualGreeting(userText) || isPoliteAck(userText))) {
      const recentUser = messages
        .filter((m) => m.role === 'user')
        .slice(-4)
        .map((m) => m.text)
        .reverse();
      const activeLang = resolveMasterAiLanguage(
        langMode,
        userText,
        selectedLang.code,
        recentUser,
      );
      if (langMode === 'auto' && activeLang.code !== selectedLang.code) {
        setSelectedLang(activeLang);
        saveSelectedLanguage(activeLang.code);
      }
      const reply = isCasualGreeting(userText)
        ? getHumanGreetingReply(activeLang.code, userText)
        : isHindiLang(activeLang.code) || isHinglishLang(activeLang.code)
          ? 'Theek hai. Aage bataiye — chart ya sawal.'
          : 'Understood. Share the chart or your question whenever you are ready.';
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-u`, role: 'user', text: userText, timestamp: new Date() },
        { id: `${Date.now()}-a`, role: 'trafi', text: reply, timestamp: new Date() },
      ]);
      setInputText('');
      return;
    }

    // Day / market questions go to the API — server injects live TradingView tape
    // (do NOT hard-block with "send screenshot" when live data is available).

    // If chat already started, always continue — never block mid-conversation
    const continuingThread = hasActiveDeskThread(messages);

    if (!hasImage && !isTradingRelated(userText) && !continuingThread && !chartMessageId) {
      const recentUser = messages
        .filter((m) => m.role === 'user')
        .slice(-4)
        .map((m) => m.text)
        .reverse();
      const blockLang = resolveMasterAiLanguage(
        langMode,
        userText,
        selectedLang.code,
        recentUser,
      );
      if (langMode === 'auto' && blockLang.code !== selectedLang.code) {
        setSelectedLang(blockLang);
        saveSelectedLanguage(blockLang.code);
      }
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-u`, role: 'user', text: userText, timestamp: new Date() },
        {
          id: `${Date.now()}-block`,
        role: 'trafi',
          text: getTradingBlockMessage(blockLang.code),
        timestamp: new Date(),
        },
      ]);
      setInputText('');
      clearSelectedImage();
      return;
    }

    const userMsg: Message = {
      id: `${Date.now()}-u`,
      role: 'user',
      text: hasImage
        ? userNote || (hindi ? '📷 Chart screenshot — analysis chahiye' : '📷 Chart screenshot — analyze this')
        : userText,
      timestamp: new Date(),
      imageUrl: hasImage ? imageDataUrl ?? undefined : undefined,
    };
    setMessages((prev) => [...prev, userMsg, ...(chartMsg ? [chartMsg] : [])]);
    setInputText('');
    analyzingRef.current = true;
    setIsThinking(true);
    if (hasImage) setIsAnalyzingChart(true);

    const history: ChatHistoryItem[] = messages
      .filter((m) => m.id !== 'welcome' && m.text.trim().length > 0)
      .slice(-24)
      .map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text.slice(0, 2000),
      }));

    try {
      const detectFrom = userNote.trim() || (hasImage ? '' : userText);
      const recentUser = messages
        .filter((m) => m.role === 'user')
        .slice(-4)
        .map((m) => m.text)
        .reverse();
      const explicitLang = detectExplicitLanguageRequest(detectFrom);
      const activeLang = explicitLang
        ? getMasterAiLanguage(explicitLang)
        : resolveMasterAiLanguage(
            langMode,
            detectFrom,
            selectedLang.code || 'hi-Latn',
            recentUser,
          );
      if (langMode === 'auto' || explicitLang) {
        if (activeLang.code !== selectedLang.code) {
          setSelectedLang(activeLang);
          saveSelectedLanguage(activeLang.code);
        }
      }
      const visionMessage = hasImage
        ? getChartVisionPrompt(activeLang.code, userNote || undefined, langMode === 'auto')
        : userText;

      let responseText = '';

      if (!aiStatus.configured) {
        responseText =
          isHindiLang(activeLang.code) || isHinglishLang(activeLang.code)
            ? 'Wolf AI key ready nahi hai. Profile mein AI key add karke phir try kijiye.'
            : 'Wolf AI is not configured yet. Add an AI key in Profile and try again.';
      } else {
        try {
          const lastAi = [...messages]
            .reverse()
            .find((m) => m.role === 'trafi' && m.id !== 'welcome' && m.text.trim().length > 40);
          const journalContext = !hasImage && isJournalReviewQuestion(userText)
            ? buildJournalContextForAi(loadLocalTrades(user))
            : undefined;
          // Without this the model has no idea which instrument "mark it" means.
          const wantsMarkNow = isChartMarkupRequest(userText);
          const wantsTrendNow =
            /\b(trend\s*lines?|trendlines?|trend\s*live|trend\s*channel|price\s*channel)\b|\btrend\b.*\b(mark|draw|line|channel|khinch)/i.test(
              userText,
            );
          const wantsObNow =
            !wantsTrendNow &&
            /\b(order\s*blocks?|orderblocks?|\bob\b|breaker\s*blocks?|mitigation\s*blocks?|supply\s*zone|demand\s*zone)\b/i.test(
              userText,
            );
          const recentLiqContext = [...messages]
            .slice(-8)
            .some((m) =>
              /liquidity|\bbsl\b|\bssl\b|\bpdh\b|\bpdl\b|\bpwh\b|\bpwl\b|\bpmh\b|\bpml\b|BSL \(High Vol\)|SSL \(High Vol\)/i.test(
                m.text || '',
              ),
            );
          const wantsLiqNow =
            !wantsTrendNow &&
            !wantsObNow &&
            (/\b(liquidity|liquidty|liq\b|buy[\s-]*side|sell[\s-]*side|\bbsl\b|\bssl\b|eqh|eql|equal\s*highs?|equal\s*lows?|pdh|pdl|pwh|pwl|pmh|pml)\b/i.test(
              userText,
            ) ||
              // "chart me mark kar do" after a liquidity answer → keep Pine liq tool
              (wantsMarkNow && recentLiqContext));
          const wantsSrNow =
            !wantsTrendNow &&
            !wantsObNow &&
            !wantsLiqNow &&
            /\b(support|resistance|s\/r|sup\s*\/\s*res|support\s*(aur|and|&)?\s*resistance)\b/i.test(
              userText,
            );
          const chartHint = chartTarget
            ? `\n\n[CHART OPEN BESIDE THIS CHAT: ${tradingViewSymbolLabel(chartTarget.symbol)} · ${chartTarget.interval}. ALWAYS draw on this chart for every answer and emit the wolfchart block. NEVER ask for a screenshot.${
                wantsTrendNow
                  ? ' TRENDLINE ASK: draw DIAGONAL Upper + Lower trendline rays on swing highs/lows (both sides of the channel). Forbidden: horizontal S-R level rays or hray labels.'
                  : wantsObNow
                    ? ' ORDER BLOCK ASK: Pine FVG+high-vol zones from tape — Bull OB #00ff9d / Bear OB #ff4d4d boxes extend right.'
                    : wantsLiqNow
                      ? ' LIQUIDITY ASK: Pine logic hrays — BSL/SSL (High Vol), PDH/PDL/PWH/PWL/PMH/PML. Not SUPPORT/RESISTANCE labels.'
                      : wantsMarkNow
                        ? ' EXPLICIT MARK: match the tool the user named; end with wolfchart.'
                        : ''
              }]`
            : '';
          const baseMessage = `${userText}${chartHint}`;
          const textMessage = hasImage
            ? visionMessage
            : explicitLang && lastAi
              ? `${userText}${chartHint}\n\n[CRITICAL: Re-state the PREVIOUS analysis below in ${activeLang.replyIn}. Keep same Bias and marked areas. SHORT — under ~100 words. Do NOT ask for a chart.${
                  chartTarget ? ' Still append the wolfchart block with those levels drawn.' : ''
                }]\n\nPREVIOUS ANALYSIS:\n${lastAi.text.slice(0, 2000)}`
              : continuingThread && !journalContext && !wantsMarkNow
                ? `${baseMessage}\n\n[Continue briefly from previous messages. Under ~80 words. Do NOT ask for a chart again.${
                    chartTarget
                      ? ' ALWAYS append the wolfchart block and redraw relevant levels/zones on the open chart.'
                      : ''
                  }]`
                : journalContext
                  ? `${userText}\n\n[JOURNAL REVIEW v3.0: Use PLATFORM TRADING JOURNAL context only. Score completeness/quality when evidence exists. Under ~200 words.]`
                  : baseMessage;
          const result = await askMasterAi(
            {
              message: textMessage,
              model: MASTER_AI_MODEL_ID,
              lang: activeLang.code,
              langName: activeLang.nativeLabel,
              langMode: explicitLang ? explicitLang : langMode,
              imageDataUrl: hasImage ? imageDataUrl : null,
              history,
              needsWeb: !hasImage && shouldUseWebSearch(userText),
              journalContext,
              mentorMode: isMentor ? mentorMode : 'professional',
              roomMode: isMentor ? roomMode : false,
              trainingGrade: Boolean(opts?.trainingGrade),
              mentorDesk: isMentor,
              markTool: wantsTrendNow
                ? 'trend'
                : wantsObNow
                  ? 'ob'
                  : wantsLiqNow
                    ? 'liq'
                    : wantsSrNow
                      ? 'sr'
                      : wantsMarkNow
                        ? 'auto'
                        : undefined,
            },
            hasImage
              ? {
                  summary: 'Chart screenshot + server live tape cross-check',
                  nifty: 'from chart',
                  bankNifty: 'from chart',
                  pcr: 0,
                  maxPain: 0,
                  signals: 'from chart',
                  news: 'n/a',
                  gainers: 'n/a',
                  losers: 'n/a',
                  active: 'n/a',
                  breadth: 'n/a',
                  futures: 'n/a',
                  session: 'from chart',
                }
              : // Real local snapshot; the server still overlays its own live TradingView tape.
                buildMasterMarketContext(),
          );
          responseText =
            (result.reply || '').trim() ||
            getMasterAiSorryMessage(activeLang.code, hasImage ? 'chart' : 'chat');
        } catch (err) {
          console.warn('[Wolf AI] chat failed:', err);
          responseText = describeMasterAiFailure(
            err,
            activeLang.code,
            hasImage ? 'chart' : 'chat',
          );
        }
      }

      // Wolf AI hides its chart markup at the end of the reply — lift it out
      // before anything reaches the transcript or the speech engine.
      const parsed = parseChartAnnotations(responseText);
      const marked = parsed.levels.length > 0 || parsed.shapes.length > 0;
      // A reply that was nothing but markup still needs a line to sit under.
      responseText =
        parsed.text ||
        (marked ? (hindi ? 'Chart par marking kar di hai.' : 'Marked on the chart.') : responseText);

      // A screenshot only tells us the instrument once the model has read it,
      // so the matching live chart is built here rather than before the send.
      // Markings with nowhere to go would be lost, so they get their own card.
      let replyChart: Message | null = null;
      if (!chartMessageId && (parsed.symbol || marked)) {
        const symbol = parsed.symbol ?? chartSymbol;
        const interval = parsed.interval ?? chartInterval;
        replyChart = makeChartMessage({
          symbol,
          interval,
          study: chartStudy,
          levels: parsed.levels,
          shapes: parsed.shapes,
        });
        setChartSymbol(symbol);
        setChartInterval(interval);
      } else if (chartMessageId && parsed.interval) {
        // The user's wording won; a timeframe the model read off the image wins back.
        updateChartMessage(chartMessageId, { interval: parsed.interval });
      }

      const aiMsg: Message = {
        id: `${Date.now()}-a`,
        role: 'trafi',
        text: responseText,
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const next =
          marked && chartMessageId
            ? prev.map((m) =>
                m.id === chartMessageId && m.chart
                  ? { ...m, chart: { ...m.chart, levels: parsed.levels, shapes: parsed.shapes } }
                  : m,
              )
            : prev;
        return [...next, ...(replyChart ? [replyChart] : []), aiMsg];
      });

      if (autoSpeak) speakText(responseText);
    } finally {
      analyzingRef.current = false;
      setIsThinking(false);
      setIsAnalyzingChart(false);
      clearSelectedImage();
    }
  };

  handleSendRef.current = (text, sendOpts) => {
    void handleSend(text, sendOpts);
  };

  useEffect(() => {
    const pending = consumeHunterPendingPrompt();
    if (!pending) return;
    const t = window.setTimeout(() => {
      void handleSendRef.current(pending);
    }, 450);
    return () => window.clearTimeout(t);
  }, []);

  const onAutoSpeakToggle = () => {
    const next = !autoSpeak;
    setAutoSpeak(next);
    saveAutoSpeak(next);
    if (!next && synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  return (
    <div className="mai-chat">
      <header className="mai-chat__topbar">
        <div className="mai-chat__brand">
          <div className="mai-chat__avatar" aria-hidden>
            <LineChart className="h-4 w-4" />
            <span
              className={`mai-chat__pulse ${
                isSpeaking ? 'mai-chat__pulse--live' : aiStatus.configured ? 'mai-chat__pulse--ok' : 'mai-chat__pulse--warn'
              }`}
            />
          </div>
          <div className="min-w-0">
            <div className="mai-chat__title-row">
              <h1 className="mai-chat__title">{isMentor ? 'Mentor AI' : AI_PRODUCT_NAME}</h1>
              <span className="mai-chat__badge">{isMentor ? 'Trainer' : 'Hunter'}</span>
            </div>
            <p className="mai-chat__status" title={aiStatus.message}>
              {aiStatus.configured
                ? langMode === 'auto'
                  ? `Ready · Auto · ${selectedLang.nativeLabel}`
                  : `Ready · ${selectedLang.nativeLabel}`
                : aiStatus.message}
            </p>
          </div>
        </div>

        <div className="mai-chat__controls">
          <button
            type="button"
            onClick={addChartCard}
            className="mai-chat__chip"
            title={
              hindi
                ? 'Chat mein live chart daalo — "NIFTY ka 5 min chart dikha" bhi likh sakte ho'
                : 'Drop a live chart into the chat — you can also type "show NIFTY 5 min chart"'
            }
          >
            <CandlestickChart className="h-3.5 w-3.5" />
            <span>Chart</span>
          </button>

          <button
            type="button"
            onClick={handleNewChat}
            className="mai-chat__chip mai-chat__chip--accent"
            title={hindi ? 'Nayi chat — purani se link nahi' : 'New chat — fresh context'}
            disabled={isThinking}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Chat</span>
          </button>

          <div className={`mai-chat__history ${historyOpen ? 'mai-chat__history--open' : ''}`} ref={historyMenuRef}>
            <button
              type="button"
              onClick={() => {
                setLangMenuOpen(false);
                setHistoryOpen((o) => !o);
              }}
              className={`mai-chat__chip ${historyOpen ? 'mai-chat__chip--active' : ''}`}
              title={hindi ? 'Purani chats' : 'Chat history'}
              aria-expanded={historyOpen}
              aria-haspopup="listbox"
            >
              <History className="h-3.5 w-3.5" />
              <span>History</span>
            </button>

            <AnimatePresence>
              {historyOpen ? (
                <motion.div
                  className="mai-chat__history-menu"
                  role="listbox"
                  aria-label="Chat history"
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                >
                  <div className="mai-chat__history-head">
                    <span>Previous chats</span>
                    <button type="button" className="mai-chat__history-new" onClick={handleNewChat}>
                      <Plus className="h-3.5 w-3.5" />
                      New Chat
                    </button>
                  </div>
                  <div className="mai-chat__history-scroll">
                    {chatSessions.length === 0 ? (
                      <p className="mai-chat__history-empty">No saved chats yet</p>
                    ) : (
                      chatSessions.map((s) => {
                        const on = s.id === activeChatId;
                        return (
                          <div
                            key={s.id}
                            role="option"
                            aria-selected={on}
                            className={`mai-chat__history-item ${on ? 'mai-chat__history-item--on' : ''}`}
                            onClick={() => handleOpenChat(s.id)}
                          >
                            <div className="mai-chat__history-item-main">
                              <span className="mai-chat__history-item-title">{s.title}</span>
                              <span className="mai-chat__history-item-time">{formatChatTime(s.updatedAt)}</span>
                            </div>
                            <button
                              type="button"
                              className="mai-chat__history-del"
                              aria-label="Delete chat"
                              title="Delete"
                              onClick={(e) => handleDeleteChat(s.id, e)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={onAutoSpeakToggle}
            className={`mai-chat__chip ${autoSpeak ? 'mai-chat__chip--on' : ''}`}
            title={autoSpeak ? 'Auto-speak on' : 'Speak only when you tap Speak'}
          >
            {autoSpeak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span>Voice</span>
          </button>

          {isMentor ? (
            <>
              <div className="mai-chat__mentor-modes" title="Mentor personality">
                {MENTOR_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`mai-chat__chip mai-chat__chip--sm ${mentorMode === m.id ? 'mai-chat__chip--on' : ''}`}
                    title={m.hint}
                    onClick={() => {
                      setMentorMode(m.id);
                      saveMentorMode(m.id);
                    }}
                  >
                    {m.id === 'beginner' ? (
                      <GraduationCap className="h-3 w-3" />
                    ) : m.id === 'strict' ? (
                      <Swords className="h-3 w-3" />
                    ) : m.id === 'socratic' ? (
                      <HelpCircle className="h-3 w-3" />
                    ) : (
                      <Brain className="h-3 w-3" />
                    )}
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="mai-chat__chip mai-chat__chip--on"
                title="Always-on training — chart drills stay live"
                onClick={() => detective && setActiveDrill(buildDrillFromDetective(detective))}
                disabled={!detective || isThinking}
              >
                <Target className="h-3.5 w-3.5" />
                <span>Next quiz</span>
              </button>

              <button
                type="button"
                className={`mai-chat__chip ${roomMode ? 'mai-chat__chip--on' : ''}`}
                title="AI Trading Room — multi-role reply"
                onClick={() => {
                  const next = !roomMode;
                  setRoomMode(next);
                  saveRoomMode(next);
                }}
              >
                <Split className="h-3.5 w-3.5" />
                <span>Room</span>
              </button>
            </>
          ) : null}

          <div className={`mai-chat__lang ${langMenuOpen ? 'mai-chat__lang--open' : ''}`} ref={langMenuRef}>
            <button
              type="button"
              className={`mai-chat__chip mai-chat__lang-trigger ${langMenuOpen ? 'mai-chat__chip--active' : ''}`}
              onClick={() => {
                setHistoryOpen(false);
                setLangMenuOpen((o) => !o);
              }}
              aria-label="Reply language"
              aria-expanded={langMenuOpen}
              aria-haspopup="listbox"
              title="Auto detects language from your message, or lock a language"
            >
              <Languages className="h-3.5 w-3.5 shrink-0" />
              <span className="mai-chat__lang-label">
                {langMode === 'auto' ? `Auto · ${selectedLang.nativeLabel}` : selectedLang.nativeLabel}
              </span>
              <ChevronDown className={`mai-chat__lang-chevron ${langMenuOpen ? 'mai-chat__lang-chevron--up' : ''}`} />
            </button>

            <AnimatePresence>
              {langMenuOpen ? (
                <motion.div
                  className="mai-chat__lang-menu"
                  role="listbox"
                  aria-label="Select reply language"
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                >
                  <div className="mai-chat__lang-glow" aria-hidden />
                  <div className="mai-chat__lang-head">
                    <div className="mai-chat__lang-head-title">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Reply language</span>
                    </div>
                    <input
                      type="search"
                      className="mai-chat__lang-search"
                      placeholder="Search language…"
                      value={langQuery}
                      onChange={(e) => setLangQuery(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="mai-chat__lang-scroll">
                    <button
                      type="button"
                      role="option"
                      aria-selected={langMode === 'auto'}
                      className={`mai-chat__lang-item mai-chat__lang-item--auto ${langMode === 'auto' ? 'mai-chat__lang-item--on' : ''}`}
                      onClick={() => onLanguageChange('auto')}
                    >
                      <span className="mai-chat__lang-item-main">
                        <span className="mai-chat__lang-item-name">Auto detect</span>
                        <span className="mai-chat__lang-item-sub">Matches your message · {selectedLang.nativeLabel}</span>
                      </span>
                      {langMode === 'auto' ? <Check className="mai-chat__lang-check" /> : null}
                    </button>

                    {langGroups.map((group) => (
                      <div key={group.id} className="mai-chat__lang-group">
                        <div className="mai-chat__lang-group-label">{group.label}</div>
                        {group.items.map((l) => {
                          const on = langMode === l.code;
                          return (
                            <button
                              key={l.code}
                              type="button"
                              role="option"
                              aria-selected={on}
                              className={`mai-chat__lang-item ${on ? 'mai-chat__lang-item--on' : ''}`}
                              onClick={() => onLanguageChange(l.code)}
                            >
                              <span className="mai-chat__lang-item-main">
                                <span className="mai-chat__lang-item-name">{l.nativeLabel}</span>
                                <span className="mai-chat__lang-item-sub">{l.name}</span>
                              </span>
                              {on ? <Check className="mai-chat__lang-check" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ))}

                    {langGroups.length === 0 ? (
                      <p className="mai-chat__lang-empty">No language matched</p>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <div
        ref={chatAreaRef}
        className="mai-chat__scroll"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        <div className="mai-chat__column">
          {isMentor && detective ? (
            <div className="mai-detective" aria-label="Market condition">
              <div className="mai-detective__head">
                <span className="mai-detective__title">Market Condition</span>
                <span className="mai-detective__sym">
                  {detective.symbol} · {detective.interval}
                </span>
                <button
                  type="button"
                  className="mai-detective__brief"
                  onClick={speakDetectiveBriefing}
                  title="Speak mentor briefing"
                >
                  <Mic2 className="h-3.5 w-3.5" />
                  Briefing
                </button>
              </div>
              <div className="mai-detective__grid">
                <div>
                  <span>Trend</span>
                  <b>{detective.trend}</b>
                </div>
                <div>
                  <span>Liquidity</span>
                  <b>{detective.liquidity}</b>
                </div>
                <div>
                  <span>Zone</span>
                  <b>{detective.zone}</b>
                </div>
                <div>
                  <span>Volatility</span>
                  <b>{detective.volatility}</b>
                </div>
                <div className="mai-detective__wide">
                  <span>Best process action</span>
                  <b>{detective.bestAction}</b>
                </div>
                <div>
                  <span>Confidence</span>
                  <b>{detective.confidence}% · evidence</b>
                </div>
              </div>
              {detective.mtf ? (
                <div className="mai-detective__mtf">
                  Daily {detective.mtf.daily} · 1H {detective.mtf.h1} · Chart TF {detective.mtf.entryTf}
                </div>
              ) : null}
            </div>
          ) : null}

          {isMentor ? (
            <div className="mai-skill" aria-label="Trader skill profile">
              <div className="mai-skill__head">
                <Trophy className="h-3.5 w-3.5" />
                <span>{skillProfile.level.label}</span>
                <span className="mai-skill__xp">{skillProfile.xp} XP</span>
                <button
                  type="button"
                  className="mai-skill__plan"
                  disabled={isThinking}
                  onClick={() =>
                    applyDeskPrompt(
                      MENTOR_CHAT_PROMPTS.find((p) => p.id === 'training-plan')!,
                      { send: true },
                    )
                  }
                >
                  My training plan
                </button>
              </div>
              <div className="mai-skill__bars">
                {(
                  [
                    ['Reading', skillProfile.scores.marketReading],
                    ['Timing', skillProfile.scores.entryTiming],
                    ['Risk', skillProfile.scores.riskManagement],
                    ['Patience', skillProfile.scores.patience],
                  ] as const
                ).map(([label, val]) => (
                  <div key={label} className="mai-skill__bar">
                    <span>
                      {label} <em>{val}</em>
                    </span>
                    <i style={{ width: `${val}%` }} />
                  </div>
                ))}
              </div>
              <p className="mai-skill__focus">
                Focus this week: {skillProfile.weakness}. {skillProfile.focusWeek[0]}
              </p>
              <div className="mai-skill__ach">
                {skillProfile.achievements.map((a) => (
                  <span
                    key={a.id}
                    className={`mai-skill__badge ${a.earned ? 'mai-skill__badge--on' : ''}`}
                    title={a.detail}
                  >
                    {a.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {isMentor && activeDrill ? (
            <div className="mai-drill" role="group" aria-label="Decision training">
              <div className="mai-drill__head">
                <Target className="h-3.5 w-3.5" />
                <span>Decision Training</span>
                <button
                  type="button"
                  className="mai-drill__skip"
                  onClick={() => setActiveDrill(null)}
                >
                  Dismiss
                </button>
              </div>
              <p className="mai-drill__q">{activeDrill.question}</p>
              <div className="mai-drill__opts">
                {activeDrill.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={isThinking}
                    onClick={() => answerDrill(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ) : isMentor ? (
            <div className="mai-drill mai-drill--idle">
              <button
                type="button"
                disabled={!detective || isThinking}
                onClick={() => detective && setActiveDrill(buildDrillFromDetective(detective))}
              >
                <Target className="h-3.5 w-3.5" />
                Ask me a drill
              </button>
            </div>
          ) : null}

          {messages.length <= 1 && !isThinking ? (
            <div className="mai-chat__empty">
              <HunterMark />
              <motion.h2
                className="mai-chat__empty-title"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.4 }}
              >
                {isMentor
                  ? 'Ready to train from the live chart?'
                  : hindi
                    ? 'Aaj kya analyse karna hai?'
                    : 'What should we analyse today?'}
              </motion.h2>
              <motion.p
                className="mai-chat__empty-sub"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14, duration: 0.4 }}
              >
                {isMentor
                  ? 'I will punch process quizzes from Market Condition — answer, get graded, level up.'
                  : hindi
                    ? 'Quick prompt choose karo, ya chart attach karke desk question select karo'
                    : 'Pick a quick prompt — or attach a chart and choose a desk question'}
              </motion.p>

              <div className="mai-chat__suggestions" role="list">
                {deskPrompts.map((p, i) => {
                  const Icon = CHAT_PROMPT_ICONS[p.id] ?? Sparkles;
                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      role="listitem"
                      className="mai-chat__suggest"
                      disabled={isThinking || isListening}
                      onClick={() => applyDeskPrompt(p, { send: true })}
                      initial={{ opacity: 0, y: 18, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        delay: 0.18 + i * 0.055,
                        type: 'spring',
                        stiffness: 420,
                        damping: 26,
                      }}
                      whileHover={{ y: -3, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="mai-chat__suggest-glow" aria-hidden />
                      <span className="mai-chat__suggest-icon" aria-hidden>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="mai-chat__suggest-body">
                        <span className="mai-chat__suggest-label">{deskPromptLabel(p, useHiPrompts)}</span>
                        <span className="mai-chat__suggest-hint">{deskPromptHint(p, useHiPrompts)}</span>
                      </span>
                      <Sparkles className="mai-chat__suggest-spark" aria-hidden />
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <AnimatePresence>
            {messages.map((message) => {
              const isUser = message.role === 'user';
              if (message.id === 'welcome') return null;

              if (message.chart) {
                const chart = message.chart;
                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    className="mai-chat__row mai-chat__row--ai"
                  >
                    <div className="mai-chat__msg-avatar" aria-hidden>
                      <CandlestickChart className="h-3.5 w-3.5" />
                    </div>
                    <div className="mai-chat__chart-card">
                      <ChatChartPanel
                        symbol={chart.symbol}
                        interval={chart.interval}
                        study={chart.study}
                        onSymbolChange={(symbol) => updateChartMessage(message.id, { symbol })}
                        onIntervalChange={(interval) => updateChartMessage(message.id, { interval })}
                        onStudyChange={(study) => updateChartMessage(message.id, { study })}
                        onClose={() => removeChartMessage(message.id)}
                        closeLabel="Remove chart"
                        levels={chart.levels}
                        shapes={chart.shapes}
                      />
                    </div>
                  </motion.div>
                );
              }

              const roomSections =
                !isUser && roomMode ? parseRoomSections(message.text) : null;

              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 14, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  className={`mai-chat__row ${isUser ? 'mai-chat__row--user' : 'mai-chat__row--ai'}`}
                >
                  {!isUser ? (
                    <motion.div
                      className="mai-chat__msg-avatar"
                      aria-hidden
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.05, type: 'spring', stiffness: 420, damping: 22 }}
                    >
                      <LineChart className="h-3.5 w-3.5" />
                    </motion.div>
                  ) : null}

                  <motion.div
                    className={`mai-chat__bubble ${isUser ? 'mai-chat__bubble--user' : 'mai-chat__bubble--ai'}`}
                    initial={isUser ? { opacity: 0, x: 12 } : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {!isUser ? <div className="mai-chat__bubble-glow" aria-hidden /> : null}
                    {message.imageUrl ? (
                      <img src={message.imageUrl} alt="" className="mai-chat__img" />
                    ) : null}
                    <div className="mai-chat__text">
                      {isUser ? (
                        message.text
                      ) : roomSections ? (
                        <div className="mai-room">
                          {roomSections.map((sec) => (
                            <div key={sec.title} className="mai-room__card">
                              <div className="mai-room__role">{sec.title}</div>
                              <ChatMarkdown text={sec.body} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <ChatMarkdown text={message.text} />
                      )}
                    </div>
                    {!isUser ? (
                      <div className="mai-chat__meta">
                        <button type="button" onClick={() => speakText(message.text)} className="mai-chat__speak">
                          <Volume2 className="h-3 w-3" />
                          {hindi ? 'बोलें' : 'Speak'}
                        </button>
                      </div>
                    ) : null}
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {isThinking ? (
            <motion.div
              className="mai-chat__row mai-chat__row--ai"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="mai-chat__msg-avatar" aria-hidden>
                <LineChart className="h-3.5 w-3.5" />
              </div>
              <div className="mai-chat__thinking">
                <span className="mai-chat__dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                {isAnalyzingChart
                  ? hindi
                    ? 'Chart review chal raha hai…'
                    : 'Reviewing the chart…'
                  : hindi
                    ? 'Analysis taiyar kar raha hoon…'
                    : 'Preparing the analysis…'}
              </div>
            </motion.div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="mai-chat__composer-wrap">
        <div className="mai-chat__composer">
          <AnimatePresence>
            {selectedImage ? (
              <motion.div
                className="mai-chat__attach-panel"
                initial={{ opacity: 0, height: 0, y: 8 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: 6 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              >
                <div className="mai-chat__attach">
                  <motion.img
                    src={selectedImage}
                    alt=""
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 24 }}
                  />
                  <div className="mai-chat__attach-meta">
                    <span className="mai-chat__attach-name">{selectedImageName || 'Chart'}</span>
                    <span className="mai-chat__attach-hint">
                      {hindi ? 'Prompt select karo ya khud likho' : 'Pick a prompt or write your own'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={clearSelectedImage}
                    aria-label="Remove"
                    disabled={isAnalyzingChart}
                    className="mai-chat__attach-x"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className={`mai-chat__prompt-dd ${chartPromptOpen ? 'mai-chat__prompt-dd--open' : ''}`} ref={chartPromptRef}>
                  <button
                    type="button"
                    className={`mai-chat__prompt-trigger ${chartPromptOpen ? 'mai-chat__prompt-trigger--on' : ''}`}
                    onClick={() => setChartPromptOpen((o) => !o)}
                    aria-expanded={chartPromptOpen}
                    aria-haspopup="listbox"
                    disabled={isThinking || isAnalyzingChart}
                  >
                    <span className="mai-chat__prompt-trigger-icon" aria-hidden>
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <span className="mai-chat__prompt-trigger-text">
                      <span className="mai-chat__prompt-trigger-label">
                        {hindi ? 'Desk prompts' : 'Desk prompts'}
                      </span>
                      <span className="mai-chat__prompt-trigger-sub">
                        {hindi ? 'Predefined chart questions' : 'Predefined chart questions'}
                      </span>
                    </span>
                    <ChevronDown className={`mai-chat__prompt-chevron ${chartPromptOpen ? 'mai-chat__prompt-chevron--up' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {chartPromptOpen ? (
                      <motion.div
                        className="mai-chat__prompt-menu"
                        role="listbox"
                        aria-label="Chart prompts"
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                      >
                        <div className="mai-chat__prompt-menu-glow" aria-hidden />
                        <div className="mai-chat__prompt-menu-head">
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>{hindi ? 'Chart ke liye sawal choose karo' : 'Choose a chart question'}</span>
                        </div>
                        <div className="mai-chat__prompt-menu-scroll">
                          {WOLF_CHART_PROMPTS.map((p, i) => {
                            const Icon = CHART_PROMPT_ICONS[p.id] ?? Sparkles;
                            const selected = inputText.trim() === deskPromptText(p, useHiPrompts).trim();
                            return (
                              <motion.button
                                key={p.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={`mai-chat__prompt-item ${selected ? 'mai-chat__prompt-item--on' : ''}`}
                                onClick={() => applyDeskPrompt(p)}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.04 + i * 0.04 }}
                                whileHover={{ x: 3 }}
                              >
                                <span className="mai-chat__prompt-item-icon" aria-hidden>
                                  <Icon className="h-3.5 w-3.5" />
                                </span>
                                <span className="mai-chat__prompt-item-main">
                                  <span className="mai-chat__prompt-item-name">{deskPromptLabel(p, useHiPrompts)}</span>
                                  <span className="mai-chat__prompt-item-hint">{deskPromptHint(p, useHiPrompts)}</span>
                                </span>
                                {selected ? <Check className="mai-chat__prompt-check" /> : null}
                              </motion.button>
                            );
                          })}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="mai-chat__input-row">
          <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mai-chat__icon-btn"
              title={hindi ? 'Chart image' : 'Attach chart'}
            >
              <ImagePlus className="h-5 w-5" />
          </button>

            <textarea
            value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isThinking && !isAnalyzingChart) void handleSend();
                }
              }}
              rows={1}
              placeholder={
                isListening
                  ? hindi
                    ? 'सुन रहा हूँ…'
                    : 'Listening…'
                  : selectedImage
                    ? hindi
                      ? 'Prompt dropdown se choose karo ya likho…'
                      : 'Pick from desk prompts or write…'
                    : hindi
                      ? isMentor
                        ? 'Mentor AI se train karo…'
                        : 'Wolf AI se poochho…'
                      : isMentor
                        ? 'Answer Mentor AI…'
                        : `Message ${AI_PRODUCT_NAME}…`
              }
              className="mai-chat__textarea"
            disabled={isListening}
          />

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={(!inputText.trim() && !selectedImage) || isListening || isThinking}
              className="mai-chat__send"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={MASTER_AI_IMAGE_ACCEPT}
            className="hidden"
            onChange={handleImageSelect}
          />
        </div>

        {imageError ? <p className="mai-chat__error">{imageError}</p> : null}
        <p className="mai-chat__footnote">
          {hindi
            ? 'Educational only · Image + desk prompt · Enter = send'
            : 'Educational only · Attach chart, pick a desk prompt, Enter to send'}
        </p>
      </div>
    </div>
  );
}
