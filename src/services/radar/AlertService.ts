/**
 * Alert-ready abstraction — no real notifications in Phase 2.
 * Future: SETUP DETECTED, SCORE ABOVE X, LIQUIDITY SWEEP, etc.
 */
export type AlertType =
  | 'SETUP_DETECTED'
  | 'SCORE_ABOVE'
  | 'LIQUIDITY_SWEEP'
  | 'STRUCTURE_SHIFT'
  | 'BREAKOUT'
  | 'SETUP_INVALIDATED';

export type AlertRule = {
  id: string;
  type: AlertType;
  symbol?: string;
  threshold?: number;
  enabled: boolean;
  createdAt: number;
};

export interface AlertService {
  listRules(): Promise<AlertRule[]>;
  upsertRule(rule: Omit<AlertRule, 'id' | 'createdAt'> & { id?: string }): Promise<AlertRule>;
  deleteRule(id: string): Promise<void>;
  /** Reserved — wire push/email/websocket later */
  dispatch(_event: { type: AlertType; payload: Record<string, unknown> }): Promise<void>;
}

class LocalAlertService implements AlertService {
  private key = 'wolf_radar_alert_rules_v1';

  private read(): AlertRule[] {
    try {
      return JSON.parse(localStorage.getItem(this.key) || '[]') as AlertRule[];
    } catch {
      return [];
    }
  }

  private write(rules: AlertRule[]) {
    localStorage.setItem(this.key, JSON.stringify(rules));
  }

  async listRules() {
    return this.read();
  }

  async upsertRule(rule: Omit<AlertRule, 'id' | 'createdAt'> & { id?: string }) {
    const rules = this.read();
    const next: AlertRule = {
      id: rule.id || `alert-${Date.now()}`,
      type: rule.type,
      symbol: rule.symbol,
      threshold: rule.threshold,
      enabled: rule.enabled,
      createdAt: Date.now(),
    };
    const idx = rules.findIndex((r) => r.id === next.id);
    if (idx >= 0) rules[idx] = { ...rules[idx], ...next };
    else rules.push(next);
    this.write(rules);
    return next;
  }

  async deleteRule(id: string) {
    this.write(this.read().filter((r) => r.id !== id));
  }

  async dispatch(_event: { type: AlertType; payload: Record<string, unknown> }) {
    // no-op until notification channel exists
  }
}

export const alertService: AlertService = new LocalAlertService();
