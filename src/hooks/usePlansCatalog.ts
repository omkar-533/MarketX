import { useEffect, useState } from 'react';
import { DEFAULT_PLANS, TRIAL_DAYS, type Plan } from '../constants/plans';
import { fetchPublicPlans } from '../services/plansCatalog';

export type PlansCatalogState = {
  plans: Plan[];
  trialDays: number;
  skipOtp?: boolean;
  loading: boolean;
};

const FALLBACK: PlansCatalogState = {
  plans: DEFAULT_PLANS.filter((p) => p.enabled !== false).map((p) => ({
    ...p,
    features: [...p.features],
  })),
  trialDays: TRIAL_DAYS,
  skipOtp: true,
  loading: false,
};

/** Public subscription catalog with defaults while loading / on error. */
export function usePlansCatalog(): PlansCatalogState {
  const [state, setState] = useState<PlansCatalogState>({ ...FALLBACK, loading: true });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const catalog = await fetchPublicPlans();
      if (cancelled) return;
      setState({
        plans: catalog.plans,
        trialDays: catalog.trialDays,
        skipOtp: catalog.skipOtp,
        loading: false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
