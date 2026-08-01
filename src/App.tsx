import { lazy, Suspense, useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { AutoRefreshProvider } from './context/AutoRefreshContext';
import { FYERS_TOKEN_INVALID_EVENT } from './constants/fyersEvents';
import AppErrorBoundary from './components/AppErrorBoundary';
import WolfLoader from './components/WolfLoader';
import { normalizeFyersAuthInput, clearFyersAuthFromUrl } from './utils/fyersAuthUrl';
import { connectFyersAuthCode } from './services/fyersApiService';
import { BRAND, pageDocumentTitle } from './constants/brandLabels';
import { SHOW_INDICATORS } from './constants/featureFlags';

const AuthPage = lazy(() => import('./components/auth/AuthPage'));
const Sidebar = lazy(() => import('./components/Sidebar'));
const Header = lazy(() => import('./components/Header'));
const AuthModal = lazy(() => import('./components/AuthModal'));
const TrialReminderPopup = lazy(() => import('./components/access/TrialReminderPopup'));
const TvAccessGrantedPopup = lazy(() => import('./components/access/TvAccessGrantedPopup'));
const AccessGate = lazy(() => import('./components/access/AccessGate'));
const ProfileModal = lazy(() => import('./components/ProfileModal'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const TradingJournal = lazy(() => import('./components/TradingJournal'));
const TradeXOptionChain = lazy(() => import('./components/TradeXOptionChain'));
const OptionSimulator = lazy(() => import('./components/OptionSimulator'));
const StrategyBuilder = lazy(() => import('./components/StrategyBuilder'));
const Scanners = lazy(() => import('./components/Scanners'));
const MasterTX = lazy(() => import('./components/MasterTX'));
const Watchlist = lazy(() => import('./components/Watchlist'));
const Alerts = lazy(() => import('./components/Alerts'));
const News = lazy(() => import('./components/News'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const Subscription = lazy(() => import('./components/Subscription'));
const GlobalMarkets = lazy(() => import('./components/GlobalMarkets'));
const PaperTrading = lazy(() => import('./components/PaperTrading'));
const Backtesting = lazy(() => import('./components/Backtesting'));
const MarketHeatmap = lazy(() => import('./components/MarketHeatmap'));
const SignalsPanel = lazy(() => import('./components/SignalsPanel'));
const FuturesAnalytics = lazy(() => import('./components/FuturesAnalytics'));
const OIIntelligence = lazy(() => import('./components/OIIntelligence'));
const FootprintChart = lazy(() => import('./components/FootprintChart'));
const MasterAI = lazy(() => import('./components/MasterAI'));
const Indicators = lazy(() => import('./components/Indicators'));
const LtpCalculator = lazy(() => import('./components/LtpCalculator'));
const FyersLoginPage = lazy(() => import('./components/FyersLoginPage'));

function PageLoader() {
  return <WolfLoader />;
}

const HIDDEN_TABS = new Set([
  'papertrading',
  'dashboard',
  'oiintelligence',
  'heatmap',
  'scanner',
  ...(SHOW_INDICATORS ? [] : (['indicators'] as const)),
]);
const DEFAULT_TAB = 'trafi';
const TAB_STORAGE_KEY = 'wolf_active_tab';
const FORCE_HOME_KEY = 'wolf_force_home';
const AUTH_HASHES = new Set(['forgot', 'reset-password', 'signin']);
const VALID_TABS = new Set([
  'dashboard',
  'ltpcalc',
  'tradingjournal',
  'optionchain',
  'optionsimulator',
  'strategy',
  'futures',
  'oiintelligence',
  'footprint',
  'trafi',
  'indicators',
  'papertrading',
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

function tabFromHash(): string | null {
  const raw = window.location.hash.replace(/^#\/?/, '').split(/[?&]/)[0]?.trim() || '';
  if (!raw || AUTH_HASHES.has(raw.toLowerCase())) return null;
  if (!VALID_TABS.has(raw) || HIDDEN_TABS.has(raw)) return null;
  return raw;
}

function tabFromStorage(): string | null {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY) || '';
    if (!VALID_TABS.has(raw) || HIDDEN_TABS.has(raw)) return null;
    return raw;
  } catch {
    return null;
  }
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

function initialActiveTab() {
  if (shouldForceHome()) return DEFAULT_TAB;
  return tabFromHash() || tabFromStorage() || DEFAULT_TAB;
}

function persistTab(tab: string) {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
  const search = window.location.search || '';
  const next = `/${search}#${tab}`;
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
    window.history.replaceState({}, '', next);
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

  useEffect(() => {
    const code = normalizeFyersAuthInput(window.location.href);
    if (!code) return;
    void connectFyersAuthCode(code).then(() => clearFyersAuthFromUrl());
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (HIDDEN_TABS.has(activeTab)) {
      setActiveTab(DEFAULT_TAB);
      persistTab(DEFAULT_TAB);
    }
  }, [activeTab]);

  useEffect(() => {
    document.title = auth.isLoggedIn ? pageDocumentTitle(activeTab) : BRAND;
  }, [auth.isLoggedIn, activeTab]);

  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    if (normalizeFyersAuthInput(window.location.href)) return;
    if (path !== '/' && path !== '' && !path.includes('fyers')) {
      const hash = window.location.hash || (auth.isLoggedIn ? `#${activeTab}` : '');
      const next = `/${window.location.search}${hash}`;
      window.history.replaceState({}, '', next);
    }
    if (params.get('fyers') === 'reconnect') {
      const hash = auth.isLoggedIn ? `#${activeTab}` : '';
      window.history.replaceState({}, '', `/${hash}`);
    }
  }, [auth.isLoggedIn, activeTab]);

  /** Keep the open page across refresh via hash + localStorage. */
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
    const onHash = () => {
      if (shouldForceHome()) return;
      const fromHash = tabFromHash();
      if (fromHash && fromHash !== activeTab) setActiveTab(fromHash);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [auth.isLoggedIn, activeTab]);

  useEffect(() => {
    if (!auth.isLoggedIn) return;
    const onTokenInvalid = () => {
      window.dispatchEvent(new CustomEvent('fyers:token-invalid'));
    };
    window.addEventListener(FYERS_TOKEN_INVALID_EVENT, onTokenInvalid);
    return () => window.removeEventListener(FYERS_TOKEN_INVALID_EVENT, onTokenInvalid);
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

  const handleTabChange = (tab: string) => {
    const next = HIDDEN_TABS.has(tab) ? DEFAULT_TAB : tab;
    setActiveTab(next);
    setMobileMenuOpen(false);
    persistTab(next);
  };

  const handleLogout = () => {
    clearPersistedTab();
    markForceHome();
    setActiveTab(DEFAULT_TAB);
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

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onNavigate={handleTabChange} />;
      case 'ltpcalc':
        return <LtpCalculator onNavigate={handleTabChange} />;
      case 'tradingjournal':
        return (
          <TradingJournal
            user={auth.user}
            isAdmin={auth.user?.role === 'admin'}
            onNavigate={handleTabChange}
          />
        );
      case 'optionchain':
        return <TradeXOptionChain />;
      case 'optionsimulator':
        return <OptionSimulator />;
      case 'strategy':
        return <StrategyBuilder onNavigate={handleTabChange} />;
      case 'futures':
        return <FuturesAnalytics />;
      case 'oiintelligence':
        return <OIIntelligence onNavigate={handleTabChange} />;
      case 'footprint':
        return <FootprintChart />;
      case 'trafi':
        return <MasterAI />;
      case 'indicators':
        return (
          <Indicators
            openIndicatorId={pendingIndicatorId}
            onOpenIndicatorConsumed={() => setPendingIndicatorId(null)}
          />
        );
      case 'papertrading':
        return <PaperTrading user={auth.user} onNavigate={handleTabChange} />;
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
        return <Watchlist />;
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
        return <Dashboard onNavigate={handleTabChange} />;
    }
  };

  const mainClass = auth.isLoggedIn
    ? `app-main ${sidebarCollapsed ? 'app-main--sidebar-collapsed' : 'app-main--sidebar'}${
        activeTab === 'trafi' ? ' app-main--chat' : ''
      }`
    : 'app-main';

  const headerClass = auth.isLoggedIn
    ? `app-header glass ${sidebarCollapsed ? 'app-header--sidebar-collapsed' : 'app-header--sidebar'}`
    : '';

  return (
    <AutoRefreshProvider enabled={auth.isLoggedIn}>
      <div className="app-shell">
        {auth.isLoggedIn && (
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
                  : activeTab === 'trafi'
                    ? 'page-content page-content--chat'
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
              <AppErrorBoundary onReset={() => handleTabChange('trafi')}>
                {planPeek ? (
                  <div className="access-peek-bar">
                    <span>Your access is locked — only pricing is visible right now.</span>
                    <button type="button" onClick={() => handleTabChange('trafi')}>
                      Unlock access
                    </button>
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
          <TrialReminderPopup
            access={auth.access}
            popup={auth.accessPopup}
            userId={auth.user?.id}
            userName={auth.user?.name}
            userPhone={auth.user?.phone}
            userEmail={auth.user?.email}
            onRefresh={auth.refreshAccess}
          />
          <TvAccessGrantedPopup
            userId={auth.user?.role === 'admin' ? null : auth.user?.id}
            onOpenIndicator={openGrantedIndicator}
          />
          <AccessGate
            access={planPeek ? null : auth.access}
            popup={auth.accessPopup}
            userName={auth.user?.name?.split(' ')[0]}
            userFullName={auth.user?.name}
            userPhone={auth.user?.phone}
            userEmail={auth.user?.email}
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
  if (window.location.pathname === '/fyers-login') {
    return (
      <Suspense fallback={<PageLoader />}>
        <FyersLoginPage />
      </Suspense>
    );
  }
  return <AppWorkspace />;
}
