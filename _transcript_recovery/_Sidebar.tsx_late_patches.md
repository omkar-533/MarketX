# Sidebar.tsx late patches

## L9639 StrReplace

### old_string
```
const navItems = [
  { id: 'wolf-ai', label: PAGE_NAMES['wolf-ai'], icon: Bot },
  { id: 'mentor-ai', label: PAGE_NAMES['mentor-ai'], icon: GraduationCap },
  ...(SHOW_INDICATORS
    ? [{ id: 'indicators', label: PAGE_NAMES.indicators, icon: Code2 }]
    : []),
  { id: 'papertrading', label: PAGE_NAMES.papertrading, icon: Wallet },
  { id: 'tradingjournal', label: PAGE_NAMES.tradingjournal, icon: NotebookPen },
];
```

### new_string
```
const navItems = [
  { id: 'wolf-ai', label: PAGE_NAMES['wolf-ai'], icon: Bot },
  { id: 'mentor-ai', label: PAGE_NAMES['mentor-ai'], icon: GraduationCap },
  { id: 'terminal', label: PAGE_NAMES.terminal, icon: CandlestickChart },
  ...(SHOW_INDICATORS
    ? [{ id: 'indicators', label: PAGE_NAMES.indicators, icon: Code2 }]
    : []),
  { id: 'papertrading', label: PAGE_NAMES.papertrading, icon: Wallet },
  { id: 'tradingjournal', label: PAGE_NAMES.tradingjournal, icon: NotebookPen },
];
```

