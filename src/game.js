/* ============================================================
   game.js  —  Midnight: THE CHASERS
   ============================================================ */
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const GROUND_Y = 600;

  // ---- EF scale definition ----
  // wind values in mph, color = fluid tint, power scales impulse on the car
  const STORMS = [
    { id:'EF0', name:'EF0', wind:75,  color:[190,192,200], power:0.35, r:[50,150],  h:360, desc:'Light damage. A gentle spin-up.' },
    { id:'EF1', name:'EF1', wind:100, color:[185,187,196], power:0.55, r:[58,170],  h:410, desc:'Moderate damage. Shingles fly.' },
    { id:'EF2', name:'EF2', wind:120, color:[176,178,190], power:0.85, r:[66,190],  h:460, desc:'Considerable damage. Roofs torn off.' },
    { id:'EF3', name:'EF3', wind:150, color:[165,166,180], power:1.35, r:[76,210],  h:510, desc:'Severe. Whole floors destroyed.' },
    { id:'EF4', name:'EF4', wind:180, color:[150,150,168], power:1.9,  r:[86,235],  h:560, desc:'Devastating. Houses leveled.' },
    { id:'EF5', name:'EF5', wind:210, color:[135,134,158], power:2.6,  r:[98,260],  h:610, desc:'Incredible. Homes swept away.' },
    { id:'EF5MV', name:'EF5 Multi-vortex', wind:230, color:[120,118,150], power:3.2, r:[110,300], h:640, multi:true, desc:'Multiple sub-vortices orbiting the core.' },
    { id:'EF5P', name:'EF5+', wind:260, color:[105,102,145], power:4.0, r:[120,320], h:660, desc:'Beyond the scale. Ground scoured to bedrock.' },
    { id:'EF6', name:'Hypothetical EF6', wind:320, color:[92,80,150],  power:5.5,  r:[140,360], h:700, multi:true, desc:'Theoretical monster. Nothing survives.' },
  ];
  const SURVIVABLE_INDEX = 2; // Dominator 1 survives up to EF2 (index 2)

  const INTERCEPTORS = [
    { id:'dom1', name:'Dominator 1', owned:true,  price:0,    survive:'EF2', note:'Reed-Timmer-style TIV. Low-slung armored hull.' },
    { id:'dom2', name:'Dominator 2', owned:false, price:1200, survive:'EF3', note:'Reinforced chassis. Deeper spikes.' },
    { id:'dom3', name:'Dominator 3', owned:false, price:3500, survive:'EF4', note:'Aero flaps push it into the ground.' },
    { id:'titus', name:'TITUS',      owned:false, price:6000, survive:'EF4', note:'Armored military-grade intercept truck.' },
    { id:'tiv2', name:'TIV 2',       owned:false, price:9000, survive:'EF5', note:'Hydraulic claws. Bulletproof glass.' },
    { id:'apex', name:'Apex Hunter', owned:false, price:20000,survive:'EF5+',note:'Prototype. Magnetic ground lock.' },
  ];

  // ---- DOM refs ----
  const screens = {
    menu: document.getElementById('menu'),
    select: document.getElementById('select'),
    shop: document.getElementById('shop'),
    result: document.getElementById('result'),
  };
  const hud = document.getElementById('hud');
  const prompt = document.getElementById('prompt');

  // ---- assets ----
  const carImg = new Image();
  carImg.src = 'assets/dominator1.png';
  let carReady = false;
  carImg.onload = () => { carReady = true; };

  // ============================================================
  //  Game state machine
  // ============================================================
  const S = {
    MENU:'menu', SELECT:'select', SHOP:'shop',
    APPROACH:'approach',   // car drives on 2 wheels to center
    WAIT:'wait',           // at center, waiting for SPACE
    ANCHORED:'anchored',   // pressed space, tornado approaches & destroys
    RESULT:'result'
  };
  let state = S.MENU;
  let storm = null;
  let tornado = null;
  let subVortices = [];

  // world & car body
  let world, car;

  // scene objects (things the tornado destroys)
  let props = [];      // trees, houses, poles, signs
  let debris = [];     // flying pieces of destroyed props

  // car animation
  let carTilt = 0;         // wheelie tilt (2-wheel driving)
  let carX = -260;
  let carTargetX = W * 0.5;
  let crouch = 0;          // 0 = normal ride height, 1 = pressed to the ground
  let wheelSpin = 0;       // rotation of the wheels
  let cameraShake = 0;
  let tornadoWorldX = W + 400; // starts off right, approaches car
  let stateTime = 0;
  let outcome = null;

  // ============================================================
  //  Screen helpers
  // ============================================================
  function show(name) {
    for (const k in screens) screens[k].classList.add('hidden');
    hud.classList.add('hidden');
    prompt.classList.add('hidden');
    if (screens[name]) screens[name].classList.remove('hidden');
  }

  function buildSelect() {
    const grid = document.getElementById('efGrid');
    grid.innerHTML = '';
    STORMS.forEach((s, i) => {
      const survives = i <= SURVIVABLE_INDEX;
      const pct = Math.min(100, (s.wind / 320) * 100);
      const barColor = i <= 2 ? '#4dffa1' : i <= 5 ? '#ffd24d' : '#ff5470';
      const card = document.createElement('div');
      card.className = 'ef-card';
      card.innerHTML = `
        <span class="badge ${survives?'surv':'fatal'}">${survives?'SURVIVABLE':'FATAL'}</span>
        <div class="ef-name">${s.name}</div>
        <div class="ef-wind">${s.wind} mph winds</div>
        <div class="ef-desc">${s.desc}</div>
        <div class="ef-bar"><i style="width:${pct}%;background:${barColor}"></i></div>`;
      card.onclick = () => startRun(i);
      grid.appendChild(card);
    });
  }

  function buildShop() {
    const grid = document.getElementById('shopGrid');
    grid.innerHTML = '';
    INTERCEPTORS.forEach(c => {
      const card = document.createElement('div');
      card.className = 'shop-card';
      card.innerHTML = `
        <h3>${c.name}</h3>
        <small>Survives up to <b style="color:#4dffa1">${c.survive}</b></small>
        <p style="margin-top:8px;color:#b9c0e6;font-size:13px">${c.note}</p>
        <div class="price">${c.price === 0 ? 'OWNED' : '$' + c.price.toLocaleString()}</div>
        ${c.owned ? '' : '<div class="locked">🔒 COMING SOON</div>'}`;
      grid.appendChild(card);
    });
  }

  // ============================================================
  //  Start a run
  // ============================================================
  function startRun(stormIndex) {
    storm = STORMS[stormIndex];
    storm._index = stormIndex;
    outcome = null;

    // physics
    world = new Phys.World({ gravity: 2200, groundY: GROUND_Y });
    car = world.add(new Phys.Body({
      x: -260, y: GROUND_Y - 70, width: 220, height: 110,
      mass: 6, restitution: 0.32, friction: 0.5
    }));
    car.anchored = false;

    carX = -260;
    carTilt = 0;
    crouch = 0;
    wheelSpin = 0;
    cameraShake = 0;
    tornadoWorldX = W + 500;
    stateTime = 0;

    // build the tornado fluid
    const [rb, rt] = storm.r;
    tornado = new window.Tornado({
      groundY: GROUND_Y, funnelHeight: storm.h,
      radiusBase: rb, radiusTop: rt, color: storm.color.slice(),
      intensity: 0.5 + stormIndex * 0.22, x: tornadoWorldX
    });
    subVortices = [];
    if (storm.multi) {
      const n = storm.id === 'EF6' ? 4 : 3;
      for (let i = 0; i < n; i++) {
        subVortices.push(new window.Tornado({
          groundY: GROUND_Y, funnelHeight: storm.h * (0.4 + Math.random()*0.3),
          radiusBase: rb*0.35, radiusTop: rt*0.4,
          color: storm.color.map(c=>c-10), intensity: 0.6 + stormIndex*0.2,
          x: tornadoWorldX
        }));
        subVortices[i]._orbit = Math.random()*Math.PI*2;
        subVortices[i]._orbR = 60 + Math.random()*140;
      }
    }

    buildProps();
    debris = [];

    state = S.APPROACH;
    show(null);
    hud.classList.remove('hidden');
    updateHud();
  }

  function buildProps() {
    props = [];
    // place trees, houses, poles, signs across the field to the right of center
    const layout = [
      { type:'house', x: 760 },
      { type:'tree',  x: 900 },
      { type:'pole',  x: 1000 },
      { type:'house', x: 1120 },
      { type:'tree',  x: 1250 },
      { type:'sign',  x: 690 },
      { type:'tree',  x: 1400 },
      { type:'house', x: 1520 },
      { type:'pole',  x: 1600 },
    ];
    for (const l of layout) {
      props.push({
        type: l.type, x: l.x, destroyed: false,
        h: l.type==='house'?110 : l.type==='tree'?130 : l.type==='pole'?150 : 60,
        w: l.type==='house'?120 : l.type==='tree'?60 : l.type==='pole'?12 : 50,
        sway: Math.random()*Math.PI*2
      });
    }
  }

  // ============================================================
  //  Input
  // ============================================================
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (state === S.WAIT) deployAnchors();
    }
  });

  // buttons
  document.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'play') { buildSelect(); state=S.SELECT; show('select'); }
    else if (a === 'shop') { buildShop(); state=S.SHOP; show('shop'); }
    else if (a === 'back') { state=S.MENU; show('menu'); }
    else if (a === 'retry') { startRun(storm._index); }
    else if (a === 'menu') { state=S.MENU; show('menu'); }
  });

  function deployAnchors() {
    state = S.ANCHORED;
    stateTime = 0;
    car.anchored = true;             // pinned to the ground
    document.getElementById('hudPhase').textContent = 'Hunkered down — bracing for impact!';
    prompt.classList.add('hidden');
  }

  // ============================================================
  //  Update loop
  // ============================================================
  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    if (state === S.APPROACH) {
      stateTime += dt;
      // drive in on 2 wheels (wheelie): accelerate then arrive
      const speed = 520;
      carX += speed * dt;
      wheelSpin += (speed / 45) * dt;
      // wheelie tilt rises then holds
      carTilt = Math.min(0.28, carTilt + dt * 0.6);
      if (carX >= carTargetX) {
        carX = carTargetX;
        state = S.WAIT;
        document.getElementById('hudPhase').textContent = 'In position. Press SPACE to hunker down!';
        prompt.classList.remove('hidden');
      }
      car.position.x = carX;
    }
    else if (state === S.WAIT) {
      // settle back onto 4 wheels
      carTilt = Math.max(0, carTilt - dt * 0.5);
    }
    else if (state === S.ANCHORED) {
      stateTime += dt;
      carTilt = Math.max(0, carTilt - dt * 0.8);
      // car presses down to the ground (crouch / squat on suspension)
      crouch = Math.min(1, crouch + dt * 3);

      // tornado approaches the car
      const approachSpeed = 120 + storm._index * 22;
      if (tornadoWorldX > carX + 20) {
        tornadoWorldX -= approachSpeed * dt;
      }
      tornado.x = tornadoWorldX;
      tornado.update(dt);
      updateSubVortices(dt);

      // destroy props the funnel reaches
      destroyProps(dt);
      updateDebris(dt);

      // camera shakes stronger as it nears
      const dist = Math.abs(tornadoWorldX - carX);
      cameraShake = Math.max(0, (400 - dist) / 400) * (4 + storm._index * 2.2);

      // when the vortex core reaches the car -> resolve
      if (dist < tornado.radiusBase + 40) {
        resolveImpact(dt);
      }

      // physics for a flung car
      world.step(dt);
      if (!car.anchored) {
        carX = car.position.x;
        // if car flew off screen or settled, end
        if ((car.position.x < -400 || car.position.x > W + 600 || car.position.y > GROUND_Y + 400) && stateTime > 2) {
          endRun(false);
        }
        // settled on ground for a moment after being tossed
      }
      updateHud();
    }
    else if (state === S.RESULT) {
      // keep tornado & debris animating in background
      if (tornado) { tornado.update(dt); updateSubVortices(dt); updateDebris(dt); }
      if (!car.anchored) world.step(dt), carX = car.position.x;
    }
  }

  function updateSubVortices(dt) {
    for (const sv of subVortices) {
      sv._orbit += dt * 1.6;
      sv.x = tornadoWorldX + Math.cos(sv._orbit) * sv._orbR;
      sv.update(dt);
    }
  }

  let impactResolved = false;
  function resolveImpact() {
    if (impactResolved) return;
    impactResolved = true;
    const survivable = storm._index <= SURVIVABLE_INDEX;
    cameraShake = 14 + storm._index * 3;
    if (survivable) {
      // anchors hold — car survives, small rattle
      setTimeout(() => endRun(true), 1400);
    } else {
      // anchors fail — car is ripped off and flung (Cannon-ES style impulse)
      car.anchored = false;
      const overpower = storm.power - 0.85; // how far past EF2 threshold
      const dir = -1; // flung away from tornado (to the left)
      const up = -(1400 + overpower * 520);
      const side = dir * (900 + overpower * 700);
      car.applyImpulse(side * car.mass, up * car.mass);
      car.applyTorque(-(6 + overpower * 5) * car.mass, 0.016);
      car.angularVelocity = -(3 + overpower * 2.2);
      document.getElementById('hudPhase').textContent = 'HULL RIPPED LOOSE!';
    }
  }

  function destroyProps(dt) {
    const reach = tornado.radiusBase + 120 + storm._index * 20;
    for (const p of props) {
      if (p.destroyed) continue;
      if (Math.abs(p.x - tornadoWorldX) < reach) {
        p.destroyed = true;
        // spawn flying debris (fluid picks it up)
        const pieces = p.type==='house'?14 : p.type==='tree'?10 : 6;
        for (let i=0;i<pieces;i++){
          debris.push({
            x: p.x + (Math.random()-0.5)*p.w,
            y: GROUND_Y - Math.random()*p.h,
            vx: -(60+Math.random()*160),
            vy: -(120+Math.random()*260),
            spin:(Math.random()-0.5)*10,
            rot:Math.random()*6,
            size: 4+Math.random()*10,
            color: p.type==='tree'? '#3a6b3a' : p.type==='house'? '#8a6a4a' : '#777',
            life: 1.4+Math.random()*1.4,
            captured:false
          });
        }
      }
    }
  }

  function updateDebris(dt) {
    for (const d of debris) {
      d.life -= dt;
      // if near the vortex, get sucked into orbit (fluid capture)
      const dx = d.x - tornadoWorldX;
      const dist = Math.hypot(dx, d.y - (GROUND_Y - 100));
      if (dist < 260) {
        d.captured = true;
        // spiral inward & upward
        const ang = Math.atan2((GROUND_Y-100)-d.y, tornadoWorldX - d.x);
        const tang = ang + Math.PI/2;
        d.vx += Math.cos(tang)*900*dt + Math.cos(ang)*260*dt;
        d.vy += Math.sin(tang)*900*dt + Math.sin(ang)*260*dt - 300*dt;
      } else {
        d.vy += 900*dt; // gravity
      }
      d.x += d.vx*dt; d.y += d.vy*dt; d.rot += d.spin*dt;
      if (!d.captured && d.y > GROUND_Y-4){ d.y=GROUND_Y-4; d.vy*=-0.3; d.vx*=0.7; }
    }
    debris = debris.filter(d => d.life > 0 && d.x > -200 && d.x < W+300 && d.y > -400);
  }

  function endRun(survived) {
    state = S.RESULT;
    outcome = survived;
    const title = document.getElementById('resTitle');
    const text = document.getElementById('resText');
    if (survived) {
      title.textContent = 'SURVIVED';
      title.className = 'win';
      text.innerHTML = `The Dominator 1 pressed down and held its ground through the <b>${storm.name}</b> (${storm.wind} mph). Low profile, low drag.`;
    } else {
      title.textContent = 'INTERCEPTOR LOST';
      title.className = 'lose';
      text.innerHTML = `The <b>${storm.name}</b> (${storm.wind} mph) overpowered the Dominator 1 and threw it. It only rates for <b>EF2</b> — you need a stronger interceptor.`;
    }
    setTimeout(()=>show('result'), 200);
    impactResolved = false;
  }

  function updateHud() {
    if (!storm) return;
    document.getElementById('hudStorm').textContent = storm.name;
    document.getElementById('hudWind').textContent = storm.wind + ' mph';
  }

  // ============================================================
  //  Render
  // ============================================================
  function render() {
    ctx.clearRect(0,0,W,H);

    // sky gradient (stormy midnight)
    const sky = ctx.createLinearGradient(0,0,0,GROUND_Y);
    sky.addColorStop(0,'#0a0e1e');
    sky.addColorStop(0.6,'#141a33');
    sky.addColorStop(1,'#232a44');
    ctx.fillStyle = sky;
    ctx.fillRect(0,0,W,H);

    // subtle lightning flicker during storm
    if ((state===S.ANCHORED||state===S.RESULT) && Math.random() < 0.012) {
      ctx.fillStyle = 'rgba(180,190,255,0.10)';
      ctx.fillRect(0,0,W,H);
    }

    ctx.save();
    // camera shake
    if (cameraShake > 0.1) {
      ctx.translate((Math.random()-0.5)*cameraShake, (Math.random()-0.5)*cameraShake);
      cameraShake *= 0.92;
    }

    drawGround();

    // draw props (behind tornado if further, simple ordering)
    for (const p of props) if (!p.destroyed) drawProp(p);

    // sub-vortices behind main
    if (state===S.ANCHORED || state===S.RESULT) {
      for (const sv of subVortices) sv.draw(ctx);
      if (tornado) tornado.draw(ctx);
    }

    // debris
    drawDebris();

    // car
    drawCar();

    ctx.restore();
  }

  function drawGround() {
    const g = ctx.createLinearGradient(0,GROUND_Y,0,H);
    g.addColorStop(0,'#20261c');
    g.addColorStop(1,'#12160f');
    ctx.fillStyle = g;
    ctx.fillRect(0,GROUND_Y,W,H-GROUND_Y);
    // ground line
    ctx.strokeStyle = 'rgba(120,140,90,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,GROUND_Y); ctx.lineTo(W,GROUND_Y); ctx.stroke();
    // dashed road markings
    ctx.strokeStyle='rgba(200,200,160,0.15)';
    ctx.setLineDash([30,26]); ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(0,GROUND_Y+60); ctx.lineTo(W,GROUND_Y+60); ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawProp(p) {
    ctx.save();
    const sway = Math.sin(performance.now()/600 + p.sway) * (state===S.ANCHORED?6:1);
    if (p.type==='tree') {
      ctx.strokeStyle='#5a3f2a'; ctx.lineWidth=10; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(p.x,GROUND_Y); ctx.lineTo(p.x+sway,GROUND_Y-p.h*0.6); ctx.stroke();
      ctx.fillStyle='#2f5d33';
      ctx.beginPath(); ctx.arc(p.x+sway,GROUND_Y-p.h*0.72,p.w*0.8,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#356b3a';
      ctx.beginPath(); ctx.arc(p.x+sway-14,GROUND_Y-p.h*0.6,p.w*0.6,0,Math.PI*2); ctx.fill();
    } else if (p.type==='house') {
      ctx.fillStyle='#6d5540';
      ctx.fillRect(p.x-p.w/2,GROUND_Y-p.h,p.w,p.h);
      ctx.fillStyle='#8a3b32'; // roof
      ctx.beginPath();
      ctx.moveTo(p.x-p.w/2-8,GROUND_Y-p.h);
      ctx.lineTo(p.x,GROUND_Y-p.h-46);
      ctx.lineTo(p.x+p.w/2+8,GROUND_Y-p.h);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle='#2a2f45'; // window
      ctx.fillRect(p.x-30,GROUND_Y-p.h+24,26,26);
      ctx.fillRect(p.x+8,GROUND_Y-p.h+24,26,26);
      ctx.fillStyle='#3a2c22';
      ctx.fillRect(p.x-14,GROUND_Y-46,28,46); // door
    } else if (p.type==='pole') {
      ctx.strokeStyle='#5a5a5a'; ctx.lineWidth=8;
      ctx.beginPath(); ctx.moveTo(p.x,GROUND_Y); ctx.lineTo(p.x,GROUND_Y-p.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x-24,GROUND_Y-p.h+18); ctx.lineTo(p.x+24,GROUND_Y-p.h+18); ctx.stroke();
    } else if (p.type==='sign') {
      ctx.strokeStyle='#888'; ctx.lineWidth=6;
      ctx.beginPath(); ctx.moveTo(p.x,GROUND_Y); ctx.lineTo(p.x,GROUND_Y-p.h); ctx.stroke();
      ctx.fillStyle='#2f7d3a';
      ctx.fillRect(p.x-p.w/2,GROUND_Y-p.h-26,p.w,26);
    }
    ctx.restore();
  }

  function drawDebris() {
    for (const d of debris) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, d.life);
      ctx.translate(d.x,d.y); ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.size/2,-d.size/2,d.size,d.size*0.7);
      ctx.restore();
    }
  }

  function drawCar() {
    if (state===S.MENU||state===S.SELECT||state===S.SHOP) return;

    // ride-height metrics
    const RIDE = 55;          // normal center height above ground line
    const CROUCH_DROP = 30;   // how much lower the body sits when hunkered down
    const cx = carX;
    let cy = GROUND_Y - RIDE + crouch * CROUCH_DROP;
    let ang = -carTilt; // wheelie tilts nose up
    let flung = false;

    if (!car.anchored && state!==S.WAIT && state!==S.APPROACH) {
      cy = car.position.y;
      ang = car.angle;
      flung = true;
    }

    const cw = 240, ch = 130;
    // wheel geometry (drawn in code — NOT a PNG)
    const wheelR = 26;
    const wheelDX = 74;                 // horizontal offset of each wheel from center
    const axleY = ch/2 - 36;            // wheel axle height within the body space
    // when crouched, suspension compresses: wheels stay on ground, body drops.
    const bodyDY = crouch * CROUCH_DROP * -0.15; // tiny extra squat feel

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);

    // ---- WHEELS (behind the body) ----
    // wheels stay planted on the ground; when crouching the body drops onto them
    const wheelY = flung ? axleY : (axleY - crouch * CROUCH_DROP);
    for (const wx of [-wheelDX, wheelDX]) {
      drawWheel(wx, wheelY, wheelR, wheelSpin);
    }

    // ---- BODY (car sprite) ----
    if (carReady) {
      ctx.drawImage(carImg, -cw/2, -ch/2 + bodyDY, cw, ch);
    } else {
      ctx.fillStyle='#3a2422';
      ctx.fillRect(-cw/2,-ch/2 + bodyDY,cw,ch);
    }
    ctx.restore();

    // ground press dust when hunkering down
    if (crouch > 0.05 && crouch < 1 && car.anchored) {
      ctx.save();
      ctx.globalAlpha = 0.3 * (1 - crouch);
      ctx.fillStyle = '#b7a98a';
      for (const wx of [-wheelDX, wheelDX]) {
        ctx.beginPath();
        ctx.arc(cx + wx, GROUND_Y - 4, 10 + crouch*14, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }

    // dust under wheels while driving in
    if (state===S.APPROACH) {
      ctx.save();
      ctx.globalAlpha=0.25; ctx.fillStyle='#b7a98a';
      for(let i=0;i<5;i++){
        const dx = cx - 90 - Math.random()*70;
        ctx.beginPath(); ctx.arc(dx,GROUND_Y-6-Math.random()*20,6+Math.random()*10,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // Draw a single wheel procedurally (tire + rim + spokes)
  function drawWheel(x, y, r, spin) {
    ctx.save();
    ctx.translate(x, y);
    // tire
    ctx.fillStyle = '#141414';
    ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
    // tread ring
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0,0,r-3,0,Math.PI*2); ctx.stroke();
    // rim
    ctx.rotate(spin);
    ctx.fillStyle = '#8a8f98';
    ctx.beginPath(); ctx.arc(0,0,r*0.55,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#c9ccd6';
    ctx.beginPath(); ctx.arc(0,0,r*0.22,0,Math.PI*2); ctx.fill();
    // spokes
    ctx.strokeStyle = '#5a5f68'; ctx.lineWidth = 3;
    for (let i=0;i<5;i++){
      const a = (i/5)*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*r*0.2, Math.sin(a)*r*0.2);
      ctx.lineTo(Math.cos(a)*r*0.5, Math.sin(a)*r*0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- boot ----
  show('menu');
  requestAnimationFrame(loop);
})();
