/* ============================================================
   tornado.js  —  Procedural fluid vortex
   Particle-based swirling funnel (NOT a photo / not AI image).
   ============================================================ */

class TornadoParticle {
  constructor(cx, groundY, funnelHeight, radiusBase) {
    this.reset(cx, groundY, funnelHeight, radiusBase, true);
  }
  reset(cx, groundY, funnelHeight, radiusBase, initial) {
    // height parameter t: 0 at ground, 1 at top
    this.t = initial ? Math.random() : Math.random() * 0.15;
    this.angle = Math.random() * Math.PI * 2;
    // angular speed decreases slightly with height
    this.spin = (2.2 + Math.random() * 2.8);
    this.rise = 0.06 + Math.random() * 0.16;   // how fast it climbs
    this.wobble = Math.random() * Math.PI * 2;
    this.size = 1 + Math.random() * 2.6;
    this.alpha = 0.25 + Math.random() * 0.55;
    this.shade = Math.random();
  }
}

class Tornado {
  constructor(cfg) {
    this.groundY = cfg.groundY;
    this.funnelHeight = cfg.funnelHeight || 520;
    this.radiusBase = cfg.radiusBase || 70;    // width at bottom
    this.radiusTop = cfg.radiusTop || 210;     // width at top
    this.color = cfg.color || [180, 180, 190];
    this.intensity = cfg.intensity || 1;       // 0..~2, scales spin & density
    this.x = cfg.x;                            // world x of the vortex core
    this.baseSway = 0;
    this.time = 0;

    const count = Math.floor(420 * (0.6 + cfg.intensity * 0.5));
    this.particles = [];
    for (let i = 0; i < count; i++)
      this.particles.push(new TornadoParticle(this.x, this.groundY, this.funnelHeight, this.radiusBase));

    // ground debris cloud swirl
    this.debris = [];
    for (let i = 0; i < 90; i++) {
      this.debris.push({
        a: Math.random() * Math.PI * 2,
        r: 40 + Math.random() * 180,
        spd: 3 + Math.random() * 4,
        y: -Math.random() * 60,
        size: 2 + Math.random() * 5,
        alpha: 0.15 + Math.random() * 0.4
      });
    }
  }

  // width of the funnel at height parameter t (0 bottom -> 1 top)
  radiusAt(t) {
    // narrow near ground, flares at top; add a little pinch
    const flare = Math.pow(t, 0.8);
    return this.radiusBase + (this.radiusTop - this.radiusBase) * flare;
  }

  update(dt) {
    this.time += dt;
    this.baseSway = Math.sin(this.time * 0.7) * 14 * this.intensity;
    const spinScale = 0.7 + this.intensity * 0.7;

    for (const p of this.particles) {
      p.angle += p.spin * spinScale * dt;
      p.t += p.rise * dt;
      p.wobble += dt * 3;
      if (p.t > 1) p.reset(this.x, this.groundY, this.funnelHeight, this.radiusBase, false);
    }
    for (const d of this.debris) {
      d.a += d.spd * spinScale * dt;
    }
  }

  // core x at a given height (adds lean/sway)
  coreX(t) {
    return this.x + this.baseSway * (1 - t) + Math.sin(this.time * 1.3 + t * 4) * 10 * this.intensity;
  }

  draw(ctx) {
    const [cr, cg, cb] = this.color;

    // --- outer haze / dust envelope ---
    const topY = this.groundY - this.funnelHeight;
    const grad = ctx.createLinearGradient(0, topY, 0, this.groundY);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.05)`);
    grad.addColorStop(1, `rgba(${cr - 40},${cg - 40},${cb - 40},0.28)`);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // funnel silhouette (soft)
    ctx.beginPath();
    const steps = 24;
    // left edge going up
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = this.groundY - t * this.funnelHeight;
      const x = this.coreX(t) - this.radiusAt(t) * (0.7 + 0.3 * Math.sin(this.time * 2 + t * 6));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    // right edge coming down
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const y = this.groundY - t * this.funnelHeight;
      const x = this.coreX(t) + this.radiusAt(t) * (0.7 + 0.3 * Math.sin(this.time * 2 + t * 6 + 1));
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // --- swirling fluid particles ---
    ctx.save();
    for (const p of this.particles) {
      const t = p.t;
      const y = this.groundY - t * this.funnelHeight;
      const r = this.radiusAt(t);
      // 3D-ish projection of circular motion -> ellipse (front/back)
      const ex = Math.cos(p.angle) * r * (0.9 + 0.1 * Math.sin(p.wobble));
      const depth = Math.sin(p.angle); // -1 back, +1 front
      const x = this.coreX(t) + ex;
      // fade at very bottom & top
      const edgeFade = Math.min(1, t * 6) * Math.min(1, (1 - t) * 3 + 0.3);
      const frontBoost = 0.55 + 0.45 * (depth * 0.5 + 0.5);
      const a = p.alpha * edgeFade * frontBoost;
      const shade = 120 + p.shade * 110;
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${Math.min(255,shade)},${Math.min(255,shade)},${Math.min(255,shade+8)})`;
      const sz = p.size * (0.7 + t * 0.8) * (0.7 + frontBoost * 0.6);
      ctx.beginPath();
      ctx.ellipse(x, y, sz, sz * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // --- ground dust ring / debris ---
    ctx.save();
    for (const d of this.debris) {
      const x = this.coreX(0) + Math.cos(d.a) * d.r;
      const y = this.groundY + d.y * 0.15 - 4 + Math.sin(d.a) * 6;
      ctx.globalAlpha = d.alpha;
      ctx.fillStyle = `rgb(${cr - 30},${cg - 30},${cb - 25})`;
      ctx.beginPath();
      ctx.arc(x, y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // subtle bright core line
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = `rgb(${cr + 30},${cg + 30},${cb + 30})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = this.groundY - t * this.funnelHeight;
      const x = this.coreX(t);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

window.Tornado = Tornado;
