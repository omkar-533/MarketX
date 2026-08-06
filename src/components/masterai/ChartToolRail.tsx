import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignJustify,
  ArrowDown,
  ArrowUpRight,
  BoxSelect,
  Check,
  Circle,
  Crosshair,
  Eye,
  EyeOff,
  Highlighter,
  Lock,
  Magnet,
  Maximize2,
  Minus,
  MousePointer2,
  MoveDiagonal,
  MoveHorizontal,
  MoveUpRight,
  MoveVertical,
  Pencil,
  PencilLine,
  ChevronRight,
  Ruler,
  Slash,
  Smile,
  Square,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Triangle,
  Type,
  Unlock,
  Waves,
  ZoomIn,
} from 'lucide-react';
import type { DrawingTool, MagnetMode } from '../../services/chart/chartDrawings';

type ToolMeta = {
  id: DrawingTool;
  label: string;
  shortcut?: string;
  Icon: typeof MousePointer2;
};

type FlySection = { title: string; tools: ToolMeta[] };

type RailGroup = {
  id: string;
  label: string;
  Icon: typeof MousePointer2;
  sections: FlySection[];
  direct?: DrawingTool;
};

const GROUPS: RailGroup[] = [
  {
    id: 'cursor',
    label: 'Cursors',
    Icon: MousePointer2,
    sections: [
      {
        title: '',
        tools: [
          { id: 'crosshair', label: 'Cross', Icon: Crosshair },
          { id: 'dot', label: 'Dot', Icon: Circle },
          { id: 'arrowCursor', label: 'Arrow', Icon: MousePointer2 },
          { id: 'eraser', label: 'Eraser', Icon: Trash2 },
        ],
      },
    ],
  },
  {
    id: 'trend',
    label: 'Trend line tools',
    Icon: TrendingUp,
    sections: [
      {
        title: 'Lines',
        tools: [
          { id: 'trend', label: 'Trendline', shortcut: 'Alt + T', Icon: TrendingUp },
          { id: 'ray', label: 'Ray', Icon: MoveUpRight },
          { id: 'info', label: 'Info line', Icon: Slash },
          { id: 'extended', label: 'Extended line', Icon: MoveDiagonal },
          { id: 'trendAngle', label: 'Trend angle', Icon: TrendingUp },
          { id: 'hline', label: 'Horizontal line', shortcut: 'Alt + H', Icon: Minus },
          { id: 'hray', label: 'Horizontal ray', shortcut: 'Alt + J', Icon: MoveHorizontal },
          { id: 'vline', label: 'Vertical line', shortcut: 'Alt + V', Icon: MoveVertical },
          { id: 'cross', label: 'Crossline', shortcut: 'Alt + C', Icon: Crosshair },
        ],
      },
      {
        title: 'Channels',
        tools: [
          { id: 'parallelChannel', label: 'Parallel channel', Icon: AlignJustify },
          { id: 'regressionTrend', label: 'Regression trend', Icon: TrendingUp },
          { id: 'flatTopBottom', label: 'Flat top/bottom', Icon: Minus },
          { id: 'disjointChannel', label: 'Disjoint channel', Icon: AlignJustify },
        ],
      },
      {
        title: 'Pitchforks',
        tools: [
          { id: 'pitchfork', label: 'Pitchfork', Icon: Triangle },
          { id: 'schiff', label: 'Schiff pitchfork', Icon: Triangle },
          { id: 'modSchiff', label: 'Modified Schiff pitchfork', Icon: Triangle },
          { id: 'insidePitchfork', label: 'Inside pitchfork', Icon: Triangle },
        ],
      },
    ],
  },
  {
    id: 'gannFib',
    label: 'Gann and Fibonacci tools',
    Icon: BoxSelect,
    sections: [
      {
        title: 'Fibonacci',
        tools: [
          { id: 'fib', label: 'Fib Retracement', Icon: AlignJustify },
          { id: 'fibExt', label: 'Trend-Based Fib Extension', Icon: AlignJustify },
          { id: 'fibChan', label: 'Fib Channel', Icon: AlignJustify },
          { id: 'fibTime', label: 'Fib Time Zone', Icon: AlignJustify },
          { id: 'fibTrendTime', label: 'Trend-Based Fib Time', Icon: AlignJustify },
          { id: 'fibCircles', label: 'Fib Circles', Icon: Circle },
          { id: 'fibSpiral', label: 'Fib Spiral', Icon: Waves },
          { id: 'fibSpeed', label: 'Fib Speed Resistance Fan', Icon: TrendingUp },
          { id: 'fibSpeedArcs', label: 'Fib Speed Resistance Arcs', Icon: Circle },
          { id: 'fibWedge', label: 'Fib Wedge', Icon: Triangle },
        ],
      },
      {
        title: 'Gann',
        tools: [
          { id: 'gannBox', label: 'Gann Box', Icon: BoxSelect },
          { id: 'gannSquareFixed', label: 'Gann Square Fixed', Icon: Square },
          { id: 'gannSquare', label: 'Gann Square', Icon: Square },
          { id: 'gannFan', label: 'Gann Fan', Icon: TrendingUp },
        ],
      },
    ],
  },
  {
    id: 'shapes',
    label: 'Geometric shapes',
    Icon: Pencil,
    sections: [
      {
        title: '',
        tools: [
          { id: 'brush', label: 'Brush', Icon: Pencil },
          { id: 'highlighter', label: 'Highlighter', Icon: Highlighter },
          { id: 'rect', label: 'Rectangle', Icon: Square },
          { id: 'rotatedRect', label: 'Rotated Rectangle', Icon: BoxSelect },
          { id: 'path', label: 'Path', Icon: PencilLine },
          { id: 'curve', label: 'Curve', Icon: Waves },
          { id: 'arc', label: 'Arc', Icon: Circle },
          { id: 'ellipse', label: 'Ellipse', Icon: Circle },
          { id: 'circle', label: 'Circle', Icon: Circle },
          { id: 'triangle', label: 'Triangle', Icon: Triangle },
          { id: 'polyline', label: 'Polyline', Icon: PencilLine },
          { id: 'angle', label: 'Angle', Icon: Triangle },
          { id: 'arrow', label: 'Arrow', Icon: MoveUpRight },
          { id: 'arrowUp', label: 'Arrow Mark Up', Icon: ArrowUpRight },
          { id: 'arrowDown', label: 'Arrow Mark Down', Icon: ArrowDown },
        ],
      },
    ],
  },
  {
    id: 'annotation',
    label: 'Annotation tools',
    Icon: Type,
    sections: [
      {
        title: '',
        tools: [
          { id: 'text', label: 'Text', Icon: Type },
          { id: 'anchoredText', label: 'Anchored Text', Icon: Type },
          { id: 'note', label: 'Note', Icon: Type },
          { id: 'anchoredNote', label: 'Anchored Note', Icon: Type },
          { id: 'callout', label: 'Callout', Icon: Type },
          { id: 'comment', label: 'Comment', Icon: Type },
          { id: 'priceLabel', label: 'Price Label', Icon: Type },
          { id: 'priceNote', label: 'Price Note', Icon: Type },
          { id: 'arrowMarker', label: 'Arrow Marker', Icon: MoveUpRight },
          { id: 'flag', label: 'Flag Mark', Icon: Star },
          { id: 'pin', label: 'Pin', Icon: Target },
          { id: 'table', label: 'Table', Icon: AlignJustify },
        ],
      },
    ],
  },
  {
    id: 'patterns',
    label: 'Patterns',
    Icon: Triangle,
    sections: [
      {
        title: 'Chart patterns',
        tools: [
          { id: 'xabcd', label: 'XABCD Pattern', Icon: Triangle },
          { id: 'cypher', label: 'Cypher Pattern', Icon: Triangle },
          { id: 'headShoulders', label: 'Head and Shoulders', Icon: Waves },
          { id: 'abcd', label: 'ABCD Pattern', Icon: Triangle },
          { id: 'trianglePattern', label: 'Triangle Pattern', Icon: Triangle },
          { id: 'threeDrives', label: 'Three Drives Pattern', Icon: Waves },
        ],
      },
      {
        title: 'Elliott waves',
        tools: [
          { id: 'elliotImpulse', label: 'Elliott Impulse Wave (12345)', Icon: Waves },
          { id: 'elliotCorrection', label: 'Elliott Correction Wave (ABC)', Icon: Waves },
          { id: 'elliotTriangle', label: 'Elliott Triangle Wave (ABCDE)', Icon: Waves },
          { id: 'elliotDouble', label: 'Elliott Double Combo (WXY)', Icon: Waves },
          { id: 'elliotTriple', label: 'Elliott Triple Combo (WXYZ)', Icon: Waves },
        ],
      },
      {
        title: 'Cycles',
        tools: [
          { id: 'cyclicLines', label: 'Cyclic Lines', Icon: MoveVertical },
          { id: 'timeCycles', label: 'Time Cycles', Icon: Circle },
          { id: 'sineLine', label: 'Sine Line', Icon: Waves },
        ],
      },
    ],
  },
  {
    id: 'prediction',
    label: 'Prediction and measurement',
    Icon: Target,
    sections: [
      {
        title: 'Forecasting',
        tools: [
          { id: 'longPos', label: 'Long Position', Icon: ArrowUpRight },
          { id: 'shortPos', label: 'Short Position', Icon: ArrowDown },
          { id: 'forecast', label: 'Forecast', Icon: TrendingUp },
          { id: 'barsPattern', label: 'Bars Pattern', Icon: AlignJustify },
          { id: 'ghostFeed', label: 'Ghost Feed', Icon: Eye },
          { id: 'sector', label: 'Sector', Icon: Circle },
        ],
      },
      {
        title: 'Volume-based',
        tools: [
          { id: 'anchoredVwap', label: 'Anchored VWAP', Icon: Target },
          { id: 'fixedRangeVp', label: 'Fixed Range Volume Profile', Icon: AlignJustify },
          { id: 'anchoredVp', label: 'Anchored Volume Profile', Icon: AlignJustify },
        ],
      },
      {
        title: 'Measurers',
        tools: [
          { id: 'priceRange', label: 'Price Range', Icon: MoveVertical },
          { id: 'dateRange', label: 'Date Range', Icon: MoveHorizontal },
          { id: 'datePriceRange', label: 'Date and Price Range', Icon: BoxSelect },
        ],
      },
    ],
  },
  {
    id: 'icons',
    label: 'Icons',
    Icon: Smile,
    sections: [
      {
        title: '',
        tools: [
          { id: 'sticker', label: 'Sticker ⭐', Icon: Smile },
          { id: 'flag', label: 'Flag', Icon: Star },
          { id: 'pin', label: 'Pin', Icon: Target },
          { id: 'arrowMarker', label: 'Arrow', Icon: MoveUpRight },
        ],
      },
    ],
  },
  {
    id: 'measure',
    label: 'Measure',
    Icon: Ruler,
    direct: 'measure',
    sections: [{ title: '', tools: [{ id: 'measure', label: 'Measure', Icon: Ruler }] }],
  },
  {
    id: 'zoom',
    label: 'Zoom In',
    Icon: ZoomIn,
    direct: 'zoomIn',
    sections: [{ title: '', tools: [{ id: 'zoomIn', label: 'Zoom In', Icon: ZoomIn }] }],
  },
];

function toolInGroup(group: RailGroup, tool: DrawingTool): boolean {
  return group.sections.some((s) => s.tools.some((t) => t.id === tool));
}

function activeMeta(group: RailGroup, tool: DrawingTool): ToolMeta {
  for (const s of group.sections) {
    const hit = s.tools.find((t) => t.id === tool);
    if (hit) return hit;
  }
  return group.sections[0].tools[0];
}

function groupOf(tool: DrawingTool): string {
  if (
    tool === 'cursor' ||
    tool === 'crosshair' ||
    tool === 'dot' ||
    tool === 'arrowCursor' ||
    tool === 'eraser'
  ) {
    return 'cursor';
  }
  for (const g of GROUPS) {
    if (toolInGroup(g, tool)) return g.id;
  }
  return 'trend';
}

const FAV_KEY = 'wolf.chart.tool.favorites';
const SYNC_KEY = 'wolf.chart.draw.sync';

function loadFavorites(): DrawingTool[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw.filter((x) => typeof x === 'string') as DrawingTool[]) : [];
  } catch {
    return [];
  }
}

function toolIsActive(tool: DrawingTool, id: DrawingTool): boolean {
  if (tool === id) return true;
  if (id === 'crosshair' && (tool === 'cursor' || tool === 'crosshair')) return true;
  return false;
}

export type ChartToolRailProps = {
  tool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  magnetMode: MagnetMode;
  onMagnetMode: (mode: MagnetMode) => void;
  snapIndicators: boolean;
  onSnapIndicators: (v: boolean) => void;
  stayDrawing: boolean;
  onStayDrawing: (v: boolean) => void;
  lockDrawings: boolean;
  onLockDrawings: (v: boolean) => void;
  hideDrawings: boolean;
  hideIndicators: boolean;
  hidePositions: boolean;
  onHideMode: (mode: 'drawings' | 'indicators' | 'positions' | 'all' | 'none') => void;
  drawingCount: number;
  indicatorCount: number;
  onUndo: () => void;
  onClearDrawings: () => void;
  onClearIndicators: () => void;
  onClearAll: () => void;
  removeLocked: boolean;
  onRemoveLocked: (v: boolean) => void;
  valuesTooltip: boolean;
  onValuesTooltip: (v: boolean) => void;
  variant?: 'chat' | 'desk';
};

type FlyPos = { top: number; left: number; maxH: number };

/** TradingView-style left rail — flyout portals next to the button like TV. */
export default function ChartToolRail({
  tool,
  onToolChange,
  magnetMode,
  onMagnetMode,
  snapIndicators,
  onSnapIndicators,
  stayDrawing,
  onStayDrawing,
  lockDrawings,
  onLockDrawings,
  hideDrawings,
  hideIndicators,
  hidePositions,
  onHideMode,
  drawingCount,
  indicatorCount,
  onUndo,
  onClearDrawings,
  onClearIndicators,
  onClearAll,
  removeLocked,
  onRemoveLocked,
  valuesTooltip,
  onValuesTooltip,
  variant = 'chat',
}: ChartToolRailProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [flyPos, setFlyPos] = useState<FlyPos | null>(null);
  const [favorites, setFavorites] = useState<DrawingTool[]>(() => loadFavorites());
  const [syncMode, setSyncMode] = useState<'off' | 'layout' | 'global'>(() => {
    try {
      return (localStorage.getItem(SYNC_KEY) as 'off' | 'layout' | 'global') || 'off';
    } catch {
      return 'off';
    }
  });
  const railRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeGroup = useMemo(() => groupOf(tool), [tool]);

  const placeFlyout = (groupId: string) => {
    const btn = btnRefs.current[groupId];
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const gap = 4;
    const estimatedH = Math.min(520, window.innerHeight - 16);
    let top = r.top;
    // Keep panel in viewport (TV pins near the tool button, flips if needed).
    if (top + estimatedH > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - estimatedH - 8);
    }
    if (top < 8) top = 8;
    const maxH = Math.max(160, window.innerHeight - top - 8);
    const panelW = Math.min(260, window.innerWidth * 0.78);
    let left = r.right + gap;
    if (left + panelW > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - panelW - 8);
    }
    setFlyPos({
      top: Math.round(top),
      left: Math.round(left),
      maxH,
    });
  };

  const openMenu = (groupId: string) => {
    if (openGroup === groupId) {
      setOpenGroup(null);
      setFlyPos(null);
      return;
    }
    setOpenGroup(groupId);
    placeFlyout(groupId);
  };

  useLayoutEffect(() => {
    if (!openGroup) {
      setFlyPos(null);
      return;
    }
    placeFlyout(openGroup);
    const onScroll = () => placeFlyout(openGroup);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openGroup]);

  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (railRef.current?.contains(t)) return;
      if (flyRef.current?.contains(t)) return;
      setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenGroup(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openGroup]);

  const pick = (id: DrawingTool) => {
    onToolChange(id === 'crosshair' ? 'cursor' : id);
    setOpenGroup(null);
  };

  const toggleFavorite = (id: DrawingTool) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 24);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const setSync = (mode: 'off' | 'layout' | 'global') => {
    setSyncMode(mode);
    try {
      localStorage.setItem(SYNC_KEY, mode);
    } catch {
      /* ignore */
    }
    setOpenGroup(null);
  };

  const hideAny = hideDrawings || hideIndicators || hidePositions;

  const renderToolRows = (sections: FlySection[], groupId: string) =>
    sections.map((sec, si) => (
      <div key={`${sec.title || 'sec'}-${si}`} className="mai-nc__flyout-block">
        {sec.title ? <div className="mai-nc__flyout-sec">{sec.title}</div> : null}
        {sec.tools.map((t) => {
          const ItemIcon = t.Icon;
          const on = toolIsActive(tool, t.id);
          const fav = favorites.includes(t.id);
          return (
            <button
              key={`${t.id}-${t.label}`}
              type="button"
              role="menuitem"
              className={`mai-nc__flyout-item ${on ? 'on' : ''}`}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (groupId === 'cursor' && t.id === 'crosshair') pick('cursor');
                else pick(t.id);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                toggleFavorite(t.id);
              }}
            >
              <ItemIcon className="mai-nc__flyout-ico" aria-hidden />
              <span className="mai-nc__flyout-label">{t.label}</span>
              <span className="mai-nc__flyout-trail">
                {fav ? <Star className="mai-nc__flyout-star" aria-hidden /> : null}
                {on ? (
                  <Check className="mai-nc__flyout-check" aria-hidden />
                ) : t.shortcut ? (
                  <kbd>{t.shortcut}</kbd>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    ));

  let flyContent: ReactNode = null;
  if (openGroup) {
    const group = GROUPS.find((g) => g.id === openGroup);
    if (group) {
      flyContent = (
        <>
          {renderToolRows(group.sections, group.id)}
          {group.id === 'cursor' ? (
            <button
              type="button"
              className="mai-nc__flyout-item mai-nc__flyout-toggle"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onValuesTooltip(!valuesTooltip);
              }}
            >
              <span className="mai-nc__flyout-label">Values tooltip on long press</span>
              <span className={`mai-nc__switch ${valuesTooltip ? 'on' : ''}`} />
            </button>
          ) : null}
        </>
      );
    } else if (openGroup === 'magnet') {
      flyContent = (
        <>
          <button
            type="button"
            className={`mai-nc__flyout-item ${magnetMode === 'weak' ? 'on' : ''}`}
            onClick={() => {
              onMagnetMode(magnetMode === 'weak' ? 'off' : 'weak');
              setOpenGroup(null);
            }}
          >
            <Magnet className="mai-nc__flyout-ico" />
            <span className="mai-nc__flyout-label">Weak magnet</span>
            <span className="mai-nc__flyout-trail">
              {magnetMode === 'weak' ? <Check className="mai-nc__flyout-check" /> : null}
            </span>
          </button>
          <button
            type="button"
            className={`mai-nc__flyout-item ${magnetMode === 'strong' ? 'on' : ''}`}
            onClick={() => {
              onMagnetMode(magnetMode === 'strong' ? 'off' : 'strong');
              setOpenGroup(null);
            }}
          >
            <Magnet className="mai-nc__flyout-ico" />
            <span className="mai-nc__flyout-label">Strong magnet</span>
            <span className="mai-nc__flyout-trail">
              {magnetMode === 'strong' ? <Check className="mai-nc__flyout-check" /> : null}
            </span>
          </button>
          <button
            type="button"
            className="mai-nc__flyout-item mai-nc__flyout-toggle"
            onClick={() => onSnapIndicators(!snapIndicators)}
          >
            <span className="mai-nc__flyout-label">Snap to indicators</span>
            <span className={`mai-nc__switch ${snapIndicators ? 'on' : ''}`} />
          </button>
        </>
      );
    } else if (openGroup === 'hide') {
      flyContent = (
        <>
          {(
            [
              ['drawings', 'Hide drawings', hideDrawings],
              ['indicators', 'Hide indicators', hideIndicators],
              ['positions', 'Hide positions and orders', hidePositions],
            ] as const
          ).map(([mode, label, on]) => (
            <button
              key={mode}
              type="button"
              className={`mai-nc__flyout-item ${on ? 'on' : ''}`}
              onClick={() => {
                onHideMode(on ? 'none' : mode);
                setOpenGroup(null);
              }}
            >
              <span className="mai-nc__flyout-label">{label}</span>
              <span className="mai-nc__flyout-trail">
                {on ? <Check className="mai-nc__flyout-check" /> : null}
              </span>
            </button>
          ))}
          <button
            type="button"
            className="mai-nc__flyout-item"
            onClick={() => {
              onHideMode('all');
              setOpenGroup(null);
            }}
          >
            <span className="mai-nc__flyout-label">Hide all</span>
          </button>
        </>
      );
    } else if (openGroup === 'remove') {
      flyContent = (
        <>
          <button
            type="button"
            className="mai-nc__flyout-item"
            onClick={() => {
              onClearDrawings();
              setOpenGroup(null);
            }}
          >
            <span className="mai-nc__flyout-label">Remove {drawingCount} drawings</span>
          </button>
          <button
            type="button"
            className="mai-nc__flyout-item"
            onClick={() => {
              onClearIndicators();
              setOpenGroup(null);
            }}
          >
            <span className="mai-nc__flyout-label">Remove {indicatorCount} indicators</span>
          </button>
          <button
            type="button"
            className="mai-nc__flyout-item"
            onClick={() => {
              onClearAll();
              setOpenGroup(null);
            }}
          >
            <span className="mai-nc__flyout-label">
              Remove {drawingCount} drawings &amp; {indicatorCount} indicators
            </span>
          </button>
          <button
            type="button"
            className="mai-nc__flyout-item mai-nc__flyout-toggle"
            onClick={() => onRemoveLocked(!removeLocked)}
          >
            <span className="mai-nc__flyout-label">Always remove locked drawings</span>
            <span className={`mai-nc__switch ${removeLocked ? 'on' : ''}`} />
          </button>
          <button
            type="button"
            className="mai-nc__flyout-item"
            onClick={() => {
              onUndo();
              setOpenGroup(null);
            }}
          >
            <span className="mai-nc__flyout-label">Undo last drawing</span>
          </button>
        </>
      );
    } else if (openGroup === 'fav') {
      flyContent =
        favorites.length === 0 ? (
          <div className="mai-nc__flyout-empty">Right-click a tool to favorite</div>
        ) : (
          favorites.map((id) => (
            <button
              key={id}
              type="button"
              className={`mai-nc__flyout-item ${tool === id ? 'on' : ''}`}
              onClick={() => pick(id)}
            >
              <span className="mai-nc__flyout-label">{id}</span>
              {tool === id ? <Check className="mai-nc__flyout-check" /> : null}
            </button>
          ))
        );
    } else if (openGroup === 'sync') {
      flyContent = (
        <>
          <button
            type="button"
            className={`mai-nc__flyout-item ${syncMode === 'layout' ? 'on' : ''}`}
            onClick={() => setSync(syncMode === 'layout' ? 'off' : 'layout')}
          >
            <span className="mai-nc__flyout-label">New drawings sync in layout</span>
            <span className="mai-nc__flyout-trail">
              {syncMode === 'layout' ? <Check className="mai-nc__flyout-check" /> : null}
            </span>
          </button>
          <button
            type="button"
            className={`mai-nc__flyout-item ${syncMode === 'global' ? 'on' : ''}`}
            onClick={() => setSync(syncMode === 'global' ? 'off' : 'global')}
          >
            <span className="mai-nc__flyout-label">New drawings sync globally</span>
            <span className="mai-nc__flyout-trail">
              {syncMode === 'global' ? <Check className="mai-nc__flyout-check" /> : null}
            </span>
          </button>
        </>
      );
    }
  }

  const flyoutPortal =
    openGroup && flyPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={flyRef}
            className="mai-nc__flyout mai-nc__flyout--tv"
            role="menu"
            style={{
              top: flyPos.top,
              left: flyPos.left,
              maxHeight: flyPos.maxH,
            }}
          >
            {flyContent}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={railRef}
      className={`mai-nc__rail${variant === 'desk' ? ' mai-nc__rail--desk' : ''}`}
      role="toolbar"
      aria-label="Drawing tools"
    >
      {GROUPS.map((group) => {
        const meta =
          group.id === 'cursor' && (tool === 'cursor' || !toolInGroup(group, tool))
            ? group.sections[0].tools[0]
            : activeMeta(group, tool);
        const Icon = group.id === activeGroup ? meta.Icon : group.Icon;
        const isOn =
          group.id === 'cursor'
            ? tool === 'cursor' ||
              tool === 'crosshair' ||
              tool === 'dot' ||
              tool === 'arrowCursor' ||
              tool === 'eraser'
            : toolInGroup(group, tool);
        const menuOpen = openGroup === group.id;
        const hasMenu = !group.direct;

        return (
          <div
            key={group.id}
            className={`mai-nc__rail-group${hasMenu ? ' mai-nc__rail-group--fly' : ''}${
              menuOpen ? ' mai-nc__rail-group--open' : ''
            }${isOn ? ' mai-nc__rail-group--on' : ''}`}
          >
            <button
              type="button"
              ref={(el) => {
                btnRefs.current[group.id] = el;
              }}
              className={`mai-nc__rail-btn ${isOn ? 'mai-nc__rail-btn--on' : ''} ${
                menuOpen ? 'mai-nc__rail-btn--menu' : ''
              }`}
              title={hasMenu ? `${group.label} · ${meta.label}` : group.label}
              aria-label={group.label}
              aria-pressed={isOn}
              aria-expanded={hasMenu ? menuOpen : undefined}
              onClick={() => {
                if (group.direct) {
                  pick(group.direct);
                  return;
                }
                // TradingView: 1st click = arm last tool; 2nd click / while active = flyout.
                const last = meta.id === 'crosshair' ? 'cursor' : meta.id;
                if (menuOpen) {
                  setOpenGroup(null);
                  onToolChange(last);
                  return;
                }
                if (isOn) {
                  openMenu(group.id);
                  return;
                }
                onToolChange(last);
              }}
              onDoubleClick={(e) => {
                if (!hasMenu) return;
                e.preventDefault();
                const last = meta.id === 'crosshair' ? 'cursor' : meta.id;
                onToolChange(last);
                openMenu(group.id);
              }}
              onContextMenu={(e) => {
                if (!hasMenu) return;
                e.preventDefault();
                openMenu(group.id);
              }}
            >
              <Icon className="mai-nc__rail-ico" aria-hidden />
            </button>
            {hasMenu ? (
              <button
                type="button"
                className={`mai-nc__rail-caret ${menuOpen ? 'on' : ''}`}
                title={`${group.label} tools`}
                aria-label={`Open ${group.label} tools`}
                aria-expanded={menuOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  if (menuOpen) setOpenGroup(null);
                  else openMenu(group.id);
                }}
              >
                <ChevronRight className="mai-nc__rail-caret-ico" aria-hidden />
              </button>
            ) : null}
          </div>
        );
      })}

      <span className="mai-nc__rail-sep" aria-hidden />

      <div
        className={`mai-nc__rail-group mai-nc__rail-group--fly${
          openGroup === 'magnet' ? ' mai-nc__rail-group--open' : ''
        }${magnetMode !== 'off' ? ' mai-nc__rail-group--on' : ''}`}
      >
        <button
          type="button"
          ref={(el) => {
            btnRefs.current.magnet = el;
          }}
          className={`mai-nc__rail-btn ${magnetMode !== 'off' ? 'mai-nc__rail-btn--on' : ''} ${
            openGroup === 'magnet' ? 'mai-nc__rail-btn--menu' : ''
          }`}
          title="Magnet mode"
          aria-pressed={magnetMode !== 'off'}
          aria-expanded={openGroup === 'magnet'}
          onClick={() => openMenu('magnet')}
        >
          <Magnet className="mai-nc__rail-ico" aria-hidden />
        </button>
        <button
          type="button"
          className={`mai-nc__rail-caret ${openGroup === 'magnet' ? 'on' : ''}`}
          title="Magnet options"
          aria-label="Open magnet options"
          aria-expanded={openGroup === 'magnet'}
          onClick={(e) => {
            e.stopPropagation();
            if (openGroup === 'magnet') setOpenGroup(null);
            else openMenu('magnet');
          }}
        >
          <ChevronRight className="mai-nc__rail-caret-ico" aria-hidden />
        </button>
      </div>

      <button
        type="button"
        className={`mai-nc__rail-btn ${stayDrawing ? 'mai-nc__rail-btn--on' : ''}`}
        title="Stay in drawing mode"
        aria-pressed={stayDrawing}
        onClick={() => onStayDrawing(!stayDrawing)}
      >
        <PencilLine className="mai-nc__rail-ico" aria-hidden />
      </button>

      <button
        type="button"
        className={`mai-nc__rail-btn ${lockDrawings ? 'mai-nc__rail-btn--on' : ''}`}
        title="Lock all drawing tools"
        aria-pressed={lockDrawings}
        onClick={() => onLockDrawings(!lockDrawings)}
      >
        {lockDrawings ? (
          <Lock className="mai-nc__rail-ico" aria-hidden />
        ) : (
          <Unlock className="mai-nc__rail-ico" aria-hidden />
        )}
      </button>

      <div
        className={`mai-nc__rail-group mai-nc__rail-group--fly${
          openGroup === 'hide' ? ' mai-nc__rail-group--open' : ''
        }${hideAny ? ' mai-nc__rail-group--on' : ''}`}
      >
        <button
          type="button"
          ref={(el) => {
            btnRefs.current.hide = el;
          }}
          className={`mai-nc__rail-btn ${hideAny ? 'mai-nc__rail-btn--on' : ''} ${
            openGroup === 'hide' ? 'mai-nc__rail-btn--menu' : ''
          }`}
          title="Hide"
          aria-expanded={openGroup === 'hide'}
          onClick={() => openMenu('hide')}
        >
          {hideAny ? (
            <EyeOff className="mai-nc__rail-ico" aria-hidden />
          ) : (
            <Eye className="mai-nc__rail-ico" aria-hidden />
          )}
        </button>
        <button
          type="button"
          className={`mai-nc__rail-caret ${openGroup === 'hide' ? 'on' : ''}`}
          title="Hide options"
          aria-label="Open hide options"
          aria-expanded={openGroup === 'hide'}
          onClick={(e) => {
            e.stopPropagation();
            if (openGroup === 'hide') setOpenGroup(null);
            else openMenu('hide');
          }}
        >
          <ChevronRight className="mai-nc__rail-caret-ico" aria-hidden />
        </button>
      </div>

      <div
        className={`mai-nc__rail-group mai-nc__rail-group--fly${
          openGroup === 'remove' ? ' mai-nc__rail-group--open' : ''
        }`}
      >
        <button
          type="button"
          ref={(el) => {
            btnRefs.current.remove = el;
          }}
          className={`mai-nc__rail-btn ${openGroup === 'remove' ? 'mai-nc__rail-btn--menu' : ''}`}
          title="Remove"
          aria-expanded={openGroup === 'remove'}
          onClick={() => openMenu('remove')}
        >
          <Trash2 className="mai-nc__rail-ico" aria-hidden />
        </button>
        <button
          type="button"
          className={`mai-nc__rail-caret ${openGroup === 'remove' ? 'on' : ''}`}
          title="Remove options"
          aria-label="Open remove options"
          aria-expanded={openGroup === 'remove'}
          onClick={(e) => {
            e.stopPropagation();
            if (openGroup === 'remove') setOpenGroup(null);
            else openMenu('remove');
          }}
        >
          <ChevronRight className="mai-nc__rail-caret-ico" aria-hidden />
        </button>
      </div>

      <div
        className={`mai-nc__rail-group mai-nc__rail-group--fly${
          openGroup === 'fav' ? ' mai-nc__rail-group--open' : ''
        }${favorites.length ? ' mai-nc__rail-group--on' : ''}`}
      >
        <button
          type="button"
          ref={(el) => {
            btnRefs.current.fav = el;
          }}
          className={`mai-nc__rail-btn ${favorites.length ? 'mai-nc__rail-btn--on' : ''} ${
            openGroup === 'fav' ? 'mai-nc__rail-btn--menu' : ''
          }`}
          title="Favorites"
          aria-expanded={openGroup === 'fav'}
          onClick={() => openMenu('fav')}
        >
          <Star className="mai-nc__rail-ico" aria-hidden />
        </button>
        <button
          type="button"
          className={`mai-nc__rail-caret ${openGroup === 'fav' ? 'on' : ''}`}
          title="Favorite tools"
          aria-label="Open favorites"
          aria-expanded={openGroup === 'fav'}
          onClick={(e) => {
            e.stopPropagation();
            if (openGroup === 'fav') setOpenGroup(null);
            else openMenu('fav');
          }}
        >
          <ChevronRight className="mai-nc__rail-caret-ico" aria-hidden />
        </button>
      </div>

      <div
        className={`mai-nc__rail-group mai-nc__rail-group--fly${
          openGroup === 'sync' ? ' mai-nc__rail-group--open' : ''
        }${syncMode !== 'off' ? ' mai-nc__rail-group--on' : ''}`}
      >
        <button
          type="button"
          ref={(el) => {
            btnRefs.current.sync = el;
          }}
          className={`mai-nc__rail-btn ${syncMode !== 'off' ? 'mai-nc__rail-btn--on' : ''} ${
            openGroup === 'sync' ? 'mai-nc__rail-btn--menu' : ''
          }`}
          title="Sync drawings"
          aria-expanded={openGroup === 'sync'}
          onClick={() => openMenu('sync')}
        >
          <Maximize2 className="mai-nc__rail-ico" aria-hidden />
        </button>
        <button
          type="button"
          className={`mai-nc__rail-caret ${openGroup === 'sync' ? 'on' : ''}`}
          title="Sync options"
          aria-label="Open sync options"
          aria-expanded={openGroup === 'sync'}
          onClick={(e) => {
            e.stopPropagation();
            if (openGroup === 'sync') setOpenGroup(null);
            else openMenu('sync');
          }}
        >
          <ChevronRight className="mai-nc__rail-caret-ico" aria-hidden />
        </button>
      </div>

      {flyoutPortal}
    </div>
  );
}
