/**
 * AI health for Strategy Lab / Teach WOLF — never returns secrets.
 */
import { apiFetch } from '../../config/api';
import { openRouterRequestHeaders } from '../openRouterKey';

export type AiHealth = {
  provider: 'gemini' | 'openrouter' | 'openai' | null;
  configured: boolean;
  available: boolean;
  strategyParse?: {
    model: string | null;
    acceptsModernGeminiKeys?: boolean;
  };
  keySource?: 'server' | 'profile' | 'none';
  serverConfigured?: boolean;
};

export async function fetchAiHealth(): Promise<AiHealth> {
  try {
    const res = await apiFetch('/api/ai/health', {
      headers: openRouterRequestHeaders(),
    });
    if (!res.ok) {
      return { provider: null, configured: false, available: false };
    }
    return (await res.json()) as AiHealth;
  } catch {
    return { provider: null, configured: false, available: false };
  }
}
