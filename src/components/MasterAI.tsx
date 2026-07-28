import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  Send,
  Volume2,
  VolumeX,
  Languages,
  Bot,
  User,
  Zap,
  BarChart3,
  ShieldAlert,
  Activity,
  Newspaper,
  BriefcaseBusiness,
  ImagePlus,
  X,
} from 'lucide-react';
import {
  MASTER_AI_LANGUAGES,
  MASTER_AI_MODEL_ID,
  askMasterAi,
  shouldUseWebSearch,
  buildMasterMarketContext,
  fetchMasterAiStatus,
  generateLocalTradingReply,
  getChartVisionPrompt,
  getMasterAiLanguage,
  getMasterAiWelcome,
  getMasterAiSorryMessage,
  getTradingBlockMessage,
  isHindiLang,
  isHinglishLang,
  isTradingRelated,
  loadAutoSpeak,
  loadLanguageMode,
  loadSelectedLanguage,
  resolveMasterAiLanguage,
  saveAutoSpeak,
  saveLanguageMode,
  saveSelectedLanguage,
  type ChatHistoryItem,
  type MasterAiLangCode,
  type MasterAiLangMode,
  type MasterAiLanguage,
} from '../services/masterAiService';
import {
  MASTER_AI_IMAGE_ACCEPT,
  prepareChartImageForAi,
} from '../services/masterAiImage';
import { API_SERVER_READY_EVENT } from '../services/apiAutoConnect';
import { OPENROUTER_KEY_UPDATED_EVENT } from '../services/openRouterKey';

interface Message {
  id: string;
  role: 'user' | 'trafi';
  text: string;
  timestamp: Date;
  imageUrl?: string;
}

const QUICK_ACTIONS_EN = [
  { id: 'market', label: 'Market pulse', icon: BarChart3, prompt: 'Give me a short, human market pulse on Nifty and Bank Nifty — what should traders watch today?' },
  { id: 'options', label: 'Options lens', icon: Activity, prompt: 'Explain the current options setup using PCR, max pain, and one practical hedge idea.' },
  { id: 'strategy', label: 'Strategy help', icon: Zap, prompt: 'Suggest a practical intraday or swing idea for the current market mood.' },
  { id: 'risk', label: 'Risk control', icon: ShieldAlert, prompt: 'How should I manage risk, stop-loss, and position sizing right now?' },
  { id: 'news', label: 'News impact', icon: Newspaper, prompt: 'Summarize latest market themes and how they may affect trading today.' },
  { id: 'portfolio', label: 'Portfolio plan', icon: BriefcaseBusiness, prompt: 'Help me build a balanced watchlist approach for the next few sessions.' },
] as const;

const QUICK_ACTIONS_HI = [
  { id: 'market', label: 'बाज़ार अपडेट', icon: BarChart3, prompt: 'Nifty aur Bank Nifty ka short market pulse do — aaj traders kya dhyaan rakhein?' },
  { id: 'options', label: 'ऑप्शन व्यू', icon: Activity, prompt: 'PCR, max pain ke saath current options setup samjhao aur ek practical hedge idea do.' },
  { id: 'strategy', label: 'स्ट्रैटेजी', icon: Zap, prompt: 'Is market mood ke liye ek practical intraday ya swing strategy suggest karo.' },
  { id: 'risk', label: 'रिस्क कंट्रोल', icon: ShieldAlert, prompt: 'Abhi risk, stop-loss aur position sizing kaise manage karun — seedha batao.' },
  { id: 'news', label: 'न्यूज़ असर', icon: Newspaper, prompt: 'Latest market themes summarize karo aur trading par unka asar batao.' },
  { id: 'portfolio', label: 'पोर्टफोलियो', icon: BriefcaseBusiness, prompt: 'Agle kuch sessions ke liye balanced watchlist approach banaane mein help karo.' },
] as const;

function getQuickActions(langCode: string) {
  return isHindiLang(langCode) ? QUICK_ACTIONS_HI : QUICK_ACTIONS_EN;
}

export default function MasterAI() {
  const initialMode = loadLanguageMode();
  const initialLang =
    initialMode === 'auto'
      ? getMasterAiLanguage(loadSelectedLanguage())
      : getMasterAiLanguage(initialMode);
  const [langMode, setLangMode] = useState<MasterAiLangMode>(initialMode);
  const [selectedLang, setSelectedLang] = useState<MasterAiLanguage>(initialLang);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'trafi',
      text:
        initialMode === 'auto'
          ? 'Auto language on — English, Hinglish, हिंदी, தமிழ்… type karo, main usi language me reply karungi. Chart (📷) bhej sakte ho.'
          : getMasterAiWelcome(initialLang.code),
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const hindi = isHindiLang(selectedLang.code);
  const quickActions = getQuickActions(selectedLang.code);
  const [autoSpeak, setAutoSpeak] = useState(loadAutoSpeak);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [quickAction, setQuickAction] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [aiStatus, setAiStatus] = useState({ configured: false, message: 'Checking AI…' });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);
  const [isAnalyzingChart, setIsAnalyzingChart] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const analyzingRef = useRef(false);
  const recognitionRef = useRef<{ start: () => void; stop: () => void; lang: string } | null>(null);
  const handleSendRef = useRef<(text?: string) => void>(() => {});
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    messagesEndRef.current?.scrollIntoView({ behavior: isThinking ? 'auto' : 'smooth' });
  }, [messages, isThinking]);

  const speakText = useCallback(
    (text: string) => {
      if (!synthRef.current) return;
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = isHinglishLang(selectedLang.code) ? 'hi-IN' : selectedLang.code;
      utterance.rate = hindi ? 0.88 : 0.95;
      utterance.pitch = 1;
      const voices = synthRef.current.getVoices();
      const langPrefix = selectedLang.code.slice(0, 2);
      const preferred =
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
                text: 'Auto language on — English, Hinglish, हिंदी, தமிழ்… type karo, main usi language me reply karungi. Chart (📷) bhej sakte ho.',
              }
            : m,
        ),
      );
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
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    setSelectedImageName('');
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processChartFile = async (file: File, autoAnalyze = true) => {
    if (analyzingRef.current) return;
    setImageError(null);
    try {
      const { dataUrl, fileName } = await prepareChartImageForAi(file);
      setSelectedImage(dataUrl);
      setSelectedImageName(fileName);
      if (autoAnalyze) {
        await handleSend(undefined, { imageDataUrl: dataUrl, imageName: fileName });
      }
    } catch {
      setImageError(getMasterAiSorryMessage(selectedLang.code, 'image'));
      clearSelectedImage();
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void processChartFile(file, true);
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          void processChartFile(file, true);
        }
        break;
      }
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void processChartFile(file, true);
  };

  const handleSend = async (
    textOverride?: string,
    opts?: { imageDataUrl?: string | null; imageName?: string },
  ) => {
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

    if (!hasImage && !isTradingRelated(userText)) {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-u`, role: 'user', text: userText, timestamp: new Date() },
        {
          id: `${Date.now()}-block`,
          role: 'trafi',
          text: getTradingBlockMessage(selectedLang.code),
          timestamp: new Date(),
        },
      ]);
      setInputText('');
      setQuickAction(null);
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
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setQuickAction(null);
    analyzingRef.current = true;
    setIsThinking(true);
    if (hasImage) setIsAnalyzingChart(true);

    const history: ChatHistoryItem[] = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-6)
      .map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text.slice(0, 1200),
      }));

    try {
      const liveContext = buildMasterMarketContext();
      const activeLang = resolveMasterAiLanguage(
        langMode,
        userText || userNote || '',
        selectedLang.code,
      );
      if (langMode === 'auto') {
        // Always sync detected / sticky language into UI so Auto · label updates
        if (activeLang.code !== selectedLang.code) {
          setSelectedLang(activeLang);
          saveSelectedLanguage(activeLang.code);
        }
      }
      const visionMessage = hasImage
        ? getChartVisionPrompt(activeLang.code, userNote || undefined)
        : userText;

      let responseText = hasImage
        ? isHindiLang(activeLang.code)
          ? 'Chart load ho gaya. Anika analysis ready nahi hui — thodi der baad dubara bhejo.'
          : 'Chart loaded, but Anika could not finish analysis — try again in a moment.'
        : generateLocalTradingReply(userText, liveContext, activeLang.code);

      if (aiStatus.configured) {
        try {
          const result = await askMasterAi(
            {
              message: visionMessage,
              model: MASTER_AI_MODEL_ID,
              lang: activeLang.code,
              langName: activeLang.nativeLabel,
              imageDataUrl: hasImage ? imageDataUrl : null,
              history,
              needsWeb: !hasImage && shouldUseWebSearch(userText),
            },
            liveContext,
          );
          if (result.reply) responseText = result.reply;
        } catch {
          responseText = getMasterAiSorryMessage(
            activeLang.code,
            hasImage ? 'chart' : 'chat',
          );
        }
      }

      const aiMsg: Message = {
        id: `${Date.now()}-a`,
        role: 'trafi',
        text: responseText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (autoSpeak) speakText(responseText);
    } finally {
      analyzingRef.current = false;
      setIsThinking(false);
      setIsAnalyzingChart(false);
      clearSelectedImage();
    }
  };

  handleSendRef.current = (text) => {
    void handleSend(text);
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const rec = recognitionRef.current;
    if (rec) {
      rec.lang = selectedLang.code;
      rec.start();
      setIsListening(true);
    }
  };

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
    <div className="mai flex h-[calc(100vh-100px)] flex-col overflow-hidden rounded-2xl border border-[#1e2433] bg-[#07090f] text-slate-200 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#1e2433] bg-[#0c1018]/95 px-4 py-3 backdrop-blur sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d4af37]/25 bg-gradient-to-br from-[#d4af37]/20 to-[#d4af37]/5">
              <Bot className="h-5 w-5 text-[#d4af37]" />
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0c1018] ${
                isSpeaking
                  ? 'bg-emerald-400 animate-pulse'
                  : aiStatus.configured
                    ? 'bg-emerald-500'
                    : 'bg-amber-400'
              }`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-white">Anika</h2>
              <span className="rounded border border-[#d4af37]/20 bg-[#d4af37]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#d4af37]">
                Master AI
              </span>
            </div>
            <p className="truncate text-[11px] text-slate-500" title={aiStatus.message}>
              {aiStatus.configured
                ? langMode === 'auto'
                  ? `Online · Auto · ${selectedLang.nativeLabel}`
                  : `Online · ${selectedLang.nativeLabel}`
                : aiStatus.message}
              {langMode === 'auto' ? '' : ` · ${selectedLang.name}`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onAutoSpeakToggle}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              autoSpeak
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-[#252b3a] bg-[#12161f] text-slate-400 hover:text-slate-200'
            }`}
            title={autoSpeak ? 'Auto-speak on' : 'Speak only when you tap Speak'}
          >
            {autoSpeak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Voice</span>
          </button>

          <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#252b3a] bg-[#12161f] px-2 py-1.5">
            <Languages className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <select
              value={langMode}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="max-w-[150px] cursor-pointer bg-transparent text-[11px] font-medium text-slate-200 focus:outline-none sm:max-w-[170px]"
              aria-label="Reply language"
              title="Auto detects from your message, or lock a language"
            >
              <option value="auto" className="bg-[#12161f] text-slate-200">
                Auto · {selectedLang.nativeLabel}
              </option>
              {MASTER_AI_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-[#12161f] text-slate-200">
                  {l.nativeLabel} · {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* Chat thread */}
      <div
        ref={chatAreaRef}
        className="mai__thread min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {messages.length <= 1 && !isThinking && (
          <div className="mx-auto mb-2 max-w-xl px-2 text-center">
            <p className="text-[13px] leading-relaxed text-slate-400">
              {hindi
                ? 'Chart screenshot bhejo ya market, options, risk ke baare mein poochho.'
                : 'Send a chart screenshot or ask about markets, options, and risk.'}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {quickActions.slice(0, 4).map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => {
                      setQuickAction(action.id);
                      void handleSend(action.prompt);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#252b3a] bg-[#10141c] px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-[#d4af37]/35 hover:text-[#e8d5a3]"
                  >
                    <Icon className="h-3 w-3 text-[#d4af37]/80" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <AnimatePresence>
          {messages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex gap-2.5 sm:gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                    isUser
                      ? 'border-[#2a3142] bg-[#161b26] text-slate-300'
                      : 'border-[#d4af37]/25 bg-[#d4af37]/10 text-[#d4af37]'
                  }`}
                >
                  {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>

                <div className={`max-w-[min(720px,88%)] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div
                    className={`px-3.5 py-2.5 text-[13px] leading-relaxed sm:px-4 sm:py-3 sm:text-[14px] ${
                      isUser
                        ? 'rounded-2xl rounded-tr-md border border-[#d4af37]/20 bg-[#d4af37]/12 text-[#f0e2b8]'
                        : 'rounded-2xl rounded-tl-md border border-[#1e2433] bg-[#12161f] text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
                    }`}
                  >
                    {message.imageUrl && (
                      <img
                        src={message.imageUrl}
                        alt=""
                        className="mb-2.5 max-h-52 w-full rounded-xl border border-[#252b3a] bg-black/40 object-contain"
                      />
                    )}
                    <div className="whitespace-pre-wrap break-words">{message.text}</div>
                  </div>
                  <div
                    className={`mt-1 flex items-center gap-2 px-1 text-[10px] text-slate-600 ${
                      isUser ? 'flex-row-reverse' : ''
                    }`}
                  >
                    <span>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {!isUser && (
                      <button
                        type="button"
                        onClick={() => speakText(message.text)}
                        className="inline-flex items-center gap-1 font-medium text-slate-500 transition-colors hover:text-[#d4af37]"
                      >
                        <Volume2 className="h-3 w-3" />
                        {hindi ? 'बोलें' : 'Speak'}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isThinking && (
          <div className="flex items-center gap-3 pl-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#d4af37]/25 bg-[#d4af37]/10">
              <Bot className="h-3.5 w-3.5 text-[#d4af37]" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md border border-[#1e2433] bg-[#12161f] px-4 py-2.5 text-[12px] text-slate-400">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d4af37]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d4af37] [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d4af37] [animation-delay:300ms]" />
              </span>
              {isAnalyzingChart
                ? hindi
                  ? 'Chart padh raha hoon…'
                  : 'Reading your chart…'
                : hindi
                  ? 'Soch raha hoon…'
                  : 'Thinking…'}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-[#1e2433] bg-[#0c1018] px-3 py-3 sm:px-5 sm:py-4">
        {messages.length > 1 && (
          <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    setQuickAction(action.id);
                    void handleSend(action.prompt);
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    quickAction === action.id
                      ? 'border-[#d4af37]/40 bg-[#d4af37]/15 text-[#e8d5a3]'
                      : 'border-[#252b3a] bg-[#10141c] text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {action.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="mx-auto max-w-3xl rounded-2xl border border-[#252b3a] bg-[#12161f] p-2 shadow-[0_0_0_1px_rgba(212,175,55,0.04)] focus-within:border-[#d4af37]/35">
          {selectedImage && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#d4af37]/20 bg-[#0c1018] px-2 py-1.5">
              <img
                src={selectedImage}
                alt=""
                className="h-12 w-12 rounded-lg border border-[#252b3a] object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">
                {isAnalyzingChart
                  ? hindi
                    ? 'Chart analyze ho raha hai…'
                    : 'Analyzing chart…'
                  : selectedImageName}
              </span>
              <button
                type="button"
                onClick={clearSelectedImage}
                className="rounded-md p-1 text-slate-500 hover:bg-[#1a1f2e] hover:text-white"
                disabled={isAnalyzingChart}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={toggleListening}
              className={`rounded-xl p-2.5 transition-colors ${
                isListening
                  ? 'bg-red-500/15 text-red-400'
                  : 'text-slate-500 hover:bg-[#1a1f2e] hover:text-slate-200'
              }`}
              title="Voice input"
            >
              <Mic className="h-5 w-5" />
            </button>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={1}
              placeholder={
                isListening
                  ? hindi
                    ? 'सुन रहा हूँ…'
                    : 'Listening…'
                  : hindi
                    ? 'Message likho… (Enter bheje, Shift+Enter naya line)'
                    : 'Message… (Enter to send, Shift+Enter for new line)'
              }
              className="max-h-32 min-h-[42px] flex-1 resize-none bg-transparent py-2.5 text-[13px] text-white placeholder:text-slate-600 focus:outline-none sm:text-[14px]"
              disabled={isListening}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept={MASTER_AI_IMAGE_ACCEPT}
              className="hidden"
              onChange={handleImageSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-[#1a1f2e] hover:text-slate-200"
              title={hindi ? 'Chart image' : 'Attach chart'}
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={(!inputText.trim() && !selectedImage) || isListening || isThinking}
              className="rounded-xl bg-[#d4af37] p-2.5 text-[#0b0e16] transition-opacity disabled:opacity-35"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>

        {imageError && (
          <p className="mt-2 text-center text-[10px] text-red-400">{imageError}</p>
        )}
        <p className="mt-2 text-center text-[10px] text-slate-600">
          {hindi
            ? 'Educational only · Chart JPG/PNG drop/paste · Voice OFF ho to Speak dabao'
            : 'Educational only · Drop/paste chart images · Use Speak when Voice is off'}
        </p>
      </div>
    </div>
  );
}
