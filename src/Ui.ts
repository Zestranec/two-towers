import { SimulationResults } from './Simulation';
import { TowerId } from './ProbabilityController';

/**
 * Manages all DOM UI elements for Twin Towers Dodge.
 * Communicates with Game.ts through callback registration and setter methods.
 */
export class Ui {
  private readonly el = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const e = document.getElementById(id) as T | null;
    if (!e) throw new Error(`UI: #${id} not found`);
    return e;
  };

  // ── Element references ───────────────────────────────────────────────────
  private readonly elBalance    = this.el('balance-val');
  private readonly elSeed       = this.el('seed-val');
  private readonly elState      = this.el('state-val');
  private readonly elMessage    = this.el('message-val');
  private readonly elTowerA     = this.el<HTMLButtonElement>('tower-a');
  private readonly elTowerB     = this.el<HTMLButtonElement>('tower-b');
  private readonly elPlay       = this.el<HTMLButtonElement>('btn-play');
  private readonly elSim        = this.el<HTMLButtonElement>('btn-sim');
  private readonly elPopup      = this.el('popup-overlay');
  private readonly elPopupIcon  = this.el('popup-icon');
  private readonly elPopupTitle = this.el('popup-title');
  private readonly elPopupSub   = this.el('popup-subtitle');
  private readonly elPopupAmt   = this.el('popup-amount');
  private readonly elPopupBtn   = this.el<HTMLButtonElement>('popup-btn');
  private readonly elFlash      = this.el('flash');

  private _selected: TowerId = 'A';

  constructor() {
    this.applyTowerSelection();
  }

  // ── Event bindings ───────────────────────────────────────────────────────

  onTowerSelect(cb: (tower: TowerId) => void): void {
    this.elTowerA.addEventListener('click', () => {
      this._selected = 'A';
      this.applyTowerSelection();
      cb('A');
    });
    this.elTowerB.addEventListener('click', () => {
      this._selected = 'B';
      this.applyTowerSelection();
      cb('B');
    });
  }

  onPlay(cb: () => void): void {
    this.elPlay.addEventListener('click', cb);
  }

  onSim(cb: () => void): void {
    this.elSim.addEventListener('click', cb);
  }

  // ── HUD setters ──────────────────────────────────────────────────────────

  setBalance(v: number): void    { this.elBalance.textContent = v.toFixed(0); }
  setSeed(hex: string): void     { this.elSeed.textContent = hex.slice(0, 8); }
  setState(s: string): void      { this.elState.textContent = s; }
  setMessage(msg: string): void  { this.elMessage.textContent = msg; }

  setPlayEnabled(on: boolean): void { this.elPlay.disabled = !on; }

  setPlayLabel(label: string): void { this.elPlay.textContent = label; }

  get selectedTower(): TowerId { return this._selected; }

  // ── Flash effect ─────────────────────────────────────────────────────────

  flash(type: 'win-flash' | 'lose-flash' | 'surprise-flash'): void {
    this.elFlash.className = '';
    void this.elFlash.offsetWidth; // force reflow to restart animation
    this.elFlash.className = type;
  }

  // ── Round result popup ───────────────────────────────────────────────────

  showRoundPopup(win: boolean, returned: number, onClose: () => void): void {
    this.elPopupIcon.textContent  = win ? '🏆' : '💥';
    this.elPopupTitle.textContent = win ? 'Tower Survived!' : 'Tower Destroyed!';
    this.elPopupSub.textContent   = win
      ? `Your chosen tower made it through. 2× returned.`
      : `Your tower was destroyed. Bet lost.`;
    this.elPopupAmt.textContent   = win ? `+${returned.toFixed(0)} FUN` : '−10 FUN';
    this.elPopupAmt.className     = win ? 'win' : 'lose';
    this.elPopupBtn.textContent   = '▶ PLAY AGAIN';
    this.elPopupBtn.className     = win ? 'win' : 'lose';

    this.elPopup.classList.add('visible');

    const handler = () => {
      this.elPopupBtn.removeEventListener('click', handler);
      this.elPopup.classList.remove('visible');
      onClose();
    };
    this.elPopupBtn.addEventListener('click', handler);
  }

  // ── Simulation modal ─────────────────────────────────────────────────────

  showSimulation(r: SimulationResults): void {
    const netPerRound = (r.winRate * r.rounds * 20 - r.rounds * 10) / r.rounds;

    const modal = document.createElement('div');
    modal.className = 'sim-modal';
    modal.innerHTML = `
      <div class="sim-card">
        <h3>📊 RTP Simulation · ${(r.rounds / 1000).toFixed(0)}k rounds</h3>
        <div class="sim-row">
          <span class="key">Effective RTP</span>
          <span class="val rtp">${(r.effectiveRtp * 100).toFixed(2)}%</span>
        </div>
        <div class="sim-row">
          <span class="key">Win rate</span>
          <span class="val">${(r.winRate * 100).toFixed(2)}%</span>
        </div>
        <div class="sim-row">
          <span class="key">Avg net / round</span>
          <span class="val">${netPerRound >= 0 ? '+' : ''}${netPerRound.toFixed(3)} FUN</span>
        </div>
        <div class="sim-row">
          <span class="key">Hit Tower A</span>
          <span class="val">${(r.hitA * 100).toFixed(2)}%</span>
        </div>
        <div class="sim-row">
          <span class="key">Hit Tower B</span>
          <span class="val">${(r.hitB * 100).toFixed(2)}%</span>
        </div>
        <div class="sim-row">
          <span class="key">Plane miss</span>
          <span class="val">${(r.miss * 100).toFixed(2)}%</span>
        </div>
        <div class="sim-row">
          <span class="key">Double-plane events</span>
          <span class="val">${(r.doublePlane * 100).toFixed(2)}%</span>
        </div>
        <div class="sim-row">
          <span class="key">Self-collapse events</span>
          <span class="val">${(r.collapse * 100).toFixed(2)}%</span>
        </div>
        <button id="close-sim">Close</button>
      </div>
    `;

    modal.querySelector<HTMLButtonElement>('#close-sim')!
      .addEventListener('click', () => modal.remove());
    document.body.appendChild(modal);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private applyTowerSelection(): void {
    this.elTowerA.classList.toggle('selected', this._selected === 'A');
    this.elTowerB.classList.toggle('selected', this._selected === 'B');
  }
}
