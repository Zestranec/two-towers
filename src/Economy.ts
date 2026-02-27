/**
 * Manages player balance and round economics.
 */
export class Economy {
  private _balance: number;
  private _roundValue: number = 0;
  private _multiplier: number = 1.0;
  private _swipeCount: number = 0;
  private _roundCost: number = 10;
  private _multiplierStep: number = 1.1;

  constructor(initialBalance: number = 1000) {
    this._balance = initialBalance;
  }

  get balance(): number { return this._balance; }
  get roundValue(): number { return this._roundValue; }
  get multiplier(): number { return this._multiplier; }
  get swipeCount(): number { return this._swipeCount; }
  get roundCost(): number { return this._roundCost; }

  canStartRound(): boolean {
    return this._balance >= this._roundCost;
  }

  startRound(): boolean {
    if (!this.canStartRound()) return false;
    this._balance -= this._roundCost;
    this._roundValue = this._roundCost;
    this._multiplier = 1.0;
    this._swipeCount = 0;
    return true;
  }

  onSafeSwipe(): void {
    this._swipeCount++;
    this._multiplier = parseFloat(
      Math.pow(this._multiplierStep, this._swipeCount).toFixed(4)
    );
    this._roundValue = parseFloat(
      (this._roundCost * this._multiplier).toFixed(2)
    );
  }

  cashOut(): number {
    const profit = this._roundValue;
    this._balance = parseFloat((this._balance + profit).toFixed(2));
    this._roundValue = 0;
    return profit;
  }

  onBomb(): void {
    this._roundValue = 0;
  }

  formatBalance(): string {
    return this._balance.toFixed(0);
  }

  formatRoundValue(): string {
    return this._roundValue.toFixed(2);
  }

  formatMultiplier(): string {
    return `×${this._multiplier.toFixed(2)}`;
  }
}
