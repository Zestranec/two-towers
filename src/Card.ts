/**
 * Card type definitions and visual data.
 * 14 safe card types + 1 bomb card.
 * pickSafeCard uses SAFE_CARDS.length dynamically → each card gets 1/14 of the 85% safe weight.
 */

export type CardKind =
  | 'strawberry' | 'butterfly' | 'taxi' | 'fruit'         // original 4
  | 'guru' | 'hydration' | 'catceo' | 'ramen' | 'crypto'  // new batch 1
  | 'mindfulness' | 'cleaning' | 'pizza' | 'dog' | 'drama' // new batch 2
  | 'bomb';

export interface CardData {
  kind: CardKind;
  emoji: string;
  title: string;
  subtitle: string;
  gradient: [string, string];
  accentColor: string;
  isBomb: boolean;
}

export const SAFE_CARDS: CardData[] = [
  // ─── Original 4 ───────────────────────────────────────────────────────────
  {
    kind: 'strawberry',
    emoji: '🍓',
    title: 'Dancing Strawberry',
    subtitle: '#trending #fresh #vibe',
    gradient: ['#ff6b6b', '#ee0979'],
    accentColor: '#ff6b6b',
    isBomb: false,
  },
  {
    kind: 'butterfly',
    emoji: '🦋',
    title: 'Flying Butterfly',
    subtitle: '#nature #beauty #free',
    gradient: ['#667eea', '#764ba2'],
    accentColor: '#a78bfa',
    isBomb: false,
  },
  {
    kind: 'taxi',
    emoji: '🚕',
    title: 'Taxi Ad',
    subtitle: '📞 Call 7788 — Now!',
    gradient: ['#f7971e', '#ffd200'],
    accentColor: '#fbbf24',
    isBomb: false,
  },
  {
    kind: 'fruit',
    emoji: '🍉',
    title: 'Fruit Dance',
    subtitle: '#food #dance #summer',
    gradient: ['#56ab2f', '#a8e063'],
    accentColor: '#4ade80',
    isBomb: false,
  },

  // ─── New batch 1 ──────────────────────────────────────────────────────────
  {
    kind: 'guru',
    emoji: '🧠',
    title: 'WAKE UP AT 4AM AND OUTRUN YOUR PROBLEMS',
    subtitle: 'Step 1: deny emotions. Step 2: spreadsheets.',
    gradient: ['#0f2027', '#2c5364'],
    accentColor: '#38bdf8',
    isBomb: false,
  },
  {
    kind: 'hydration',
    emoji: '🥤',
    title: 'DRINK WATER OR YOU\'LL TURN INTO A RAISIN',
    subtitle: 'Source: vibes.',
    gradient: ['#00c6ff', '#0072ff'],
    accentColor: '#7dd3fc',
    isBomb: false,
  },
  {
    kind: 'catceo',
    emoji: '🐈',
    title: 'HIRED. PROMOTED. FIRED.',
    subtitle: 'The cat made the decision.',
    gradient: ['#1a1a2e', '#16213e'],
    accentColor: '#e2e8f0',
    isBomb: false,
  },
  {
    kind: 'ramen',
    emoji: '🍜',
    title: 'THIS RAMEN CHANGED MY PERSONALITY',
    subtitle: 'Now I speak in slurps.',
    gradient: ['#e96c2e', '#c0392b'],
    accentColor: '#fb923c',
    isBomb: false,
  },
  {
    kind: 'crypto',
    emoji: '💸',
    title: 'TRUST ME BRO: IT\'S GOING TO THE MOON',
    subtitle: 'Chart analysis: I squinted.',
    gradient: ['#1a0533', '#7b2ff7'],
    accentColor: '#c084fc',
    isBomb: false,
  },

  // ─── New batch 2 ──────────────────────────────────────────────────────────
  {
    kind: 'mindfulness',
    emoji: '🧘',
    title: 'BREATHE IN… BREATHE OUT… PAYWALL',
    subtitle: 'Unlock calm for only 9.99.',
    gradient: ['#11998e', '#38ef7d'],
    accentColor: '#6ee7b7',
    isBomb: false,
  },
  {
    kind: 'cleaning',
    emoji: '🧽',
    title: 'I CLEANED MY WHOLE LIFE WITH ONE SPONGE',
    subtitle: 'It was a bad idea.',
    gradient: ['#4776e6', '#8e54e9'],
    accentColor: '#c4b5fd',
    isBomb: false,
  },
  {
    kind: 'pizza',
    emoji: '🍕',
    title: 'PINEAPPLE ON PIZZA: CIVIL WAR UPDATE',
    subtitle: 'Comments are on fire (again).',
    gradient: ['#f7971e', '#e74c3c'],
    accentColor: '#fca5a5',
    isBomb: false,
  },
  {
    kind: 'dog',
    emoji: '🐕',
    title: 'I TRANSLATED MY DOG\'S THOUGHTS',
    subtitle: 'Result: "snack?"',
    gradient: ['#f09819', '#edde5d'],
    accentColor: '#fde68a',
    isBomb: false,
  },
  {
    kind: 'drama',
    emoji: '🎭',
    title: 'THEY SAID WHAT?! (part 47)',
    subtitle: 'Stay tuned for absolutely nothing.',
    gradient: ['#f953c6', '#b91d73'],
    accentColor: '#f9a8d4',
    isBomb: false,
  },
];

export const BOMB_CARD: CardData = {
  kind: 'bomb',
  emoji: '💣',
  title: 'BOOM!',
  subtitle: 'Round Over',
  gradient: ['#1a0000', '#3d0000'],
  accentColor: '#ef4444',
  isBomb: true,
};

/** Uniform distribution across all 14 safe cards (each = 1/14 of 85% safe weight). */
export function pickSafeCard(r: number): CardData {
  return SAFE_CARDS[Math.floor(r * SAFE_CARDS.length)];
}
