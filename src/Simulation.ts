import { Rng } from './Rng';
import { PlaneOutcome, ProbabilityController, TowerId } from './ProbabilityController';

export interface SimulationResults {
  rounds: number;
  winRate: number;
  effectiveRtp: number;
  hitA: number;
  hitB: number;
  miss: number;
  doublePlane: number;
  collapse: number;
}

export function simulate(rounds: number): SimulationResults {
  const rng = new Rng(0x5eedc0de);
  const probability = new ProbabilityController(rng);

  let wins = 0;
  let hitA = 0;
  let hitB = 0;
  let miss = 0;
  let doublePlane = 0;
  let collapse = 0;

  for (let i = 0; i < rounds; i++) {
    const pickedTower: TowerId = rng.chance(0.5) ? 'A' : 'B';
    const resolution = probability.resolveRound(pickedTower);

    if (resolution.selectedTowerWins) wins++;
    if (resolution.collapseTriggered) collapse++;
    if (resolution.secondPlaneTriggered) doublePlane++;

    countOutcome(resolution.firstPlane);
    if (resolution.secondPlane) {
      countOutcome(resolution.secondPlane);
    }
  }

  const winRate = wins / rounds;
  const effectiveRtp = winRate * (ProbabilityController.PAYOUT_ON_WIN / ProbabilityController.BET);

  return {
    rounds,
    winRate,
    effectiveRtp,
    hitA: hitA / rounds,
    hitB: hitB / rounds,
    miss: miss / rounds,
    doublePlane: doublePlane / rounds,
    collapse: collapse / rounds,
  };

  function countOutcome(outcome: PlaneOutcome): void {
    if (outcome === 'hitA') hitA++;
    if (outcome === 'hitB') hitB++;
    if (outcome === 'miss') miss++;
  }
}
