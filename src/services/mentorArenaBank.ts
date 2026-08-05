/**
 * Wolf Mentor Arena question bank — full trading mix.
 * Weights (Arena): 40% candles + candle psychology, 10% chart psychology, 50% other desk topics.
 */

import type { DetectiveCard, MentorDrill } from './mentorDrills';

export type ArenaTopic =
  | 'candle'
  | 'candle_psych'
  | 'chart_psych'
  | 'basics'
  | 'trend'
  | 'sr'
  | 'liquidity'
  | 'structure'
  | 'smc'
  | 'price_action'
  | 'risk'
  | 'psych'
  | 'live'
  | 'historical';

export type ArenaBankItem = {
  topic: ArenaTopic;
  question: string;
  options: { id: string; label: string }[];
  correctId: string;
  reason: string;
  /** Hint for coach / chart marks */
  drawHint?: string;
};

const CANDLE: ArenaBankItem[] = [
  {
    topic: 'candle',
    question: 'A candle body shows the distance between…',
    options: [
      { id: 'a', label: 'High and low' },
      { id: 'b', label: 'Open and close' },
      { id: 'c', label: 'Volume and OI' },
      { id: 'd', label: 'Bid and ask only' },
    ],
    correctId: 'b',
    reason: 'Body = open→close. Wicks show high/low rejection extremes.',
    drawHint: 'Point at a clear candle body vs wick on the chart.',
  },
  {
    topic: 'candle',
    question: 'OHLC stands for…',
    options: [
      { id: 'a', label: 'Order High Low Close' },
      { id: 'b', label: 'Open High Low Close' },
      { id: 'c', label: 'Only Hedge Long Calls' },
      { id: 'd', label: 'Open Hold Lock Cash' },
    ],
    correctId: 'b',
    reason: 'Every candle is Open, High, Low, Close — the auction print for that period.',
  },
  {
    topic: 'candle',
    question: 'A long upper wick usually means…',
    options: [
      { id: 'a', label: 'Selling pressure / rejection of highs' },
      { id: 'b', label: 'Guaranteed reversal tomorrow' },
      { id: 'c', label: 'No auction happened' },
      { id: 'd', label: 'Always buy the close' },
    ],
    correctId: 'a',
    reason: 'Long upper wick = buyers pushed high, sellers rejected — location still matters.',
    drawHint: 'Highlight a long upper-wick candle near a high.',
  },
  {
    topic: 'candle',
    question: 'A long lower wick usually means…',
    options: [
      { id: 'a', label: 'Buying interest / rejection of lows' },
      { id: 'b', label: 'Market is closed' },
      { id: 'c', label: 'Always short next candle' },
      { id: 'd', label: 'Volume was zero' },
    ],
    correctId: 'a',
    reason: 'Long lower wick = sellers probed lows, buyers stepped in — still wait for context.',
    drawHint: 'Highlight a long lower-wick candle near a low.',
  },
  {
    topic: 'candle',
    question: 'A doji (tiny body) most often shows…',
    options: [
      { id: 'a', label: 'Strong one-sided control' },
      { id: 'b', label: 'Indecision / balance between sides' },
      { id: 'c', label: 'Always buy' },
      { id: 'd', label: 'Broker error' },
    ],
    correctId: 'b',
    reason: 'Tiny body = open≈close → balance / indecision until next acceptance.',
  },
  {
    topic: 'candle',
    question: 'A big green (bull) marubozu-style body mainly shows…',
    options: [
      { id: 'a', label: 'Buyers controlled most of the period' },
      { id: 'b', label: 'Sellers won the candle' },
      { id: 'c', label: 'Guaranteed next-day gap up' },
      { id: 'd', label: 'No risk needed' },
    ],
    correctId: 'a',
    reason: 'Large bull body = buyers dominated open→close. Not a chase signal alone.',
  },
  {
    topic: 'candle',
    question: 'A hammer candle (small body, long lower wick) is best read as…',
    options: [
      { id: 'a', label: 'Potential rejection of lows — need location + confirmation' },
      { id: 'b', label: 'Instant market buy with 10x size' },
      { id: 'c', label: 'Meaningless always' },
      { id: 'd', label: 'Only works on crypto' },
    ],
    correctId: 'a',
    reason: 'Hammer = rejection of lows. Quality rises at support/discount + confirmation.',
  },
  {
    topic: 'candle',
    question: 'A shooting star (small body, long upper wick) suggests…',
    options: [
      { id: 'a', label: 'Rejection of highs — context still required' },
      { id: 'b', label: 'Always short with market order now' },
      { id: 'c', label: 'Bullish continuation guaranteed' },
      { id: 'd', label: 'Ignore all highs' },
    ],
    correctId: 'a',
    reason: 'Shooting star = failed push high. Best near premium/resistance, not in vacuum.',
  },
  {
    topic: 'candle',
    question: 'Bullish engulfing means…',
    options: [
      { id: 'a', label: 'A bull candle’s body fully covers the prior bear body' },
      { id: 'b', label: 'Two dojis in a row' },
      { id: 'c', label: 'Volume always doubles' },
      { id: 'd', label: 'Gap fill only' },
    ],
    correctId: 'a',
    reason: 'Engulfing = shift in control on that pair of candles — still needs structure context.',
  },
  {
    topic: 'candle',
    question: 'Bearish engulfing means…',
    options: [
      { id: 'a', label: 'A bear candle’s body fully covers the prior bull body' },
      { id: 'b', label: 'Always buy the dip' },
      { id: 'c', label: 'Only happens on Mondays' },
      { id: 'd', label: 'No seller interest' },
    ],
    correctId: 'a',
    reason: 'Bear engulfing = sellers seized control of the prior bull print — location matters.',
  },
  {
    topic: 'candle',
    question: 'Candles alone without location/structure…',
    options: [
      { id: 'a', label: 'Are enough for guaranteed trades' },
      { id: 'b', label: 'Need context (structure/location) to be useful' },
      { id: 'c', label: 'Never matter' },
      { id: 'd', label: 'Replace risk rules' },
    ],
    correctId: 'b',
    reason: 'Same candle at support ≠ same candle mid-range. Context first.',
  },
  {
    topic: 'candle',
    question: 'The wick (shadow) of a candle represents…',
    options: [
      { id: 'a', label: 'Prices visited then rejected within the period' },
      { id: 'b', label: 'Broker commission' },
      { id: 'c', label: 'Tomorrow’s open always' },
      { id: 'd', label: 'Only news headlines' },
    ],
    correctId: 'a',
    reason: 'Wicks = auction explored and rejected. Bodies = where it closed the fight.',
  },
  {
    topic: 'candle',
    question: 'A series of smaller bodies after a big impulse often means…',
    options: [
      { id: 'a', label: 'Pause / digestion — wait to see acceptance' },
      { id: 'b', label: 'Force a breakout trade now' },
      { id: 'c', label: 'Delete the chart' },
      { id: 'd', label: 'Guaranteed reversal' },
    ],
    correctId: 'a',
    reason: 'Compression after impulse = market deciding. Process: wait for acceptance.',
  },
  {
    topic: 'candle',
    question: 'Close near the high of a bull candle usually shows…',
    options: [
      { id: 'a', label: 'Buyers finished strong into the close' },
      { id: 'b', label: 'Sellers won the candle' },
      { id: 'c', label: 'Indecision only' },
      { id: 'd', label: 'Invalid candle' },
    ],
    correctId: 'a',
    reason: 'Close near high = buyers held control into the print — still not a chase button.',
  },
  {
    topic: 'candle',
    question: 'Close near the low of a bear candle usually shows…',
    options: [
      { id: 'a', label: 'Sellers finished strong into the close' },
      { id: 'b', label: 'Buyers dominated' },
      { id: 'c', label: 'Always bounce next bar' },
      { id: 'd', label: 'No auction' },
    ],
    correctId: 'a',
    reason: 'Close near low = sellers pressed till the end of the period.',
  },
  {
    topic: 'candle',
    question: 'What is the best first read on any new candle?',
    options: [
      { id: 'a', label: 'Body direction + wick rejection + where it sits in structure' },
      { id: 'b', label: 'Only the color emoji on Twitter' },
      { id: 'c', label: 'Ignore OHLC completely' },
      { id: 'd', label: 'Trade every candle' },
    ],
    correctId: 'a',
    reason: 'Read body, wick, then location. That is candle literacy.',
  },
];

const CANDLE_PSYCH: ArenaBankItem[] = [
  {
    topic: 'candle_psych',
    question: 'Candle psychology: a long upper wick near a high mainly shows which crowd emotion?',
    options: [
      { id: 'a', label: 'Late buyers trapped / sellers defended the high' },
      { id: 'b', label: 'Everyone is calm and patient' },
      { id: 'c', label: 'No humans trade there' },
      { id: 'd', label: 'Always greed-free market' },
    ],
    correctId: 'a',
    reason: 'Push into highs then reject = FOMO longs often trapped; sellers showed strength.',
  },
  {
    topic: 'candle_psych',
    question: 'A giant green candle after a quiet range often triggers which bad habit?',
    options: [
      { id: 'a', label: 'FOMO chase without waiting for confirmation' },
      { id: 'b', label: 'Perfect journaling' },
      { id: 'c', label: 'Smaller size always' },
      { id: 'd', label: 'Ignoring the candle' },
    ],
    correctId: 'a',
    reason: 'Impulse candles trigger FOMO. Process: location + confirmation, not chase.',
  },
  {
    topic: 'candle_psych',
    question: 'Seeing 3 red candles in a row, the emotional trap is…',
    options: [
      { id: 'a', label: 'Panic-selling or revenge shorting without a plan' },
      { id: 'b', label: 'Calm checklist always' },
      { id: 'c', label: 'Market holiday' },
      { id: 'd', label: 'Guaranteed bottom' },
    ],
    correctId: 'a',
    reason: 'Streaks pull emotions. Desk rule: process over panic.',
  },
  {
    topic: 'candle_psych',
    question: 'A doji after a big rally — what is the healthy mental read?',
    options: [
      { id: 'a', label: 'Balance / pause — wait; don’t force a hero trade' },
      { id: 'b', label: 'Short 5x immediately' },
      { id: 'c', label: 'Long 5x immediately' },
      { id: 'd', label: 'Close the app forever' },
    ],
    correctId: 'a',
    reason: 'Doji = indecision. Mentally: patience until acceptance.',
  },
  {
    topic: 'candle_psych',
    question: 'Why do traders misread a hammer as “must buy now”?',
    options: [
      { id: 'a', label: 'They skip location and treat the pattern as a magic signal' },
      { id: 'b', label: 'Hammers never reject lows' },
      { id: 'c', label: 'Brokers force the trade' },
      { id: 'd', label: 'OHLC is fake' },
    ],
    correctId: 'a',
    reason: 'Pattern without location = superstition. Hammer at junk location is weak.',
  },
  {
    topic: 'candle_psych',
    question: 'Candle closes strong green into resistance. Healthy psychology is…',
    options: [
      { id: 'a', label: 'Respect the location — don’t chase; wait for acceptance/rejection' },
      { id: 'b', label: 'Market-buy because green feels good' },
      { id: 'c', label: 'Ignore resistance forever' },
      { id: 'd', label: 'Double size for dopamine' },
    ],
    correctId: 'a',
    reason: 'Strong candle into resistance is where FOMO peaks. Process > feeling.',
  },
  {
    topic: 'candle_psych',
    question: 'What does a “failed breakout candle” teach emotionally?',
    options: [
      { id: 'a', label: 'Chasers get trapped — wait for acceptance beyond the level' },
      { id: 'b', label: 'Always trust the first tick above a high' },
      { id: 'c', label: 'Emotions never matter' },
      { id: 'd', label: 'Delete stop-losses' },
    ],
    correctId: 'a',
    reason: 'Failed breakouts punish impatience. Acceptance beats hope.',
  },
  {
    topic: 'candle_psych',
    question: 'You see a perfect textbook engulfing mid-nowhere. Best mindset?',
    options: [
      { id: 'a', label: 'Pretty candle ≠ high-quality process without context' },
      { id: 'b', label: 'Trade every textbook pattern' },
      { id: 'c', label: 'Patterns beat risk rules' },
      { id: 'd', label: 'Skip structure forever' },
    ],
    correctId: 'a',
    reason: 'Beauty of a candle is not edge. Location + risk + confirmation are.',
  },
  {
    topic: 'candle_psych',
    question: 'Long lower wick after a fear dump — what psychology printed?',
    options: [
      { id: 'a', label: 'Panic sellers hit lows; buyers absorbed (rejection)' },
      { id: 'b', label: 'Nobody traded' },
      { id: 'c', label: 'Always short more' },
      { id: 'd', label: 'Candle psychology does not exist' },
    ],
    correctId: 'a',
    reason: 'Fear spike into lows then reclaim = absorption story — still confirm.',
  },
  {
    topic: 'candle_psych',
    question: 'Best habit when a candle “looks too good to miss”?',
    options: [
      { id: 'a', label: 'Pause — run structure, liquidity, risk checklist' },
      { id: 'b', label: 'Click market order before thinking' },
      { id: 'c', label: 'Ask a random tip group' },
      { id: 'd', label: 'Increase size because of excitement' },
    ],
    correctId: 'a',
    reason: '“Too good” feeling = FOMO alarm. Checklist kills impulse.',
  },
  {
    topic: 'candle_psych',
    question: 'Two opposite big candles back-to-back often mean…',
    options: [
      { id: 'a', label: 'Battle / volatility — don’t force certainty' },
      { id: 'b', label: 'Clear free money' },
      { id: 'c', label: 'Indicators broke' },
      { id: 'd', label: 'Always sideways forever' },
    ],
    correctId: 'a',
    reason: 'Two-way aggression = noisy tape. Mentally stay flexible.',
  },
  {
    topic: 'candle_psych',
    question: 'Candle psychology is mainly about…',
    options: [
      { id: 'a', label: 'Who was aggressive and who got rejected in that period' },
      { id: 'b', label: 'Predicting lottery numbers' },
      { id: 'c', label: 'Ignoring buyers and sellers' },
      { id: 'd', label: 'Only color names' },
    ],
    correctId: 'a',
    reason: 'Candles are a story of aggression vs rejection — not a crystal ball.',
  },
];

const CHART_PSYCH: ArenaBankItem[] = [
  {
    topic: 'chart_psych',
    question: 'Chart psychology: price sitting just under an obvious high often creates…',
    options: [
      { id: 'a', label: 'Breakout FOMO / stop-hunt tension' },
      { id: 'b', label: 'Zero emotion on the desk' },
      { id: 'c', label: 'Automatic profit' },
      { id: 'd', label: 'No liquidity' },
    ],
    correctId: 'a',
    reason: 'Obvious highs magnetize stops and FOMO — expect volatility, not certainty.',
    drawHint: 'Mark nearest swing high / day high as psychological magnet.',
  },
  {
    topic: 'chart_psych',
    question: 'Equal highs on a chart often attract…',
    options: [
      { id: 'a', label: 'Stop liquidity / breakout traders' },
      { id: 'b', label: 'Nothing ever' },
      { id: 'c', label: 'Only news bots' },
      { id: 'd', label: 'Guaranteed short' },
    ],
    correctId: 'a',
    reason: 'Equal highs = shared stops above. Chart psychology = liquidity magnet.',
  },
  {
    topic: 'chart_psych',
    question: 'When chart “looks clean” for a breakout, the trap is…',
    options: [
      { id: 'a', label: 'Everyone sees it — crowded idea, fakeouts common' },
      { id: 'b', label: 'Clean charts never fail' },
      { id: 'c', label: 'Skip risk because it’s obvious' },
      { id: 'd', label: 'Trade without a plan' },
    ],
    correctId: 'a',
    reason: 'If it’s obvious to you, it’s obvious to the crowd. Wait for acceptance.',
  },
  {
    topic: 'chart_psych',
    question: 'Round numbers (e.g. 25000) on index charts often act as…',
    options: [
      { id: 'a', label: 'Psychological magnets / reaction zones' },
      { id: 'b', label: 'Illegal prices' },
      { id: 'c', label: 'Guaranteed targets only' },
      { id: 'd', label: 'Noise with zero meaning' },
    ],
    correctId: 'a',
    reason: 'Humans anchor to round numbers — expect reactions, not magic.',
  },
  {
    topic: 'chart_psych',
    question: 'A parabolic vertical move on the chart usually means…',
    options: [
      { id: 'a', label: 'Crowd euphoria — late chase risk is high' },
      { id: 'b', label: 'Safest time to max size' },
      { id: 'c', label: 'Risk disappears' },
      { id: 'd', label: 'Structure stopped mattering forever' },
    ],
    correctId: 'a',
    reason: 'Vertical = emotion. Desk: don’t chase the last tick.',
  },
  {
    topic: 'chart_psych',
    question: 'Long consolidation under resistance builds which psychology?',
    options: [
      { id: 'a', label: 'Impatience + breakout anticipation (both ways can trap)' },
      { id: 'b', label: 'Perfect calm forever' },
      { id: 'c', label: 'No traders watching' },
      { id: 'd', label: 'Always bullish only' },
    ],
    correctId: 'a',
    reason: 'Coils load both breakout hope and fakeout traps.',
  },
  {
    topic: 'chart_psych',
    question: 'Best chart-psychology habit at the open?',
    options: [
      { id: 'a', label: 'Let the first volatility settle — map levels before forcing' },
      { id: 'b', label: 'Trade the first second no matter what' },
      { id: 'c', label: 'Ignore levels because open is random' },
      { id: 'd', label: 'Max size for “adrenaline edge”' },
    ],
    correctId: 'a',
    reason: 'Open noise is emotional. Map first, act later.',
  },
  {
    topic: 'chart_psych',
    question: 'Why do traders “see” patterns that aren’t there?',
    options: [
      { id: 'a', label: 'Confirmation bias / wanting the chart to agree with a wish' },
      { id: 'b', label: 'Charts never have bias' },
      { id: 'c', label: 'Brokers draw fake candles only' },
      { id: 'd', label: 'Psychology is irrelevant' },
    ],
    correctId: 'a',
    reason: 'We invent patterns to feel in control. Counter with checklist.',
  },
];

const OTHER: ArenaBankItem[] = [
  // basics
  {
    topic: 'basics',
    question: 'A market primarily exists to…',
    options: [
      { id: 'a', label: 'Guarantee profits' },
      { id: 'b', label: 'Match buyers and sellers (price discovery)' },
      { id: 'c', label: 'Print free money' },
      { id: 'd', label: 'Remove all risk' },
    ],
    correctId: 'b',
    reason: 'Markets discover price by matching aggressive buyers and sellers.',
  },
  {
    topic: 'basics',
    question: 'If more aggressive buying hits the offer, price tends to…',
    options: [
      { id: 'a', label: 'Fall' },
      { id: 'b', label: 'Stay frozen forever' },
      { id: 'c', label: 'Rise' },
      { id: 'd', label: 'Become illegal' },
    ],
    correctId: 'c',
    reason: 'Aggressive buy demand lifts the auction.',
  },
  {
    topic: 'basics',
    question: 'LTP means…',
    options: [
      { id: 'a', label: 'Last Traded Price' },
      { id: 'b', label: 'Long Term Profit' },
      { id: 'c', label: 'Low Tick Plan' },
      { id: 'd', label: 'Liquidity Target Point' },
    ],
    correctId: 'a',
    reason: 'LTP = last traded price — the latest agreed print.',
  },
  {
    topic: 'basics',
    question: 'Wolf Mentor teaches…',
    options: [
      { id: 'a', label: 'Exact buy/sell signals only' },
      { id: 'b', label: 'Process and Areas of Interest — never Entry/SL/Target' },
      { id: 'c', label: 'Tips from WhatsApp groups' },
      { id: 'd', label: 'How to skip risk rules' },
    ],
    correctId: 'b',
    reason: 'Mentor = process + AOI. No order instructions.',
  },
  // trend
  {
    topic: 'trend',
    question: 'A classic uptrend often shows…',
    options: [
      { id: 'a', label: 'Lower highs and lower lows' },
      { id: 'b', label: 'Higher highs and higher lows' },
      { id: 'c', label: 'Only dojis' },
      { id: 'd', label: 'No swings at all' },
    ],
    correctId: 'b',
    reason: 'Uptrend ≈ HH + HL structure.',
    drawHint: 'Label recent HH/HL swings.',
  },
  {
    topic: 'trend',
    question: 'A classic downtrend often shows…',
    options: [
      { id: 'a', label: 'Higher highs and higher lows' },
      { id: 'b', label: 'Lower highs and lower lows' },
      { id: 'c', label: 'Only green candles' },
      { id: 'd', label: 'Flat forever' },
    ],
    correctId: 'b',
    reason: 'Downtrend ≈ LH + LL structure.',
    drawHint: 'Label recent LH/LL swings.',
  },
  {
    topic: 'trend',
    question: 'Sideways / range means…',
    options: [
      { id: 'a', label: 'Price rotating between roughly similar highs and lows' },
      { id: 'b', label: 'Always trending up' },
      { id: 'c', label: 'No auction' },
      { id: 'd', label: 'Guaranteed breakout direction' },
    ],
    correctId: 'a',
    reason: 'Range = balance. Breakout needs acceptance.',
  },
  {
    topic: 'trend',
    question: '“Higher Low (HL)” means…',
    options: [
      { id: 'a', label: 'Pullback held above the prior low — bullish structure clue' },
      { id: 'b', label: 'New lower trough' },
      { id: 'c', label: 'Always sell' },
      { id: 'd', label: 'Broker code' },
    ],
    correctId: 'a',
    reason: 'HL = bullish pullback hold.',
  },
  // S/R
  {
    topic: 'sr',
    question: 'Support is best thought of as…',
    options: [
      { id: 'a', label: 'An area where buying interest may appear — not a magic line' },
      { id: 'b', label: 'A guaranteed bounce price' },
      { id: 'c', label: 'Only one exact tick' },
      { id: 'd', label: 'Irrelevant forever' },
    ],
    correctId: 'a',
    reason: 'Support/resistance are areas of interest, not promises.',
    drawHint: 'Mark nearest reaction low as support area.',
  },
  {
    topic: 'sr',
    question: 'Resistance is best thought of as…',
    options: [
      { id: 'a', label: 'An area where selling interest may appear — still needs confirmation' },
      { id: 'b', label: 'Always short instantly' },
      { id: 'c', label: 'Never breaks' },
      { id: 'd', label: 'Only for stocks, not indices' },
    ],
    correctId: 'a',
    reason: 'Resistance = supply interest zone — wait for rejection/acceptance.',
  },
  {
    topic: 'sr',
    question: 'Broken support that flips to resistance is called…',
    options: [
      { id: 'a', label: 'Role reversal / polarity' },
      { id: 'b', label: 'Guaranteed long' },
      { id: 'c', label: 'News only' },
      { id: 'd', label: 'Invalid idea always' },
    ],
    correctId: 'a',
    reason: 'Old support can become resistance after acceptance below.',
  },
  // liquidity
  {
    topic: 'liquidity',
    question: 'Liquidity in trading context often means…',
    options: [
      { id: 'a', label: 'Pools of stops / resting orders that price can seek' },
      { id: 'b', label: 'Only cash in your bank' },
      { id: 'c', label: 'Candle color' },
      { id: 'd', label: 'Broker login' },
    ],
    correctId: 'a',
    reason: 'Liquidity = where orders cluster (often beyond highs/lows).',
    drawHint: 'Mark equal highs/lows as liquidity magnets.',
  },
  {
    topic: 'liquidity',
    question: 'A liquidity sweep typically…',
    options: [
      { id: 'a', label: 'Takes stops beyond a level then often reverses or rebalances' },
      { id: 'b', label: 'Guarantees trend forever' },
      { id: 'c', label: 'Means ignore structure' },
      { id: 'd', label: 'Is illegal always' },
    ],
    correctId: 'a',
    reason: 'Sweep = grab liquidity. Process: wait for reclaim/confirmation.',
  },
  {
    topic: 'liquidity',
    question: 'Equal lows under a range often hide…',
    options: [
      { id: 'a', label: 'Sell-side stop liquidity' },
      { id: 'b', label: 'Nothing' },
      { id: 'c', label: 'Only call options' },
      { id: 'd', label: 'Guaranteed uptrend' },
    ],
    correctId: 'a',
    reason: 'Equal lows = stops below — magnet for sweeps.',
  },
  // structure
  {
    topic: 'structure',
    question: 'Market structure is mainly about…',
    options: [
      { id: 'a', label: 'Swing highs/lows and how bias develops (HH/HL/LH/LL, BOS/CHoCH)' },
      { id: 'b', label: 'Only reading news headlines' },
      { id: 'c', label: 'Guessing the next tick' },
      { id: 'd', label: 'Whatever the broker app highlights green' },
    ],
    correctId: 'a',
    reason: 'Structure = swing map of bias — not a buy button.',
    drawHint: 'Label latest swings HH/HL/LH/LL.',
  },
  {
    topic: 'structure',
    question: 'BOS (Break of Structure) mainly tells you…',
    options: [
      { id: 'a', label: 'A swing level broke — bias clue, still need confirmation' },
      { id: 'b', label: 'Instant market order with no plan' },
      { id: 'c', label: 'Ignore all risk' },
      { id: 'd', label: 'Guaranteed reversal candle' },
    ],
    correctId: 'a',
    reason: 'BOS is a structure clue, not a trade order.',
  },
  {
    topic: 'structure',
    question: 'CHoCH (Change of Character) suggests…',
    options: [
      { id: 'a', label: 'Possible shift in prior trend character — wait for acceptance' },
      { id: 'b', label: 'Always fade every move' },
      { id: 'c', label: 'Delete higher timeframe' },
      { id: 'd', label: 'Broker glitch' },
    ],
    correctId: 'a',
    reason: 'CHoCH = character shift hypothesis — confirm, don’t gamble.',
  },
  // SMC / premium-discount (small share)
  {
    topic: 'smc',
    question: 'Premium vs discount zone — correct beginner takeaway?',
    options: [
      { id: 'a', label: 'Discount = always buy immediately' },
      { id: 'b', label: 'Premium = always sell immediately' },
      { id: 'c', label: 'Context only — still wait for confirmation' },
      { id: 'd', label: 'Zones do not matter at all' },
    ],
    correctId: 'c',
    reason: 'Premium/discount is range context, not a market order.',
    drawHint: 'Shade premium (mid→high) and discount (low→mid).',
  },
  {
    topic: 'smc',
    question: 'An Order Block (OB) is best treated as…',
    options: [
      { id: 'a', label: 'An area of interest from prior aggressive orders — still need confirmation' },
      { id: 'b', label: 'Guaranteed entry with no invalidation' },
      { id: 'c', label: 'Same as a random candle always' },
      { id: 'd', label: 'A tip to ignore risk' },
    ],
    correctId: 'a',
    reason: 'OB = AOI. Process framing, not certainty.',
  },
  {
    topic: 'smc',
    question: 'Fair Value Gap (FVG) mainly represents…',
    options: [
      { id: 'a', label: 'An imbalance / inefficiency left by displacement' },
      { id: 'b', label: 'Free money always' },
      { id: 'c', label: 'Broker fee' },
      { id: 'd', label: 'News headline' },
    ],
    correctId: 'a',
    reason: 'FVG = imbalance zone — reaction possible, not guaranteed.',
  },
  // price action
  {
    topic: 'price_action',
    question: 'Price action quality improves when you combine…',
    options: [
      { id: 'a', label: 'Location + candle behavior + follow-through' },
      { id: 'b', label: 'Only candle color' },
      { id: 'c', label: 'Only tip messages' },
      { id: 'd', label: 'Random entries' },
    ],
    correctId: 'a',
    reason: 'PA = location + reaction + acceptance/rejection.',
  },
  {
    topic: 'price_action',
    question: 'Acceptance above a level means…',
    options: [
      { id: 'a', label: 'Price holds/continues beyond it — not just a wick poke' },
      { id: 'b', label: 'One tick above is enough always' },
      { id: 'c', label: 'Ignore the level forever' },
      { id: 'd', label: 'Always short' },
    ],
    correctId: 'a',
    reason: 'Acceptance ≠ wick. Look for hold / follow-through.',
  },
  {
    topic: 'price_action',
    question: 'Rejection at a level means…',
    options: [
      { id: 'a', label: 'Price probes then fails to hold — often long wick / reclaim' },
      { id: 'b', label: 'Guaranteed trend day' },
      { id: 'c', label: 'No sellers exist' },
      { id: 'd', label: 'Skip journaling' },
    ],
    correctId: 'a',
    reason: 'Rejection = failed acceptance at the AOI.',
  },
  // risk
  {
    topic: 'risk',
    question: 'Risk management’s main job is…',
    options: [
      { id: 'a', label: 'Keep you alive to trade another day (capital preservation)' },
      { id: 'b', label: 'Maximize FOMO' },
      { id: 'c', label: 'Remove all losing days magically' },
      { id: 'd', label: 'Ignore invalidation' },
    ],
    correctId: 'a',
    reason: 'Survive first. Edge second.',
  },
  {
    topic: 'risk',
    question: 'Position size should mainly depend on…',
    options: [
      { id: 'a', label: 'Account risk rules + distance to invalidation' },
      { id: 'b', label: 'How excited you feel' },
      { id: 'c', label: 'Tip group confidence' },
      { id: 'd', label: 'Candle color only' },
    ],
    correctId: 'a',
    reason: 'Size from risk % and invalidation distance — not emotion.',
  },
  {
    topic: 'risk',
    question: 'If your process is unclear, best risk choice is…',
    options: [
      { id: 'a', label: 'No trade' },
      { id: 'b', label: 'Max leverage' },
      { id: 'c', label: 'Average down blindly' },
      { id: 'd', label: 'Delete the stop' },
    ],
    correctId: 'a',
    reason: 'Unclear = stand aside. That is professional risk.',
  },
  // trading psych
  {
    topic: 'psych',
    question: 'FOMO usually leads to…',
    options: [
      { id: 'a', label: 'Chasing without confirmation' },
      { id: 'b', label: 'Better risk rules' },
      { id: 'c', label: 'Perfect patience' },
      { id: 'd', label: 'Ignoring charts' },
    ],
    correctId: 'a',
    reason: 'FOMO = chase. Counter with checklist.',
  },
  {
    topic: 'psych',
    question: 'Revenge trading is…',
    options: [
      { id: 'a', label: 'Trying to “win back” losses emotionally' },
      { id: 'b', label: 'A risk framework' },
      { id: 'c', label: 'HTF analysis' },
      { id: 'd', label: 'Always profitable' },
    ],
    correctId: 'a',
    reason: 'Revenge = emotion sizing. Reset instead.',
  },
  {
    topic: 'psych',
    question: 'A healthy process after a loss…',
    options: [
      { id: 'a', label: 'Review → reset → wait for next quality process' },
      { id: 'b', label: 'Double size immediately' },
      { id: 'c', label: 'Quit forever without review' },
      { id: 'd', label: 'Blame only the market always' },
    ],
    correctId: 'a',
    reason: 'Review and reset — don’t dig the hole deeper.',
  },
  {
    topic: 'psych',
    question: 'Journaling helps…',
    options: [
      { id: 'a', label: 'See emotional patterns over time' },
      { id: 'b', label: 'Delete history' },
      { id: 'c', label: 'Skip structure' },
      { id: 'd', label: 'Guarantee wins' },
    ],
    correctId: 'a',
    reason: 'Journal = mirror for emotional patterns.',
  },
  {
    topic: 'psych',
    question: 'Patience is a skill because…',
    options: [
      { id: 'a', label: 'Not every moment is a high-quality process' },
      { id: 'b', label: 'Markets pay for waiting always' },
      { id: 'c', label: 'Brokers require it' },
      { id: 'd', label: 'Indicators demand it' },
    ],
    correctId: 'a',
    reason: 'Most moments are noise. Quality > activity.',
  },
];

const BY_TOPIC: Record<string, ArenaBankItem[]> = {
  candle: CANDLE,
  candle_psych: CANDLE_PSYCH,
  chart_psych: CHART_PSYCH,
  basics: OTHER.filter((x) => x.topic === 'basics'),
  trend: OTHER.filter((x) => x.topic === 'trend'),
  sr: OTHER.filter((x) => x.topic === 'sr'),
  liquidity: OTHER.filter((x) => x.topic === 'liquidity'),
  structure: OTHER.filter((x) => x.topic === 'structure'),
  smc: OTHER.filter((x) => x.topic === 'smc'),
  price_action: OTHER.filter((x) => x.topic === 'price_action'),
  risk: OTHER.filter((x) => x.topic === 'risk'),
  psych: OTHER.filter((x) => x.topic === 'psych'),
};

function pickItem(items: ArenaBankItem[]): ArenaBankItem {
  return items[Math.floor(Math.random() * items.length)];
}

function toDrill(d: DetectiveCard, item: ArenaBankItem): MentorDrill {
  const topicTag =
    item.topic === 'candle'
      ? 'CANDLES'
      : item.topic === 'candle_psych'
        ? 'CANDLE PSYCH'
        : item.topic === 'chart_psych'
          ? 'CHART PSYCH'
          : item.topic.toUpperCase().replace('_', ' ');

  return {
    id: `arena-${item.topic}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    scope: item.topic === 'smc' && /premium|discount/i.test(item.question) ? 'live' : 'teach',
    question: `[${topicTag}] ${item.question}`,
    options: item.options,
    correctId: item.correctId,
    reason: item.reason,
    symbol: d.symbol,
    createdAt: new Date().toISOString(),
    drawHint:
      item.drawHint ||
      (item.topic.startsWith('candle')
        ? `Focus student on recent candle bodies/wicks on ${d.symbol}. Mark LTP ${Number(d.ltp).toFixed(1)}.`
        : item.topic === 'chart_psych'
          ? `Mark Day High ${d.dayHigh ?? ''} / Day Low ${d.dayLow ?? ''} as psychological magnets. LTP ${Number(d.ltp).toFixed(1)}.`
          : `Teach on ${d.symbol} tape. LTP ${Number(d.ltp).toFixed(1)}.`),
    topic: item.topic,
  };
}

/** Mission-locked drill — only topics for this campaign level. */
export function buildArenaDrillForLevel(
  d: DetectiveCard,
  topics: ArenaTopic[],
  opts?: {
    topicWeights?: Partial<Record<ArenaTopic, number>>;
    allowLiveTape?: boolean;
    liveDrill?: (card: DetectiveCard) => MentorDrill;
    histDrill?: (card: DetectiveCard) => MentorDrill | null;
  },
): MentorDrill {
  if (opts?.allowLiveTape && opts.liveDrill && opts.histDrill && Math.random() < 0.18) {
    if (Math.random() < 0.45) {
      return { ...opts.liveDrill(d), topic: 'live' as ArenaTopic };
    }
    const h = opts.histDrill(d);
    if (h) return { ...h, topic: 'historical' as ArenaTopic };
  }

  const usable = topics.filter((t) => (BY_TOPIC[t] || []).length > 0);
  const poolTopics = usable.length ? usable : (['candle'] as ArenaTopic[]);
  const weights = poolTopics.map((t) => opts?.topicWeights?.[t] ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let pickTopic = poolTopics[0];
  for (let i = 0; i < poolTopics.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      pickTopic = poolTopics[i];
      break;
    }
  }
  const items = BY_TOPIC[pickTopic] || CANDLE;
  return toDrill(d, pickItem(items));
}

/** Weighted Arena builder — Survival Raid / free play. */
export function buildArenaDrill(
  d: DetectiveCard,
  liveDrill: (card: DetectiveCard) => MentorDrill,
  histDrill: (card: DetectiveCard) => MentorDrill | null,
): MentorDrill {
  const roll = Math.random();

  // 40% candles + candle psychology (split ~55/45 inside)
  if (roll < 0.4) {
    const candleRoll = Math.random();
    const pool = candleRoll < 0.55 ? CANDLE : CANDLE_PSYCH;
    return toDrill(d, pickItem(pool));
  }

  // 10% chart psychology
  if (roll < 0.5) {
    return toDrill(d, pickItem(CHART_PSYCH));
  }

  // 50% rest of trading desk
  const rest = Math.random();
  if (rest < 0.12) return { ...liveDrill(d), topic: 'live' as ArenaTopic };
  if (rest < 0.22) {
    const h = histDrill(d);
    if (h) return { ...h, topic: 'historical' as ArenaTopic };
  }

  const otherTopics: ArenaTopic[] = [
    'basics',
    'trend',
    'sr',
    'liquidity',
    'structure',
    'smc',
    'price_action',
    'risk',
    'psych',
  ];
  const weights = [1.1, 1.2, 1.1, 1.1, 1.2, 0.55, 1.1, 1.1, 1.2];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let topic: ArenaTopic = 'basics';
  for (let i = 0; i < otherTopics.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      topic = otherTopics[i];
      break;
    }
  }
  const pool = BY_TOPIC[topic] || OTHER;
  return toDrill(d, pickItem(pool));
}

export function arenaTopicLabel(topic?: string): string {
  if (!topic) return 'DESK';
  if (topic === 'candle') return 'CANDLES';
  if (topic === 'candle_psych') return 'CANDLE PSYCH';
  if (topic === 'chart_psych') return 'CHART PSYCH';
  return topic.replace('_', ' ').toUpperCase();
}
