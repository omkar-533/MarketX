# App.tsx late patches

## L9639 StrReplace

### old_string
```
const MentorAI = lazy(() => import('./components/MentorAI'));
const Indicators = lazy(() => import('./components/Indicators'));
const LtpCalculator = lazy(() => import('./components/LtpCalculator'));
```

### new_string
```
const MentorAI = lazy(() => import('./components/MentorAI'));
const TerminalPage = lazy(() => import('./components/terminal/TerminalPage'));
const Indicators = lazy(() => import('./components/Indicators'));
const LtpCalculator = lazy(() => import('./components/LtpCalculator'));
```

## L9639 StrReplace

### old_string
```
  'wolf-ai',
  'mentor-ai',
  'trafi', // legacy alias → normalized to wolf-ai
  'indicators',
```

### new_string
```
  'wolf-ai',
  'mentor-ai',
  'terminal',
  'trafi', // legacy alias → normalized to wolf-ai
  'indicators',
```

## L9639 StrReplace

### old_string
```
      case 'mentor-ai':
        return <MentorAI />;
      case 'indicators':
```

### new_string
```
      case 'mentor-ai':
        return <MentorAI />;
      case 'terminal':
        return <TerminalPage />;
      case 'indicators':
```

## L9639 StrReplace

### old_string
```
  const mainClass = auth.isLoggedIn
    ? `app-main ${sidebarCollapsed ? 'app-main--sidebar-collapsed' : 'app-main--sidebar'}${
        activeTab === 'wolf-ai' ? ' app-main--chat' : ''
      }`
    : 'app-main';
```

### new_string
```
  const mainClass = auth.isLoggedIn
    ? `app-main ${sidebarCollapsed ? 'app-main--sidebar-collapsed' : 'app-main--sidebar'}${
        activeTab === 'wolf-ai' ? ' app-main--chat' : ''
      }${activeTab === 'terminal' ? ' app-main--terminal' : ''}`
    : 'app-main';
```

## L9639 StrReplace

### old_string
```
                ? activeTab === 'master-tx'
                  ? 'page-content page-content--screener'
                  : activeTab === 'wolf-ai'
                    ? 'page-content page-content--chat'
                    : activeTab === 'mentor-ai'
                      ? 'page-content page-content--full page-content--mentor'
                      : 'page-content page-content--full'
```

### new_string
```
                ? activeTab === 'master-tx'
                  ? 'page-content page-content--screener'
                  : activeTab === 'wolf-ai'
                    ? 'page-content page-content--chat'
                    : activeTab === 'mentor-ai'
                      ? 'page-content page-content--full page-content--mentor'
                      : activeTab === 'terminal'
                        ? 'page-content page-content--terminal'
                        : 'page-content page-content--full'
```

## L9701 StrReplace

### old_string
```
      case 'terminal':
        return <TerminalPage />;
```

### new_string
```
      case 'terminal':
        return <TerminalPage onNavigate={handleTabChange} />;
```

## L9701 StrReplace

### old_string
```
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
```

### new_string
```
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
                className={headerClass}
              />
            </>
          </Suspense>
        )}
```

## L9701 StrReplace

### old_string
```
  const mainClass = auth.isLoggedIn
    ? `app-main ${sidebarCollapsed ? 'app-main--sidebar-collapsed' : 'app-main--sidebar'}${
        activeTab === 'wolf-ai' ? ' app-main--chat' : ''
      }${activeTab === 'terminal' ? ' app-main--terminal' : ''}`
    : 'app-main';
```

### new_string
```
  const mainClass = auth.isLoggedIn
    ? activeTab === 'terminal'
      ? 'app-main app-main--terminal-immersive'
      : `app-main ${sidebarCollapsed ? 'app-main--sidebar-collapsed' : 'app-main--sidebar'}${
          activeTab === 'wolf-ai' ? ' app-main--chat' : ''
        }`
    : 'app-main';
```

