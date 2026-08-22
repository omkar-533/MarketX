# CommandPalette.tsx late patches

## L9640 StrReplace

### old_string
```
  { id: 'wolf-ai', label: 'Open Wolf AI', shortcut: 'M' },
  { id: 'mentor-ai', label: 'Open Wolf Mentor', shortcut: 'T' },
  { id: 'ltpcalc', label: 'LPT Master', shortcut: 'L' },
  { id: 'tradingjournal', label: 'Open Trading Journal', shortcut: 'J' },
  { id: 'papertrading', label: 'Open Paper Trading', shortcut: 'P' },
  { id: 'optionchain', label: 'Open Option Chain', shortcut: 'O' },
  { id: 'optionsimulator', label: 'Open Option Simulator', shortcut: 'V' },
  { id: 'strategy', label: 'Strategy Builder', shortcut: 'S' },
  { id: 'futures', label: 'Futures Analytics', shortcut: 'F' },
  ...(SHOW_INDICATORS ? [{ id: 'indicators', label: 'Open Indicators', shortcut: 'C' }] : []),
];
```

### new_string
```
  { id: 'wolf-ai', label: 'Open Wolf AI', shortcut: 'M' },
  { id: 'mentor-ai', label: 'Open Wolf Mentor', shortcut: 'T' },
  { id: 'terminal', label: 'Open Terminal', shortcut: 'C' },
  { id: 'ltpcalc', label: 'LPT Master', shortcut: 'L' },
  { id: 'tradingjournal', label: 'Open Trading Journal', shortcut: 'J' },
  { id: 'papertrading', label: 'Open Paper Trading', shortcut: 'P' },
  { id: 'optionchain', label: 'Open Option Chain', shortcut: 'O' },
  { id: 'optionsimulator', label: 'Open Option Simulator', shortcut: 'V' },
  { id: 'strategy', label: 'Strategy Builder', shortcut: 'S' },
  { id: 'futures', label: 'Futures Analytics', shortcut: 'F' },
  ...(SHOW_INDICATORS ? [{ id: 'indicators', label: 'Open Indicators', shortcut: 'I' }] : []),
];
```

