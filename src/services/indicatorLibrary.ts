import { apiFetch } from '../config/api';
import { loadAppSession } from './appInviteAuth';
import type { PineSettingField } from './pineSettings';

export type IndicatorItem = {
  id: string;
  title: string;
  description: string;
  /** Invite / share URL — only present when access + TV grant allow it. */
  link: string;
  /** Optional how-to guidance video (YouTube / Vimeo / direct file URL). */
  howToVideoUrl?: string | null;
  /** Admin-only — Pine Script source. Never present on member list responses. */
  pineSource?: string;
  /** True when server has Pine (members never receive the source text). */
  hasPine?: boolean;
  /** Parsed input.* settings (safe for members). */
  settings?: PineSettingField[];
  settingsDefaults?: Record<string, string | number | boolean>;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt?: string;
  imageUrl: string | null;
  /** Latest TV access request status for this user, if any. */
  tvAccessStatus?: 'pending' | 'granted' | 'dismissed' | null;
};

export type TvAccessStatusPayload = {
  ok: boolean;
  status: 'pending' | 'granted' | 'dismissed' | null;
  inviteUnlocked: boolean;
  inviteLink: string;
  request: {
    id: string;
    tradingViewId: string;
    status: 'pending' | 'granted' | 'dismissed';
    createdAt: string;
  } | null;
  access?: {
    unlocked: boolean;
    isTrial: boolean;
    daysLeft: number | null;
    reason: string | null;
    status?: string;
    indicatorsUnlocked?: boolean;
  };
};

function sessionHeaders(): HeadersInit {
  const session = loadAppSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
  };
}

function authHeaders(adminEmail?: string | null, adminPassword?: string | null): HeadersInit {
  const session = loadAppSession();
  if (session?.token && session.user.role === 'admin') {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    };
  }
  if (adminEmail && adminPassword) {
    return {
      'Content-Type': 'application/json',
      'X-Admin-Email': adminEmail,
      'X-Admin-Password': adminPassword,
    };
  }
  return { 'Content-Type': 'application/json' };
}

async function readJson(res: Response, fallback: string) {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : fallback);
  }
  return data;
}

export async function listIndicators(): Promise<IndicatorItem[]> {
  const res = await apiFetch('/api/app-auth/indicators', { headers: sessionHeaders() });
  const data = await readJson(res, 'Could not load indicators');
  return (data.indicators || []) as IndicatorItem[];
}

export async function getIndicator(id: string): Promise<IndicatorItem> {
  const res = await apiFetch(`/api/app-auth/indicators/${encodeURIComponent(id)}`, {
    headers: sessionHeaders(),
  });
  const data = await readJson(res, 'Could not load indicator');
  return data.indicator as IndicatorItem;
}

export async function adminListIndicators(
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<IndicatorItem[]> {
  const res = await apiFetch('/api/app-auth/admin/indicators', {
    headers: authHeaders(adminEmail, adminPassword),
  });
  const data = await readJson(res, 'Could not load indicators');
  return (data.indicators || []) as IndicatorItem[];
}

export type IndicatorInput = {
  title: string;
  description: string;
  link?: string;
  howToVideoUrl?: string;
  pineSource?: string;
  image?: string | null;
  sortOrder?: number;
  published?: boolean;
};

/** Admin writes can hit a cold Render box — give them a full minute. */
const ADMIN_WRITE_OPTS = { retries: 2, timeoutMs: 60_000 };

export async function adminCreateIndicator(
  input: IndicatorInput,
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<IndicatorItem> {
  const res = await apiFetch(
    '/api/app-auth/admin/indicators',
    {
      method: 'POST',
      headers: authHeaders(adminEmail, adminPassword),
      body: JSON.stringify(input),
    },
    ADMIN_WRITE_OPTS,
  );
  const data = await readJson(res, 'Could not create indicator');
  return data.indicator as IndicatorItem;
}

export async function adminUpdateIndicator(
  id: string,
  input: Partial<IndicatorInput>,
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<IndicatorItem> {
  // Prefer PUT — some older API CORS configs omitted PATCH and browsers report
  // that as a opaque "Failed to fetch". Server accepts both.
  const res = await apiFetch(
    `/api/app-auth/admin/indicators/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: authHeaders(adminEmail, adminPassword),
      body: JSON.stringify(input),
    },
    ADMIN_WRITE_OPTS,
  );
  const data = await readJson(res, 'Could not update indicator');
  return data.indicator as IndicatorItem;
}

/** Saves only the how-to video URL (separate from title/link/image). */
export async function adminSetIndicatorHowToVideo(
  id: string,
  howToVideoUrl: string,
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<IndicatorItem> {
  const res = await apiFetch(
    `/api/app-auth/admin/indicators/${encodeURIComponent(id)}/how-to-video`,
    {
      method: 'PUT',
      headers: authHeaders(adminEmail, adminPassword),
      body: JSON.stringify({ howToVideoUrl }),
    },
    ADMIN_WRITE_OPTS,
  );
  const data = await readJson(res, 'Could not save how-to video URL');
  return data.indicator as IndicatorItem;
}

export async function adminDeleteIndicator(
  id: string,
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<void> {
  const res = await apiFetch(`/api/app-auth/admin/indicators/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(adminEmail, adminPassword),
  });
  await readJson(res, 'Could not delete indicator');
}

/** Persist member-grid order (top → bottom). */
export async function adminReorderIndicators(
  orderedIds: string[],
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<IndicatorItem[]> {
  const res = await apiFetch(
    '/api/app-auth/admin/indicators/reorder',
    {
      method: 'PUT',
      headers: authHeaders(adminEmail, adminPassword),
      body: JSON.stringify({ orderedIds }),
    },
    ADMIN_WRITE_OPTS,
  );
  const data = await readJson(res, 'Could not reorder indicators');
  return (data.indicators || []) as IndicatorItem[];
}

/** Submit TradingView username for manual invite — admin Approves to unlock invite link. */
export async function submitTradingViewAccess(
  indicatorId: string,
  tradingViewId: string,
): Promise<{ ok: boolean; message: string; inviteLink: string; status: string | null }> {
  const res = await apiFetch(
    `/api/app-auth/indicators/${encodeURIComponent(indicatorId)}/tv-access`,
    {
      method: 'POST',
      headers: sessionHeaders(),
      body: JSON.stringify({ tradingViewId }),
    },
  );
  const data = await readJson(res, 'Could not submit TradingView ID');
  const request = data.request as { status?: string } | undefined;
  return {
    ok: true,
    message: typeof data.message === 'string' ? data.message : 'Submitted',
    inviteLink: typeof data.inviteLink === 'string' ? data.inviteLink : '',
    status: request?.status || null,
  };
}

/** Poll TV access / invite unlock status for an indicator. */
export async function getTradingViewAccessStatus(
  indicatorId: string,
): Promise<TvAccessStatusPayload> {
  const res = await apiFetch(
    `/api/app-auth/indicators/${encodeURIComponent(indicatorId)}/tv-access`,
    { headers: sessionHeaders() },
  );
  const data = await readJson(res, 'Could not load TradingView access status');
  return {
    ok: true,
    status: (data.status as TvAccessStatusPayload['status']) || null,
    inviteUnlocked: Boolean(data.inviteUnlocked),
    inviteLink: typeof data.inviteLink === 'string' ? data.inviteLink : '',
    request: (data.request as TvAccessStatusPayload['request']) || null,
    access: (data.access as TvAccessStatusPayload['access']) || undefined,
  };
}

export type TvAccessGrant = {
  id: string;
  indicatorId: string;
  indicatorTitle: string;
  tradingViewId: string;
  inviteLink: string;
  reviewedAt: string | null;
  createdAt: string;
};

/** Approved TV invites for the signed-in member (popup / notification inbox). */
export async function listTvAccessGrants(): Promise<TvAccessGrant[]> {
  const res = await apiFetch('/api/app-auth/tv-access/grants', {
    headers: sessionHeaders(),
  });
  const data = await readJson(res, 'Could not load TradingView grants');
  return (data.grants || []) as TvAccessGrant[];
}

export type PineRunBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type PineRunPlot = {
  title: string;
  color: string;
  values: Array<number | null>;
};

export type PineRunDrawing = {
  type: string;
  tone: 'bull' | 'bear' | 'neutral';
  label: string;
  p1?: number;
  p2?: number;
  i1?: number;
  i2?: number;
  color?: string;
  borderColor?: string;
  fillColor?: string;
  lineStyle?: 'solid' | 'dotted';
};

export type PineRunResult = {
  ok: boolean;
  version: number;
  overlay: boolean;
  plots: PineRunPlot[];
  hlines: Array<{ price: number; color: string }>;
  shapes: Array<{ title: string; flags: number[] }>;
  drawings: PineRunDrawing[];
  warnings: string[];
};

export type PineDraftRunResult = PineRunResult & {
  error?: string;
};

function mapPineRunPayload(data: Record<string, unknown>): PineDraftRunResult {
  return {
    ok: Boolean(data.ok),
    version: Number(data.version) || 0,
    overlay: data.overlay !== false,
    plots: Array.isArray(data.plots) ? (data.plots as PineRunPlot[]) : [],
    hlines: Array.isArray(data.hlines) ? (data.hlines as PineRunResult['hlines']) : [],
    shapes: Array.isArray(data.shapes) ? (data.shapes as PineRunResult['shapes']) : [],
    drawings: Array.isArray(data.drawings) ? (data.drawings as PineRunDrawing[]) : [],
    warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : [],
    ...(typeof data.error === 'string' && data.error.trim()
      ? { error: data.error.trim() }
      : {}),
  };
}

/** Run CMS Pine on OHLC bars. Source stays on server — only plot series returned. */
export async function runPineIndicator(
  indicatorId: string,
  payload: {
    bars: PineRunBar[];
    inputs?: Record<string, string | number | boolean>;
    timeLimitMs?: number;
  },
): Promise<PineRunResult> {
  const res = await apiFetch(`/api/app-auth/indicators/${encodeURIComponent(indicatorId)}/run`, {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify({
      bars: payload.bars,
      inputs: payload.inputs || {},
      timeLimitMs: payload.timeLimitMs,
    }),
  });
  const data = await readJson(res, 'Could not run Pine Script');
  return mapPineRunPayload(data as Record<string, unknown>);
}

/**
 * Admin-only: run draft Pine source against OHLC without saving.
 * Source is never stored — engine result only.
 */
export async function adminRunPineDraft(payload: {
  source: string;
  bars: PineRunBar[];
  inputs?: Record<string, string | number | boolean>;
  timeLimitMs?: number;
}): Promise<PineDraftRunResult> {
  const pine = String(payload.source || '').trim();
  const res = await apiFetch(
    '/api/app-auth/indicators/pine-run',
    {
      method: 'POST',
      headers: sessionHeaders(),
      body: JSON.stringify({
        source: pine,
        bars: payload.bars,
        inputs: payload.inputs || {},
        timeLimitMs: payload.timeLimitMs,
      }),
    },
    { retries: 1, timeoutMs: pine.length > 40_000 ? 45_000 : 20_000 },
  );
  const data = await readJson(res, 'Could not run draft Pine Script');
  return mapPineRunPayload(data as Record<string, unknown>);
}
