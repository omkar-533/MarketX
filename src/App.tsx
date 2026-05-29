import { lazy, Suspense, useState, useEffect } from 'react';
import AuthPage from './components/auth/AuthPage';
import { useAuth } from './hooks/useAuth';
import { AutoRefreshProvider } from './context/AutoRefreshContext';
import { FYERS_TOKEN_INVALID_EVENT } from './constants/fyersEvents';
import AppErrorBoundary from './components/AppErrorBoundary';
import FyersConnectBanner from './components/FyersConnectBanner';
import FyersLoginPage from './components/FyersLoginPage';
import { normalizeFyersAuthInput, clearFyersAuthFromUrl } from './utils/fyersAuthUrl';
import { connectFyersAuthCode } from './services/fyersApiService';
import { useBrokerSession } from './hooks/useBrokerSession';

const Sidebar = lazy(() => import('./components/Sidebar'));
const Header = lazy(() => import('./components/Header'));
const AuthModal = lazy(() => import('./components/AuthModal'));
const ProfileModal = lazy(() => import('./components/ProfileModal'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const TradingJournal = lazy(() => import('./components/TradingJournal'));
const ChartsWorkspace = lazy(() => import('./components/charts/ChartsWorkspace'));
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

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] text-slate-500 text-sm">
      Loading workspace…
    </div>
  );
}

function AppWorkspace() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const auth = useAuth();
  useBrokerSession(auth.isLoggedIn);

  useEffect(() => {
    const code = normalizeFyersAuthInput(window.location.href);
    if (!code) return;
    void connectFyersAuthCode(code).then(() => clearFyersAuthFromUrl());
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activeTab]);

  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    if (normalizeFyersAuthInput(window.location.href)) return;
    if (path !== '/' && path !== '' && !path.includes('fyers')) {
      const next = `/${window.location.search}${window.location.hash}`;
      window.history.replaceState({}, '', next);
    }
    if (params.get('fyers') === 'reconnect') {
      window.history.replaceState({}, '', '/');
    }
  }, [auth.isLoggedIn]);

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
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const renderLoggedInContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onNavigate={setActiveTab} />;
      case 'tradingjournal':
        return <TradingJournal user={auth.user} isAdmin={auth.user?.role === 'admin'} />;
      case 'optionchain':
        return <TradeXOptionChain />;
      case 'optionsimulator':
        return <OptionSimulator />;
      case 'strategy':
        return <StrategyBuilder onNavigate={setActiveTab} />;
      case 'futures':
        return <FuturesAnalytics />;
      case 'oiintelligence':
        return <OIIntelligence onNavigate={setActiveTab} />;
      case 'footprint':
        return <FootprintChart />;
      case 'trafi':
        return <MasterAI />;
      case 'chart':
        return <ChartsWorkspace />;
      case 'papertrading':
        return <PaperTrading user={auth.user} onNavigate={setActiveTab} />;
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
        return <AdminPanel />;
      case 'subscription':
        return <Subscription user={auth.user} />;
      default:
        return <Dashboard onNavigate={setActiveTab} />;
    }
  };

  const mainClass = auth.isLoggedIn
    ? `app-main ${sidebarCollapsed ? 'app-main--sidebar-collapsed' : 'app-main--sidebar'}`
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
                onLogout={auth.logout}
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
                ? activeTab === 'chart'
                  ? 'charts-page'
                  : activeTab === 'scanner' || activeTab === 'master-tx'
                    ? 'page-content page-content--screener'
                    : 'page-content'
                : ''
            }
          >
            {!auth.isLoggedIn ? (
              <AuthPage
                mode={auth.authMode}
                onLogin={auth.login}
                onSignup={auth.signup}
                onGoogleLogin={auth.googleLogin}
                onOtpLogin={auth.otpLogin}
                onForgotPassword={auth.forgotPassword}
                onSwitchMode={auth.setAuthMode}
              />
            ) : (
              <AppErrorBoundary onReset={() => handleTabChange('dashboard')}>
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
              onLogout={auth.logout}
              onUpgrade={() => handleTabChange('subscription')}
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
      {auth.isLoggedIn ? <FyersConnectBanner /> : null}
    </AutoRefreshProvider>
  );
}

export default function App() {
  if (window.location.pathname === '/fyers-login') {
    return <FyersLoginPage />;
  }
  return <AppWorkspace />;
}
