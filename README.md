# Midnight: THE CHASERS

A 2D storm-chasing / tornado-intercept physics game. Anchor the **Dominator 1**
and survive the vortex.

![Dominator 1](assets/dominator1.png)

## How to play

1. Open `index.html` in a browser (or run a local server, below).
2. **PLAY** → choose a storm on the EF scale.
3. The Dominator 1 drives in on two wheels (wheelie) to the center of the screen.
4. When you see the prompt, press **SPACE** to deploy the hydraulic ground anchors.
   The car presses down and the tornado approaches, tearing apart everything in
   its path.
5. Survive — or get thrown.

### The EF scale
`EF0 · EF1 · EF2 · EF3 · EF4 · EF5 · EF5 Multi-vortex · EF5+ · Hypothetical EF6`

The **Dominator 1** is rated to survive up to **EF2**. Anything stronger
overpowers the anchors and flings the vehicle using the physics engine.

### Buy Interceptors
The shop lists stronger vehicles (Dominator 2/3, TITUS, TIV 2, Apex Hunter).
They're placeholders / "coming soon" for now.

## Tech

- **`src/physics.js`** – a tiny 2D rigid-body engine (impulses, bodies,
  `world.step`) in the spirit of Cannon-ES, flattened to a 2D plane. Used when
  the car is ripped off its anchors and thrown.
- **`src/tornado.js`** – the tornado is a **procedural fluid** made of hundreds
  of swirling particles + captured debris. It is **not** a photo or an AI image.
- **`src/game.js`** – game states, EF-scale config, rendering, scene destruction.
- **`assets/dominator1.png`** – the Dominator 1 sprite (transparent background).

## Run locally

Just open `index.html`, or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```
