/* ============================================================
   physics.js  —  Minimal 2D rigid-body engine
   Inspired by Cannon-ES (impulses, bodies, world.step),
   flattened to a 2D plane for Midnight: THE CHASERS.
   ============================================================ */

// A 2D vector helper
class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  scale(s) { return new Vec2(this.x * s, this.y * s); }
  len() { return Math.hypot(this.x, this.y); }
}

// A rigid body on the 2D plane (x = horizontal, y = vertical, up is negative)
class Body {
  constructor(opts = {}) {
    this.position = new Vec2(opts.x || 0, opts.y || 0);
    this.velocity = new Vec2(opts.vx || 0, opts.vy || 0);
    this.angle = opts.angle || 0;          // radians
    this.angularVelocity = opts.av || 0;   // rad/s
    this.mass = opts.mass || 1;
    this.invMass = this.mass > 0 ? 1 / this.mass : 0;
    this.restitution = opts.restitution ?? 0.35; // bounciness
    this.friction = opts.friction ?? 0.6;
    this.width = opts.width || 100;
    this.height = opts.height || 50;
    this.anchored = false;   // pinned to the ground (survives)
    this.onGround = false;
    this.airDrag = opts.airDrag ?? 0.06;
  }

  // Apply an instantaneous impulse (kg·px/s) at the center of mass
  applyImpulse(ix, iy) {
    this.velocity.x += ix * this.invMass;
    this.velocity.y += iy * this.invMass;
  }

  // Apply a continuous force this frame
  applyForce(fx, fy, dt) {
    this.velocity.x += fx * this.invMass * dt;
    this.velocity.y += fy * this.invMass * dt;
  }

  applyTorque(t, dt) {
    // simple: treat moment of inertia ~ mass
    this.angularVelocity += (t / this.mass) * dt;
  }
}

// The physics world
class World {
  constructor(opts = {}) {
    this.gravity = opts.gravity ?? 2000;   // px/s^2 downward
    this.groundY = opts.groundY ?? 600;    // y of the ground line
    this.bodies = [];
  }

  add(body) { this.bodies.push(body); return body; }

  step(dt) {
    // clamp dt to avoid tunneling on lag spikes
    dt = Math.min(dt, 1 / 30);

    for (const b of this.bodies) {
      if (b.anchored || b.invMass === 0) {
        b.velocity.set(0, 0);
        b.angularVelocity = 0;
        continue;
      }

      // gravity
      b.velocity.y += this.gravity * dt;

      // quadratic-ish air drag while airborne
      if (!b.onGround) {
        b.velocity.x *= (1 - b.airDrag * dt);
        b.velocity.y *= (1 - b.airDrag * dt * 0.5);
      }

      // integrate
      b.position.x += b.velocity.x * dt;
      b.position.y += b.velocity.y * dt;
      b.angle += b.angularVelocity * dt;

      // ground collision (treat body base as position.y + height/2)
      const base = b.position.y + b.height / 2;
      if (base >= this.groundY) {
        b.position.y = this.groundY - b.height / 2;
        if (b.velocity.y > 0) {
          b.velocity.y = -b.velocity.y * b.restitution;
          // rolling / sliding friction
          b.velocity.x *= (1 - b.friction);
          b.angularVelocity *= 0.55;
          // settle if very slow
          if (Math.abs(b.velocity.y) < 40) { b.velocity.y = 0; b.onGround = true; }
        }
      } else {
        b.onGround = false;
      }
    }
  }
}

// export to global for non-module usage
window.Phys = { Vec2, Body, World };
