import * as PIXI from 'pixi.js';
import { CardData, CardKind } from './Card';

// Per-card animation state — attached to each card container via __animData
interface CardAnimData {
  kind: CardKind;
  emojiText: PIXI.Text;
  titleText: PIXI.Text;
  emojiBaseX: number;
  emojiBaseY: number;
  // catceo
  catStamp?: PIXI.Text;
  // ramen
  steamDots?: Array<{ g: PIXI.Graphics; baseY: number; speed: number }>;
  // mindfulness
  ringGfx?: { g: PIXI.Graphics; cx: number; cy: number; baseR: number };
  // cleaning
  sweepDot?: { g: PIXI.Graphics; maxX: number; baseY: number };
  // pizza
  flameDots?: Array<{ g: PIXI.Graphics; startY: number; baseOpacity: number; speed: number }>;
  // dog
  dogBubble?: PIXI.Text;
}

/**
 * Handles all PixiJS rendering: background gradients, card canvases,
 * particle systems, swipe transitions, and per-card idle animations.
 */
export class Renderer {
  app: PIXI.Application;
  private cardContainer: PIXI.Container;
  private currentCard: PIXI.Container | null = null;
  private nextCard: PIXI.Container | null = null;
  private particles: PIXI.Container;
  private particleList: ParticleSprite[] = [];
  private _isAnimating: boolean = false;
  private animHandler: ((delta: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;

    this.app = new PIXI.Application({
      view: canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      resolution: dpr,
      autoDensity: true,
      backgroundColor: 0x0a0a0f,
      antialias: true,
    });

    this.cardContainer = new PIXI.Container();
    this.particles = new PIXI.Container();
    this.app.stage.addChild(this.cardContainer);
    this.app.stage.addChild(this.particles);

    this.app.ticker.add(this.onTick.bind(this));
    window.addEventListener('resize', this.onResize.bind(this));
  }

  get isAnimating(): boolean { return this._isAnimating; }
  get width(): number { return this.app.screen.width; }
  get height(): number { return this.app.screen.height; }

  private onResize(): void {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    if (this.currentCard) {
      this.positionCard(this.currentCard, 0);
    }
  }

  // ─── Card creation ────────────────────────────────────────────────────────

  /** Creates a PixiJS card graphic from CardData, with animation extras attached. */
  createCardGraphic(card: CardData): PIXI.Container {
    const W = this.width;
    const H = this.height;
    const container = new PIXI.Container();

    // Gradient background (40 horizontal strips)
    const bg = new PIXI.Graphics();
    const c1 = parseInt(card.gradient[0].replace('#', ''), 16);
    const c2 = parseInt(card.gradient[1].replace('#', ''), 16);
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = lerp((c1 >> 16) & 0xff, (c2 >> 16) & 0xff, t);
      const g = lerp((c1 >> 8) & 0xff, (c2 >> 8) & 0xff, t);
      const b = lerp(c1 & 0xff, c2 & 0xff, t);
      const color = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
      bg.beginFill(color);
      bg.drawRect(0, (H / steps) * i, W, H / steps + 1);
      bg.endFill();
    }
    container.addChild(bg);

    // Grid overlay
    const grid = new PIXI.Graphics();
    grid.lineStyle(1, 0xffffff, 0.04);
    for (let x = 0; x < W; x += 40) { grid.moveTo(x, 0); grid.lineTo(x, H); }
    for (let y = 0; y < H; y += 40) { grid.moveTo(0, y); grid.lineTo(W, y); }
    container.addChild(grid);

    // Radial glow
    const glowGfx = new PIXI.Graphics();
    const accentHex = parseInt(card.accentColor.replace('#', ''), 16);
    glowGfx.beginFill(accentHex, 0.12);
    glowGfx.drawCircle(W / 2, H / 2, Math.min(W, H) * 0.55);
    glowGfx.endFill();
    container.addChild(glowGfx);

    // Emoji
    const emojiStyle = new PIXI.TextStyle({ fontSize: Math.min(W * 0.30, 150), align: 'center' });
    const emojiText = new PIXI.Text(card.emoji, emojiStyle);
    emojiText.anchor.set(0.5);
    emojiText.x = W / 2;
    emojiText.y = H * 0.38;
    container.addChild(emojiText);

    // Title — smaller font + wordWrap to handle long uppercase strings
    const titleStyle = new PIXI.TextStyle({
      fontSize: Math.min(W * 0.055, 22),
      fontWeight: '800',
      fill: '#ffffff',
      align: 'center',
      wordWrap: true,
      wordWrapWidth: W * 0.88,
      lineHeight: Math.min(W * 0.055, 22) * 1.25,
      dropShadow: true,
      dropShadowColor: '#000000',
      dropShadowDistance: 2,
      dropShadowAlpha: 0.7,
    });
    const titleText = new PIXI.Text(card.title, titleStyle);
    titleText.anchor.set(0.5);
    titleText.x = W / 2;
    titleText.y = H * 0.60;
    container.addChild(titleText);

    // Subtitle
    const subtitleStyle = new PIXI.TextStyle({
      fontSize: Math.min(W * 0.040, 15),
      fill: 'rgba(255,255,255,0.65)',
      align: 'center',
      wordWrap: true,
      wordWrapWidth: W * 0.88,
    });
    const subtitleText = new PIXI.Text(card.subtitle, subtitleStyle);
    subtitleText.anchor.set(0.5);
    subtitleText.x = W / 2;
    subtitleText.y = H * 0.69;
    container.addChild(subtitleText);

    // Bottom strip (safe cards only)
    if (!card.isBomb) {
      const stripGfx = new PIXI.Graphics();
      stripGfx.beginFill(0x000000, 0.3);
      stripGfx.drawRect(0, H * 0.74, W, H * 0.055);
      stripGfx.endFill();
      container.addChild(stripGfx);

      const stripStyle = new PIXI.TextStyle({
        fontSize: Math.min(W * 0.033, 13),
        fill: 'rgba(255,255,255,0.5)',
        align: 'center',
      });
      const stripText = new PIXI.Text('▶ tap to like  ♡  share  ↗', stripStyle);
      stripText.anchor.set(0.5);
      stripText.x = W / 2;
      stripText.y = H * 0.767;
      container.addChild(stripText);
    }

    // Attach kind-specific animation extras
    const animData = this.buildAnimExtras(container, card, W, H, emojiText, titleText);
    (container as any).__animData = animData;

    return container;
  }

  /**
   * Creates and attaches kind-specific extra elements used by startCardAnimation.
   * Elements are added to the container so they render on top of the base card.
   */
  private buildAnimExtras(
    container: PIXI.Container,
    card: CardData,
    W: number,
    H: number,
    emojiText: PIXI.Text,
    titleText: PIXI.Text,
  ): CardAnimData {
    const data: CardAnimData = {
      kind: card.kind,
      emojiText,
      titleText,
      emojiBaseX: W / 2,
      emojiBaseY: H * 0.38,
    };

    switch (card.kind) {

      case 'catceo': {
        // "APPROVED" stamp that pulses in/out
        const stamp = new PIXI.Text('✅ APPROVED', new PIXI.TextStyle({
          fontSize: Math.min(W * 0.075, 30),
          fontWeight: '900',
          fill: '#4ade80',
          align: 'center',
          dropShadow: true,
          dropShadowColor: '#000',
          dropShadowBlur: 10,
          dropShadowDistance: 0,
        }));
        stamp.anchor.set(0.5);
        stamp.x = W / 2;
        stamp.y = H * 0.53;
        stamp.alpha = 0;
        stamp.rotation = -0.12;
        container.addChild(stamp);
        data.catStamp = stamp;
        break;
      }

      case 'ramen': {
        // 3 steam ellipses that drift upward
        const steamDots: NonNullable<CardAnimData['steamDots']> = [];
        for (let i = 0; i < 3; i++) {
          const g = new PIXI.Graphics();
          g.beginFill(0xffffff, 0.22);
          g.drawEllipse(0, 0, 5 + i * 2, 11);
          g.endFill();
          g.x = W * 0.38 + i * W * 0.12;
          const baseY = H * 0.30;
          g.y = baseY + i * 14;
          container.addChild(g);
          steamDots.push({ g, baseY, speed: 0.6 + i * 0.25 });
        }
        data.steamDots = steamDots;
        break;
      }

      case 'mindfulness': {
        // Breathing ring that expands/contracts
        const g = new PIXI.Graphics();
        container.addChild(g);
        data.ringGfx = { g, cx: W / 2, cy: H * 0.38, baseR: Math.min(W, H) * 0.14 };
        break;
      }

      case 'cleaning': {
        // Bright sparkle dot sweeps left→right across the emoji
        const g = new PIXI.Graphics();
        g.beginFill(0xffffff, 0.9);
        g.drawCircle(0, 0, 7);
        g.endFill();
        g.x = 0;
        g.y = H * 0.38;
        container.addChild(g);
        data.sweepDot = { g, maxX: W, baseY: H * 0.38 };
        break;
      }

      case 'pizza': {
        // Gentle flame particles drifting upward from below the emoji
        const flameDots: NonNullable<CardAnimData['flameDots']> = [];
        const colors = [0xff6b2b, 0xff9f43, 0xffd32a, 0xff4757, 0xffa502];
        for (let i = 0; i < 5; i++) {
          const g = new PIXI.Graphics();
          g.beginFill(colors[i], 0.65);
          g.drawCircle(0, 0, 3 + (i % 3));
          g.endFill();
          const sx = W * 0.32 + Math.random() * W * 0.36;
          const sy = H * 0.50;
          g.x = sx;
          g.y = sy;
          container.addChild(g);
          flameDots.push({ g, startY: sy, baseOpacity: 0.35 + Math.random() * 0.35, speed: 0.45 + Math.random() * 0.6 });
        }
        data.flameDots = flameDots;
        break;
      }

      case 'dog': {
        // Speech bubble that fades in, stays, then fades out
        const bubble = new PIXI.Text('snack? 🦴', new PIXI.TextStyle({
          fontSize: Math.min(W * 0.052, 20),
          fontWeight: '700',
          fill: '#ffffff',
          align: 'center',
        }));
        bubble.anchor.set(0.5);
        bubble.x = W * 0.63;
        bubble.y = H * 0.28;
        bubble.alpha = 0;
        container.addChild(bubble);
        data.dogBubble = bubble;
        break;
      }
    }

    return data;
  }

  // ─── Card animation ───────────────────────────────────────────────────────

  /**
   * Starts the idle animation for a card container.
   * Stops any previously running animation.
   * Should be called right after the card becomes visible.
   */
  startCardAnimation(container: PIXI.Container): void {
    // Remove previous animation handler
    if (this.animHandler !== null) {
      this.app.ticker.remove(this.animHandler);
      this.animHandler = null;
    }

    const data = (container as any).__animData as CardAnimData | undefined;
    if (!data) return;

    let phase = 0;
    this.animHandler = (delta: number) => {
      phase += delta * 0.05; // ~3 rad/s at 60 fps
      this.tickCardAnimation(data, phase, delta);
    };
    this.app.ticker.add(this.animHandler);
  }

  private tickCardAnimation(data: CardAnimData, phase: number, delta: number): void {
    const { emojiText, titleText, emojiBaseX, emojiBaseY } = data;

    switch (data.kind) {

      // Original cards: gentle bob
      case 'strawberry':
      case 'butterfly':
      case 'taxi':
      case 'fruit':
        emojiText.y = emojiBaseY + Math.sin(phase * 2.2) * 7;
        break;

      // 🧠 Guru: bounce up-down + rapid micro-shake
      case 'guru':
        emojiText.y = emojiBaseY + Math.sin(phase * 3.5) * 9;
        emojiText.x = emojiBaseX + Math.sin(phase * 11) * 2.5;
        break;

      // 🥤 Hydration: wobble scale + gentle tilt
      case 'hydration': {
        const s = 1 + Math.sin(phase * 4) * 0.055;
        emojiText.scale.set(s);
        emojiText.rotation = Math.sin(phase * 3) * 0.06;
        break;
      }

      // 🐈 Cat CEO: "APPROVED" stamp slams in and fades out every ~1.5s
      case 'catceo': {
        if (!data.catStamp) break;
        // Period ≈ π*2 ≈ 6.28; at 0.05 rad/frame that's ~2s per full cycle
        const cycle = phase % (Math.PI * 2);
        if (cycle < Math.PI * 0.4) {
          // slam in
          const t = cycle / (Math.PI * 0.4);
          data.catStamp.alpha = t;
          data.catStamp.scale.set(0.6 + t * 0.55);
        } else if (cycle < Math.PI * 1.2) {
          // hold
          data.catStamp.alpha = 1;
          data.catStamp.scale.set(1.15);
        } else {
          // fade out
          const t = (cycle - Math.PI * 1.2) / (Math.PI * 0.8);
          data.catStamp.alpha = Math.max(0, 1 - t);
          data.catStamp.scale.set(1.15);
        }
        // Emoji bobs
        emojiText.y = emojiBaseY + Math.sin(phase * 2) * 5;
        break;
      }

      // 🍜 Ramen: steam drifts up + emoji bobs gently
      case 'ramen': {
        if (!data.steamDots) break;
        data.steamDots.forEach((s, i) => {
          s.g.y -= s.speed * delta;
          if (s.g.y < s.baseY - 65) s.g.y = s.baseY;
          s.g.alpha = 0.12 + Math.sin(phase * 2.5 + i * 1.2) * 0.09;
        });
        emojiText.y = emojiBaseY + Math.sin(phase * 1.8) * 5;
        break;
      }

      // 💸 Crypto: rocket wiggle + lean into chaos
      case 'crypto':
        emojiText.rotation = Math.sin(phase * 5) * 0.18;
        emojiText.x = emojiBaseX + Math.sin(phase * 3.5) * 6;
        emojiText.y = emojiBaseY + Math.cos(phase * 4) * 4;
        break;

      // 🧘 Mindfulness: breathing ring expands/contracts
      case 'mindfulness': {
        if (!data.ringGfx) break;
        const { g, cx, cy, baseR } = data.ringGfx;
        // Slow 4-count breath: ~4s per cycle
        const r = baseR + Math.sin(phase * 0.8) * 18;
        const alpha = 0.18 + Math.sin(phase * 0.8) * 0.10;
        g.clear();
        g.lineStyle(2.5, 0x4facfe, alpha + 0.15);
        g.drawCircle(cx, cy, r);
        g.lineStyle(1.5, 0x00f2fe, alpha * 0.6);
        g.drawCircle(cx, cy, r * 1.35);
        // Emoji breathes along
        emojiText.scale.set(1 + Math.sin(phase * 0.8) * 0.04);
        break;
      }

      // 🧽 Cleaning: sparkle dot sweeps left→right
      case 'cleaning': {
        if (!data.sweepDot) break;
        const { g, maxX, baseY } = data.sweepDot;
        // Full sweep in ~2.5s: maxX / (150) per frame at 60fps
        g.x += (maxX / 150) * delta;
        if (g.x > maxX + 10) g.x = -10;
        g.y = baseY + Math.sin(phase * 4) * 12;
        const normalX = Math.max(0, Math.min(1, g.x / maxX));
        g.alpha = Math.sin(normalX * Math.PI) * 0.85;
        // Emoji shakes a little
        emojiText.x = emojiBaseX + Math.sin(phase * 9) * 1.5;
        break;
      }

      // 🍕 Pizza: flame dots drift upward (gentle, non-explosive)
      case 'pizza': {
        if (!data.flameDots) break;
        data.flameDots.forEach((f) => {
          f.g.y -= f.speed * delta;
          if (f.g.y < f.startY - 85) f.g.y = f.startY;
          const progress = (f.startY - f.g.y) / 85;
          f.g.alpha = f.baseOpacity * (1 - progress);
          f.g.x += Math.sin(phase * 2 + f.startY) * 0.4 * delta;
        });
        emojiText.y = emojiBaseY + Math.sin(phase * 2.5) * 4;
        break;
      }

      // 🐕 Dog: "snack?" speech bubble pops up and fades (every ~3s)
      case 'dog': {
        if (!data.dogBubble) break;
        // Period ≈ 2π; ~2s at 0.05 rate — adjust for ~3s with slower rate
        const cycle = phase % (Math.PI * 2);
        if (cycle < Math.PI * 0.45) {
          const t = cycle / (Math.PI * 0.45);
          data.dogBubble.alpha = t;
          data.dogBubble.scale.set(0.75 + t * 0.3);
        } else if (cycle < Math.PI * 1.4) {
          data.dogBubble.alpha = 1;
          data.dogBubble.scale.set(1.05);
        } else {
          const t = (cycle - Math.PI * 1.4) / (Math.PI * 0.6);
          data.dogBubble.alpha = Math.max(0, 1 - t);
          data.dogBubble.scale.set(1.05);
        }
        emojiText.y = emojiBaseY + Math.sin(phase * 2) * 6;
        break;
      }

      // 🎭 Drama: headline zoom pulse (subtle camera-zoom effect)
      case 'drama': {
        const pulse = 1 + Math.sin(phase * 2) * 0.025;
        titleText.scale.set(pulse);
        emojiText.y = emojiBaseY + Math.sin(phase * 3) * 4;
        break;
      }
    }
  }

  // ─── Card transitions ─────────────────────────────────────────────────────

  private positionCard(card: PIXI.Container, yOffset: number): void {
    card.x = 0;
    card.y = yOffset;
  }

  /** Show initial card with scale-in animation, then start idle animation. */
  showCard(card: PIXI.Container): void {
    // Stop previous card animation
    if (this.animHandler !== null) {
      this.app.ticker.remove(this.animHandler);
      this.animHandler = null;
    }

    this.cardContainer.removeChildren();
    this.currentCard = card;
    this.cardContainer.addChild(card);
    this.positionCard(card, 0);
    card.scale.set(1.03);

    let t = 0;
    const tick = () => {
      t += 0.06;
      const s = lerp(1.03, 1.0, easeOutCubic(Math.min(t, 1)));
      card.scale.set(s);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        // Start idle animation after scale-in completes
        this.startCardAnimation(card);
      }
    };
    requestAnimationFrame(tick);
  }

  /**
   * Swipe-up transition: current card slides out upward, new card slides in from bottom.
   * easeOutCubic for ~350ms feel. Starts idle animation on completion.
   */
  swipeToCard(nextCardData: CardData, onComplete: () => void): void {
    if (this._isAnimating) return;
    this._isAnimating = true;

    // Stop current idle animation during the transition
    if (this.animHandler !== null) {
      this.app.ticker.remove(this.animHandler);
      this.animHandler = null;
    }

    const H = this.height;
    const newCard = this.createCardGraphic(nextCardData);
    this.nextCard = newCard;
    newCard.y = H;
    newCard.scale.set(1.03);
    this.cardContainer.addChild(newCard);

    const current = this.currentCard;
    let t = 0;

    const tick = () => {
      // ~350ms at 60fps: t increments by ~0.017 per rAF → need ~0.042 per step for 24 steps
      t += 0.042;
      const progress = easeOutCubic(Math.min(t, 1));

      if (current) {
        current.y = -H * progress;
        current.alpha = 1 - progress * 1.3;
      }

      newCard.y = H * (1 - progress);
      newCard.scale.set(lerp(1.03, 1.0, progress));

      if (t >= 1) {
        if (current) this.cardContainer.removeChild(current);
        this.currentCard = newCard;
        this.nextCard = null;
        this._isAnimating = false;
        // Start idle animation on the new card
        this.startCardAnimation(newCard);
        onComplete();
      } else {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }

  // ─── Particle effects ─────────────────────────────────────────────────────

  spawnSparkles(x: number, y: number): void {
    const emojis = ['✨', '⭐', '💫', '🌟'];
    for (let i = 0; i < 6; i++) {
      const style = new PIXI.TextStyle({ fontSize: 18 });
      const t = new PIXI.Text(emojis[Math.floor(Math.random() * emojis.length)], style);
      t.x = x + (Math.random() - 0.5) * 120;
      t.y = y + (Math.random() - 0.5) * 80;
      t.anchor.set(0.5);
      this.particles.addChild(t);
      this.particleList.push({
        sprite: t,
        vy: -(1.5 + Math.random() * 2),
        vx: (Math.random() - 0.5) * 2,
        life: 1.0,
        decay: 0.025 + Math.random() * 0.015,
      });
    }
  }

  spawnCoins(x: number, y: number): void {
    const emojis = ['🪙', '💰', '💵', '✨'];
    for (let i = 0; i < 8; i++) {
      const style = new PIXI.TextStyle({ fontSize: 22 });
      const t = new PIXI.Text(emojis[Math.floor(Math.random() * emojis.length)], style);
      t.x = x + (Math.random() - 0.5) * 160;
      t.y = y;
      t.anchor.set(0.5);
      this.particles.addChild(t);
      this.particleList.push({
        sprite: t,
        vy: -(2 + Math.random() * 3),
        vx: (Math.random() - 0.5) * 3,
        life: 1.0,
        decay: 0.018 + Math.random() * 0.012,
      });
    }
  }

  private onTick(): void {
    for (let i = this.particleList.length - 1; i >= 0; i--) {
      const p = this.particleList[i];
      p.life -= p.decay;
      p.sprite.x += p.vx;
      p.sprite.y += p.vy;
      p.sprite.alpha = Math.max(0, p.life);
      if (p.life <= 0) {
        this.particles.removeChild(p.sprite);
        p.sprite.destroy();
        this.particleList.splice(i, 1);
      }
    }
  }

  destroy(): void {
    if (this.animHandler !== null) {
      this.app.ticker.remove(this.animHandler);
    }
    window.removeEventListener('resize', this.onResize.bind(this));
    this.app.destroy(false);
  }
}

interface ParticleSprite {
  sprite: PIXI.Text;
  vy: number;
  vx: number;
  life: number;
  decay: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
