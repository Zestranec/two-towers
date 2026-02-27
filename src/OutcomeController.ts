import { Rng } from './Rng';

/**
 * Outcome types for a round – set once at round start.
 * Controls how quickly the bomb probability rises.
 */
export type RunType = 'short' | 'medium' | 'long';

/**
 * Manages RTP-targeted bomb probability.
 * Target RTP ≈ 95%.
 *
 * Short run  (~30%): bomb likely within first 2–3 swipes
 * Medium run (~50%): bomb likely within 4–6 swipes
 * Long run   (~20%): survives 7+ swipes; low initial bomb prob
 *
 * Probability never exceeds 30%, never goes to 0.
 */
export class OutcomeController {
  private rng: Rng;
  private runType: RunType = 'medium';
  private consecutiveLosses: number = 0;
  private consecutiveWins: number = 0;
  private roundNumber: number = 0;

  // Base bomb probability per run type
  private static readonly BASE_PROB: Record<RunType, number> = {
    short:  0.25,
    medium: 0.14,
    long:   0.08,
  };

  // How much prob increases per swipe
  private static readonly GROW_RATE: Record<RunType, number> = {
    short:  0.06,
    medium: 0.03,
    long:   0.015,
  };

  constructor(rng: Rng) {
    this.rng = rng;
  }

  /** Call at the beginning of each round to decide run type. */
  startRound(): void {
    this.roundNumber++;
    const r = this.rng.next();
    if (r < 0.30) {
      this.runType = 'short';
    } else if (r < 0.80) {
      this.runType = 'medium';
    } else {
      this.runType = 'long';
    }
  }

  get currentRunType(): RunType { return this.runType; }

  /**
   * Returns bomb probability for the current swipe.
   * swipeIndex = 0 means first swipe of the round.
   */
  getBombProbability(swipeIndex: number): number {
    let prob = OutcomeController.BASE_PROB[this.runType]
      + OutcomeController.GROW_RATE[this.runType] * swipeIndex;

    // Streak adjustments – subtle, never obvious
    if (this.consecutiveLosses >= 3) {
      prob *= 0.80; // slight mercy after losses
    } else if (this.consecutiveWins >= 3) {
      prob *= 1.10; // slight correction after wins
    }

    // Clamp to [0.04, 0.30]
    return Math.min(0.30, Math.max(0.04, prob));
  }

  /** Returns true if this swipe is a bomb. */
  isBomb(swipeIndex: number): boolean {
    return this.rng.chance(this.getBombProbability(swipeIndex));
  }

  onRoundLost(): void {
    this.consecutiveLosses++;
    this.consecutiveWins = 0;
  }

  onRoundWon(): void {
    this.consecutiveWins++;
    this.consecutiveLosses = 0;
  }
}
