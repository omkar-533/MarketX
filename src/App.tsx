import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { AutoRefreshProvider } from './context/AutoRefreshContext';
import AppErrorBoundary from './components/AppErrorBoundary';
import WolfLoader from './components/WolfLoader';
import { BRAND, pageDocumentTitle } from './constants/brandLabels';
import {
  SHOW_DASHBOARD,
  SHOW_INDICATORS,
  SHOW_OI_INTELLIGENCE,
  SHOW_OPTION_CHAIN,
  SHOW_PAPER_TRADING,
  SHOW_TERMINAL,
} from './constants/featureFlags';
import { RADAR_OPEN_EVENT } from './services/radar/radarBridge';
import { LIVE_WOLF_OPEN_EVENT, peekPendingLiveWolf } from './services/live/liveBridge';
import { parseHashQuery } from './utils/appNav';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { clearOpportunityDayBoard } from './services/opportunity/opportunityStore';
import { clearRadarDayBoard } from './services/radar/radarStore';
import AppLink from './components/AppLink';

const AuthPage = lazyWithRetry(() => import('./components/auth/AuthPage'));
const Sidebar = lazyWithRetry(() => import('./components/Sidebar'));
const Header = lazyWithRetry(() => import('./components/Header'));
const AuthModal = lazyWithRetry(() => import('./components/AuthModal'));
const TvAccessGrantedPopup = lazyWithRetry(() => import('./components/access/TvAccessGrantedPopup'));
const AccessGate = lazyWithRetry(() => import('./components/access/AccessGate'));
const ConnectLiveNudgePopup = lazyWithRetry(() => import('./components/access/ConnectLiveNudgePopup'));
const ProfileModal = lazyWithRetry(() => import('./components/ProfileModal'));
const CommandPalette = lazyWithRetry(() => import('./components/CommandPalette'));
const TradingJournal = lazyWithRetry(() => import('./components/TradingJournal'));
const TradeXOptionChain = lazyWithRetry(() => import('./components/TradeXOptionChain'));
const OptionSimulator = lazyWithRetry(() => import('./components/OptionSimulator'));
const StrategyBuilder = lazyWithRetry(() => import('./components/StrategyBuilder'));
const Scanners = lazyWithRetry(() => import('./components/Scanners'));
const MasterTX = lazyWithRetry(() => import('./components/MasterTX'));
const Alerts = lazyWithRetry(() => import('./components/Alerts'));
const News = lazyWithRetry(() => import('./components/News'));
const AdminPanel = lazyWithRetry(() => import('./components/AdminPanel'));
const Subscription = lazyWithRetry(() => import('./components/Subscription'));
const GlobalMarkets = lazyWithRetry(() => import('./components/GlobalMarkets'));
const PaperTrading = lazyWithRetry(() => import('./components/PaperTrading'));
const Backtesting = lazyWithRetry(() => import('./components/Backtesting'));
const MarketHeatmap = lazyWithRetry(() => import('./components/MarketHeatmap'));
const SignalsPanel = lazyWithRetry(() => import('./components/SignalsPanel'));
const FuturesAnalytics = lazyWithRetry(() => import('./components/FuturesAnalytics'));
const OIIntelligence = lazyWithRetry(() => import('./components/OIIntelligence'));
const FootprintChart = lazyWithRetry(() => import('./components/FootprintChart'));
const WolfRadarPage = lazyWithRetry(() => import('./components/masterai/radar/WolfRadarPage'));
const WolfOpportunityRoute = lazyWithRetry(() => import('./components/masterai/opportunity/WolfOpportunityRoute'));
const LiveWolfRoute = lazyWithRetry(() => import('./components/masterai/live/LiveWolfRoute'));
const WatchlistPanel = lazyWithRetry(() => import('./components/masterai/radar/WatchlistPanel'));
const TerminalPage = lazyWithRetry(() => import('./components/terminal/TerminalPage'));
const Indicators = lazyWithRetry(() => import('./components/Indicators'));
const LtpCalculator = lazyWithRetry(() => import('./components/LtpCalculator'));
const Dashboard = lazyWithRetry(() => import('./components/Dashboard'));

function PageLoader() {
  return <WolfLoader fullscreen={false} label="Loading…" className="wolf-loader--page" />;
}

const HIDDEN_TABS = new Set([
  'heatmap',
  'scanner',
  'wolf-ai',
  'trafi',
  ...(SHOW_DASHBOARD ? [] : (['dashboard'] as const)),
  ...(SHOW_OI_INTELLIGENCE ? [] : (['oiintelligence'] as const)),
  ...(SHOW_OPTION_CHAIN ? [] : (['optionchain'] as const)),
  ...(SHOW_INDICATORS ? [] : (['indicators'] as const)),
  ...(SHOW_TERMINAL ? [] : (['terminal'] as const)),
  ...(SHOW_PAPER_TRADING ? [] : (['papertrading'] as const)),
]);
const DEFAULT_TAB = 'wolf-opportunity';
const TAB_STORAGE_KEY = 'wolf_active_tab';
const FORCE_HOME_KEY = 'wolf_force_home';
const AUTH_HASHES = new Set(['forgot', 'reset-password', 'signin']);
const VALID_TABS = new Set([
  ...(SHOW_DASHBOARD ? (['dashboard'] as const) : []),
  'ltpcalc',
  'tradingjournal',
  ...(SHOW_OPTION_CHAIN ? (['optionchain'] as const) : []),
  'optionsimulator',
  'strategy',
  'futures',
  ...(SHOW_OI_INTELLIGENCE ? (['oiintelligence'] as const) : []),
  'footprint',
  'wolf-ai',
  'wolf-radar',
  'wolf-opportunity',
  'live-wolf',
  'strategy-lab',
  ...(SHOW_TERMINAL ? (['terminal'] as const) : []),
  'trafi', // legacy alias → normalized to wolf-ai
  ...(SHOW_INDICATORS ? (['indicators'] as const) : []),
  ...(SHOW_PAPER_TRADING ? (['papertrading'] as const) : []),
  'backtesting',
  'heatmap',
  'signals',
  'scanner',
  'master-tx',
  'watchlist',
  'alerts',
  'news',
  'global',
  'admin',
  'subscription',
]);

function normalizeTabId(raw: string): string {
  if (raw === 'trafi' || raw === 'wolf-ai') return 'live-wolf';
  return raw;
}

function tabFromHash(): string | null {
  const raw = window.location.hash.replace(/^#\/?/, '').split(/[?&]/)[0]?.trim() || '';
  if (!raw || AUTH_HASHES.has(raw.toLowerCase())) return null;
  const resolved = normalizeTabId(raw);
  if (!VALID_TABS.has(raw) && !VALID_TABS.has(resolved)) return null;
  if (HIDDEN_TABS.has(resolved)) return null;
  return resolved;
}

function shouldForceHome() {
  try {
    return sessionStorage.getItem(FORCE_HOME_KEY) === '1';
  } catch {
    return false;
  }
}

function clearForceHome() {
  try {
    sessionStorage.removeItem(FORCE_HOME_KEY);
  } catch {
    /* ignore */
  }
}

function markForceHome() {
  try {
    sessionStorage.setItem(FORCE_HOME_KEY, '1');
  } catch {
    /* ignore */
  }
}

function clearPersistedTab() {
  try {
    localStorage.removeItem(TAB_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  const hash = window.location.hash.replace(/^#\/?/, '').split(/[?&]/)[0]?.trim() || '';
  if (hash && VALID_TABS.has(hash)) {
    window.history.replaceState({}, '', `/${window.location.search}`);
  }
}

/** Honor #hash so Refresh / stale-chunk reload stays on the page the user opened. */
function initialActiveTab() {
  try {
    if (shouldForceHome()) return DEFAULT_TAB;
    const fromHash = tabFromHash();
    if (fromHash) return fromHash;
  } catch {
    /* ignore */
  }
  return DEFAULT_TAB;
}

function persistTab(tab: string, mode: 'push' | 'replace' = 'replace') {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
  const search = window.location.search || '';
  const currentRaw = window.location.hash.replace(/^#\/?/, '');
  const currentTab = currentRaw.split(/[?&]/)[0] || '';
  const qAt = currentRaw.search(/[?&]/);
  let query = currentTab === tab && qAt >= 0 ? currentRaw.slice(qAt).replace(/^&/, '?') : '';
  if (query && !query.startsWith('?')) query = `?${query}`;
  if (tab === 'live-wolf' && !parseHashQuery(`#${tab}${query}`).get('symbol')) {
    const pending = peekPendingLiveWolf();
    if (pending?.symbol && pending.queuedAt && Date.now() - pending.queuedAt < 15_000) {
      const params = new URLSearchParams();
      params.set('symbol', pending.symbol);
      params.set('exchange', pending.exchange || 'NSE');
      params.set('tf', pending.timeframe || '5m');
      query = `?${params.toString()}`;
    }
  }
  const next = `/${search}#${tab}${query}`;
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` === next) {
    return;
  }
  if (mode === 'push') {
    window.history.pushState({ tab }, '', next);
  } else {
    window.history.replaceState({ tab }, '', next);
  }
}

function AppWorkspace() {
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [pendingIndicatorId, setPendingIndicatorId] = useState<string | null>(null);
  const auth = useAuth();
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activeTab]);

  useEffect(() => {
    const resolved = normalizeTabId(activeTab);
    if (resolved !== activeTab) {
      setActiveTab(resolved);
      persistTab(resolved);
      return;
    }
    if (HIDDEN_TABS.has(activeTab)) {
      setActiveTab(DEFAULT_TAB);
      persistTab(DEFAULT_TAB);
    }
  }, [activeTab]);

  useEffect(() => {
    document.title = auth.isLoggedIn ? pageDocumentTitle(activeTab) : BRAND;
  }, [auth.isLoggedIn, activeTab]);

  useEffect(() => {
    const sync = () => {
      document.documentElement.classList.toggle('wolf-tab-hidden', document.hidden);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if (path !== '/' && path !== '') {
      const hash = window.location.hash || (auth.isLoggedIn ? `#${activeTab}` : '');
      const next = `/${window.location.search}${hash}`;
      window.history.replaceState({}, '', next);
    }
  }, [auth.isLoggedIn, activeTab]);

  /** Persist in-session navigation to hash/localStorage. Reload keeps the hash page. */
  useEffect(() => {
    if (!auth.isLoggedIn) return;
    if (shouldForceHome()) {
      clearForceHome();
      setActiveTab(DEFAULT_TAB);
      persistTab(DEFAULT_TAB);
      return;
    }
    persistTab(activeTab);
  }, [auth.isLoggedIn, activeTab]);

  useEffect(() => {
    if (!auth.isLoggedIn) return;
    const syncFromLocation = () => {
      if (shouldForceHome()) return;
      const fromHash = tabFromHash();
      if (fromHash && fromHash !== activeTabRef.current) setActiveTab(fromHash);
    };
    window.addEventListener('hashchange', syncFromLocation);
    window.addEventListener('popstate', syncFromLocation);
    return () => {
      window.removeEventListener('hashchange', syncFromLocation);
      window.removeEventListener('popstate', syncFromLocation);
    };
  }, [auth.isLoggedIn]);

  useEffect(() => {
    if (!auth.isLoggedIn) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [auth.isLoggedIn]);

  const handleTabChange = useCallback((tab: string) => {
    const resolved = normalizeTabId(tab);
    const next = HIDDEN_TABS.has(resolved) ? DEFAULT_TAB : resolved;
    const changed = next !== activeTabRef.current;
    setActiveTab(next);
    setMobileMenuOpen(false);
    persistTab(next, changed ? 'push' : 'replace');
    // Mobile: closing the drawer / leaving chat left a stale scrollY so Upgrade
    // felt like “jump up then land halfway down the page”. Always pin to top.
    const pinTop = () => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } catch {
        window.scrollTo(0, 0);
      }
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelectorAll('.app-main, .page-content, .app-shell').forEach((node) => {
        (node as HTMLElement).scrollTop = 0;
      });
    };
    pinTop();
    requestAnimationFrame(pinTop);
    window.setTimeout(pinTop, 50);
  }, []);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    if (activeTabRef.current !== DEFAULT_TAB) handleTabChange(DEFAULT_TAB);
  }, [handleTabChange]);

  useEffect(() => {
    if (!auth.isLoggedIn) return;
    const openRadar = () => handleTabChange('wolf-radar');
    const openLive = () => handleTabChange('live-wolf');
    window.addEventListener(RADAR_OPEN_EVENT, openRadar);
    window.addEventListener(LIVE_WOLF_OPEN_EVENT, openLive);
    return () => {
      window.removeEventListener(RADAR_OPEN_EVENT, openRadar);
      window.removeEventListener(LIVE_WOLF_OPEN_EVENT, openLive);
    };
  }, [auth.isLoggedIn, handleTabChange]);

  if (!auth.ready) {
    return <WolfLoader label="WOLF LOADING" />;
  }

  const handleLogout = () => {
    try {
      if (auth.user?.id) sessionStorage.removeItem(`wolf_live_connect_nudge_${auth.user.id}`);
    } catch {
      /* ignore */
    }
    clearPersistedTab();
    clearOpportunityDayBoard();
    clearRadarDayBoard();
    markForceHome();
    setActiveTab(DEFAULT_TAB);
    // App logout must not call disconnectMarketData — INDstocks token stays until the broker rejects it.
    void auth.logout();
  };

  const openGrantedIndicator = (indicatorId: string) => {
    setPendingIndicatorId(indicatorId);
    handleTabChange('indicators');
  };

  /** Locked accounts may still read the pricing page, nothing else. */
  const locked = Boolean(auth.access && !auth.access.unlocked);
  const planPeek = locked && activeTab === 'subscription';

  const renderLoggedInContent = () => {
    if (locked && !planPeek) return null;

    const liveWolf = () => handleTabChange('live-wolf');
    const opportunity = (
      <WolfOpportunityRoute onOpenWolfAi={liveWolf} onOpenLive={liveWolf} />
    );

    switch (activeTab) {
      case 'dashboard':
        return SHOW_DASHBOARD ? <Dashboard onNavigate={handleTabChange} /> : opportunity;
      case 'ltpcalc':
        return <LtpCalculator onNavigate={handleTabChange} />;
      case 'tradingjournal':
        return (
          <TradingJournal
            user={auth.user}
            isAdmin={auth.user?.role === 'admin' || auth.user?.role === 'subadmin'}
            onNavigate={handleTabChange}
          />
        );
      case 'optionchain':
        return SHOW_OPTION_CHAIN ? <TradeXOptionChain /> : opportunity;
      case 'optionsimulator':
        return <OptionSimulator />;
      case 'strategy':
        return <StrategyBuilder onNavigate={handleTabChange} />;
      case 'futures':
        return <FuturesAnalytics />;
      case 'oiintelligence':
        return SHOW_OI_INTELLIGENCE ? (
          <OIIntelligence onNavigate={handleTabChange} />
        ) : (
          opportunity
        );
      case 'footprint':
        return <FootprintChart />;
      case 'wolf-ai':
        return <LiveWolfRoute />;
      case 'wolf-radar':
      case 'strategy-lab':
        return (
          <WolfRadarPage
            desk={activeTab === 'strategy-lab' ? 'lab' : 'hunt'}
            onOpenLive={liveWolf}
            onOpenHunt={() => handleTabChange('wolf-radar')}
            onOpenLab={() => handleTabChange('strategy-lab')}
          />
        );
      case 'wolf-opportunity':
        return opportunity;
      case 'live-wolf':
        return <LiveWolfRoute />;
      case 'terminal':
        return SHOW_TERMINAL ? <TerminalPage onNavigate={handleTabChange} /> : opportunity;
      case 'indicators':
        return (
          <Indicators
            openIndicatorId={pendingIndicatorId}
            onOpenIndicatorConsumed={() => setPendingIndicatorId(null)}
          />
        );
      case 'papertrading':
        return SHOW_PAPER_TRADING ? (
          <PaperTrading user={auth.user} onNavigate={handleTabChange} />
        ) : (
          opportunity
        );
      case 'backtesting':
        return <Backtesting />;
      case 'heatmap':
        return <MarketHeatmap />;
      case 'signals':
        return <SignalsPanel />;
      case 'scanner':
        return <Scanners user={auth.user} />;
      case 'master-tx':
        return <MasterTX />;
      case 'watchlist':
        return (
          <WatchlistPanel
            onAnalyze={() => handleTabChange('live-wolf')}
            onOpenRadar={() => handleTabChange('wolf-radar')}
          />
        );
      case 'alerts':
        return <Alerts />;
      case 'news':
        return <News />;
      case 'global':
        return <GlobalMarkets />;
      case 'admin':
        return <AdminPanel user={auth.user} adminPassword={auth.adminPassword} />;
      case 'subscription':
        return (
          <Subscription
            user={auth.user}
            access={auth.access}
            popup={auth.accessPopup}
            onAccessSubmitted={auth.refreshAccess}
          />
        );
      default:
        return opportunity;
    }
  };

  const mainClass = auth.isLoggedIn
    ? activeTab === 'terminal'
      ? 'app-main app-main--terminal-immersive'
      : `app-main ${sidebarCollapsed ? 'app-main--sidebar-collapsed' : 'app-main--sidebar'}${
          activeTab === 'wolf-ai' ? ' app-main--chat' : ''
        }${activeTab === 'live-wolf' ? ' app-main--live-wolf' : ''}`
    : 'app-main';

  const headerClass = auth.isLoggedIn
    ? `app-header glass ${sidebarCollapsed ? 'app-header--sidebar-collapsed' : 'app-header--sidebar'}`
    : '';

  return (
    <AutoRefreshProvider enabled={auth.isLoggedIn}>
      <div className="app-shell">
        {auth.isLoggedIn && activeTab !== 'terminal' && (
          <Suspense fallback={null}>
            <>
              {mobileMenuOpen && (
                <button
                  type="button"
                  aria-label="Close menu"
                  className="sidebar-overlay lg:hidden"
                  onClick={() => setMobileMenuOpen(false)}
                />
              )}
          <Sidebar
            activeTab={activeTab}
                onTabChange={handleTabChange}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                mobileOpen={mobileMenuOpen}
                onMobileClose={() => setMobileMenuOpen(false)}
            user={auth.user}
                onLogout={handleLogout}
                onProfile={() => setShowProfile(true)}
          />
          <Header
            sidebarCollapsed={sidebarCollapsed}
            user={auth.user}
                onMenuClick={() => setMobileMenuOpen(true)}
                onProfile={() => setShowProfile(true)}
                onBack={handleBack}
                className={headerClass}
          />
        </>
          </Suspense>
        )}

        <main className={mainClass}>
          <div
            className={
              auth.isLoggedIn
                ? activeTab === 'master-tx'
                  ? 'page-content page-content--screener'
                  : activeTab === 'wolf-ai'
                    ? 'page-content page-content--chat'
                    : activeTab === 'terminal'
                      ? 'page-content page-content--terminal'
                      : activeTab === 'optionchain'
                        ? 'page-content page-content--optionchain'
                        : activeTab === 'wolf-opportunity'
                          ? 'page-content page-content--opportunity'
                          : activeTab === 'live-wolf'
                            ? 'page-content page-content--live-wolf'
                            : 'page-content page-content--full'
                : ''
            }
          >
            {!auth.isLoggedIn ? (
              <Suspense fallback={<PageLoader />}>
                <AuthPage
                  mode={auth.authMode}
                  onLogin={auth.login}
                  onSignup={auth.signup}
                  onSignupStart={auth.signupStart}
                  onSignupVerify={auth.signupVerify}
                  onSignupResend={auth.signupResend}
                  onResetStart={auth.resetStart}
                  onResetResend={auth.resetResend}
                  onResetComplete={auth.resetComplete}
                  onGoogleLogin={auth.googleLogin}
                  onOtpLogin={auth.otpLogin}
                  onForgotPassword={auth.forgotPassword}
                  onSwitchMode={auth.setAuthMode}
                />
              </Suspense>
            ) : (
              <AppErrorBoundary onReset={() => handleTabChange(activeTabRef.current || DEFAULT_TAB)}>
                {planPeek ? (
                  <div className="access-peek-bar">
                    <span>Your access is locked — only pricing is visible right now.</span>
                    <AppLink to="wolf-opportunity" onActivate={() => handleTabChange('wolf-opportunity')}>
                      Unlock access
                    </AppLink>
                  </div>
                ) : null}
                <Suspense fallback={<PageLoader />}>{renderLoggedInContent()}</Suspense>
              </AppErrorBoundary>
            )}
        </div>
      </main>

        {auth.isLoggedIn && (
          <Suspense fallback={null}>
            <ProfileModal
              isOpen={showProfile}
              onClose={() => setShowProfile(false)}
              user={auth.user}
              onLogout={handleLogout}
              onUpgrade={() => handleTabChange('subscription')}
              onUpdateAvatar={auth.updateAvatar}
              onRemoveAvatar={auth.removeAvatar}
            />
      <AuthModal
        isOpen={auth.showAuth}
        onClose={() => auth.setShowAuth(false)}
        mode={auth.authMode}
        onLogin={auth.login}
        onSignup={auth.signup}
        onGoogleLogin={auth.googleLogin}
        onOtpLogin={auth.otpLogin}
        onForgotPassword={auth.forgotPassword}
        onSwitchMode={auth.setAuthMode}
      />
      <CommandPalette 
        isOpen={isCommandPaletteOpen} 
        onClose={() => setIsCommandPaletteOpen(false)} 
              onNavigate={(tab) => {
                handleTabChange(tab);
                setIsCommandPaletteOpen(false);
              }}
      />
          </Suspense>
        )}
    </div>
      {auth.isLoggedIn ? (
        <Suspense fallback={null}>
          <TvAccessGrantedPopup
            userId={
              auth.user?.role === 'admin' || auth.user?.role === 'subadmin' ? null : auth.user?.id
            }
            onOpenIndicator={openGrantedIndicator}
          />
          <ConnectLiveNudgePopup
            enabled={auth.isLoggedIn && Boolean(auth.user?.id) && !locked}
            userId={auth.user?.id}
          />
          <AccessGate
            access={planPeek ? null : auth.access}
            popup={auth.accessPopup}
            userName={auth.user?.name?.split(' ')[0]}
            userFullName={auth.user?.name}
            userPhone={auth.user?.phone}
            onRefresh={auth.refreshAccess}
            onLogout={handleLogout}
            onSeePlans={() => handleTabChange('subscription')}
          />
        </Suspense>
      ) : null}
    </AutoRefreshProvider>
  );
}

export default function App() {
  return <AppWorkspace />;
}
