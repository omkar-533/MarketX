import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from './useAuth';
import {
  addPsychologyEntry,
  deletePsychologyEntry,
  getPsychologyAverages,
  loadPsychologyForUser,
  subscribePsychologyUpdates,
  type PsychologyEntry,
} from '../services/traderPsychology';

export type { PsychologyEntry };

export function useTraderPsychology(user: User | null) {
  const [entries, setEntries] = useState<PsychologyEntry[]>(() => loadPsychologyForUser(user));

  const reload = useCallback(() => {
    setEntries(loadPsychologyForUser(user));
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => subscribePsychologyUpdates(reload), [reload]);

  const averages = useMemo(() => getPsychologyAverages(entries), [entries]);

  const addEntry = useCallback(
    (partial: Omit<PsychologyEntry, 'id' | 'ownerId' | 'date'> & { date?: string }) => {
      if (!user) return null;
      return addPsychologyEntry(user, partial);
    },
    [user],
  );

  const removeEntry = useCallback(
    (id: string) => {
      if (!user) return;
      deletePsychologyEntry(user, id);
      reload();
    },
    [user, reload],
  );

  return {
    entries,
    averages,
    addEntry,
    removeEntry,
    reload,
    disciplineScore: averages.discipline,
    confidenceScore: averages.confidence,
    fearGreedScore: averages.fearGreed,
  };
}
