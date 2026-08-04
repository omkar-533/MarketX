/** Module 1 curriculum — locked Level 1–12 path for Wolf AI Mentor. */

export type LessonStepId =
  | 'explain'
  | 'story'
  | 'analogy'
  | 'visual'
  | 'chart'
  | 'mistakes'
  | 'quiz'
  | 'homework'
  | 'revision'
  | 'practical';

export type LessonStepDef = {
  id: LessonStepId;
  label: string;
  /** AI fills this step when true; quiz/homework/practical use local UI */
  aiDriven: boolean;
  needsChart: boolean;
};

export const LESSON_STEPS: LessonStepDef[] = [
  { id: 'explain', label: 'Simple explanation', aiDriven: true, needsChart: false },
  { id: 'story', label: 'Story', aiDriven: true, needsChart: false },
  { id: 'analogy', label: 'Daily-life example', aiDriven: true, needsChart: false },
  { id: 'visual', label: 'Visual / diagram', aiDriven: true, needsChart: false },
  { id: 'chart', label: 'Real chart example', aiDriven: true, needsChart: true },
  { id: 'mistakes', label: 'Common mistakes', aiDriven: true, needsChart: false },
  { id: 'quiz', label: 'Quiz', aiDriven: false, needsChart: false },
  { id: 'homework', label: 'Homework', aiDriven: false, needsChart: false },
  { id: 'revision', label: 'Revision notes', aiDriven: true, needsChart: false },
  { id: 'practical', label: 'Practical exercise', aiDriven: false, needsChart: true },
];

export type QuizOption = { id: string; label: string };
export type QuizQuestion = {
  id: string;
  question: string;
  options: QuizOption[];
  correctId: string;
};

export type CurriculumLevel = {
  id: number;
  title: string;
  objective: string;
  topicSeed: string;
  homework: string[];
  quiz: QuizQuestion[];
};

export const PASS_SCORE = 4; // out of 5

export const CURRICULUM_LEVELS: CurriculumLevel[] = [
  {
    id: 1,
    title: 'Market Basics',
    objective: 'Understand what a market is, buyers vs sellers, and why price moves.',
    topicSeed: 'financial markets auction, buyers sellers, price discovery, why markets exist',
    homework: [
      'Write in your words: who is a buyer and who is a seller',
      'List 3 reasons a price can rise',
      'List 3 reasons a price can fall',
    ],
    quiz: [
      {
        id: 'l1q1',
        question: 'A market primarily exists to…',
        options: [
          { id: 'a', label: 'Guarantee profits' },
          { id: 'b', label: 'Match buyers and sellers (price discovery)' },
          { id: 'c', label: 'Print free money' },
          { id: 'd', label: 'Remove all risk' },
        ],
        correctId: 'b',
      },
      {
        id: 'l1q2',
        question: 'If more aggressive buying hits the offer, price tends to…',
        options: [
          { id: 'a', label: 'Fall' },
          { id: 'b', label: 'Stay frozen forever' },
          { id: 'c', label: 'Rise' },
          { id: 'd', label: 'Become illegal' },
        ],
        correctId: 'c',
      },
      {
        id: 'l1q3',
        question: 'LTP means…',
        options: [
          { id: 'a', label: 'Last Traded Price' },
          { id: 'b', label: 'Long Term Profit' },
          { id: 'c', label: 'Low Tick Plan' },
          { id: 'd', label: 'Liquidity Target Point' },
        ],
        correctId: 'a',
      },
      {
        id: 'l1q4',
        question: 'Price is best thought of as…',
        options: [
          { id: 'a', label: 'A promise of future profit' },
          { id: 'b', label: 'The latest agreed auction print' },
          { id: 'c', label: 'Always fair value' },
          { id: 'd', label: 'Always manipulated forever' },
        ],
        correctId: 'b',
      },
      {
        id: 'l1q5',
        question: 'Wolf Mentor teaches…',
        options: [
          { id: 'a', label: 'Exact buy/sell signals only' },
          { id: 'b', label: 'Process and Areas of Interest — never Entry/SL/Target' },
          { id: 'c', label: 'Tips from WhatsApp groups' },
          { id: 'd', label: 'How to skip risk rules' },
        ],
        correctId: 'b',
      },
    ],
  },
  {
    id: 2,
    title: 'Candlesticks',
    objective: 'Read open, high, low, close and what a candle body/wick represents.',
    topicSeed: 'candlestick anatomy OHLC body wick psychology of buyers sellers',
    homework: ['Mark 5 big-body candles and note direction', 'Mark 5 long-wick candles and what they reject'],
    quiz: [
      {
        id: 'l2q1',
        question: 'A candle’s body shows the distance between…',
        options: [
          { id: 'a', label: 'High and low' },
          { id: 'b', label: 'Open and close' },
          { id: 'c', label: 'Volume and OI' },
          { id: 'd', label: 'Bid and ask only' },
        ],
        correctId: 'b',
      },
      {
        id: 'l2q2',
        question: 'A long upper wick often shows…',
        options: [
          { id: 'a', label: 'Selling pressure / rejection of highs' },
          { id: 'b', label: 'Guaranteed reversal tomorrow' },
          { id: 'c', label: 'No auction happened' },
          { id: 'd', label: 'Broker error' },
        ],
        correctId: 'a',
      },
      {
        id: 'l2q3',
        question: 'OHLC stands for…',
        options: [
          { id: 'a', label: 'Order High Low Close' },
          { id: 'b', label: 'Open High Low Close' },
          { id: 'c', label: 'Only Hedge Long Calls' },
          { id: 'd', label: 'Open Hold Lock Cash' },
        ],
        correctId: 'b',
      },
      {
        id: 'l2q4',
        question: 'A doji-like candle (tiny body) often means…',
        options: [
          { id: 'a', label: 'Strong one-sided control' },
          { id: 'b', label: 'Indecision / balance between sides' },
          { id: 'c', label: 'Market closed' },
          { id: 'd', label: 'Always buy' },
        ],
        correctId: 'b',
      },
      {
        id: 'l2q5',
        question: 'Candles alone without context…',
        options: [
          { id: 'a', label: 'Are enough for guaranteed trades' },
          { id: 'b', label: 'Need structure/location context to be useful' },
          { id: 'c', label: 'Never matter' },
          { id: 'd', label: 'Replace risk rules' },
        ],
        correctId: 'b',
      },
    ],
  },
  {
    id: 3,
    title: 'Trend',
    objective: 'Define uptrend / downtrend / sideways using swing structure.',
    topicSeed: 'trend definition HH HL LH LL sideways range',
    homework: ['Label current chart bias: up / down / sideways with 2 reasons'],
    quiz: [
      {
        id: 'l3q1',
        question: 'A classic uptrend often shows…',
        options: [
          { id: 'a', label: 'Lower highs and lower lows' },
          { id: 'b', label: 'Higher highs and higher lows' },
          { id: 'c', label: 'Only flat candles' },
          { id: 'd', label: 'Random noise only' },
        ],
        correctId: 'b',
      },
      {
        id: 'l3q2',
        question: 'Sideways / range means…',
        options: [
          { id: 'a', label: 'Clear directional control' },
          { id: 'b', label: 'Price oscillating between balance without clear expansion' },
          { id: 'c', label: 'Market holiday' },
          { id: 'd', label: 'Always short' },
        ],
        correctId: 'b',
      },
      {
        id: 'l3q3',
        question: 'Trading against a strong trend without evidence is…',
        options: [
          { id: 'a', label: 'Always smart' },
          { id: 'b', label: 'Usually lower-quality process' },
          { id: 'c', label: 'Required by mentors' },
          { id: 'd', label: 'Risk-free' },
        ],
        correctId: 'b',
      },
      {
        id: 'l3q4',
        question: 'HH means…',
        options: [
          { id: 'a', label: 'Higher High' },
          { id: 'b', label: 'Hard Hedge' },
          { id: 'c', label: 'Half Hour' },
          { id: 'd', label: 'Hidden Halt' },
        ],
        correctId: 'a',
      },
      {
        id: 'l3q5',
        question: 'Trend is…',
        options: [
          { id: 'a', label: 'A guarantee of next candle' },
          { id: 'b', label: 'A working hypothesis from structure' },
          { id: 'c', label: 'Always the same on every TF' },
          { id: 'd', label: 'Useless information' },
        ],
        correctId: 'b',
      },
    ],
  },
  {
    id: 4,
    title: 'Support & Resistance',
    objective: 'Identify Areas of Interest where price previously reacted — not magic lines.',
    topicSeed: 'support resistance areas of interest reaction zones',
    homework: ['Mark 3 support and 3 resistance Areas of Interest on your chart (no entries)'],
    quiz: [
      {
        id: 'l4q1',
        question: 'Support is best described as…',
        options: [
          { id: 'a', label: 'A guaranteed bounce price' },
          { id: 'b', label: 'An area where demand previously showed interest' },
          { id: 'c', label: 'Always the VWAP' },
          { id: 'd', label: 'A buy signal button' },
        ],
        correctId: 'b',
      },
      {
        id: 'l4q2',
        question: 'Resistance is…',
        options: [
          { id: 'a', label: 'An area where supply previously showed interest' },
          { id: 'b', label: 'Always broken instantly' },
          { id: 'c', label: 'Only for stocks' },
          { id: 'd', label: 'A stop loss' },
        ],
        correctId: 'a',
      },
      {
        id: 'l4q3',
        question: 'Wolf Mentor marks S/R as…',
        options: [
          { id: 'a', label: 'Entry and Target' },
          { id: 'b', label: 'Areas of Interest for process study' },
          { id: 'c', label: 'WhatsApp tips' },
          { id: 'd', label: 'Random colors' },
        ],
        correctId: 'b',
      },
      {
        id: 'l4q4',
        question: 'A level that breaks and holds the other side may act as…',
        options: [
          { id: 'a', label: 'Role reversal / flipped interest (hypothesis)' },
          { id: 'b', label: 'Proof of infinite trend' },
          { id: 'c', label: 'Broker glitch only' },
          { id: 'd', label: 'Nothing ever' },
        ],
        correctId: 'a',
      },
      {
        id: 'l4q5',
        question: 'Best practice for S/R…',
        options: [
          { id: 'a', label: 'Draw 50 lines everywhere' },
          { id: 'b', label: 'Prefer clear reaction areas with context' },
          { id: 'c', label: 'Ignore higher timeframes always' },
          { id: 'd', label: 'Never update levels' },
        ],
        correctId: 'b',
      },
    ],
  },
  {
    id: 5,
    title: 'Liquidity',
    objective: 'Understand resting orders / stop clusters as Areas of Interest — probability, not certainty.',
    topicSeed: 'liquidity BSL SSL stop pools equal highs lows sweep',
    homework: ['Mark 5 potential liquidity areas (equal highs/lows) on chart — process only'],
    quiz: [
      {
        id: 'l5q1',
        question: 'Liquidity in trading education often means…',
        options: [
          { id: 'a', label: 'Cash in your bank only' },
          { id: 'b', label: 'Areas where resting orders / stops may sit' },
          { id: 'c', label: 'Guaranteed reversal magnets' },
          { id: 'd', label: 'Broker fees' },
        ],
        correctId: 'b',
      },
      {
        id: 'l5q2',
        question: 'Equal highs can attract…',
        options: [
          { id: 'a', label: 'Buy-side liquidity / stops above (hypothesis)' },
          { id: 'b', label: 'Nothing ever' },
          { id: 'c', label: 'Only options expiry' },
          { id: 'd', label: 'Free money' },
        ],
        correctId: 'a',
      },
      {
        id: 'l5q3',
        question: 'A liquidity sweep is…',
        options: [
          { id: 'a', label: 'Price briefly taking stops then leaving (possible)' },
          { id: 'b', label: 'Always the best entry tip' },
          { id: 'c', label: 'Illegal trading' },
          { id: 'd', label: 'Volume profile only' },
        ],
        correctId: 'a',
      },
      {
        id: 'l5q4',
        question: 'Liquidity analysis must be framed as…',
        options: [
          { id: 'a', label: 'Certainty' },
          { id: 'b', label: 'Probability / Areas of Interest' },
          { id: 'c', label: 'Signals only' },
          { id: 'd', label: 'Ignore structure' },
        ],
        correctId: 'b',
      },
      {
        id: 'l5q5',
        question: 'SSL often refers to…',
        options: [
          { id: 'a', label: 'Sell-side liquidity (below lows)' },
          { id: 'b', label: 'Super Strong Long' },
          { id: 'c', label: 'Session Start Line' },
          { id: 'd', label: 'Stock Split List' },
        ],
        correctId: 'a',
      },
    ],
  },
  {
    id: 6,
    title: 'Market Structure',
    objective: 'Read BOS / CHoCH as structure events — descriptive, not trade orders.',
    topicSeed: 'market structure BOS CHoCH swing breaks continuation reversal hypothesis',
    homework: ['Mark 1 BOS and 1 CHoCH candidate on history (labels only)'],
    quiz: [
      {
        id: 'l6q1',
        question: 'BOS generally means…',
        options: [
          { id: 'a', label: 'Break of Structure in the trend direction (hypothesis)' },
          { id: 'b', label: 'Buy on Spot' },
          { id: 'c', label: 'Broker Order System' },
          { id: 'd', label: 'Best Option Strike' },
        ],
        correctId: 'a',
      },
      {
        id: 'l6q2',
        question: 'CHoCH often signals a possible…',
        options: [
          { id: 'a', label: 'Change of character / shift in structure lean' },
          { id: 'b', label: 'Guaranteed reversal tip' },
          { id: 'c', label: 'Candlestick color only' },
          { id: 'd', label: 'Holiday' },
        ],
        correctId: 'a',
      },
      {
        id: 'l6q3',
        question: 'Structure should be read with…',
        options: [
          { id: 'a', label: 'Context (TF, liquidity, location)' },
          { id: 'b', label: 'One candle only always' },
          { id: 'c', label: 'Tips only' },
          { id: 'd', label: 'Ignoring swings' },
        ],
        correctId: 'a',
      },
      {
        id: 'l6q4',
        question: 'After a BOS, a pro student looks for…',
        options: [
          { id: 'a', label: 'Instant FOMO chase always' },
          { id: 'b', label: 'Whether location/liquidity supports continuation process' },
          { id: 'c', label: 'Random indicators only' },
          { id: 'd', label: 'Ignoring invalidation ideas' },
        ],
        correctId: 'b',
      },
      {
        id: 'l6q5',
        question: 'Structure labels in Wolf Mentor are…',
        options: [
          { id: 'a', label: 'Trade orders' },
          { id: 'b', label: 'Teaching marks / Areas of Interest' },
          { id: 'c', label: 'Account passwords' },
          { id: 'd', label: 'Broker messages' },
        ],
        correctId: 'b',
      },
    ],
  },
  {
    id: 7,
    title: 'SMC',
    objective: 'Smart Money Concepts as a language for structure + liquidity — not certainty.',
    topicSeed: 'SMC order blocks FVG premium discount liquidity concepts process framing',
    homework: ['Define OB and FVG in your words (no trade plan)'],
    quiz: [
      {
        id: 'l7q1',
        question: 'SMC is best used as…',
        options: [
          { id: 'a', label: 'A vocabulary for reading participation / structure' },
          { id: 'b', label: 'A guaranteed signal system' },
          { id: 'c', label: 'Only for crypto' },
          { id: 'd', label: 'A way to skip risk' },
        ],
        correctId: 'a',
      },
      {
        id: 'l7q2',
        question: 'An Order Block in education is often…',
        options: [
          { id: 'a', label: 'A zone of prior aggressive participation (hypothesis)' },
          { id: 'b', label: 'Always perfect entry' },
          { id: 'c', label: 'A broker product' },
          { id: 'd', label: 'Volume profile exclusive' },
        ],
        correctId: 'a',
      },
      {
        id: 'l7q3',
        question: 'FVG describes…',
        options: [
          { id: 'a', label: 'A visible imbalance / inefficiency after fast move' },
          { id: 'b', label: 'Forced fill magnet' },
          { id: 'c', label: 'Futures Vague Gap' },
          { id: 'd', label: 'Free Value Gift' },
        ],
        correctId: 'a',
      },
      {
        id: 'l7q4',
        question: 'Premium / discount framing helps…',
        options: [
          { id: 'a', label: 'Relative location of price in a range' },
          { id: 'b', label: 'Brokerage discounts' },
          { id: 'c', label: 'Guaranteed longs in discount' },
          { id: 'd', label: 'Ignore HTF' },
        ],
        correctId: 'a',
      },
      {
        id: 'l7q5',
        question: 'SMC without risk/process…',
        options: [
          { id: 'a', label: 'Is incomplete training' },
          { id: 'b', label: 'Is enough forever' },
          { id: 'c', label: 'Removes uncertainty' },
          { id: 'd', label: 'Replaces psychology' },
        ],
        correctId: 'a',
      },
    ],
  },
  {
    id: 8,
    title: 'ICT',
    objective: 'ICT-style concepts (liquidity, displacement, sessions) as study tools — not gospel.',
    topicSeed: 'ICT concepts sessions displacement liquidity draws process caution',
    homework: ['Note Asian/London/NY session times relevant to your market study'],
    quiz: [
      {
        id: 'l8q1',
        question: 'ICT ideas should be treated as…',
        options: [
          { id: 'a', label: 'Study frameworks requiring confirmation' },
          { id: 'b', label: 'Infallible religion' },
          { id: 'c', label: 'Broker API' },
          { id: 'd', label: 'Only indicators' },
        ],
        correctId: 'a',
      },
      {
        id: 'l8q2',
        question: 'Displacement often means…',
        options: [
          { id: 'a', label: 'Strong energetic move leaving imbalance' },
          { id: 'b', label: 'Moving house' },
          { id: 'c', label: 'Cancelled order' },
          { id: 'd', label: 'Always fade the move' },
        ],
        correctId: 'a',
      },
      {
        id: 'l8q3',
        question: 'Session context matters because…',
        options: [
          { id: 'a', label: 'Participation/volatility regimes differ' },
          { id: 'b', label: 'Charts change colors by law' },
          { id: 'c', label: 'It removes all risk' },
          { id: 'd', label: 'It guarantees BOS' },
        ],
        correctId: 'a',
      },
      {
        id: 'l8q4',
        question: 'When uncertainty is high, a mentor should…',
        options: [
          { id: 'a', label: 'State assumptions clearly' },
          { id: 'b', label: 'Fake certainty' },
          { id: 'c', label: 'Give buy/sell' },
          { id: 'd', label: 'Ignore the student' },
        ],
        correctId: 'a',
      },
      {
        id: 'l8q5',
        question: 'Wolf Mentor never provides…',
        options: [
          { id: 'a', label: 'Process critique' },
          { id: 'b', label: 'Entry / Stop / Target orders' },
          { id: 'c', label: 'Chart drawings for learning' },
          { id: 'd', label: 'Structure labels' },
        ],
        correctId: 'b',
      },
    ],
  },
  {
    id: 9,
    title: 'Price Action',
    objective: 'Combine candles + location + structure into a coherent read.',
    topicSeed: 'price action location context acceptance rejection follow-through',
    homework: ['Journal 3 rejection and 3 acceptance examples from history'],
    quiz: [
      {
        id: 'l9q1',
        question: 'Price action quality improves when you include…',
        options: [
          { id: 'a', label: 'Location + structure + participation clues' },
          { id: 'b', label: 'Only emoji reactions' },
          { id: 'c', label: 'More tips channels' },
          { id: 'd', label: 'Ignoring wick information' },
        ],
        correctId: 'a',
      },
      {
        id: 'l9q2',
        question: 'Acceptance near a level means…',
        options: [
          { id: 'a', label: 'Price spends time / trades through with participation' },
          { id: 'b', label: 'Broker accepted your KYC' },
          { id: 'c', label: 'Always reverse' },
          { id: 'd', label: 'News only' },
        ],
        correctId: 'a',
      },
      {
        id: 'l9q3',
        question: 'Rejection near a level means…',
        options: [
          { id: 'a', label: 'Quick leave / failed acceptance (hypothesis)' },
          { id: 'b', label: 'Account rejected' },
          { id: 'c', label: 'Guaranteed trend day' },
          { id: 'd', label: 'Ignore volume entirely always' },
        ],
        correctId: 'a',
      },
      {
        id: 'l9q4',
        question: 'Follow-through after a break suggests…',
        options: [
          { id: 'a', label: 'Stronger evidence of continuation lean' },
          { id: 'b', label: 'Nothing' },
          { id: 'c', label: 'Always fade' },
          { id: 'd', label: 'Skip risk' },
        ],
        correctId: 'a',
      },
      {
        id: 'l9q5',
        question: 'PA without a process checklist…',
        options: [
          { id: 'a', label: 'Often becomes storytelling' },
          { id: 'b', label: 'Is always perfect' },
          { id: 'c', label: 'Needs no practice' },
          { id: 'd', label: 'Replaces journaling' },
        ],
        correctId: 'a',
      },
    ],
  },
  {
    id: 10,
    title: 'Risk Management',
    objective: 'Process risk: size, heat, invalidation thinking — still no trade orders from Mentor.',
    topicSeed: 'risk management position sizing heat invalidation capital preservation process',
    homework: ['Write your personal max risk rules (process, not a trade)'],
    quiz: [
      {
        id: 'l10q1',
        question: 'Capital preservation is…',
        options: [
          { id: 'a', label: 'Optional for beginners' },
          { id: 'b', label: 'Core to staying in the game' },
          { id: 'c', label: 'Only for banks' },
          { id: 'd', label: 'Ignored by pros' },
        ],
        correctId: 'b',
      },
      {
        id: 'l10q2',
        question: 'Invalidation thinking means…',
        options: [
          { id: 'a', label: 'Knowing what evidence would kill the idea' },
          { id: 'b', label: 'Never admitting wrong' },
          { id: 'c', label: 'Moving stops randomly' },
          { id: 'd', label: 'Adding forever' },
        ],
        correctId: 'a',
      },
      {
        id: 'l10q3',
        question: 'High conviction does NOT justify…',
        options: [
          { id: 'a', label: 'Unlimited risk' },
          { id: 'b', label: 'Clear journaling' },
          { id: 'c', label: 'Waiting for confirmation' },
          { id: 'd', label: 'Reviewing mistakes' },
        ],
        correctId: 'a',
      },
      {
        id: 'l10q4',
        question: 'Portfolio heat rises when…',
        options: [
          { id: 'a', label: 'Many correlated risks stack' },
          { id: 'b', label: 'You sleep well' },
          { id: 'c', label: 'You only paper trade' },
          { id: 'd', label: 'Markets are closed' },
        ],
        correctId: 'a',
      },
      {
        id: 'l10q5',
        question: 'Wolf Mentor risk lessons…',
        options: [
          { id: 'a', label: 'Still never give Entry/SL/Target orders' },
          { id: 'b', label: 'Tell you exact lot size to buy' },
          { id: 'c', label: 'Replace your broker' },
          { id: 'd', label: 'Promise returns' },
        ],
        correctId: 'a',
      },
    ],
  },
  {
    id: 11,
    title: 'Trading Psychology',
    objective: 'Recognize FOMO, revenge, overconfidence — process habits over emotion.',
    topicSeed: 'trading psychology FOMO revenge trading patience discipline journaling',
    homework: ['Write 3 emotional traps you personally fall into'],
    quiz: [
      {
        id: 'l11q1',
        question: 'FOMO usually leads to…',
        options: [
          { id: 'a', label: 'Chasing without confirmation' },
          { id: 'b', label: 'Better risk rules' },
          { id: 'c', label: 'Perfect patience' },
          { id: 'd', label: 'Ignoring charts' },
        ],
        correctId: 'a',
      },
      {
        id: 'l11q2',
        question: 'Revenge trading is…',
        options: [
          { id: 'a', label: 'Trying to “win back” losses emotionally' },
          { id: 'b', label: 'A risk framework' },
          { id: 'c', label: 'HTF analysis' },
          { id: 'd', label: 'Always profitable' },
        ],
        correctId: 'a',
      },
      {
        id: 'l11q3',
        question: 'A healthy process after a loss…',
        options: [
          { id: 'a', label: 'Review → reset → wait for next quality process' },
          { id: 'b', label: 'Double size immediately' },
          { id: 'c', label: 'Quit forever without review' },
          { id: 'd', label: 'Blame only the market always' },
        ],
        correctId: 'a',
      },
      {
        id: 'l11q4',
        question: 'Journaling helps…',
        options: [
          { id: 'a', label: 'See emotional patterns over time' },
          { id: 'b', label: 'Delete history' },
          { id: 'c', label: 'Skip structure' },
          { id: 'd', label: 'Guarantee wins' },
        ],
        correctId: 'a',
      },
      {
        id: 'l11q5',
        question: 'Patience is a skill because…',
        options: [
          { id: 'a', label: 'Not every moment is a high-quality process' },
          { id: 'b', label: 'Markets pay for waiting always' },
          { id: 'c', label: 'Brokers require it' },
          { id: 'd', label: 'Indicators demand it' },
        ],
        correctId: 'a',
      },
    ],
  },
  {
    id: 12,
    title: 'Live Trading Practice',
    objective: 'Apply the full process checklist on live tape — still Areas of Interest only.',
    topicSeed: 'live practice checklist structure liquidity risk psychology no trade orders',
    homework: [
      'Run one full process checklist on today’s chart (no orders)',
      'Write what you would wait for next (confirmation language)',
    ],
    quiz: [
      {
        id: 'l12q1',
        question: 'Before acting on live tape, a student should…',
        options: [
          { id: 'a', label: 'Run structure + liquidity + risk + psychology checks' },
          { id: 'b', label: 'Click market order instantly' },
          { id: 'c', label: 'Ask a tip channel' },
          { id: 'd', label: 'Ignore HTF' },
        ],
        correctId: 'a',
      },
      {
        id: 'l12q2',
        question: 'Live practice in Wolf Mentor means…',
        options: [
          { id: 'a', label: 'Process identification on live chart' },
          { id: 'b', label: 'Broker auto-execution by Mentor' },
          { id: 'c', label: 'Guaranteed P&L' },
          { id: 'd', label: 'Skipping earlier levels' },
        ],
        correctId: 'a',
      },
      {
        id: 'l12q3',
        question: 'If evidence is mixed…',
        options: [
          { id: 'a', label: 'Say so and wait — uncertainty is honest' },
          { id: 'b', label: 'Force a directional tip' },
          { id: 'c', label: 'Increase size' },
          { id: 'd', label: 'Delete the chart' },
        ],
        correctId: 'a',
      },
      {
        id: 'l12q4',
        question: 'Completing Module 1 means…',
        options: [
          { id: 'a', label: 'You can identify concepts and practice process — not “become rich”' },
          { id: 'b', label: 'You are a licensed SEBI advisor' },
          { id: 'c', label: 'You never need review again' },
          { id: 'd', label: 'You unlock Entry/SL tips' },
        ],
        correctId: 'a',
      },
      {
        id: 'l12q5',
        question: 'The biggest difference AI Teacher vs tip bot…',
        options: [
          { id: 'a', label: 'Understand → identify → practice → test → apply process' },
          { id: 'b', label: 'More buy alerts' },
          { id: 'c', label: 'Faster lottery picks' },
          { id: 'd', label: 'Hidden signals only' },
        ],
        correctId: 'a',
      },
    ],
  },
];

export type LevelProgress = {
  levelId: number;
  stepsDone: LessonStepId[];
  quizScore: number | null;
  quizPassed: boolean;
  homeworkChecked: boolean[];
  completedAt: string | null;
};

export type CurriculumProgress = {
  highestUnlocked: number;
  levels: Record<number, LevelProgress>;
  lastLevelId: number | null;
  updatedAt: string;
};

const STORAGE = 'wolf_mentor_curriculum_v1';

function storageKey(ownerKey: string) {
  return `${STORAGE}:${ownerKey || 'guest'}`;
}

function emptyLevelProgress(levelId: number): LevelProgress {
  const level = CURRICULUM_LEVELS.find((l) => l.id === levelId);
  return {
    levelId,
    stepsDone: [],
    quizScore: null,
    quizPassed: false,
    homeworkChecked: (level?.homework || []).map(() => false),
    completedAt: null,
  };
}

export function defaultCurriculumProgress(): CurriculumProgress {
  const levels: Record<number, LevelProgress> = {};
  for (const l of CURRICULUM_LEVELS) levels[l.id] = emptyLevelProgress(l.id);
  return {
    highestUnlocked: 1,
    levels,
    lastLevelId: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function loadCurriculumProgress(ownerKey = 'guest'): CurriculumProgress {
  if (typeof window === 'undefined') return defaultCurriculumProgress();
  try {
    const raw = window.localStorage.getItem(storageKey(ownerKey));
    if (!raw) return defaultCurriculumProgress();
    const parsed = JSON.parse(raw) as CurriculumProgress;
    if (!parsed?.highestUnlocked) return defaultCurriculumProgress();
    const base = defaultCurriculumProgress();
    return {
      ...base,
      ...parsed,
      levels: { ...base.levels, ...parsed.levels },
      highestUnlocked: Math.max(1, Math.min(12, parsed.highestUnlocked || 1)),
    };
  } catch {
    return defaultCurriculumProgress();
  }
}

export function saveCurriculumProgress(progress: CurriculumProgress, ownerKey = 'guest'): void {
  if (typeof window === 'undefined') return;
  progress.updatedAt = new Date().toISOString();
  window.localStorage.setItem(storageKey(ownerKey), JSON.stringify(progress));
}

export function getLevel(id: number): CurriculumLevel | undefined {
  return CURRICULUM_LEVELS.find((l) => l.id === id);
}

export function isLevelUnlocked(levelId: number, progress: CurriculumProgress): boolean {
  return levelId <= progress.highestUnlocked;
}

export function markStepDone(
  progress: CurriculumProgress,
  levelId: number,
  stepId: LessonStepId,
): CurriculumProgress {
  const prev = progress.levels[levelId] || emptyLevelProgress(levelId);
  const stepsDone = prev.stepsDone.includes(stepId) ? prev.stepsDone : [...prev.stepsDone, stepId];
  return {
    ...progress,
    lastLevelId: levelId,
    levels: {
      ...progress.levels,
      [levelId]: { ...prev, stepsDone },
    },
  };
}

export function submitLevelQuiz(
  progress: CurriculumProgress,
  levelId: number,
  score: number,
): { progress: CurriculumProgress; passed: boolean } {
  const passed = score >= PASS_SCORE;
  const prev = progress.levels[levelId] || emptyLevelProgress(levelId);
  let stepsDone = prev.stepsDone;
  if (passed && !stepsDone.includes('quiz')) stepsDone = [...stepsDone, 'quiz'];
  const next: CurriculumProgress = {
    ...progress,
    lastLevelId: levelId,
    highestUnlocked: passed
      ? Math.max(progress.highestUnlocked, Math.min(12, levelId + 1))
      : progress.highestUnlocked,
    levels: {
      ...progress.levels,
      [levelId]: {
        ...prev,
        stepsDone,
        quizScore: score,
        quizPassed: passed,
        completedAt: passed ? new Date().toISOString() : prev.completedAt,
      },
    },
  };
  return { progress: next, passed };
}

export function setHomeworkChecks(
  progress: CurriculumProgress,
  levelId: number,
  checks: boolean[],
): CurriculumProgress {
  const prev = progress.levels[levelId] || emptyLevelProgress(levelId);
  let stepsDone = prev.stepsDone;
  if (checks.length && checks.every(Boolean) && !stepsDone.includes('homework')) {
    stepsDone = [...stepsDone, 'homework'];
  }
  return {
    ...progress,
    levels: {
      ...progress.levels,
      [levelId]: { ...prev, homeworkChecked: checks, stepsDone },
    },
  };
}

export function buildLessonStepPrompt(
  level: CurriculumLevel,
  step: LessonStepDef,
  studentName: string,
  adapt?: string,
): string {
  const adaptLine = adapt
    ? `\nStudent request: ${adapt}. Adapt this step accordingly.`
    : '';
  const chartLine = step.needsChart
    ? '\nMUST end with a ```wolfchart``` block drawing the teaching marks on the OPEN chart (Areas of Interest only).'
    : '';

  return `[MENTOR LESSON] Module 1 · Level ${level.id}: ${level.title}
Topic seed: ${level.topicSeed}
Objective: ${level.objective}
Student name: ${studentName || 'Student'}
Current lesson STEP ONLY: ${step.id} — ${step.label}

Teach ONLY this step now using the mentor lesson format for this step.
Personality: why + how; simplify until clear; real market context; state assumptions if uncertain.
Never Entry/Stop/Target/Buy/Sell.
${adaptLine}
${chartLine}`;
}

export function stepIndex(stepId: LessonStepId): number {
  return LESSON_STEPS.findIndex((s) => s.id === stepId);
}
