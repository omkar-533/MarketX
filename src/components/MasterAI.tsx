import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Sparkles,
  ShieldCheck,
  ImagePlus,
  X,
} from 'lucide-react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import {
  MASTER_AI_LANGUAGES,
  MASTER_AI_MODEL_ID,
  askMasterAi,
  buildMasterMarketContext,
  fetchMasterAiStatus,
  generateLocalTradingReply,
  getChartVisionPrompt,
  getMasterAiWelcome,
  getTradingBlockMessage,
  isHindiLang,
  isTradingRelated,
  loadAutoSpeak,
  loadSelectedLanguage,
  saveAutoSpeak,
  saveSelectedLanguage,
  type ChatHistoryItem,
  type MasterAiLangCode,
} from '../services/masterAiService';
import {
  MASTER_AI_IMAGE_ACCEPT,
  prepareChartImageForAi,
} from '../services/masterAiImage';

interface Message {
  id: string;
  role: 'user' | 'trafi';
  text: string;
  timestamp: Date;
  imageUrl?: string;
}

const QUICK_ACTIONS = {
  'en-US': [
    { id: 'market', label: 'Market pulse', icon: BarChart3, prompt: 'Give me a short, human market pulse on Nifty and Bank Nifty — what should traders watch today?' },
    { id: 'options', label: 'Options lens', icon: Activity, prompt: 'Explain the current options setup using PCR, max pain, and one practical hedge idea.' },
    { id: 'strategy', label: 'Strategy help', icon: Zap, prompt: 'Suggest a practical intraday or swing idea for the current market mood.' },
    { id: 'risk', label: 'Risk control', icon: ShieldAlert, prompt: 'How should I manage risk, stop-loss, and position sizing right now?' },
    { id: 'news', label: 'News impact', icon: Newspaper, prompt: 'Summarize latest market themes and how they may affect trading today.' },
    { id: 'portfolio', label: 'Portfolio plan', icon: BriefcaseBusiness, prompt: 'Help me build a balanced watchlist approach for the next few sessions.' },
  ],
  'hi-IN': [
    { id: 'market', label: 'बाज़ार अपडेट', icon: BarChart3, prompt: 'Nifty aur Bank Nifty ka short market pulse do — aaj traders kya dhyaan rakhein?' },
    { id: 'options', label: 'ऑप्शन व्यू', icon: Activity, prompt: 'PCR, max pain ke saath current options setup samjhao aur ek practical hedge idea do.' },
    { id: 'strategy', label: 'स्ट्रैटेजी', icon: Zap, prompt: 'Is market mood ke liye ek practical intraday ya swing strategy suggest karo.' },
    { id: 'risk', label: 'रिस्क कंट्रोल', icon: ShieldAlert, prompt: 'Abhi risk, stop-loss aur position sizing kaise manage karun — seedha batao.' },
    { id: 'news', label: 'न्यूज़ असर', icon: Newspaper, prompt: 'Latest market themes summarize karo aur trading par unka asar batao.' },
    { id: 'portfolio', label: 'पोर्टफोलियो', icon: BriefcaseBusiness, prompt: 'Agle kuch sessions ke liye balanced watchlist approach banaane mein help karo.' },
  ],
} as const;

export default function MasterAI() {
  const initialLang = loadSelectedLanguage();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'trafi',
      text: getMasterAiWelcome(initialLang),
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [selectedLang, setSelectedLang] = useState(
    () => MASTER_AI_LANGUAGES.find((l) => l.code === initialLang) ?? MASTER_AI_LANGUAGES[0],
  );
  const hindi = isHindiLang(selectedLang.code);
  const quickActions = QUICK_ACTIONS[selectedLang.code];
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

  const [contextTick, setContextTick] = useState(0);
  useAutoRefresh(() => setContextTick((t) => t + 1));
  const context = useMemo(() => buildMasterMarketContext(), [contextTick]);

  useEffect(() => {
    void fetchMasterAiStatus().then(setAiStatus);
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const speakText = useCallback(
    (text: string) => {
      if (!synthRef.current) return;
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = selectedLang.code;
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

  const onLanguageChange = (code: MasterAiLangCode) => {
    const lang = MASTER_AI_LANGUAGES.find((l) => l.code === code) ?? MASTER_AI_LANGUAGES[0];
    setSelectedLang(lang);
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load image';
      setImageError(msg);
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
      .slice(-10)
      .map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      }));

    try {
      const visionMessage = hasImage
        ? getChartVisionPrompt(selectedLang.code, userNote || undefined)
        : userText;

      let responseText = hasImage
        ? hindi
          ? 'Chart load ho gaya. Server connect karo (npm run server) taaki main trend, support, resistance detail mein bata sakun.'
          : 'Chart loaded. Connect the API server (npm run server) so I can read trend, support, and resistance from your screenshot.'
        : generateLocalTradingReply(userText, context, selectedLang.code);

      if (aiStatus.configured) {
        try {
          const result = await askMasterAi(
            {
              message: visionMessage,
              model: MASTER_AI_MODEL_ID,
              lang: selectedLang.code,
              langName: selectedLang.nativeLabel,
              imageDataUrl: hasImage ? imageDataUrl : null,
              history,
              needsWeb: !hasImage,
            },
            context,
          );
          if (result.reply) responseText = result.reply;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'AI unavailable';
          responseText = hasImage
            ? hindi
              ? `Chart analysis abhi nahi ho payi: ${msg}. Server restart karke dubara try karo.`
              : `Could not analyze the chart: ${msg}. Restart npm run server and try again.`
            : `${generateLocalTradingReply(userText, context, selectedLang.code)}\n\n(${msg})`;
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
    <div className="h-[calc(100vh-100px)] flex flex-col bg-[#05070d] text-slate-200 rounded-xl overflow-hidden border border-[#1a1f2e] shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-[#0b0e17] border-b border-[#1a1f2e]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 bg-[#d4af37]/10 rounded-full flex items-center justify-center border border-[#d4af37]/30">
              <Bot className="w-5 h-5 text-[#d4af37]" />
            </div>
            <div
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0b0e17] ${isSpeaking ? 'bg-emerald-500 animate-pulse' : aiStatus.configured ? 'bg-emerald-500/80' : 'bg-amber-500'}`}
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 flex-wrap">
              Master AI
              <span className="text-[9px] px-2 py-0.5 bg-[#d4af37]/20 text-[#d4af37] rounded-full border border-[#d4af37]/30">
                TRADING ONLY
              </span>
            </h2>
            <p className="text-[10px] text-slate-500 truncate" title={aiStatus.message}>
              {aiStatus.configured
                ? hindi
                  ? 'लाइव बाज़ार जानकारी · प्राकृतिक हिंदी/अंग्रेज़ी'
                  : 'Live market intelligence · natural English'
                : aiStatus.message}{' '}
              · {selectedLang.nativeLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAutoSpeakToggle}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border ${autoSpeak ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-[#121520] border-[#1a1f2e] text-slate-500'}`}
            title={autoSpeak ? 'Auto-speak on' : 'Speak only when you tap Speak'}
          >
            {autoSpeak ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            Voice
          </button>

          <div className="flex items-center gap-0.5 bg-[#121520] border border-[#1a1f2e] rounded-lg p-0.5">
            <Languages className="w-3.5 h-3.5 text-slate-500 ml-1.5 shrink-0" />
            {MASTER_AI_LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => onLanguageChange(l.code)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
                  selectedLang.code === l.code
                    ? 'bg-[#d4af37] text-[#0b0e17]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {l.nativeLabel}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-2 bg-[#0b0e17]/60 border-b border-[#1a1f2e] flex flex-wrap gap-2">
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
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap ${
                quickAction === action.id
                  ? 'bg-[#d4af37] text-[#0b0e17] border-[#d4af37]'
                  : 'bg-[#121520] text-slate-300 border-[#1a1f2e] hover:border-slate-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {action.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-3 p-3 sm:p-4 bg-[#080a12] border-b border-[#1a1f2e]">
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-3 sm:p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            {hindi ? 'बाज़ार पल्स' : 'Market pulse'}
          </p>
          <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
            <div className="bg-[#121520] rounded-lg p-2 border border-[#1a1f2e]">
              <div className="text-[10px] text-slate-500">NIFTY</div>
              <div className="font-bold text-white text-xs mt-1">{context.nifty}</div>
            </div>
            <div className="bg-[#121520] rounded-lg p-2 border border-[#1a1f2e]">
              <div className="text-[10px] text-slate-500">BANKNIFTY</div>
              <div className="font-bold text-white text-xs mt-1">{context.bankNifty}</div>
            </div>
            <div className="bg-[#121520] rounded-lg p-2 border border-[#1a1f2e]">
              <div className="text-[10px] text-slate-500">PCR</div>
              <div className="font-bold text-white text-xs mt-1">{context.pcr}</div>
            </div>
          </div>
        </div>
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
            <span className="text-[10px] text-slate-400">
              {aiStatus.configured
                ? hindi
                  ? 'लाइव डेटा + प्लेटफ़ॉर्म — जैसे सीनियर ट्रेडर समझाता है'
                  : 'Live data + platform — answers like a senior trader'
                : hindi
                  ? 'सीमित मोड — पूरा AI के लिए server चालू करें'
                  : 'Limited mode — start API server for full intelligence'}
            </span>
          </div>
          <ShieldCheck className="w-4 h-4 text-[#d4af37] mb-1" />
          <p className="text-[10px] text-slate-500">
            {hindi ? 'सिर्फ ट्रेडिंग · जवाब सुनने के लिए Speak दबाएँ' : 'Trading-only · tap Speak on any reply to hear it'}
          </p>
        </div>
      </div>

      <div
        ref={chatAreaRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#080a12] min-h-0"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  message.role === 'trafi'
                    ? 'bg-[#d4af37]/10 border border-[#d4af37]/30'
                    : 'bg-blue-500/10 border border-blue-500/30'
                }`}
              >
                {message.role === 'trafi' ? (
                  <Bot className="w-4 h-4 text-[#d4af37]" />
                ) : (
                  <User className="w-4 h-4 text-blue-400" />
                )}
              </div>
              <div className={`max-w-[85%] ${message.role === 'user' ? 'text-right' : ''}`}>
                <div
                  className={`p-3 sm:p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    message.role === 'trafi'
                      ? 'bg-[#121520] border border-[#1a1f2e] text-slate-200 rounded-tl-none'
                      : 'bg-[#d4af37]/10 border border-[#d4af37]/20 text-[#d4af37] rounded-tr-none'
                  }`}
                >
                  {message.imageUrl && (
                    <img
                      src={message.imageUrl}
                      alt=""
                      className="mb-2 max-h-48 w-full rounded-lg border border-[#1a1f2e] object-contain bg-black/40"
                    />
                  )}
                  {message.text}
                </div>
                <div className="text-[10px] text-slate-600 mt-1 flex items-center gap-2 flex-wrap">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {message.role === 'trafi' && (
                    <button
                      type="button"
                      onClick={() => speakText(message.text)}
                      className="hover:text-[#d4af37] flex items-center gap-1 font-bold"
                    >
                      <Volume2 className="w-3 h-3" /> {hindi ? 'बोलें' : 'Speak'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isThinking && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="w-2 h-2 rounded-full bg-[#d4af37] animate-pulse" />
            {isAnalyzingChart
              ? hindi
                ? 'Chart padh raha hoon — trend, support, resistance nikal raha hoon…'
                : 'Reading your chart — trend, support, resistance…'
              : hindi
                ? 'लाइव बाज़ार डेटा देख रहा हूँ…'
                : 'Reading live market context…'}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 sm:p-4 bg-[#0b0e17] border-t border-[#1a1f2e]">
        <div className="flex items-center gap-2 bg-[#121520] border border-[#1a1f2e] rounded-xl p-2 focus-within:border-[#d4af37]/40">
          <button
            type="button"
            onClick={toggleListening}
            className={`p-2.5 rounded-lg ${isListening ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-[#1a1f2e] text-slate-400 hover:text-white'}`}
            title="Voice input"
          >
            <Mic className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSend()}
            placeholder={
              isListening
                ? hindi
                  ? 'सुन रहा हूँ…'
                  : 'Listening…'
                : hindi
                  ? 'Nifty, options, risk, strategy — kuch bhi poochho…'
                  : 'Ask about Nifty, options, risk, strategies…'
            }
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 focus:outline-none min-w-0"
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
            className="p-2.5 rounded-lg bg-[#1a1f2e] text-slate-400 hover:text-white"
            title={hindi ? 'Chart JPG/PNG/WebP… — turant analysis' : 'Chart JPG/PNG/WebP… — instant analysis'}
          >
            <ImagePlus className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={(!inputText.trim() && !selectedImage) || isListening || isThinking}
            className="p-2.5 bg-[#d4af37] text-[#0b0e17] rounded-lg disabled:opacity-40"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        {selectedImage && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#d4af37]/30 bg-[#121520] px-2 py-1.5">
            <img src={selectedImage} alt="" className="h-14 w-14 rounded object-cover border border-[#1a1f2e]" />
            <span className="text-xs text-slate-400 truncate flex-1">
              {isAnalyzingChart
                ? hindi
                  ? 'Chart analyze ho raha hai…'
                  : 'Analyzing chart…'
                : selectedImageName}
            </span>
            <button type="button" onClick={clearSelectedImage} className="p-1 text-slate-500 hover:text-white" disabled={isAnalyzingChart}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {imageError && <p className="text-center mt-1 text-[10px] text-red-400">{imageError}</p>}
        <p className="text-center mt-2 text-[10px] text-slate-600">
          {hindi
            ? 'JPG · PNG · WebP · GIF · BMP · HEIC · AVIF · SVG — paste/drop ya 📷 se bhejo, turant analysis'
            : 'JPG · PNG · WebP · GIF · BMP · HEIC · AVIF · SVG — paste, drop, or 📷 for instant analysis'}
        </p>
        <p className="text-center mt-1 text-[10px] text-slate-600">
          {hindi
            ? 'केवल शिक्षा · Voice ON नहीं तो Speak से सुनें'
            : 'Educational only · Speak manually unless Voice is on'}
        </p>
      </div>
    </div>
  );
}
