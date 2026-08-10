import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chatHasChartImage,
  emptyWolfMessages,
  hydrateMessagesWithSessionChart,
  looksLikeWolfAnalysisText,
} from './wolfSessionGuard';
import type { ChatMessage } from '../services/masterAiChatStore';

describe('wolfSessionGuard — NO CHART = NO ANALYSIS', () => {
  it('detects analysis-shaped text', () => {
    assert.equal(
      looksLikeWolfAnalysisText('Market Bias: WAIT\nKey Observation: 66000 resistance'),
      true,
    );
    assert.equal(looksLikeWolfAnalysisText('hello'), false);
  });

  it('chatHasChartImage requires imageUrl', () => {
    const msgs: ChatMessage[] = [
      { id: 'welcome', role: 'trafi', text: 'hi', timestamp: new Date() },
      {
        id: 'a1',
        role: 'trafi',
        text: 'Market Bias: WAIT\nKey Levels:\nR1 · 66000',
        timestamp: new Date(),
      },
    ];
    assert.equal(chatHasChartImage(msgs), false);
    msgs.push({
      id: 'u1',
      role: 'user',
      text: 'chart',
      timestamp: new Date(),
      imageUrl: 'data:image/png;base64,abc',
    });
    assert.equal(chatHasChartImage(msgs), true);
  });

  it('marks orphan analysis without chart as invalid', () => {
    const msgs: ChatMessage[] = [
      { id: 'welcome', role: 'trafi', text: 'welcome', timestamp: new Date() },
      {
        id: 'a1',
        role: 'trafi',
        text: 'Market Bias: WAIT\nKey Observation: PRICE CONSOLIDATING near 66000\nKey Levels:\nR1 · 66000',
        timestamp: new Date(),
      },
    ];
    const hydrated = hydrateMessagesWithSessionChart('sess-1', msgs);
    assert.equal(hydrated.valid, false);
    assert.equal(hydrated.blob, null);
  });

  it('welcome-only session is valid empty', () => {
    const msgs = emptyWolfMessages('Upload a chart');
    const hydrated = hydrateMessagesWithSessionChart('sess-new', msgs);
    assert.equal(hydrated.valid, true);
    assert.equal(chatHasChartImage(hydrated.messages), false);
  });

  it('keeps session valid when chart image is present', () => {
    const msgs: ChatMessage[] = [
      { id: 'welcome', role: 'trafi', text: 'welcome', timestamp: new Date() },
      {
        id: 'u1',
        role: 'user',
        text: 'Analyze this chart',
        timestamp: new Date(),
        imageUrl: 'data:image/png;base64,abc',
      },
      {
        id: 'a1',
        role: 'trafi',
        text: 'Market Bias: LONG\nKey Observation: Breakout',
        timestamp: new Date(),
        imageUrl: 'data:image/png;base64,abc',
      },
    ];
    const hydrated = hydrateMessagesWithSessionChart('sess-2', msgs);
    assert.equal(hydrated.valid, true);
    assert.ok(hydrated.blob?.imageUrl);
  });
});
