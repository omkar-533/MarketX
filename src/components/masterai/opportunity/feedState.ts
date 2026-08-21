/**
 * Header state for the Opportunity market-data control.
 *
 * The control is always rendered. It used to be hidden whenever the desk believed
 * a broker was attached, so a single wrong guess — a stale status, a session that
 * outlived the browser, a closed market — left no way at all to open the connect
 * modal. `cta` only chooses how loud the button is, never whether it exists.
 */
export type FeedCta = 'connect' | 'manage';

export type FeedState = {
  /** A live or delayed broker feed is attached. */
  brokerOn: boolean;
  /** Tape is actually moving right now. */
  liveStreaming: boolean;
  cta: FeedCta;
  label: string;
};

export function feedState(input: {
  dataMode: 'LIVE' | 'DEMO';
  feedStatus: string;
  marketOpen: boolean;
}): FeedState {
  const { dataMode, feedStatus, marketOpen } = input;
  const brokerOn = dataMode === 'LIVE' && (feedStatus === 'LIVE' || feedStatus === 'DELAYED');
  const liveStreaming = brokerOn && marketOpen && feedStatus === 'LIVE';
  const cta: FeedCta = !brokerOn || (marketOpen && !liveStreaming) ? 'connect' : 'manage';

  let label: string;
  if (liveStreaming) label = 'Live feed';
  else if (brokerOn && marketOpen) label = 'Delayed';
  else if (brokerOn) label = 'Last session';
  else if (dataMode === 'DEMO') label = 'Demo mode';
  else label = 'Connect for live';

  return { brokerOn, liveStreaming, cta, label };
}
