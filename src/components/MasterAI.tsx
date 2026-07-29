import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Volume2,
  VolumeX,
  Languages,
  Bot,
  ImagePlus,
  X,
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
  getTradingBlockMessage,
  isHindiLang,
  isHinglishLang,
  isTradingRelated,
  isCasualGreeting,
  isPoliteAck,
  getChartImageRequiredMessage,
  getHumanGreetingReply,
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
          ? 'Auto language on — English, Hinglish, हिंदी, தமிழ்… type karo, main usi language me reply karunga. Chart (📷) bhej sakte ho.'
          : getMasterAiWelcome(initialLang.code),
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const hindi = isHindiLang(selectedLang.code);
  const [autoSpeak, setAutoSpeak] = useState(loadAutoSpeak);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
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
                text: 'Auto language on — English, Hinglish, हिंदी, தமிழ்… type karo, main usi language me reply karunga. Chart (📷) bhej sakte ho.',
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

    // Greetings / short thanks — no chart needed
    if (!hasImage && (isCasualGreeting(userText) || isPoliteAck(userText))) {
      const activeLang = resolveMasterAiLanguage(langMode, userText, selectedLang.code);
      if (langMode === 'auto' && activeLang.code !== selectedLang.code) {
        setSelectedLang(activeLang);
        saveSelectedLanguage(activeLang.code);
      }
      const reply = isCasualGreeting(userText)
        ? getHumanGreetingReply(activeLang.code, userText)
        : isHindiLang(activeLang.code) || isHinglishLang(activeLang.code)
          ? 'Theek hai bhai — bolte raho.'
          : 'Got it — I’m here.';
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-u`, role: 'user', text: userText, timestamp: new Date() },
        { id: `${Date.now()}-a`, role: 'trafi', text: reply, timestamp: new Date() },
      ]);
      setInputText('');
      return;
    }

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
      const detectFrom = userNote.trim();
      const activeLang = resolveMasterAiLanguage(
        langMode,
        detectFrom,
        selectedLang.code || 'hi-Latn',
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
        ? isHindiLang(activeLang.code) || isHinglishLang(activeLang.code)
          ? 'Chart load ho gaya. Jarvis analysis ready nahi hua — thodi der baad dubara bhejo.'
          : 'Chart loaded, but Jarvis could not finish analysis — try again in a moment.'
        : getChartImageRequiredMessage(activeLang.code);

      if (aiStatus.configured) {
        try {
          const textMessage =
            hasImage
              ? visionMessage
              : `${userText}\n\n[LANGUAGE LOCK: Reply in ${activeLang.replyIn}. Match this language exactly.]`;
          const result = await askMasterAi(
            {
              message: textMessage,
              model: MASTER_AI_MODEL_ID,
              lang: activeLang.code,
              langName: activeLang.nativeLabel,
              imageDataUrl: hasImage ? imageDataUrl : null,
              history,
              needsWeb: false,
            },
            hasImage
              ? {
                  summary: 'Chart screenshot analysis only',
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
              : {
                  summary: 'Normal chat — no chart yet; ask for screenshot before analysis',
                  nifty: 'n/a',
                  bankNifty: 'n/a',
                  pcr: 0,
                  maxPain: 0,
                  signals: 'n/a',
                  news: 'n/a',
                  gainers: 'n/a',
                  losers: 'n/a',
                  active: 'n/a',
                  breadth: 'n/a',
                  futures: 'n/a',
                  session: 'n/a',
                },
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
            <Bot className="h-4 w-4" />
            <span
              className={`mai-chat__pulse ${
                isSpeaking ? 'mai-chat__pulse--live' : aiStatus.configured ? 'mai-chat__pulse--ok' : 'mai-chat__pulse--warn'
              }`}
            />
          </div>
          <div className="min-w-0">
            <div className="mai-chat__title-row">
              <h1 className="mai-chat__title">Analyse AI</h1>
              <span className="mai-chat__badge">Jarvis</span>
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
            onClick={onAutoSpeakToggle}
            className={`mai-chat__chip ${autoSpeak ? 'mai-chat__chip--on' : ''}`}
            title={autoSpeak ? 'Auto-speak on' : 'Speak only when you tap Speak'}
          >
            {autoSpeak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Voice</span>
          </button>

          <label className="mai-chat__chip mai-chat__lang">
            <Languages className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <select
              value={langMode}
              onChange={(e) => onLanguageChange(e.target.value)}
              aria-label="Reply language"
              title="Auto detects from your message, or lock a language"
            >
              <option value="auto">Auto · {selectedLang.nativeLabel}</option>
              {MASTER_AI_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeLabel} · {l.name}
                </option>
              ))}
            </select>
          </label>
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
          {messages.length <= 1 && !isThinking ? (
            <div className="mai-chat__empty">
              <div className="mai-chat__empty-mark">
                <Bot className="h-7 w-7" />
              </div>
              <h2 className="mai-chat__empty-title">
                {hindi ? 'Kaise help karun aaj?' : 'How can I help today?'}
              </h2>
              <p className="mai-chat__empty-sub">Post chart screenshots to start analysis</p>
            </div>
          ) : null}

          <AnimatePresence>
            {messages.map((message) => {
              const isUser = message.role === 'user';
              if (message.id === 'welcome') return null;
              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`mai-chat__row ${isUser ? 'mai-chat__row--user' : 'mai-chat__row--ai'}`}
                >
                  {!isUser ? (
                    <div className="mai-chat__msg-avatar" aria-hidden>
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  ) : null}

                  <div className={`mai-chat__bubble ${isUser ? 'mai-chat__bubble--user' : 'mai-chat__bubble--ai'}`}>
                    {message.imageUrl ? (
                      <img src={message.imageUrl} alt="" className="mai-chat__img" />
                    ) : null}
                    <div className="mai-chat__text">{message.text}</div>
                    {!isUser ? (
                      <div className="mai-chat__meta">
                        <button type="button" onClick={() => speakText(message.text)} className="mai-chat__speak">
                          <Volume2 className="h-3 w-3" />
                          {hindi ? 'बोलें' : 'Speak'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {isThinking ? (
            <div className="mai-chat__row mai-chat__row--ai">
              <div className="mai-chat__msg-avatar" aria-hidden>
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="mai-chat__thinking">
                <span className="mai-chat__dots" aria-hidden>
                  <i />
                  <i />
                  <i />
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
          ) : null}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="mai-chat__composer-wrap">
        <div className="mai-chat__composer">
          {selectedImage ? (
            <div className="mai-chat__attach">
              <img src={selectedImage} alt="" />
              <span>
                {isAnalyzingChart
                  ? hindi
                    ? 'Chart analyze ho raha hai…'
                    : 'Analyzing chart…'
                  : selectedImageName}
              </span>
              <button
                type="button"
                onClick={clearSelectedImage}
                aria-label="Remove"
                disabled={isAnalyzingChart}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

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
                    ? 'Analyse AI se poochho…'
                    : 'Message Analyse AI…'
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
            ? 'Educational only · Chart drop/paste · Enter = send'
            : 'Educational only · Drop or paste charts · Enter to send'}
        </p>
      </div>
    </div>
  );
}
