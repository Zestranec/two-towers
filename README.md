# SDVGame — Scroll Doom Victory Game

A production-ready browser game built with **PixiJS + TypeScript + Vite** that simulates doomscrolling in a TikTok/Reels-style gambling experience.

---

## Quick Start

```bash
cd SDVGame
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser (or on mobile via local network IP).

---

## How to Play

1. Press **▶ Start Game** on the intro screen
2. Your first swipe deducts **10 FUN** from your balance to start a round
3. **Swipe up** (or scroll) to reveal the next card
4. Each **safe card** multiplies your pot by **×1.10**
5. Hit a **💣 Bomb** → lose your entire round pot
6. Press **💰 Take Profit** at any time to cash out and add to your balance

---

## Game Economy

| Parameter | Value |
|-----------|-------|
| Starting balance | 1,000 FUN |
| Round entry cost | 10 FUN |
| Multiplier per safe card | ×1.10 |
| Base bomb probability | ~15% |
| Target RTP | ~95% |

---

## Card Types

| Card | Type | Probability |
|------|------|-------------|
| 🍓 Dancing Strawberry | Safe | ~21% |
| 🦋 Flying Butterfly | Safe | ~21% |
| 🚕 Taxi Ad | Safe | ~21% |
| 🍉 Fruit Dance | Safe | ~21% |
| 💣 Bomb | Danger | ~15% |

---

## Architecture

```
src/
├── main.ts              # Entry point; boots the Game
├── Game.ts              # Main controller (state machine, gestures)
├── ReelEngine.ts        # Card sequence generation
├── Card.ts              # Card type definitions
├── Renderer.ts          # PixiJS rendering, transitions, particles
├── Ui.ts                # DOM overlay (HUD, popups, effects)
├── Economy.ts           # Balance, round value, multiplier math
├── Rng.ts               # Seeded Mulberry32 PRNG
├── OutcomeController.ts # RTP-targeted bomb probability
└── Simulation.ts        # Headless stats simulation
```

---

## RTP System

The `OutcomeController` uses three run types decided at round start:

- **Short run** (30% of rounds): higher base bomb probability (~25%)
- **Medium run** (50% of rounds): balanced probability (~14%)
- **Long run** (20% of rounds): low initial probability (~8%)

Consecutive loss/win streaks adjust probability slightly for a natural feel. Probability is always clamped to **[4%, 30%]**.

---

## Controls

| Action | Mobile | Desktop |
|--------|--------|---------|
| Next card | Swipe up | Drag up / Scroll down |
| Cash out | Tap button | Click button |

---

## Simulation

Press the **📊** icon (right side) to run a 10,000-round simulation and view:
- RTP (target ≈ 95%)
- Average swipes per round
- Win/lose rates
- Average profit per win

---

## Build for Production

```bash
npm run build
npm run preview
```

Output goes to `dist/`.
