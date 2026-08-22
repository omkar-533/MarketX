# Fragments for index.css

## L9649 StrReplace

### old_string

```
html[data-theme="light"] .auth-lux-modal__backdrop {
  background: rgba(15, 23, 42, 0.42) !important;
}
```

### new_string

```
html[data-theme="light"] .auth-lux-modal__backdrop {
  background: rgba(15, 23, 42, 0.42) !important;
}

/* ─── Wolf Terminal desk ─────────────────────────────────────────── */
.app-main--terminal {
  overflow: hidden;
}

.page-content--terminal {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 3.5rem);
  max-height: calc(100vh - 3.5rem);
  min-height: 0;
  padding: 0 !important;
  overflow: hidden;
}

.wolf-term {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  background: #131722;
  color: #d1d4dc;
}

.wolf-term__bar {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 0.35rem;
  flex: 0 0 auto;
  min-height: 2.4rem;
  border-bottom: 1px solid #2a2e39;
  background: #1e222d;
  padding: 0.2rem 0.35rem;
}

.wolf-term__bar-scroll {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.wolf-term__search {
  position: relative;
  flex: 0 0 auto;
}

.wolf-term__symbol {
  margin: 0;
}

.wolf-term__symbol-input {
  width: 7.5rem;
  padding: 0.28rem 0.45rem;
  border-radius: 0.35rem;
  border: 1px solid #363a45;
  background: #131722;
  color: #f0b90b;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.wolf-term__symbol-input:focus {
  outline: 1px solid rgba(240, 185, 11, 0.55);
  border-color: rgba(240, 185, 11, 0.55);
}

.wolf-term__search-menu {
  position: absolute;
  z-index: 40;
  top: calc(100% + 0.25rem);
  left: 0;
  width: min(22rem, 80vw);
  max-height: 18rem;
  overflow-y: auto;
  border-radius: 0.5rem;
  border: 1px solid #363a45;
  background: #1e222d;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}

.wolf-term__search-empty {
  padding: 0.65rem 0.75rem;
  font-size: 0.72rem;
  color: #787b86;
}

.wolf-term__search-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.45rem;
  align-items: center;
  width: 100%;
  padding: 0.4rem 0.65rem;
  border: 0;
  background: transparent;
  color: #d1d4dc;
  text-align: left;
  cursor: pointer;
}

.wolf-term__search-item b {
  font-size: 0.74rem;
  font-weight: 800;
}

.wolf-term__search-item span {
  font-size: 0.66rem;
  color: #787b86;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wolf-term__search-item em {
  font-style: normal;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #f0b90b;
}

.wolf-term__search-item.on,
.wolf-term__search-item:hover {
  background: rgba(240, 185, 11, 0.1);
}

.wolf-term__sep {
  width: 1px;
  align-self: stretch;
  background: #2a2e39;
  flex: 0 0 auto;
}

.wolf-term__tfs {
  display: flex;
  align-items: center;
  gap: 0.12rem;
}

.wolf-term__tf {
  padding: 0.22rem 0.4rem;
  border-radius: 0.3rem;
  border: 0;
  background: transparent;
  color: #787b86;
  font-size: 0.68rem;
  font-weight: 800;
  cursor: pointer;
}

.wolf-term__tf.on,
.wolf-term__tf:hover {
  background: rgba(41, 98, 255, 0.18);
  color: #d1d4dc;
}

.wolf-term__tf.on {
  color: #2962ff;
}

.wolf-term__selects {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.wolf-term__select {
  padding: 0.22rem 0.35rem;
  border-radius: 0.3rem;
  border: 1px solid #363a45;
  background: #131722;
  color: #d1d4dc;
  font-size: 0.68rem;
  font-weight: 700;
}

.wolf-term__ind {
  position: relative;
}

.wolf-term__ind-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.22rem 0.45rem;
  border-radius: 0.3rem;
  border: 1px solid #363a45;
  background: #131722;
  color: #d1d4dc;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
}

.wolf-term__ind-btn.on {
  border-color: rgba(41, 98, 255, 0.55);
  color: #2962ff;
}

.wolf-term__ind-menu {
  position: absolute;
  z-index: 40;
  top: calc(100% + 0.25rem);
  right: 0;
  width: 12rem;
  max-height: 16rem;
  overflow-y: auto;
  border-radius: 0.5rem;
  border: 1px solid #363a45;
  background: #1e222d;
  padding: 0.35rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}

.wolf-term__ind-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.28rem 0.35rem;
  border-radius: 0.3rem;
  font-size: 0.7rem;
  font-weight: 650;
  cursor: pointer;
}

.wolf-term__ind-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.wolf-term__ind-clear {
  width: 100%;
  margin-top: 0.25rem;
  padding: 0.3rem;
  border: 0;
  border-top: 1px solid #2a2e39;
  background: transparent;
  color: #ef5350;
  font-size: 0.65rem;
  font-weight: 800;
  cursor: pointer;
}

.wolf-term__actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: 0 0 auto;
}

.wolf-term__badge {
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
  border: 1px solid #363a45;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #787b86;
}

.wolf-term__badge--native {
  color: #26a69a;
  border-color: rgba(38, 166, 154, 0.4);
}

.wolf-term__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 0.35rem;
  border: 1px solid #363a45;
  background: #131722;
  color: #d1d4dc;
  cursor: pointer;
}

.wolf-term__icon:hover {
  border-color: rgba(240, 185, 11, 0.45);
  color: #f0b90b;
}

.wolf-term__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 15.5rem;
  flex: 1 1 auto;
  min-height: 0;
}

.wolf-term--wl-closed .wolf-term__body {
  grid-template-columns: minmax(0, 1fr);
}

.wolf-term__chart {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.wolf-term__chart .mai-tv__frame--fill,
.wolf-term__tv-fallback {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

.wolf-term__tv-fallback {
  position: relative;
}

.wolf-term__tv-fallback .mai-tv__host,
.wolf-term__tv-fallback iframe {
  height: 100% !important;
  min-height: 100%;
}

.mai-tv__frame--fill {
  height: 100%;
}

.mai-nc__history-load {
  position: absolute;
  top: 0.55rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid rgba(41, 98, 255, 0.35);
  background: rgba(19, 23, 34, 0.85);
  color: #9db2ff;
  font-size: 0.62rem;
  font-weight: 800;
  pointer-events: none;
}

.mai-nc__history-load--done {
  border-color: #2a2e39;
  color: #787b86;
  opacity: 0.7;
}

.wolf-term__watch {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid #2a2e39;
  background: #1e222d;
}

.wolf-term__watch-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.55rem;
  border-bottom: 1px solid #2a2e39;
}

.wolf-term__watch-head b {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #787b86;
}

.wolf-term__watch-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 0.3rem;
  border: 1px solid #363a45;
  background: #131722;
  color: #d1d4dc;
  cursor: pointer;
}

.wolf-term__watch-search {
  padding: 0.4rem;
  border-bottom: 1px solid #2a2e39;
}

.wolf-term__watch-search input {
  width: 100%;
  padding: 0.3rem 0.45rem;
  border-radius: 0.3rem;
  border: 1px solid #363a45;
  background: #131722;
  color: #d1d4dc;
  font-size: 0.7rem;
}

.wolf-term__watch-hits {
  display: grid;
  gap: 0.15rem;
  margin-top: 0.3rem;
  max-height: 8rem;
  overflow-y: auto;
}

.wolf-term__watch-hits button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.05rem;
  width: 100%;
  padding: 0.3rem 0.4rem;
  border: 0;
  border-radius: 0.3rem;
  background: transparent;
  color: #d1d4dc;
  text-align: left;
  cursor: pointer;
}

.wolf-term__watch-hits button:hover:not(:disabled) {
  background: rgba(240, 185, 11, 0.08);
}

.wolf-term__watch-hits button:disabled {
  opacity: 0.4;
  cursor: default;
}

.wolf-term__watch-hits b {
  font-size: 0.7rem;
}

.wolf-term__watch-hits span {
  font-size: 0.58rem;
  color: #787b86;
}

.wolf-term__watch-list {
  list-style: none;
  margin: 0;
  padding: 0.2rem 0;
  overflow-y: auto;
  flex: 1 1 auto;
}

.wolf-term__watch-list li {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.1rem;
  padding: 0 0.25rem;
}

.wolf-term__watch-list li.on {
  background: rgba(41, 98, 255, 0.12);
}

.wolf-term__watch-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.35rem;
  align-items: center;
  width: 100%;
  padding: 0.4rem 0.35rem;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.wolf-term__watch-sym {
  font-size: 0.72rem;
  font-weight: 800;
  color: #d1d4dc;
}

.wolf-term__watch-px,
.wolf-term__watch-chg {
  font-size: 0.66rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.wolf-term__watch-px.up,
.wolf-term__watch-chg.up {
  color: #26a69a;
}

.wolf-term__watch-px.down,
.wolf-term__watch-chg.down {
  color: #ef5350;
}

.wolf-term__watch-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.3rem;
  height: 1.3rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: #787b86;
  opacity: 0;
  cursor: pointer;
}

.wolf-term__watch-list li:hover .wolf-term__watch-x {
  opacity: 1;
}

.wolf-term__wl-toggle {
  position: absolute;
  top: 2.7rem;
  right: 0.35rem;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 0.35rem;
  border: 1px solid #363a45;
  background: rgba(30, 34, 45, 0.95);
  color: #d1d4dc;
  cursor: pointer;
}

.wolf-term--wl-closed .wolf-term__wl-toggle {
  right: 0.45rem;
}

@media (max-width: 900px) {
  .wolf-term__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .wolf-term__watch {
    display: none;
  }

  .wolf-term__wl-toggle {
    display: none;
  }

  .page-content--terminal {
    height: calc(100vh - 3.5rem - env(safe-area-inset-bottom, 0px));
  }
}

```

## L9652 StrReplace

### old_string

```
.wolf-term__tv-fallback {
  position: relative;
}

.wolf-term__tv-fallback .mai-tv__host,
.wolf-term__tv-fallback iframe {
  height: 100% !important;
  min-height: 100%;
}
```

### new_string

```
.wolf-term__tv-fallback {
  position: relative;
  display: flex;
  flex-direction: column;
}

.wolf-term__tv-fallback .mai-tv__frame {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
}

.wolf-term__tv-fallback .mai-tv__host,
.wolf-term__tv-fallback iframe {
  height: 100% !important;
  min-height: 100%;
}
```

## L9708 StrReplace

### old_string

```
html[data-theme="light"] .auth-lux-modal__backdrop {
  background: rgba(15, 23, 42, 0.42) !important;
}
```

### new_string

```
html[data-theme="light"] .auth-lux-modal__backdrop {
  background: rgba(15, 23, 42, 0.42) !important;
}

/* ─── Wolf Terminal desk (pro charting chrome) ─────────────────────── */
.app-main--terminal-immersive {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  max-width: none !important;
  height: 100vh !important;
  max-height: 100vh !important;
  overflow: hidden;
  background: #131722;
}

.page-content--terminal {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-height: 100vh;
  min-height: 0;
  padding: 0 !important;
  margin: 0 !important;
  overflow: hidden;
  background: #131722;
}

.wolf-term {
  --wt-bg: #131722;
  --wt-panel: #1e222d;
  --wt-border: #2a2e39;
  --wt-border-2: #363a45;
  --wt-text: #d1d4dc;
  --wt-muted: #787b86;
  --wt-blue: #2962ff;
  --wt-green: #089981;
  --wt-red: #f23645;
  position: relative;
  display: grid;
  grid-template-rows: 38px minmax(0, 1fr) 28px;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  background: var(--wt-bg);
  color: var(--wt-text);
  font-family: "Trebuchet MS", "Segoe UI", Tahoma, sans-serif;
}

.wolf-term__bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 0.35rem;
  height: 38px;
  padding: 0 0.4rem;
  border-bottom: 1px solid var(--wt-border);
  background: var(--wt-panel);
  z-index: 20;
}

.wolf-term__bar-left,
.wolf-term__bar-mid,
.wolf-term__bar-right {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  min-width: 0;
}

.wolf-term__bar-mid {
  justify-content: center;
}

.wolf-term__bar-right {
  justify-content: flex-end;
}

.wolf-term__brand {
  position: relative;
}

.wolf-term__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid var(--wt-border-2);
  background: #131722;
  color: #f0b90b;
  font-size: 0.72rem;
  font-weight: 900;
  cursor: pointer;
}

.wolf-term__brand-menu {
  position: absolute;
  z-index: 50;
  top: calc(100% + 4px);
  left: 0;
  min-width: 160px;
  padding: 0.25rem;
  border: 1px solid var(--wt-border-2);
  border-radius: 4px;
  background: #1c2030;
}

.wolf-term__brand-menu button {
  display: block;
  width: 100%;
  padding: 0.4rem 0.55rem;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--wt-text);
  font-size: 0.75rem;
  text-align: left;
  cursor: pointer;
}

.wolf-term__brand-menu button:hover {
  background: rgba(41, 98, 255, 0.15);
}

.wolf-term__search,
.wolf-term__tf-wrap {
  position: relative;
}

.wolf-term__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  height: 28px;
  padding: 0 0.45rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--wt-text);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.wolf-term__chip:hover,
.wolf-term__icon-btn:hover:not(:disabled),
.wolf-term__text-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
}

.wolf-term__chip--symbol {
  font-weight: 800;
  letter-spacing: 0.02em;
}

.wolf-term__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--wt-text);
  cursor: pointer;
}

.wolf-term__icon-btn:disabled,
.wolf-term__text-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.wolf-term__text-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  height: 28px;
  padding: 0 0.5rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--wt-text);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.wolf-term__text-btn.on {
  color: var(--wt-blue);
}

.wolf-term__text-btn em {
  font-style: normal;
  margin-left: 0.15rem;
  padding: 0 0.3rem;
  border-radius: 3px;
  background: rgba(41, 98, 255, 0.2);
  font-size: 0.65rem;
  font-weight: 800;
}

.wolf-term__layout-name {
  margin-left: 0.25rem;
  font-size: 0.72rem;
  color: var(--wt-muted);
  white-space: nowrap;
}

.wolf-term__btn-trade {
  height: 28px;
  padding: 0 0.75rem;
  border: 1px solid var(--wt-blue);
  border-radius: 4px;
  background: transparent;
  color: var(--wt-blue);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}

.wolf-term__btn-publish {
  height: 28px;
  padding: 0 0.8rem;
  border: 0;
  border-radius: 4px;
  background: #fff;
  color: #131722;
  font-size: 0.75rem;
  font-weight: 800;
  cursor: pointer;
}

.wolf-term__badge {
  padding: 0.12rem 0.35rem;
  border-radius: 3px;
  border: 1px solid var(--wt-border-2);
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--wt-muted);
}

.wolf-term__symbol {
  margin: 0;
  padding: 0.35rem;
  border-bottom: 1px solid var(--wt-border);
}

.wolf-term__symbol-input {
  width: 100%;
  padding: 0.4rem 0.5rem;
  border-radius: 4px;
  border: 1px solid var(--wt-border-2);
  background: #131722;
  color: var(--wt-text);
  font-size: 0.8rem;
  font-weight: 600;
}

.wolf-term__symbol-input:focus {
  outline: 1px solid var(--wt-blue);
  border-color: var(--wt-blue);
}

.wolf-term__search-menu,
.wolf-term__pop {
  position: absolute;
  z-index: 60;
  top: calc(100% + 4px);
  left: 0;
  min-width: 140px;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--wt-border-2);
  border-radius: 4px;
  background: #1c2030;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
}

.wolf-term__search-menu {
  width: min(22rem, 85vw);
}

.wolf-term__search-empty {
  padding: 0.65rem 0.75rem;
  font-size: 0.72rem;
  color: var(--wt-muted);
}

.wolf-term__search-item,
.wolf-term__pop-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.45rem;
  align-items: center;
  width: 100%;
  padding: 0.42rem 0.65rem;
  border: 0;
  background: transparent;
  color: var(--wt-text);
  text-align: left;
  cursor: pointer;
  font-size: 0.78rem;
}

.wolf-term__pop-item {
  display: block;
}

.wolf-term__search-item b {
  font-size: 0.78rem;
  font-weight: 800;
}

.wolf-term__search-item span {
  font-size: 0.68rem;
  color: var(--wt-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wolf-term__search-item em {
  font-style: normal;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--wt-muted);
}

.wolf-term__search-item.on,
.wolf-term__search-item:hover,
.wolf-term__pop-item.on,
.wolf-term__pop-item:hover {
  background: rgba(41, 98, 255, 0.16);
}

.wolf-term__ind-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.wolf-term__ind-modal {
  width: min(720px, 92vw);
  max-height: min(560px, 86vh);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--wt-border-2);
  border-radius: 8px;
  background: #1e222d;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.wolf-term__ind-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 0.85rem;
  border-bottom: 1px solid var(--wt-border);
}

.wolf-term__ind-modal-head b {
  font-size: 0.95rem;
  font-weight: 700;
}

.wolf-term__ind-modal-search {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0.65rem 0.85rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--wt-border-2);
  border-radius: 4px;
  background: #131722;
  color: var(--wt-muted);
}

.wolf-term__ind-modal-search input {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--wt-text);
  font-size: 0.85rem;
  outline: none;
}

.wolf-term__ind-modal-body {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  min-height: 0;
  flex: 1;
  border-top: 1px solid var(--wt-border);
  overflow: hidden;
}

.wolf-term__ind-modal-body aside {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.45rem;
  border-right: 1px solid var(--wt-border);
  background: #181c27;
}

.wolf-term__ind-modal-body aside button {
  padding: 0.45rem 0.55rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--wt-muted);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.wolf-term__ind-modal-body aside button.on {
  background: rgba(41, 98, 255, 0.18);
  color: var(--wt-text);
}

.wolf-term__ind-list {
  overflow-y: auto;
  padding: 0.35rem;
}

.wolf-term__ind-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.55rem;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
}

.wolf-term__ind-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.wolf-term__ind-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
  padding: 0.55rem 0.85rem;
  border-top: 1px solid var(--wt-border);
}

.wolf-term__ind-modal-foot button {
  height: 30px;
  padding: 0 0.8rem;
  border-radius: 4px;
  border: 1px solid var(--wt-border-2);
  background: transparent;
  color: var(--wt-text);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}

.wolf-term__ind-modal-foot button.primary {
  border-color: var(--wt-blue);
  background: var(--wt-blue);
  color: #fff;
}

.wolf-term__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
}

.wolf-term--panel-closed .wolf-term__body {
  grid-template-columns: minmax(0, 1fr) 48px;
}

.wolf-term__chart {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--wt-bg);
}

.wolf-term__chart .mai-tv__frame--fill,
.wolf-term__tv-fallback {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

.wolf-term__tv-fallback {
  position: relative;
  display: flex;
  flex-direction: column;
}

.wolf-term__tv-fallback .mai-tv__frame {
  flex: 1 1 auto;
  height: 100%;
}

.wolf-term__tv-fallback .mai-tv__host,
.wolf-term__tv-fallback iframe {
  height: 100% !important;
  min-height: 100%;
}

.mai-tv__frame--fill {
  height: 100%;
  min-height: 0;
}

/* Desk drawing rail + flyouts */
.mai-nc__rail--desk {
  width: 46px;
  padding: 0.35rem 0.2rem;
  gap: 0.12rem;
  background: var(--wt-panel);
  border-right: 1px solid var(--wt-border);
}

.mai-nc__rail--desk .mai-nc__rail-btn {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  color: var(--wt-text);
}

.mai-nc__rail--desk .mai-nc__rail-btn--on {
  color: var(--wt-blue);
  background: rgba(41, 98, 255, 0.18);
}

.mai-nc__rail-group {
  position: relative;
}

.mai-nc__flyout {
  position: absolute;
  z-index: 40;
  left: calc(100% + 6px);
  top: 0;
  min-width: 220px;
  max-height: min(420px, 70vh);
  overflow-y: auto;
  padding: 0.25rem 0;
  border: 1px solid var(--wt-border-2);
  border-radius: 4px;
  background: #1c2030;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45);
}

.mai-nc__flyout--sm {
  min-width: 160px;
}

.mai-nc__flyout-sec {
  padding: 0.35rem 0.7rem 0.2rem;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--wt-muted);
}

.mai-nc__flyout-item {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.4rem 0.7rem;
  border: 0;
  background: transparent;
  color: var(--wt-text);
  font-size: 0.78rem;
  text-align: left;
  cursor: pointer;
}

.mai-nc__flyout-item.on,
.mai-nc__flyout-item:hover {
  background: rgba(41, 98, 255, 0.16);
}

.mai-nc__flyout-item kbd {
  font-family: inherit;
  font-size: 0.62rem;
  color: var(--wt-muted);
}

.mai-nc__draw--hidden {
  opacity: 0 !important;
  pointer-events: none !important;
}

.wolf-term__chart .mai-nc__legend {
  top: 2.6rem;
  left: 0.55rem;
  font-size: 0.72rem;
}

.wolf-term__chart .mai-nc__quick {
  top: 0.35rem;
  right: 3.2rem;
}

.wolf-term__trade {
  position: absolute;
  z-index: 8;
  top: 8px;
  left: 54px;
  display: flex;
  align-items: stretch;
  height: 36px;
  border: 1px solid var(--wt-border-2);
  border-radius: 2px;
  overflow: hidden;
  background: rgba(19, 23, 34, 0.92);
  pointer-events: auto;
}

.wolf-term__trade-sell,
.wolf-term__trade-buy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 88px;
  padding: 0 0.55rem;
  border: 0;
  cursor: pointer;
  line-height: 1.05;
}

.wolf-term__trade-sell {
  background: var(--wt-red);
  color: #fff;
}

.wolf-term__trade-buy {
  background: var(--wt-blue);
  color: #fff;
}

.wolf-term__trade-sell span,
.wolf-term__trade-buy span {
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  opacity: 0.9;
}

.wolf-term__trade-sell b,
.wolf-term__trade-buy b {
  font-size: 0.78rem;
  font-weight: 800;
}

.wolf-term__trade-qty {
  width: 52px;
  border: 0;
  border-left: 1px solid var(--wt-border);
  border-right: 1px solid var(--wt-border);
  background: #0f131a;
  color: var(--wt-text);
  text-align: center;
  font-size: 0.75rem;
  font-weight: 700;
}

.wolf-term__right {
  display: flex;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--wt-border);
  background: var(--wt-panel);
}

.wolf-term__panel {
  width: 280px;
  min-width: 280px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--wt-border);
  overflow: hidden;
}

.wolf-term__panel-placeholder {
  padding: 1rem;
}

.wolf-term__panel-placeholder b {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.85rem;
}

.wolf-term__panel-placeholder p {
  margin: 0;
  font-size: 0.72rem;
  color: var(--wt-muted);
  line-height: 1.45;
}

.wolf-term__dock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  width: 48px;
  padding: 0.35rem 0.15rem;
  background: var(--wt-panel);
}

.wolf-term__dock-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--wt-muted);
  cursor: pointer;
}

.wolf-term__dock-btn:hover:not(:disabled),
.wolf-term__dock-btn.on {
  color: var(--wt-text);
  background: rgba(255, 255, 255, 0.06);
}

.wolf-term__dock-btn.on {
  color: var(--wt-blue);
}

.wolf-term__dock-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.wolf-term__dock-spacer {
  flex: 1 1 auto;
  min-height: 0.5rem;
}

.wolf-term__watch {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  background: var(--wt-panel);
}

.wolf-term__watch-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.65rem;
  border-bottom: 1px solid var(--wt-border);
}

.wolf-term__watch-head b {
  font-size: 0.78rem;
  font-weight: 700;
}

.wolf-term__watch-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--wt-text);
  cursor: pointer;
}

.wolf-term__watch-add:hover {
  background: rgba(255, 255, 255, 0.06);
}

.wolf-term__watch-search {
  padding: 0.45rem;
  border-bottom: 1px solid var(--wt-border);
}

.wolf-term__watch-search input {
  width: 100%;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  border: 1px solid var(--wt-border-2);
  background: #131722;
  color: var(--wt-text);
  font-size: 0.75rem;
}

.wolf-term__watch-hits {
  display: grid;
  gap: 0.15rem;
  max-height: 9rem;
  overflow-y: auto;
  margin-top: 0.35rem;
}

.wolf-term__watch-hits button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.05rem;
  width: 100%;
  padding: 0.35rem 0.45rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--wt-text);
  text-align: left;
  cursor: pointer;
}

.wolf-term__watch-hits button:hover:not(:disabled) {
  background: rgba(41, 98, 255, 0.12);
}

.wolf-term__watch-hits button:disabled {
  opacity: 0.4;
  cursor: default;
}

.wolf-term__watch-hits b {
  font-size: 0.72rem;
}

.wolf-term__watch-hits span {
  font-size: 0.58rem;
  color: var(--wt-muted);
}

.wolf-term__watch-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1 1 auto;
}

.wolf-term__watch-list li {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  border-bottom: 1px solid rgba(42, 46, 57, 0.6);
}

.wolf-term__watch-list li.on {
  background: rgba(41, 98, 255, 0.12);
}

.wolf-term__watch-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.45rem;
  align-items: center;
  width: 100%;
  padding: 0.45rem 0.55rem;
  border: 0;
  background: transparent;
  color: var(--wt-text);
  cursor: pointer;
  text-align: left;
}

.wolf-term__watch-sym {
  font-size: 0.74rem;
  font-weight: 800;
}

.wolf-term__watch-px,
.wolf-term__watch-chg {
  font-size: 0.68rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.wolf-term__watch-px.up,
.wolf-term__watch-chg.up {
  color: var(--wt-green);
}

.wolf-term__watch-px.down,
.wolf-term__watch-chg.down {
  color: var(--wt-red);
}

.wolf-term__watch-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 0.25rem;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--wt-muted);
  opacity: 0;
  cursor: pointer;
}

.wolf-term__watch-list li:hover .wolf-term__watch-x {
  opacity: 1;
}

.wolf-term__bottom {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  height: 28px;
  padding: 0 0.45rem;
  border-top: 1px solid var(--wt-border);
  background: var(--wt-panel);
  z-index: 15;
}

.wolf-term__bottom-tabs {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.wolf-term__bottom-tabs button {
  height: 22px;
  padding: 0 0.45rem;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--wt-muted);
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
}

.wolf-term__bottom-tabs button:disabled {
  opacity: 0.55;
  cursor: default;
}

.wolf-term__ranges {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  overflow-x: auto;
  scrollbar-width: none;
}

.wolf-term__ranges button {
  height: 20px;
  padding: 0 0.35rem;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--wt-muted);
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
}

.wolf-term__ranges button.on,
.wolf-term__ranges button:hover {
  color: var(--wt-blue);
}

.wolf-term__bottom-right {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.wolf-term__clock {
  font-size: 0.68rem;
  color: var(--wt-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.wolf-term__clock em {
  font-style: normal;
  margin-left: 0.25rem;
  font-weight: 800;
}

.wolf-term__clock em.live {
  color: var(--wt-green);
}

.wolf-term__scale-btn {
  height: 18px;
  padding: 0 0.3rem;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--wt-muted);
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: lowercase;
  cursor: pointer;
}

.wolf-term__scale-btn.on {
  color: var(--wt-blue);
}

@media (max-width: 960px) {
  .wolf-term__bar {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .wolf-term__bar-mid {
    display: none;
  }

  .wolf-term__panel {
    width: 220px;
    min-width: 220px;
  }

  .wolf-term__trade {
    left: 8px;
    top: 6px;
    transform: scale(0.92);
    transform-origin: top left;
  }

  .wolf-term__bottom-tabs {
    display: none;
  }
}

@media (max-width: 720px) {
  .wolf-term__panel {
    display: none;
  }

  .wolf-term--panel-closed .wolf-term__body,
  .wolf-term__body {
    grid-template-columns: minmax(0, 1fr) 42px;
  }
}

```

## L9727 StrReplace

### old_string

```
@media (max-width: 720px) {
  .wolf-term__panel {
    display: none;
  }

  .wolf-term--panel-closed .wolf-term__body,
  .wolf-term__body {
    grid-template-columns: minmax(0, 1fr) 42px;
  }
}

```

### new_string

```
@media (max-width: 720px) {
  .wolf-term__panel {
    display: none;
  }

  .wolf-term--panel-closed .wolf-term__body,
  .wolf-term__body {
    grid-template-columns: minmax(0, 1fr) 42px;
  }
}

/* ─── Wolf Terminal TV desk (Advanced Chart embed) ─────────────────── */
.wolf-term--tv {
  display: grid;
  grid-template-rows: 32px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  background: #131722;
}

.wolf-term__exitbar {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  height: 32px;
  padding: 0 0.45rem;
  border-bottom: 1px solid #2a2e39;
  background: #1e222d;
  z-index: 30;
}

.wolf-term__exitbar-title {
  font-size: 0.78rem;
  font-weight: 800;
  color: #d1d4dc;
}

.wolf-term__exitbar-hint {
  font-size: 0.65rem;
  color: #787b86;
  margin-right: auto;
}

.wolf-term__exitbar-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.wolf-term__exitbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  height: 24px;
  padding: 0 0.5rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #d1d4dc;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
}

.wolf-term__exitbar-btn:hover,
.wolf-term__exitbar-btn.on {
  background: rgba(41, 98, 255, 0.16);
  color: #2962ff;
}

.wolf-term--tv .wolf-term__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  min-height: 0;
  overflow: hidden;
}

.wolf-term--tv.wolf-term--wl-closed .wolf-term__body {
  grid-template-columns: minmax(0, 1fr);
}

.wolf-term--tv .wolf-term__chart {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.wolf-term__tv-desk {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #131722;
}

.wolf-term__tv-host {
  width: 100%;
  height: 100%;
}

.wolf-term__tv-host > div,
.wolf-term__tv-desk iframe {
  width: 100% !important;
  height: 100% !important;
  border: 0 !important;
}

.wolf-term__tv-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(19, 23, 34, 0.92);
  color: #d1d4dc;
  font-size: 0.85rem;
  z-index: 5;
}

.wolf-term__wl-side {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid #2a2e39;
  background: #1e222d;
}

.wolf-term__wl-side .wolf-term__watch {
  height: 100%;
}

@media (max-width: 800px) {
  .wolf-term--tv .wolf-term__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .wolf-term__wl-side {
    display: none;
  }

  .wolf-term__exitbar-hint {
    display: none;
  }
}

```

## L9732 StrReplace

### old_string

```
.wolf-term--tv {
  display: grid;
  grid-template-rows: 32px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  background: #131722;
}
```

### new_string

```
.wolf-term--tv {
  display: grid;
  grid-template-rows: 32px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  background: #131722;
}

.wolf-term--native {
  display: grid;
  grid-template-rows: 32px 38px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  background: #131722;
}

.wolf-term--native .wolf-term__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  min-height: 0;
  overflow: hidden;
}

.wolf-term--native.wolf-term--wl-closed .wolf-term__body {
  grid-template-columns: minmax(0, 1fr);
}

.wolf-term--native .wolf-term__chart {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
```

## L9746 StrReplace

### old_string

```
.wolf-term__ind-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.55rem;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
}

.wolf-term__ind-row:hover {
  background: rgba(255, 255, 255, 0.04);
}
```

### new_string

```
.wolf-term__ind-row--wolf {
  align-items: flex-start;
}

.wolf-term__ind-copy {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
  flex: 1 1 auto;
}

.wolf-term__ind-copy b {
  font-size: 0.8rem;
  font-weight: 700;
  color: #d1d4dc;
}

.wolf-term__ind-copy em {
  font-style: normal;
  font-size: 0.68rem;
  color: #787b86;
  line-height: 1.35;
}

.wolf-term__ind-soon {
  flex: 0 0 auto;
  margin-top: 0.1rem;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: rgba(240, 185, 11, 0.14);
  color: #f0b90b;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.wolf-term__ind-empty {
  padding: 0.85rem 0.65rem;
  font-size: 0.75rem;
  color: #787b86;
  line-height: 1.4;
}

.mai-nc__legend-wolf {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-left: 0.35rem;
}

.mai-nc__wolf-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  border: 1px solid rgba(240, 185, 11, 0.35);
  background: rgba(240, 185, 11, 0.08);
  color: #f0b90b;
  font-size: 0.62rem;
  font-weight: 700;
}

.mai-nc__wolf-chip em {
  font-style: normal;
  opacity: 0.75;
  font-size: 0.55rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

```

