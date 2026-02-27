import { Rng } from './Rng';
import { OutcomeController } from './OutcomeController';
import { CardData, BOMB_CARD, pickSafeCard } from './Card';

/**
 * Generates card sequences for rounds.
 * Each round: [safe, safe, ..., bomb] or pure safe streak (when cashing out).
 */
export class ReelEngine {
  private rng: Rng;
  private outcomeController: OutcomeController;

  constructor(rng: Rng) {
    this.rng = rng;
    this.outcomeController = new OutcomeController(rng);
  }

  get controller(): OutcomeController { return this.outcomeController; }

  /** Call at round start; decides this round's run type. */
  startRound(): void {
    this.outcomeController.startRound();
  }

  /**
   * Returns the next card for the given swipe index.
   * If the outcome controller determines bomb → return bomb card.
   * Otherwise return a random safe card.
   */
  nextCard(swipeIndex: number): CardData {
    if (this.outcomeController.isBomb(swipeIndex)) {
      return BOMB_CARD;
    }
    return pickSafeCard(this.rng.next());
  }

  /** Force a safe card (used for cashout animation or first card). */
  safePick(): CardData {
    return pickSafeCard(this.rng.next());
  }

  onRoundLost(): void { this.outcomeController.onRoundLost(); }
  onRoundWon(): void { this.outcomeController.onRoundWon(); }
}
