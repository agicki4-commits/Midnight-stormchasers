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
  const SURVIVABLE_INDEX = 2; // (legacy) Dominator 1 survives up to EF2 (index 2)

  // helper: EF label -> storm index
  const EF_INDEX = {};
  STORMS.forEach((s,i)=>{ EF_INDEX[s.name]=i; });

  // ---- Interceptors (buyable). surviveIdx = highest storm index survived.
  //  crouches: body squats onto its wheels on deploy (Dominator style)
  //  armorSprite: swap to this sprite when deployed (Dorothy style)
  //  wheels: draw the two code-drawn wheels
  const INTERCEPTORS = [
    { id:'dom1', name:'Dominator 1', owned:true,  price:0,    survive:'EF2',
      sprite:'assets/dominator1.png', crouches:true, wheels:true, clearanceCm:5,
      note:'Reed-Timmer-style TIV. 5 cm clearance — hunkers its body flat to the ground.' },
    { id:'dorothy', name:'Dorothy', owned:false, price:1000, survive:'EF3',
      sprite:'assets/dorothy.png', armorSprite:'assets/dorothyArmor.png', crouches:true, wheels:false,
      clearanceCm:10, armorCm:10,
      note:'Twister-style pod. 10 cm clearance — lowers 5 cm and drops a 10 cm armor skirt that perfectly seals the gap to the ground.' },
    { id:'dom2', name:'Dominator 2', owned:false, price:2500, survive:'EF3',
      sprite:'assets/dominator1.png', crouches:true, wheels:true, clearanceCm:5,
      note:'Reinforced chassis. Deeper stance.' },
    { id:'dom3', name:'Dominator 3', owned:false, price:4500, survive:'EF4',
      sprite:'assets/dominator1.png', crouches:true, wheels:true, clearanceCm:5,
      note:'Aero flaps push it into the ground.' },
    { id:'tiv2', name:'TIV 2',       owned:false, price:9000, survive:'EF5',
      sprite:'assets/dominator1.png', crouches:true, wheels:true, clearanceCm:5,
      note:'Hydraulic claws. Bulletproof glass.' },
    { id:'apex', name:'Apex Hunter', owned:false, price:20000,survive:'EF5+',
      sprite:'assets/dominator1.png', crouches:true, wheels:true, clearanceCm:5,
      note:'Prototype. Magnetic ground lock.' },
  ];

  // pixels-per-centimetre scale (visual). 5 cm -> 20 px lowering, etc.
  const PX_PER_CM = 4;

  // ---- Economy / save state ----
  const SAVE_KEY = 'midnight_chasers_save_v1';
  let coins = 0;
  let owned = { dom1:true };
  let selectedId = 'dom1';
  function loadSave(){
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s){ coins=s.coins||0; owned=Object.assign({dom1:true}, s.owned||{}); selectedId=s.selectedId||'dom1'; }
    } catch(e){}
    if (!owned[selectedId]) selectedId='dom1';
  }
  function saveGame(){
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({coins, owned, selectedId})); } catch(e){}
  }
  function getVehicle(id){ return INTERCEPTORS.find(v=>v.id===id); }
  function activeVehicle(){ return getVehicle(selectedId); }
  // reward: stronger tornado -> more coins
  function stormReward(idx){ return 100 + idx*140; }

  // ---- DOM refs ----
  const screens = {
    menu: document.getElementById('menu'),
    select: document.getElementById('select'),
    shop: document.getElementById('shop'),
    result: document.getElementById('result'),
  };
  const hud = document.getElementById('hud');
  const prompt = document.getElementById('prompt');
  const coinBar = document.getElementById('coinBar');

  function refreshCoins(){ document.getElementById('coinAmt').textContent = coins.toLocaleString(); }

  // ---- assets: one Image per unique sprite path ----
  const imgCache = {};
  function getImg(path){
    if (!imgCache[path]){
      const im = new Image(); im.src = path; im._ready=false;
      im.onload=()=>{ im._ready=true; };
      imgCache[path]=im;
    }
    return imgCache[path];
  }
  // preload all vehicle sprites
  INTERCEPTORS.forEach(v=>{ getImg(v.sprite); if(v.armorSprite) getImg(v.armorSprite); });

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
  let armorDrop = 0;       // 0..1 Dorothy armor skirt descending
  let wheelSpin = 0;       // rotation of the wheels
  let cameraShake = 0;
  let tornadoWorldX = W + 400; // starts off right, approaches car
  let stateTime = 0;
  let outcome = null;
  let runVeh = null;        // vehicle used for the current run
  let runSurviveIdx = 2;    // highest storm index this run's vehicle survives
  let armorDeployed = false; // Dorothy-style armor shell dropped

  // ============================================================
  //  Screen helpers
  // ============================================================
  function show(name) {
    for (const k in screens) screens[k].classList.add('hidden');
    hud.classList.add('hidden');
    prompt.classList.add('hidden');
    if (screens[name]) screens[name].classList.remove('hidden');
    // coin balance visible on menu-type screens
    const onMenu = (name==='menu'||name==='select'||name==='shop'||name==='result');
    coinBar.classList.toggle('hidden', !onMenu);
    if (onMenu) refreshCoins();
  }

  function buildSelect() {
    const veh = activeVehicle();
    const surviveIdx = EF_INDEX[veh.survive];
    const grid = document.getElementById('efGrid');
    grid.innerHTML = '';
    STORMS.forEach((s, i) => {
      const survives = i <= surviveIdx;
      const pct = Math.min(100, (s.wind / 320) * 100);
      const barColor = i <= 2 ? '#4dffa1' : i <= 5 ? '#ffd24d' : '#ff5470';
      const card = document.createElement('div');
      card.className = 'ef-card';
      card.innerHTML = `
        <span class="badge ${survives?'surv':'fatal'}">${survives?'SURVIVABLE':'FATAL'}</span>
        <div class="ef-name">${s.name}</div>
        <div class="ef-wind">${s.wind} mph winds</div>
        <div class="ef-desc">${s.desc}</div>
        <div style="font-size:12px;color:#ffe6a0;margin-top:6px">🪙 +${stormReward(i)} on survive</div>
        <div class="ef-bar"><i style="width:${pct}%;background:${barColor}"></i></div>`;
      card.onclick = () => startRun(i);
      grid.appendChild(card);
    });

    // active vehicle info + owned-vehicle picker
    const ownedVehs = INTERCEPTORS.filter(v=>owned[v.id]);
    const chips = ownedVehs.map(v=>`
      <div class="veh-chip ${v.id===selectedId?'active':''}" data-veh="${v.id}">
        ${v.name}<small>up to ${v.survive}</small>
      </div>`).join('');
    document.getElementById('activeInfo').innerHTML = `
      <span class="tag">ACTIVE INTERCEPTOR</span>
      <b>${veh.name}</b> — survives up to <span class="good">${veh.survive}</span>. Stronger storms rip it away.
      <div class="vehsel">${chips}</div>`;
    document.querySelectorAll('.veh-chip').forEach(ch=>{
      ch.onclick = ()=>{ selectedId = ch.dataset.veh; saveGame(); buildSelect(); };
    });
  }

  function buildShop() {
    refreshCoins();
    const grid = document.getElementById('shopGrid');
    grid.innerHTML = '';
    INTERCEPTORS.forEach(c => {
      const isOwned = !!owned[c.id];
      const canAfford = coins >= c.price;
      const card = document.createElement('div');
      card.className = 'shop-card';
      let btn;
      if (isOwned) btn = `<button class="buy owned" disabled>✓ OWNED</button>`;
      else btn = `<button class="buy" data-buy="${c.id}" ${canAfford?'':'disabled'}>
                    ${canAfford ? 'BUY' : 'NOT ENOUGH'} 🪙 ${c.price.toLocaleString()}
                  </button>`;
      card.innerHTML = `
        <h3>${c.name}</h3>
        <small>Survives up to <b style="color:#4dffa1">${c.survive}</b></small>
        <p style="margin-top:8px;color:#b9c0e6;font-size:13px">${c.note}</p>
        <div class="price">${c.price === 0 ? 'STARTER' : '🪙 ' + c.price.toLocaleString()}</div>
        ${btn}`;
      grid.appendChild(card);
    });
    document.querySelectorAll('[data-buy]').forEach(b=>{
      b.onclick = ()=> buyVehicle(b.dataset.buy);
    });
  }

  function buyVehicle(id){
    const v = getVehicle(id);
    if (!v || owned[id] || coins < v.price) return;
    coins -= v.price;
    owned[id] = true;
    selectedId = id;      // auto-equip the new interceptor
    saveGame();
    refreshCoins();
    buildShop();
  }

  // ============================================================
  //  Start a run
  // ============================================================
  function startRun(stormIndex) {
    storm = STORMS[stormIndex];
    storm._index = stormIndex;
    outcome = null;
    runVeh = activeVehicle();
    runSurviveIdx = EF_INDEX[runVeh.survive];

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
    armorDrop = 0;
    wheelSpin = 0;
    armorDeployed = false;
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
    if (runVeh.armorSprite) armorDeployed = true; // Dorothy drops its armor shell
    const msg = runVeh.armorSprite ? 'Lowered & armor deployed — bracing for impact!'
                                   : 'Hunkered down — bracing for impact!';
    document.getElementById('hudPhase').textContent = msg;
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
        const msg = runVeh.armorSprite ? 'In position. Press SPACE to lower & deploy armor!'
                                       : 'In position. Press SPACE to hunker down!';
        document.getElementById('hudPhase').textContent = msg;
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
      // car presses down to the ground: BOTH Dominator and Dorothy lower 5 cm.
      crouch = Math.min(1, crouch + dt * 3);
      if (armorDeployed) armorDrop = Math.min(1, armorDrop + dt * 3);

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
    const survivable = storm._index <= runSurviveIdx;
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
    const rewardEl = document.getElementById('reward');
    const nm = runVeh.name;
    if (survived) {
      title.textContent = 'SURVIVED';
      title.className = 'win';
      const action = runVeh.armorSprite ? 'lowered and sealed its armor skirt to the ground'
                                        : 'pressed down and held its ground';
      text.innerHTML = `The ${nm} ${action} through the <b>${storm.name}</b> (${storm.wind} mph). Stronger storms pay more.`;
      // award coins — bigger storm = more coins
      const gain = stormReward(storm._index);
      coins += gain;
      saveGame();
      rewardEl.textContent = `🪙 +${gain} coins`;
      rewardEl.classList.remove('hidden');
    } else {
      title.textContent = 'INTERCEPTOR LOST';
      title.className = 'lose';
      text.innerHTML = `The <b>${storm.name}</b> (${storm.wind} mph) overpowered the ${nm} and threw it. It only rates for <b>${runVeh.survive}</b> — you need a stronger interceptor.`;
      rewardEl.classList.add('hidden');
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

    const cx = carX;
    let ang = -carTilt; // wheelie tilts nose up
    let flung = false;

    // sprite draw size
    const cw = 240, ch = 130;

    // ---- clearance / lowering in centimetres -> pixels ----
    // driving clearance (per vehicle); on deploy the body drops exactly 5 cm.
    const driveClearCm = runVeh.clearanceCm || 5;
    const loweredClearCm = Math.max(0, driveClearCm - 5 * crouch); // 5cm drop
    const clearPx = loweredClearCm * PX_PER_CM;

    // ground contact y (screen space). local origin will sit at ground.
    let groundLocalY = GROUND_Y;
    if (!car.anchored && state!==S.WAIT && state!==S.APPROACH) {
      // flung: follow physics body, sprite centre = car.position.y
      groundLocalY = car.position.y + ch/2 + (driveClearCm*PX_PER_CM);
      ang = car.angle;
      flung = true;
    }

    // which sprite to draw for the body
    const bodyImg = getImg(runVeh.sprite);
    const armorImg = runVeh.armorSprite ? getImg(runVeh.armorSprite) : null;

    ctx.save();
    ctx.translate(cx, groundLocalY);  // local y = 0 is the ground line
    ctx.rotate(ang);

    // body rectangle in local space: bottom sits `clearPx` above ground
    const bodyBottom = -clearPx;
    const bodyTop = bodyBottom - ch;
    const bodyLeft = -cw/2;

    // visible body horizontal extent (sprite has transparent padding),
    // used to clip wheels so they never stick out past the car.
    const inset = cw * 0.13;
    const clipLeft = bodyLeft + inset;
    const clipRight = -bodyLeft - inset;

    // ---- WHEELS (drawn in code, NOT a PNG) ----
    // Fixed-size wheels. They sit on the ground; the BODY drops down over them.
    // We only draw the part of each wheel that shows in the gap under the body,
    // so as the car presses to the ground the wheels tuck away (they do NOT shrink).
    if (runVeh.wheels) {
      const wheelR = 20;                 // FIXED radius — never changes
      const wheelDX = cw * 0.26;         // inside the body width
      const gapTop = bodyBottom;         // top of the visible under-body gap (<=0)
      if (gapTop < -0.5) {               // only if there is a gap to show wheels in
        ctx.save();
        // clip to the gap between the body's bottom edge and the ground line
        ctx.beginPath();
        ctx.rect(clipLeft, gapTop, clipRight - clipLeft, -gapTop);
        ctx.clip();
        for (const wx of [-wheelDX, wheelDX]) {
          drawWheel(wx, -wheelR, wheelR, wheelSpin); // bottom of wheel on ground
        }
        ctx.restore();
      }
    }

    // ---- BODY (vehicle sprite) ----
    if (bodyImg && bodyImg._ready) {
      ctx.drawImage(bodyImg, bodyLeft, bodyTop, cw, ch);
    } else {
      ctx.fillStyle='#3a2422';
      ctx.fillRect(bodyLeft, bodyTop, cw, ch);
    }

    // ---- DOROTHY ARMOR SKIRT (drawn ON TOP so the seal is visible) ----
    // A LARGE panel: overlaps up onto the lower body and extends down to the
    // ground, visually connected to the car and fully sealing the gap.
    if (armorImg && armorDeployed) {
      const overlap = ch * 0.55;          // how far the armor rides up over the body
      const gapPx = -bodyBottom;          // body-bottom -> ground distance
      const armorH = overlap + gapPx;     // full panel height (big)
      const armorTopFinal = bodyBottom - overlap; // where the panel top ends up
      // animate: slide the whole panel down into place
      const slide = (1 - armorDrop) * armorH;
      const armorTop = armorTopFinal + slide;
      const armorW = (clipRight - clipLeft) * 1.06; // a touch wider than body inset
      const armorX = -armorW / 2;
      ctx.save();
      // clip so the panel never draws below the ground line
      ctx.beginPath();
      ctx.rect(armorX, armorTopFinal - 4, armorW, (0) - (armorTopFinal - 4));
      ctx.clip();
      if (armorImg._ready) {
        ctx.drawImage(armorImg, armorX, armorTop, armorW, armorH);
      } else {
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(armorX, armorTop, armorW, armorH);
      }
      ctx.restore();
    }

    ctx.restore();

    // ground press dust when lowering
    if (crouch > 0.05 && crouch < 1 && car.anchored) {
      ctx.save();
      ctx.globalAlpha = 0.3 * (1 - crouch);
      ctx.fillStyle = '#b7a98a';
      for (let i=0;i<4;i++){
        const dx = cx + (Math.random()-0.5)*180;
        ctx.beginPath();
        ctx.arc(dx, GROUND_Y - 4, 8 + crouch*14, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }

    // dust burst when Dorothy's armor slams down
    if (armorDeployed && armorDrop < 1 && car.anchored) {
      ctx.save();
      ctx.globalAlpha = 0.35 * (1 - armorDrop);
      ctx.fillStyle = '#b7a98a';
      for (let i=0;i<8;i++){
        const dx = cx + (Math.random()-0.5)*220;
        ctx.beginPath();
        ctx.arc(dx, GROUND_Y - 4 - Math.random()*20, 8+Math.random()*16, 0, Math.PI*2);
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
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0,0,r-2,0,Math.PI*2); ctx.stroke();
    // rim
    ctx.rotate(spin);
    ctx.fillStyle = '#8a8f98';
    ctx.beginPath(); ctx.arc(0,0,r*0.55,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#c9ccd6';
    ctx.beginPath(); ctx.arc(0,0,r*0.22,0,Math.PI*2); ctx.fill();
    // spokes
    ctx.strokeStyle = '#5a5f68'; ctx.lineWidth = 2;
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
  loadSave();
  refreshCoins();
  show('menu');
  requestAnimationFrame(loop);
})();
