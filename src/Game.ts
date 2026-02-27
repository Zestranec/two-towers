import * as PIXI from 'pixi.js';
import { Rng } from './Rng';
import { PlaneOutcome, ProbabilityController, RoundResolution, TowerId } from './ProbabilityController';
import { Ui } from './Ui';
import { simulate } from './Simulation';

type GameState = 'idle' | 'betting' | 'flying' | 'resolve' | 'win' | 'lose';

// ── Tower geometry ────────────────────────────────────────────────────────────
const TW = 88;   // tower width
const TH = 205;  // tower body height
const TR = 12;   // tower corner radius
const RH = 44;   // roof block height

// ── Color palettes ────────────────────────────────────────────────────────────
interface TowerPalette { body: number; accent: number; window: number; roof: number; }

const PA: TowerPalette = { body: 0x4f6ef5, accent: 0x8aa0ff, window: 0xc8d8ff, roof: 0x3350d6 }; // Tower A – blue
const PB: TowerPalette = { body: 0xee5aa2, accent: 0xff9fd4, window: 0xffd6ee, roof: 0xc43787 }; // Tower B – pink

export class Game {
  private readonly app: PIXI.Application;
  private readonly ui: Ui;
  private readonly rng: Rng;
  private readonly probability: ProbabilityController;

  private state: GameState = 'idle';
  private selectedTower: TowerId = 'A';
  private balance = 1000;

  // ── Scene graph ───────────────────────────────────────────────────────────
  private readonly root        = new PIXI.Container();
  private readonly bgGfx       = new PIXI.Graphics();
  private readonly groundGfx   = new PIXI.Graphics();
  private readonly towerA      = new PIXI.Container();
  private readonly towerB      = new PIXI.Container();
  private readonly shadowGfx   = new PIXI.Graphics(); // plane ground shadow
  private readonly planeCtr    = new PIXI.Container();
  private readonly fxCtr       = new PIXI.Container(); // particles, halves, clouds
  private readonly textCtr     = new PIXI.Container();

  private readonly overlayText = new PIXI.Text('', new PIXI.TextStyle({
    fill: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    align: 'center',
    wordWrap: true,
    wordWrapWidth: 300,
    dropShadow: true,
    dropShadowBlur: 22,
    dropShadowDistance: 0,
    dropShadowColor: '#3322ff',
    stroke: '#00001e',
    strokeThickness: 5,
  }));

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.app = new PIXI.Application({
      view: canvas,
      resizeTo: window,
      antialias: true,
      backgroundColor: 0x090d1f,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    this.ui = new Ui();
    this.rng = new Rng();
    this.probability = new ProbabilityController(this.rng);

    // Layer ordering (back → front)
    this.app.stage.addChild(this.root);
    this.root.addChild(
      this.bgGfx,
      this.groundGfx,
      this.towerA,
      this.towerB,
      this.shadowGfx,
      this.planeCtr,
      this.fxCtr,
      this.textCtr,
    );
    this.textCtr.addChild(this.overlayText);
    this.overlayText.anchor.set(0.5);
    this.overlayText.visible = false;

    this.buildTower(this.towerA, PA);
    this.buildTower(this.towerB, PB);
    this.buildPlane();
    this.layout();

    window.addEventListener('resize', () => requestAnimationFrame(() => this.layout()));
    this.bindUi();
    this.enterBetting();
    this.ui.setBalance(this.balance);
    this.ui.setSeed(this.rng.getSeedHex());
  }

  // ── UI bindings ───────────────────────────────────────────────────────────

  private bindUi(): void {
    this.ui.onTowerSelect((t) => {
      if (this.state === 'betting') {
        this.selectedTower = t;
        this.applyTowerDim();
      }
    });
    this.ui.onPlay(async () => {
      if (this.state !== 'betting') return;
      await this.playRound();
    });
    this.ui.onSim(() => this.ui.showSimulation(simulate(200_000)));
  }

  // ── Game flow ─────────────────────────────────────────────────────────────

  private async playRound(): Promise<void> {
    if (this.balance < ProbabilityController.BET) {
      this.ui.setMessage('Not enough FUN!');
      return;
    }

    this.balance -= ProbabilityController.BET;
    this.ui.setBalance(this.balance);
    this.ui.setPlayEnabled(false);
    this.state = 'flying';
    this.ui.setState('flying');
    this.ui.setMessage('Plane incoming! Both towers dodge...');

    this.cleanupRound();    // destroy all FX from previous round
    this.resetTowers();

    const resolution = this.probability.resolveRound(this.selectedTower);
    await this.runAnimation(resolution);

    const win = resolution.selectedTowerWins;
    if (win) {
      this.balance += ProbabilityController.PAYOUT_ON_WIN;
      this.ui.setBalance(this.balance);
    }

    this.state = win ? 'win' : 'lose';
    this.ui.setState(this.state);
    this.ui.flash(win ? 'win-flash' : 'lose-flash');

    await this.sleep(180);
    this.ui.showRoundPopup(win, win ? ProbabilityController.PAYOUT_ON_WIN : 0, () => this.enterBetting());
  }

  private async runAnimation(res: RoundResolution): Promise<void> {
    // First plane: RIGHT → LEFT.  Tower wiggle runs concurrently.
    const wiggle = this.wiggleTowers(820);
    await this.flyPlane(res.firstPlane, false, false);
    await wiggle;

    // Self-collapse event (independent of plane hit)
    if (res.collapseTriggered && res.collapsedTower) {
      this.ui.setMessage("Maybe it wasn't the plane...");
      await this.showOverlay("Maybe it wasn't\nthe plane...");
      await this.animateCollapse(res.collapsedTower);
      await this.sleep(200);
    }

    // Double plane event: second plane flies LEFT → RIGHT
    if (res.secondPlaneTriggered && res.secondPlane) {
      this.ui.setMessage('NOT EXPECTING THAT?!');
      await this.dramaticZoom();
      await this.showOverlay('NOT EXPECTING\nTHAT?!');
      const wiggle2 = this.wiggleTowers(500);
      await this.flyPlane(res.secondPlane, true, true);   // leftToRight = true
      await wiggle2;
    }
  }

  private enterBetting(): void {
    this.cleanupRound();          // destroy all round FX before showing betting UI
    this.state = 'betting';
    this.ui.setState('betting');
    this.ui.setMessage('Pick a tower and press START.');
    this.ui.setPlayEnabled(true);
    this.ui.setPlayLabel('START ROUND');
    this.resetTowers();
    this.applyTowerDim();
  }

  /**
   * Destroys every temporary object spawned during a round:
   * particles, tower fragments, cloud puffs, wind streaks.
   * Also hides / resets the plane and its shadow.
   * Safe to call at any time (guards against already-destroyed objects).
   */
  private cleanupRound(): void {
    // Snapshot children before clearing so we can destroy them
    const kids = [...this.fxCtr.children];
    this.fxCtr.removeChildren();
    for (const c of kids) {
      if (!c.destroyed) c.destroy({ children: true });
    }

    // Reset plane
    this.planeCtr.visible  = false;
    this.planeCtr.rotation = 0;
    this.planeCtr.alpha    = 1;
    this.planeCtr.scale.set(1);

    // Reset shadow
    this.shadowGfx.visible = false;
    this.shadowGfx.alpha   = 1;

    // Hide overlay text (in case a showOverlay was mid-flight)
    this.overlayText.visible = false;
  }

  // ── Plane flight (horizontal) ─────────────────────────────────────────────

  /**
   * Flies the plane horizontally, then branches:
   *   hit  → flyToImpact  (straight into tower, explosion)
   *   miss → flyMiss      (approach, dodge, bank upward, exit off top)
   *
   *  leftToRight = false  →  RIGHT → LEFT  (first plane)
   *  leftToRight = true   →  LEFT  → RIGHT (second plane)
   *
   * Outcome is pre-determined by ProbabilityController; animation follows it.
   */
  private async flyPlane(outcome: PlaneOutcome, fast: boolean, leftToRight: boolean): Promise<void> {
    const W      = this.app.screen.width;
    const H      = this.app.screen.height;
    const groundY = H * 0.82;

    // Cruise altitude: ~52% up the tower body, slight random variance
    const flightY = groundY - TH * 0.52 + (this.rng.next() - 0.5) * TH * 0.10;

    const margin = 130;
    const startX = leftToRight ? -margin : W + margin;

    // Flip plane graphic to face travel direction (nose is drawn pointing left)
    this.planeCtr.scale.set(leftToRight ? -1 : 1, 1);
    this.planeCtr.position.set(startX, flightY);
    this.planeCtr.rotation = 0;
    this.planeCtr.alpha    = 1;
    this.planeCtr.visible  = true;
    this.shadowGfx.visible = true;

    if (outcome === 'hitA' || outcome === 'hitB') {
      await this.flyToImpact(outcome, startX, flightY, groundY, fast);
    } else {
      await this.flyMiss(startX, flightY, groundY, fast, leftToRight);
    }

    this.planeCtr.visible  = false;
    this.planeCtr.rotation = 0;
    this.planeCtr.alpha    = 1;
    this.shadowGfx.visible = false;
  }

  /**
   * Hit path: fly straight into the target tower and trigger the explosion break.
   */
  private async flyToImpact(
    outcome: 'hitA' | 'hitB',
    startX: number,
    flightY: number,
    groundY: number,
    fast: boolean,
  ): Promise<void> {
    const tower   = outcome === 'hitA' ? this.towerA : this.towerB;
    const impactX = tower.x;

    await this.tween(fast ? 360 : 640, (t) => {
      this.planeCtr.x      = startX + (impactX - startX) * t;
      this.planeCtr.y      = flightY;
      this.shadowGfx.x     = this.planeCtr.x;
      this.shadowGfx.y     = groundY + 8;
      this.shadowGfx.alpha = 0.1 + t * 0.18;
      this.shadowGfx.scale.set(0.8 + t * 0.4, 1);
    });

    this.planeCtr.visible  = false;
    this.shadowGfx.visible = false;
    await this.playExplosionAndBreakTower(outcome === 'hitA' ? 'A' : 'B', impactX, flightY);
  }

  /**
   * Miss path — 3 phases:
   *
   *  Phase 1 — Horizontal approach to the midpoint between towers.
   *  Phase 2 — Smooth bank-and-climb: plane rotates nose-up and starts ascending.
   *  Phase 3 — Vertical escape: flies straight up and exits off the top of the screen.
   *
   * Cloud / whoosh FX fires at both towers the moment phase 2 begins (near miss).
   *
   * Rotation maths (PixiJS y-down, positive = CW):
   *   RTL (scale.x=+1, nose points left):  rotate +π/2  →  nose points UP
   *   LTR (scale.x=−1, nose points right): rotate −π/2  →  nose points UP
   */
  private async flyMiss(
    startX: number,
    flightY: number,
    groundY: number,
    fast: boolean,
    leftToRight: boolean,
  ): Promise<void> {
    // Midpoint between the two towers (safe "pass-through" x)
    const midX = (this.towerA.x + this.towerB.x) / 2;

    // Final rotation that makes the nose face upward for each direction
    const escapeRotation = leftToRight ? -Math.PI / 2 : Math.PI / 2;

    // ── Phase 1: Horizontal approach ─────────────────────────────────────────
    const approachSpeed  = fast ? 900 : 560; // px/s
    const phase1Dist     = Math.abs(startX - midX);
    const phase1Duration = (phase1Dist / approachSpeed) * 1000;

    await this.tween(phase1Duration, (t) => {
      this.planeCtr.x      = startX + (midX - startX) * t;
      this.planeCtr.y      = flightY;
      this.shadowGfx.x     = this.planeCtr.x;
      this.shadowGfx.y     = groundY + 8;
      this.shadowGfx.alpha = t * 0.25;
      this.shadowGfx.scale.set(0.8 + t * 0.3, 1);
    });

    // Near-miss FX: cloud puffs at both towers + subtle camera shake
    this.playDodgeCloudFx(this.towerA.x, flightY);
    this.playDodgeCloudFx(this.towerB.x, flightY);
    this.subtleShake();

    // ── Phase 2: Bank-and-climb ───────────────────────────────────────────────
    // Plane rotates nose-up while pulling into the climb (easeInQuad on rotation,
    // easeOutCubic on vertical position so it starts gently and accelerates).
    const phase2Duration = fast ? 300 : 420;
    const climbStart     = 70; // px gained upward by end of phase 2

    await this.tween(phase2Duration, (t) => {
      this.planeCtr.x        = midX;
      this.planeCtr.y        = flightY - this.easeOutCubic(t) * climbStart;
      this.planeCtr.rotation = escapeRotation * this.easeInQuad(t);
      this.shadowGfx.x       = midX;
      this.shadowGfx.alpha   = (1 - t) * 0.18;
    });

    this.shadowGfx.visible = false;

    // ── Phase 3: Vertical escape ──────────────────────────────────────────────
    const escapeStartY = flightY - climbStart;
    const exitY        = -150;                 // well above the screen top
    const escapeSpeed  = approachSpeed * 1.3;
    const phase3Duration = ((escapeStartY - exitY) / escapeSpeed) * 1000;

    await this.tween(phase3Duration, (t) => {
      this.planeCtr.x     = midX;
      this.planeCtr.y     = escapeStartY + (exitY - escapeStartY) * t;
      // Gentle fade-out as the plane exits the top edge
      this.planeCtr.alpha = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
    });

    this.planeCtr.alpha = 1;
  }

  // ── FX: miss (cloud / whoosh) ─────────────────────────────────────────────

  /**
   * Cartoon cloud puff + horizontal wind streaks at (x, y).
   * Used when the plane narrowly misses a tower.
   */
  private playDodgeCloudFx(x: number, y: number): void {
    // Cloud puffs — 3 overlapping circles form each puff
    const puffCount = 4;
    for (let i = 0; i < puffCount; i++) {
      const cloud = new PIXI.Graphics();
      const r = 14 + i * 5;
      cloud.beginFill(0xffffff, 0.82);
      cloud.drawCircle(0,          0,      r);
      cloud.drawCircle(r * 0.85,   r * 0.25, r * 0.68);
      cloud.drawCircle(-r * 0.72,  r * 0.25, r * 0.60);
      cloud.endFill();

      const ox = (this.rng.next() - 0.5) * 50;
      const oy = (this.rng.next() - 0.5) * 30;
      cloud.position.set(x + ox, y + oy);
      cloud.scale.set(0.4);
      this.fxCtr.addChild(cloud);

      const delay = i * 60;
      setTimeout(() => {
        this.tween(600, (t) => {
          cloud.scale.set(0.4 + t * 1.4);
          cloud.alpha = (1 - t) * 0.82;
          cloud.y = y + oy - t * 28;
        }).then(() => { if (!cloud.destroyed) cloud.destroy(); });
      }, delay);
    }

    // Horizontal wind streaks (cartoon speed lines)
    for (let i = 0; i < 6; i++) {
      const lx  = x + (this.rng.next() - 0.5) * TW * 1.4;
      const ly  = y + (this.rng.next() - 0.5) * TH * 0.55;
      const len = 22 + this.rng.next() * 44;
      const dir = this.rng.chance(0.5) ? 1 : -1;

      const line = new PIXI.Graphics();
      line.lineStyle(2.5, 0xffffff, 0.75);
      line.moveTo(-len / 2, 0);
      line.lineTo( len / 2, 0);
      line.lineStyle(0);
      line.position.set(lx, ly);
      this.fxCtr.addChild(line);

      this.tween(380 + i * 40, (t) => {
        line.x     = lx + dir * t * 80;
        line.alpha = 1 - t;
        line.scale.x = 1 + t * 0.6;
      }).then(() => { if (!line.destroyed) line.destroy(); });
    }
  }

  // ── FX: hit (explosion + tower break) ────────────────────────────────────

  /**
   * Explosion flash + particle burst, then splits the tower into a top and
   * bottom half which separate with cartoon gravity.
   */
  private async playExplosionAndBreakTower(
    towerId: TowerId,
    impactX: number,
    impactY: number,
  ): Promise<void> {
    const tower   = towerId === 'A' ? this.towerA : this.towerB;
    const palette = towerId === 'A' ? PA : PB;
    const dir     = towerId === 'A' ? -1 : 1; // which direction the top half flies

    // Hide the intact tower — its halves take over visually
    tower.visible = false;

    // Build the two halves positioned exactly where the tower was
    const topHalf = this.buildTowerTopHalf(palette);
    const botHalf = this.buildTowerBottomHalf(palette);
    topHalf.position.copyFrom(tower.position);
    botHalf.position.copyFrom(tower.position);
    this.fxCtr.addChild(botHalf, topHalf);

    // ── Expanding flash ring ──
    const ring = new PIXI.Graphics();
    ring.lineStyle(6, 0xffffff, 0.95);
    ring.drawCircle(0, 0, 12);
    ring.lineStyle(0);
    ring.beginFill(0xfffde0, 0.7);
    ring.drawCircle(0, 0, 12);
    ring.endFill();
    ring.position.set(impactX, impactY);
    this.fxCtr.addChild(ring);

    // Animate flash
    this.tween(420, (t) => {
      ring.scale.set(1 + t * 9);
      ring.alpha  = (1 - t) * 0.9;
    }).then(() => { if (!ring.destroyed) ring.destroy(); });

    // ── Secondary inner flash ──
    const core = new PIXI.Graphics();
    core.beginFill(0xffffff, 1.0);
    core.drawCircle(0, 0, 8);
    core.endFill();
    core.position.set(impactX, impactY);
    this.fxCtr.addChild(core);
    this.tween(200, (t) => {
      core.scale.set(1 + t * 5);
      core.alpha = 1 - t;
    }).then(() => { if (!core.destroyed) core.destroy(); });

    // ── Particle burst ──
    this.spawnImpactParticles(impactX, impactY, palette.accent);
    this.spawnDebris(impactX, impactY, palette.accent, 30);

    // ── Top half: flies upward + rotates away ──
    // Fire-and-forget: guard all callbacks so a cleanupRound() mid-animation is safe.
    const topStartY = tower.y;
    const topStartX = tower.x;
    this.tween(900, (t) => {
      if (topHalf.destroyed) return;
      const e = this.easeOutCubic(t);
      topHalf.x        = topStartX + dir * e * 100;
      topHalf.y        = topStartY - e * 200;
      topHalf.rotation = dir * e * 1.1;
      topHalf.alpha    = 1 - t * 0.6;
    }).then(() => {
      if (topHalf.destroyed) return;
      this.tween(300, (t) => {
        if (!topHalf.destroyed) topHalf.alpha = 0.4 - t * 0.4;
      }).then(() => { if (!topHalf.destroyed) topHalf.destroy({ children: true }); });
    });

    // ── Bottom half: shudder + squash inward then lean ──
    const botStartX = tower.x;
    const botStartY = tower.y;
    await this.tween(650, (t) => {
      if (botHalf.destroyed) return;
      const e  = this.easeInQuad(t);
      const shake = t < 0.3 ? Math.sin(t * Math.PI * 10) * (1 - t / 0.3) * 6 : 0;
      botHalf.x        = botStartX + shake;
      botHalf.y        = botStartY;
      botHalf.rotation = dir * e * 0.28;
      botHalf.scale.set(1 + e * 0.12, 1 - e * 0.35);
      botHalf.alpha    = 1 - e * 0.4;
    });
  }

  // ── Tower-half builders ───────────────────────────────────────────────────

  /**
   * Redraws the top half of a tower (roof + antenna + upper body portion).
   * Pivot at y=0 (same as the full tower) so positioning is identical.
   */
  private buildTowerTopHalf(p: TowerPalette): PIXI.Container {
    const c  = new PIXI.Container();
    const hw = TW / 2;
    const splitY = -TH / 2; // horizontal cut line

    // Upper body (splitY to -TH)
    const body = new PIXI.Graphics();
    body.beginFill(p.body);
    body.drawRect(-hw, -TH, TW, TH / 2);  // flat bottom at splitY
    body.endFill();

    // Accent band at very top
    body.beginFill(p.accent, 0.5);
    body.drawRect(-hw, -TH, TW, 22);
    body.endFill();

    // Windows — top 2 rows only
    body.beginFill(p.window, 0.9);
    const ww = 15, wh = 11;
    const colGap = TW / 4;
    const rowGap = TH / 6;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const wx = -hw + colGap * (col + 1) - ww / 2;
        const wy = -TH  + rowGap * (row + 1) - wh / 2;
        body.drawRoundedRect(wx, wy, ww, wh, 3);
      }
    }
    body.endFill();
    c.addChild(body);

    // Roof / penthouse
    const rw   = TW - 18;
    const roof = new PIXI.Graphics();
    roof.beginFill(p.roof);
    roof.drawRoundedRect(-rw / 2, -TH - RH, rw, RH, 8);
    roof.endFill();

    // Antenna mast
    roof.beginFill(0xffffff, 0.85);
    roof.drawRoundedRect(-3, -TH - RH - 34, 6, 34, 3);
    roof.endFill();

    roof.beginFill(p.accent);
    roof.drawCircle(0, -TH - RH - 37, 5);
    roof.endFill();

    roof.beginFill(0xff4040, 0.92);
    roof.drawCircle(0, -TH - RH - 37, 2.5);
    roof.endFill();

    c.addChild(roof);
    return c;
  }

  /**
   * Redraws the bottom half of a tower (lower body portion + base shadow).
   * Pivot at y=0, same as full tower.
   */
  private buildTowerBottomHalf(p: TowerPalette): PIXI.Container {
    const c  = new PIXI.Container();
    const hw = TW / 2;

    // Base shadow
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.28);
    shadow.drawEllipse(0, 6, hw + 14, 12);
    shadow.endFill();
    c.addChild(shadow);

    // Lower body (y = -TH/2 to y = 0)
    const body = new PIXI.Graphics();
    body.beginFill(p.body);
    body.drawRect(-hw, -TH / 2, TW, TH / 2);
    body.endFill();

    // Windows — bottom 3 rows
    body.beginFill(p.window, 0.9);
    const ww = 15, wh = 11;
    const colGap = TW / 4;
    const rowGap = TH / 6;
    for (let row = 2; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        const wx = -hw + colGap * (col + 1) - ww / 2;
        const wy = -TH  + rowGap * (row + 1) - wh / 2;
        body.drawRoundedRect(wx, wy, ww, wh, 3);
      }
    }
    body.endFill();

    // Floor lines
    body.beginFill(0x000000, 0.12);
    for (let i = 3; i <= 4; i++) {
      body.drawRect(-hw, -TH + rowGap * i - 1, TW, 2);
    }
    body.endFill();

    c.addChild(body);
    return c;
  }

  // ── Wiggle / collapse / zoom / overlay ───────────────────────────────────

  private wiggleTowers(durationMs: number): Promise<void> {
    const start = performance.now();
    return new Promise((resolve) => {
      const step = (now: number) => {
        const elapsed = now - start;
        const t       = Math.min(1, elapsed / durationMs);
        const wA = Math.sin(elapsed * 0.019);
        const wB = Math.sin(elapsed * 0.019 + Math.PI);
        const s  = Math.sin(elapsed * 0.026);

        this.towerA.rotation = wA * 0.044;
        this.towerB.rotation = wB * 0.044;
        this.towerA.scale.set(1 + s * 0.028, 1 - s * 0.028);
        this.towerB.scale.set(1 - s * 0.028, 1 + s * 0.028);

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          this.towerA.rotation = 0; this.towerB.rotation = 0;
          this.towerA.scale.set(1); this.towerB.scale.set(1);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  private async animateCollapse(tower: TowerId): Promise<void> {
    const t   = tower === 'A' ? this.towerA : this.towerB;
    const dir = tower === 'A' ? -1 : 1;
    const cx  = t.x;
    const cy  = t.y - TH * 0.45;
    this.spawnDebris(cx, cy, tower === 'A' ? PA.accent : PB.accent, 30);

    await this.tween(540, (p) => {
      const e = this.easeInQuad(p);
      t.rotation = dir * e * 1.25;
      t.scale.set(1 + e * 0.18, 1 - e * 0.65);
      t.alpha = 1 - e * 0.45;
    });
  }

  private async dramaticZoom(): Promise<void> {
    this.ui.flash('surprise-flash');
    await this.tween(340, (t) => {
      const zoom = 1 + Math.sin(t * Math.PI) * 0.15;
      this.root.scale.set(zoom);
      this.root.x = this.app.screen.width  * (1 - zoom) * 0.5;
      this.root.y = this.app.screen.height * (1 - zoom) * 0.5;
    });
    this.root.scale.set(1);
    this.root.position.set(0, 0);
  }

  private async showOverlay(text: string): Promise<void> {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    this.overlayText.text = text;
    this.overlayText.style.wordWrapWidth = W * 0.82;
    this.overlayText.position.set(W * 0.5, H * 0.2);
    this.overlayText.alpha = 0;
    this.overlayText.visible = true;

    await this.tween(580, (t) => {
      const wave = Math.sin(t * Math.PI);
      this.overlayText.alpha = wave;
      this.overlayText.scale.set(0.82 + wave * 0.22);
    });
    this.overlayText.visible = false;
  }

  /** Subtle world-space camera shake (used on near-miss). */
  private subtleShake(): void {
    const ox = this.root.x;
    const oy = this.root.y;
    this.tween(320, (t) => {
      const amp = Math.sin(t * Math.PI * 8) * (1 - t) * 5;
      this.root.x = ox + amp;
      this.root.y = oy + amp * 0.4;
    }).then(() => {
      this.root.x = ox;
      this.root.y = oy;
    });
  }

  // ── Scene building ────────────────────────────────────────────────────────

  /**
   * Cartoon tower: pivot at bottom-centre (y=0 = ground line).
   */
  private buildTower(c: PIXI.Container, p: TowerPalette): void {
    c.removeChildren();
    const hw = TW / 2;

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.28);
    shadow.drawEllipse(0, 6, hw + 14, 12);
    shadow.endFill();
    c.addChild(shadow);

    const body = new PIXI.Graphics();
    body.beginFill(p.body);
    body.drawRoundedRect(-hw, -TH, TW, TH, TR);
    body.endFill();

    body.beginFill(p.accent, 0.45);
    body.drawRoundedRect(-hw, -TH, TW, 28, TR);
    body.endFill();

    body.beginFill(p.window, 0.9);
    const ww = 15, wh = 11;
    const colGap = TW / 4;
    const rowGap = TH / 6;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        const wx = -hw + colGap * (col + 1) - ww / 2;
        const wy = -TH  + rowGap * (row + 1) - wh / 2;
        body.drawRoundedRect(wx, wy, ww, wh, 3);
      }
    }
    body.endFill();

    body.beginFill(0x000000, 0.12);
    for (let i = 1; i <= 4; i++) {
      body.drawRect(-hw, -TH + rowGap * i - 1, TW, 2);
    }
    body.endFill();
    c.addChild(body);

    const rw = TW - 18;
    const roof = new PIXI.Graphics();
    roof.beginFill(p.roof);
    roof.drawRoundedRect(-rw / 2, -TH - RH, rw, RH, 8);
    roof.endFill();

    roof.beginFill(0xffffff, 0.85);
    roof.drawRoundedRect(-3, -TH - RH - 34, 6, 34, 3);
    roof.endFill();

    roof.beginFill(p.accent);
    roof.drawCircle(0, -TH - RH - 37, 5);
    roof.endFill();

    roof.beginFill(0xff4040, 0.92);
    roof.drawCircle(0, -TH - RH - 37, 2.5);
    roof.endFill();

    c.addChild(roof);
  }

  /**
   * Cartoon plane drawn for HORIZONTAL LEFT-WARD flight.
   * Nose points in the -X (left) direction.
   * Flip scale.x = -1 to reverse for LEFT → RIGHT.
   */
  private buildPlane(): void {
    this.planeCtr.removeChildren();

    // Wings (spread UP and DOWN from mid-fuselage)
    const wings = new PIXI.Graphics();
    wings.beginFill(0x7aaeff);
    wings.drawPolygon([-10, -12, 14, -54, 24, -54, 4, -12]);   // upper wing
    wings.drawPolygon([-10,  12, 14,  54, 24,  54, 4,  12]);   // lower wing
    wings.endFill();

    // Tail stabilizers (right/back end)
    wings.beginFill(0x7aaeff);
    wings.drawPolygon([28, -12, 48, -28, 52, -28, 30, -12]); // upper tail
    wings.drawPolygon([28,  12, 48,  28, 52,  28, 30,  12]); // lower tail
    wings.endFill();

    this.planeCtr.addChild(wings);

    // Fuselage body (horizontal, wider than tall)
    const body = new PIXI.Graphics();
    body.beginFill(0xddeeff);
    body.drawRoundedRect(-56, -14, 92, 28, 14);
    body.endFill();

    // Nose cone — pointed left
    body.beginFill(0x4a8fe8);
    body.moveTo(-56, -13);
    body.lineTo(-56,  13);
    body.lineTo(-78,   0);
    body.closePath();
    body.endFill();

    // Cockpit glass (just behind nose)
    body.beginFill(0x4a8fe8, 0.85);
    body.drawRoundedRect(-48, -10, 22, 20, 5);
    body.endFill();

    // Engine stripe (decorative detail near wing root)
    body.beginFill(0xaacaff, 0.4);
    body.drawRoundedRect(0, -9, 20, 18, 5);
    body.endFill();

    this.planeCtr.addChild(body);
    this.planeCtr.visible = false;

    // Ground shadow — horizontally elongated ellipse
    this.shadowGfx.clear();
    this.shadowGfx.beginFill(0x000000, 0.28);
    this.shadowGfx.drawEllipse(0, 0, 58, 12);
    this.shadowGfx.endFill();
    this.shadowGfx.visible = false;
  }

  // ── Layout & background ───────────────────────────────────────────────────

  private layout(): void {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const groundY = H * 0.82;

    this.drawBackground(W, H, groundY);

    this.towerA.position.set(W * 0.27, groundY);
    this.towerB.position.set(W * 0.73, groundY);

    this.overlayText.style.wordWrapWidth = W * 0.8;
    this.overlayText.position.set(W * 0.5, H * 0.2);

    this.applyTowerDim();
  }

  private drawBackground(W: number, H: number, groundY: number): void {
    this.bgGfx.clear();

    this.bgGfx.beginFill(0x090d1f);
    this.bgGfx.drawRect(0, 0, W, H);
    this.bgGfx.endFill();

    // Stars (deterministic, no RNG state pollution)
    for (let i = 0; i < 90; i++) {
      const sx    = ((i * 137 + 11) % 997) / 997 * W;
      const sy    = ((i * 251 + 29) % 991) / 991 * groundY * 0.94;
      const sz    = i % 5 === 0 ? 2.0 : i % 3 === 0 ? 1.4 : 0.9;
      const alpha = 0.22 + (i % 9) * 0.07;
      this.bgGfx.beginFill(0xffffff, alpha);
      this.bgGfx.drawCircle(sx, sy, sz);
      this.bgGfx.endFill();
    }

    this.bgGfx.beginFill(0x1c3285, 0.22);
    this.bgGfx.drawEllipse(W * 0.5, groundY, W * 0.6, 60);
    this.bgGfx.endFill();

    this.groundGfx.clear();
    this.groundGfx.beginFill(0x0e1628);
    this.groundGfx.drawRect(0, groundY, W, H - groundY);
    this.groundGfx.endFill();

    this.groundGfx.beginFill(0x2a3f65, 0.85);
    this.groundGfx.drawRect(0, groundY, W, 3);
    this.groundGfx.endFill();

    this.groundGfx.lineStyle(1, 0x1e3055, 0.6);
    for (let i = 1; i <= 5; i++) {
      const y = groundY + (H - groundY) * (i / 6);
      const xOff = (i / 6) * W * 0.25;
      this.groundGfx.moveTo(xOff, y);
      this.groundGfx.lineTo(W - xOff, y);
    }
    for (let i = 0; i <= 6; i++) {
      const bx = (i / 6) * W;
      this.groundGfx.moveTo(W * 0.5, groundY);
      this.groundGfx.lineTo(bx, H);
    }
    this.groundGfx.lineStyle(0);
  }

  // ── Generic particle effects ──────────────────────────────────────────────

  private spawnImpactParticles(x: number, y: number, color: number): void {
    for (let i = 0; i < 20; i++) {
      const g = new PIXI.Graphics();
      g.beginFill(i % 3 === 0 ? 0xffd740 : color);
      g.drawCircle(0, 0, 2 + this.rng.next() * 3.5);
      g.endFill();
      g.position.set(x, y);
      this.fxCtr.addChild(g);
      const angle = this.rng.next() * Math.PI * 2;
      const spd   = 2.5 + this.rng.next() * 5;
      this.tween(460, (t) => {
        g.x = x + Math.cos(angle) * spd * 55 * t;
        g.y = y + Math.sin(angle) * spd * 55 * t + 90 * t * t;
        g.alpha = 1 - t;
        g.scale.set(1 + t * 0.6);
      }).then(() => { if (!g.destroyed) g.destroy(); });
    }
  }

  private spawnDebris(x: number, y: number, color: number, count = 22): void {
    for (let i = 0; i < count; i++) {
      const g = new PIXI.Graphics();
      g.beginFill(this.rng.chance(0.55) ? color : 0xffffff);
      const dw = 3 + this.rng.next() * 6;
      const dh = 3 + this.rng.next() * 6;
      g.drawRect(-dw / 2, -dh / 2, dw, dh);
      g.endFill();
      g.position.set(x, y);
      this.fxCtr.addChild(g);
      const angle = -Math.PI / 2 + (this.rng.next() - 0.5) * 2.4;
      const spd   = 1.5 + this.rng.next() * 4.5;
      const spin  = (this.rng.next() - 0.5) * 0.55;
      this.tween(720, (t) => {
        g.x        = x + Math.cos(angle) * spd * 85 * t;
        g.y        = y + Math.sin(angle) * spd * 85 * t + 300 * t * t;
        g.rotation = spin * t * 20;
        g.alpha    = 1 - t;
      }).then(() => { if (!g.destroyed) g.destroy(); });
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private tween(durationMs: number, onUpdate: (t: number) => void): Promise<void> {
    const start = performance.now();
    return new Promise((resolve) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        onUpdate(t);
        t < 1 ? requestAnimationFrame(step) : resolve();
      };
      requestAnimationFrame(step);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private easeOutCubic(t: number): number { return 1 - (1 - t) ** 3; }
  private easeInQuad(t: number):   number { return t * t; }

  private resetTowers(): void {
    for (const t of [this.towerA, this.towerB]) {
      t.visible  = true;   // restore after a break-animation hid it
      t.rotation = 0;
      t.scale.set(1);
      t.alpha = 1;
    }
  }

  /**
   * Dims the non-selected tower during betting so the player's pick is clear.
   */
  private applyTowerDim(): void {
    if (this.state !== 'betting') return;
    this.towerA.alpha = this.selectedTower === 'A' ? 1.0 : 0.48;
    this.towerB.alpha = this.selectedTower === 'B' ? 1.0 : 0.48;
  }
}
