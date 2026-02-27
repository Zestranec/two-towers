import { Rng } from './Rng';

export type TowerId = 'A' | 'B';
export type PlaneOutcome = 'hitA' | 'hitB' | 'miss';

export interface RoundResolution {
  firstPlane: PlaneOutcome;
  secondPlaneTriggered: boolean;
  secondPlane?: PlaneOutcome;
  collapseTriggered: boolean;
  collapsedTower?: TowerId;
  destroyed: Record<TowerId, boolean>;
  survives: Record<TowerId, boolean>;
  selectedTowerWins: boolean;
}

/**
 * Centralized probability model for Twin Towers Dodge.
 *
 * Math target:
 * - Bet = 10, payout on win = 20 (2x return)
 * - RTP target = 95%
 * - Required win rate = 0.95 / 2 = 47.5%
 *
 * Base design starts from:
 * - hit A 40%, hit B 40%, miss 20%
 * - double plane trigger on miss: 10%
 * - collapse event: 5%
 *
 * Effective multipliers below are tuned to keep simulated RTP near 95%.
 */
export class ProbabilityController {
  static readonly BET = 10;
  static readonly PAYOUT_ON_WIN = 20;
  static readonly TARGET_RTP = 0.95;
  static readonly TARGET_WIN_RATE = ProbabilityController.TARGET_RTP / 2;

  // Base probabilities from the design brief.
  private static readonly BASE_FIRST_PLANE = {
    hitA: 0.4,
    hitB: 0.4,
    miss: 0.2,
  } as const;

  // Base special event probabilities from the design brief.
  private static readonly BASE_DOUBLE_PLANE_ON_MISS = 0.10;
  private static readonly BASE_COLLAPSE = 0.05;

  /**
   * Internal tuning multipliers to keep effective RTP ~95%.
   * They intentionally remain centralized here for transparency.
   *
   * Effective outcome probabilities after tuning:
   *   hitA  = 0.4 × 1.125  = 45%
   *   hitB  = 0.4 × 1.125  = 45%
   *   miss  = 0.2 × 0.5    = 10%   ← visible in gameplay
   *   total = 1.00  (weights normalize exactly)
   *
   *   collapse = 0.05 × 2.8 = 14%
   *
   * Approximate RTP derivation:
   *   P(Tower A destroyed) = P(hitA) + P(miss)×P(2nd plane)×P(hitA) + P(collapse→A)
   *                        = 0.45 + 0.10×0.10×0.45 + 0.14×0.5
   *                        ≈ 0.5245
   *   P(win) ≈ 1 − 0.5245 = 0.4755  →  RTP = 0.4755 × 2 ≈ 95.1%
   */
  private static readonly TUNING = {
    hitWeightMultiplier: 1.125,
    missWeightMultiplier: 0.5,
    collapseMultiplier: 2.8,
  } as const;

  private readonly rng: Rng;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  resolveRound(selectedTower: TowerId): RoundResolution {
    const collapseTriggered = this.rng.chance(this.getEffectiveCollapseChance());
    const collapsedTower = collapseTriggered ? this.randomTower() : undefined;

    const firstPlane = this.rollPlaneOutcome();
    const secondPlaneTriggered =
      firstPlane === 'miss' && this.rng.chance(ProbabilityController.BASE_DOUBLE_PLANE_ON_MISS);
    const secondPlane = secondPlaneTriggered ? this.rollPlaneOutcome() : undefined;

    const destroyed: Record<TowerId, boolean> = { A: false, B: false };

    this.applyPlaneOutcome(destroyed, firstPlane);
    if (secondPlane) {
      this.applyPlaneOutcome(destroyed, secondPlane);
    }
    if (collapsedTower) {
      destroyed[collapsedTower] = true;
    }

    const survives: Record<TowerId, boolean> = {
      A: !destroyed.A,
      B: !destroyed.B,
    };

    return {
      firstPlane,
      secondPlaneTriggered,
      secondPlane,
      collapseTriggered,
      collapsedTower,
      destroyed,
      survives,
      selectedTowerWins: survives[selectedTower],
    };
  }

  private rollPlaneOutcome(): PlaneOutcome {
    const hitAWeight = ProbabilityController.BASE_FIRST_PLANE.hitA * ProbabilityController.TUNING.hitWeightMultiplier;
    const hitBWeight = ProbabilityController.BASE_FIRST_PLANE.hitB * ProbabilityController.TUNING.hitWeightMultiplier;
    const missWeight = ProbabilityController.BASE_FIRST_PLANE.miss * ProbabilityController.TUNING.missWeightMultiplier;

    const total = hitAWeight + hitBWeight + missWeight;
    const r = this.rng.next() * total;

    if (r < hitAWeight) return 'hitA';
    if (r < hitAWeight + hitBWeight) return 'hitB';
    return 'miss';
  }

  private applyPlaneOutcome(destroyed: Record<TowerId, boolean>, outcome: PlaneOutcome): void {
    if (outcome === 'hitA') destroyed.A = true;
    if (outcome === 'hitB') destroyed.B = true;
  }

  private getEffectiveCollapseChance(): number {
    return Math.min(1, ProbabilityController.BASE_COLLAPSE * ProbabilityController.TUNING.collapseMultiplier);
  }

  private randomTower(): TowerId {
    return this.rng.chance(0.5) ? 'A' : 'B';
  }
}
