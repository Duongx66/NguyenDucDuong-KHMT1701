// Simple Bắn Gà demo with color-based webcam control (click video to pick color)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.classList.add('glow-canvas');
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
// DOM HUD elements
const domScore = document.getElementById('domScore');
const domLevel = document.getElementById('domLevel');
const domHp = document.getElementById('domHp');
const domHigh = document.getElementById('domHigh');

// offCanvas removed (no color-tracking)

let running = false;
let pickMode = false;
// Hand control (MediaPipe) state
let handsInited = false;
let handEnabled = false;
let handPos = null;
let handsInstance = null;
let mpCamera = null;

// Game state
let W = 900, H = 600;
function resizeCanvas(){
  const rect = canvas.getBoundingClientRect();
  W = Math.max(600, Math.floor(rect.width));
  H = Math.max(400, Math.floor(rect.height));
  canvas.width = W; canvas.height = H;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

let ship = {x: W/2, y: H-60, w: 48, h: 24, speed: 8, fireRate: 800, lastShot: 0, level:1, maxHp:1, hp:1, maxBullets:1, shield:false};
let bullets = [];
let enemies = [];
let powerups = [];
let score = 0;
let highScore = 0;

// High-score persistence
function loadHighScore(){
  try{ const v = localStorage.getItem('bannuoi_highscore'); highScore = v ? parseInt(v,10) : 0; }catch(e){ highScore = 0; }
  if(domHigh) domHigh.textContent = highScore;
}
function saveHighScore(){
  try{ localStorage.setItem('bannuoi_highscore', String(highScore)); }catch(e){}
  if(domHigh) domHigh.textContent = highScore;
}
loadHighScore();
let keys = {};
let particles = [];
let flashes = [];
let shake = 0;
let level = 1;
let enemiesKilled = 0;
let waveSize = 8;
let boss = null;
let gamePaused = false;

// Camera setup
async function startCamera(){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}});
    video.srcObject = stream;
    await video.play();
    // video started
  }catch(e){alert('Không thể truy cập webcam: '+e.message)}
}

// Initialize MediaPipe Hands and camera util
function initHands(){
  if(handsInited) return;
  if(typeof Hands === 'undefined' || typeof Camera === 'undefined'){
    alert('MediaPipe Hands chưa được tải. Kiểm tra kết nối internet hoặc CDN.');
    return;
  }
  handsInstance = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
  handsInstance.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });
  handsInstance.onResults(onHandsResults);

  mpCamera = new Camera(video, {
    onFrame: async () => { await handsInstance.send({image: video}); },
    width: 640,
    height: 480
  });
  handsInited = true;
}

function onHandsResults(results){
  if(!results.multiHandLandmarks || results.multiHandLandmarks.length===0){ handPos = null; return; }
  const lm = results.multiHandLandmarks[0];
  const wrist = lm[0];
  // Map normalized wrist.x (0..1) to canvas X. Use mirrored mapping to match front camera movement.
  const xPix = (1 - wrist.x) * W;
  const yPix = wrist.y * H;
  handPos = {x: xPix, y: yPix};
}

// color-tracking removed (using hand tracking or keyboard)

// color pick removed

startBtn.addEventListener('click', ()=>{ if(!running){ running=true; gameLoop(); startBtn.textContent='Đang chạy' } else { running=false; startBtn.textContent='Bắt đầu' }});

// Hand control button (toggle)
const handBtn = document.getElementById('handBtn');
if(handBtn){
  handBtn.addEventListener('click', ()=>{
    if(!handsInited) initHands();
    handEnabled = !handEnabled;
    handBtn.textContent = handEnabled ? 'Tắt bàn tay' : 'Dùng bàn tay';
    if(handEnabled){ if(mpCamera) mpCamera.start(); }
    else { if(mpCamera) mpCamera.stop(); handPos = null; }
  });
}

// Input fallback
document.addEventListener('keydown',e=>keys[e.key]=true);
document.addEventListener('keyup',e=>keys[e.key]=false);

function spawnEnemy(){
  const x = Math.random()*(W-40)+20; enemies.push({x,y: -40, vx: (Math.random()-0.5)*1.6, vy: 1+Math.random()*1.6, r:20, hp:1 + Math.floor(Math.random()*ship.level)});
}

function spawnPowerup(){
  const types = ['shield','maxHealth','extraBullets','rate'];
  const t = types[Math.floor(Math.random()*types.length)];
  powerups.push({x:Math.random()*(W-40)+20,y:-20,vy:1.2,type:t});
}

function updatePhysics(dt, trackedPos){
  // ship movement
  // ship movement (support X and Y when tracking hand or via arrows)
  if(trackedPos){
    ship.x += (trackedPos.x - ship.x) * 0.12;
    ship.y += (trackedPos.y - ship.y) * 0.12;
  }
  if(keys['ArrowLeft']) ship.x -= ship.speed;
  if(keys['ArrowRight']) ship.x += ship.speed;
  if(keys['ArrowUp']) ship.y -= ship.speed;
  if(keys['ArrowDown']) ship.y += ship.speed;
  ship.x = Math.max(24, Math.min(W-24, ship.x));
  ship.y = Math.max(48, Math.min(H-48, ship.y));

  // shooting
  if(Date.now() - ship.lastShot > ship.fireRate){
    const n = ship.maxBullets || 1;
    const spacing = 12;
    if(n===1){ bullets.push({x:ship.x,y:ship.y-18, vy:-6, enemy:false}); }
    else {
      const mid = (n-1)/2;
      for(let i=0;i<n;i++){
        const ox = (i - mid) * spacing;
        bullets.push({x:ship.x + ox, y:ship.y-18, vy:-6, enemy:false});
      }
    }
    ship.lastShot = Date.now();
    playSfx('shoot');
    flashes.push({x:ship.x,y:ship.y-18,t:120});
  }

  bullets.forEach(b=>{ b.x += (b.vx||0); b.y += b.vy });
  // boss hit by player's bullets
  if(boss){
    for(let i=bullets.length-1;i>=0;i--){ const b = bullets[i]; if(b.enemy) continue; if(Math.hypot(b.x-boss.x,b.y-boss.y) < boss.r){ boss.hp -= 6; bullets.splice(i,1); spawnExplosion(b.x,b.y,'#ffd'); playSfx('hit'); if(boss.hp<=0){ score += 500; } }}
  }
  bullets = bullets.filter(b=>b.y> -40 && b.y < H+80 && b.x > -80 && b.x < W+80);

  enemies.forEach(e=>{ e.x += e.vx; e.y += e.vy; if(e.x<10||e.x>W-10) e.vx*=-1 });
  enemies = enemies.filter(e=>e.y < H+50 && e.hp>0);

  // collisions

  // collisions
  for(let i=enemies.length-1;i>=0;i--){
    let e = enemies[i];
    // enemy firing behavior: some flies drop 'droppings' toward the ship
    if(e.canShoot && Math.random() < (e.shootProb || 0.006)){
      // aim roughly at ship
      const dx = ship.x - e.x; const dy = ship.y - e.y; const mag = Math.hypot(dx,dy) || 1;
      const vx = (dx / mag) * (0.6 + Math.random()*1.2);
      const vy = (dy / mag) * (0.6 + Math.random()*1.6);
      bullets.push({x: e.x, y: e.y + (e.r||12), vx: vx, vy: vy, enemy: true, t: 120});
      // subtle SFX
      if(Math.random() < 0.02) playSfx('hit');
    }

    // check collisions with player's bullets
    for(let j=bullets.length-1;j>=0;j--){
      let b = bullets[j];
      // only player's bullets can hit enemies
      if(b.enemy) continue;
      if(Math.hypot(b.x-e.x,b.y-e.y) < e.r+6){
        e.hp--; bullets.splice(j,1);
        if(e.hp<=0){
          score += 10 + Math.floor(level*2);
          // drop behavior by type
          if(e.dropType === 'power'){
            if(Math.random() < 0.35) spawnPowerup();
          } else if(e.dropType === 'dots'){
            // spawn some small dot particles
            for(let k=0;k<6;k++) particles.push({x:e.x,y:e.y,vx:(Math.random()-0.5)*2,vy:(Math.random()-1.5)*2,size:2,color:'#ffd',life:180});
          } else {
            if(Math.random() < 0.12) spawnPowerup();
          }
          spawnExplosion(e.x,e.y);
          enemies.splice(i,1);
          enemiesKilled++;
        }
        break;
      }
    }

    // enemy collides with ship
    if(Math.hypot(e.x-ship.x,e.y-ship.y) < e.r+20){
      enemies.splice(i,1);
      spawnExplosion(e.x,e.y,'#ffb86b');
      applyDamage(1);
    }
  }

  // enemy bullets hitting ship
  for(let i=bullets.length-1;i>=0;i--){
    const b = bullets[i];
    if(!b.enemy) continue;
    if(Math.hypot(b.x-ship.x,b.y-ship.y) < 18){
      // splat particles for droppings
      for(let k=0;k<8;k++) particles.push({x:b.x,y:b.y,vx:(Math.random()-0.5)*2,vy:(Math.random()-1.5)*2,size:2 + Math.random()*2,color:'#6a3f0b',life:120});
      bullets.splice(i,1);
      applyDamage(1);
    }
  }

  // spawn explosion when removing enemy: handled above by pushing particles where removed

  // powerups move + pickup
  powerups.forEach(p=>{ p.y += p.vy });
  for(let i=powerups.length-1;i>=0;i--){ let p=powerups[i]; if(Math.hypot(p.x-ship.x,p.y-ship.y)<28){
      // shield (blue): consume one hit
      if(p.type==='shield'){
        ship.shield = true; // lasts until consumed; could add timeout
        setTimeout(()=>{ ship.shield = false; }, 10000);
      }
      // maxHealth (red): increase max HP up to 5
      if(p.type==='maxHealth'){
        ship.maxHp = Math.min(5, ship.maxHp+1);
        ship.hp = ship.maxHp;
      }
      // extraBullets (yellow): increase bullets up to 3
      if(p.type==='extraBullets'){
        ship.maxBullets = Math.min(3, ship.maxBullets+1);
      }
      // rate (green): speed up fire rate
      if(p.type==='rate'){
        ship.fireRate = Math.max(120, ship.fireRate - 140);
      }
      powerups.splice(i,1);
      playSfx('power');
      spawnExplosion(p.x,p.y,'#7ff');
  }}

  // update particles
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 16; if(p.life<=0) particles.splice(i,1);
  }
  for(let i=flashes.length-1;i>=0;i--){ flashes[i].t -= 16; if(flashes[i].t<=0) flashes.splice(i,1); }
  if(shake>0) shake = Math.max(0, shake-0.8);

  // update space background elements (stars twinkle / parallax)
  for(let i=0;i<starsNear.length;i++){
    const s = starsNear[i]; s.x += s.speed; s.phase += s.twinkle; if(s.x > W + 20) s.x = -20;
  }
  for(let i=0;i<starsFar.length;i++){
    const s = starsFar[i]; s.x += s.speed; s.phase += s.twinkle*0.5; if(s.x > W + 20) s.x = -20;
  }

}

let lastSpawn=0, lastPower=0;
let waveSpawned = false;
let pendingWave = []; // holds enemies to spawn gradually (used for level 1)
let starsFar = [], starsNear = [], nebulas = [];
let earth = null;

function initSpaceBackground(){
  starsFar = []; starsNear = []; nebulas = [];
  const nFar = Math.max(80, Math.floor(W * H / 6000));
  const nNear = Math.max(30, Math.floor(W * H / 18000));
  for(let i=0;i<nFar;i++) starsFar.push({x: Math.random()*W, y: Math.random()*H, size: Math.random()*1.2+0.4, speed: 0.02 + Math.random()*0.06, phase: Math.random()*Math.PI*2, twinkle: (Math.random()*0.02+0.005)});
  for(let i=0;i<nNear;i++) starsNear.push({x: Math.random()*W, y: Math.random()*H, size: Math.random()*2+0.8, speed: 0.06 + Math.random()*0.12, phase: Math.random()*Math.PI*2, twinkle: (Math.random()*0.04+0.01)});
  // nebulas: soft large gradients
  const nebCount = 3;
  const colors = [['#2b0b3a','#7a2b9a','#ff6ad5'], ['#07133a','#1b6fbf','#7af3ff'], ['#2a0b06','#8a3b0b','#ffd67a']];
  for(let i=0;i<nebCount;i++){
    nebulas.push({x: Math.random()*W, y: Math.random()*H*0.6, r: Math.max(W,H)*0.4*(0.6+Math.random()*0.8), cols: colors[i%colors.length], angle: Math.random()*Math.PI*2});
  }
  // earth placement (bottom-left) scaled to canvas
  earth = { x: Math.max(120, W*0.18), y: Math.max(120, H*0.72), r: Math.min(W,H) * 0.18 };
}

initSpaceBackground();

function spawnWave(lv){
  enemies = enemies || [];
  if(lv % 3 === 0){ // boss level handled elsewhere
    return;
  }
  let count = 12 + lv * 8;
  // make level 1 easier: fewer enemies, slower, less shooting, better drop chance
  if(lv === 1) count = 18;
  if(lv === 2) count = 40;
  waveSize = count;
  for(let i=0;i<count;i++){
    const x = 20 + (i % count) * (W-40) / Math.max(1,count-1) + (Math.random()-0.5)*18;
    const y = -20 + Math.random()*40; // start slightly off-screen for gradual entrance
    // base speed increases with level
    const vx = (Math.random()-0.5) * (0.5 + lv*0.05);
    const vy = 0.12 + Math.random()*0.45 + (lv-1)*0.06;
    const r = 12 + Math.max(0, 2 - Math.floor(lv/3));
    const hp = 1 + Math.floor((lv-1)/3);
    // decide behavior
    let canShoot = false; let shootProb = 0.002 + lv*0.002; // scale with level
    if(lv===1) { canShoot = false; shootProb = 0.0006; } // very slow/no shooting for level 1
    if(lv===2) { canShoot = Math.random() < 0.25; shootProb = 0.006; }
    if(lv>2){ canShoot = Math.random() < Math.min(0.6, 0.15 + lv*0.06); }
    // drop type: level1 -> higher chance of powerups/dots (easier), level2 some powerups, higher levels normal
    const dropType = (lv===1) ? (Math.random()<0.35 ? 'power' : 'dots') : (lv===2 ? (Math.random()<0.25?'power':'normal') : 'normal');
    const enemyObj = {x,y,vx,vy,r,hp,canShoot,shootProb,dropType};
    if(lv === 1){
      // queue level-1 enemies to appear gradually
      pendingWave.push(enemyObj);
    } else {
      enemies.push(enemyObj);
    }
  }
}
function gameLoop(){
  if(!running) return;
  requestAnimationFrame(gameLoop);
  // process tracking: prefer hand tracking when enabled, otherwise color centroid
  let tracked = null;
  if(handEnabled && handPos){ tracked = handPos; }

  const now = Date.now();
  if(!boss){
    // spawn a full wave at level start (or queue it for gradual spawn)
    if(enemies.length === 0 && !waveSpawned){ spawnWave(level); waveSpawned = true; lastSpawn = now; }

    // gradually push pendingWave into active enemies (for level 1)
    if(pendingWave && pendingWave.length > 0){
      const interval = (level === 1) ? 350 : 120; // slower for level 1
      if(now - lastSpawn > interval){
        // spawn 1-2 at a time for level 1
        const take = (level === 1) ? 1 : Math.min(3, pendingWave.length);
        for(let k=0;k<take;k++){
          const e = pendingWave.shift();
          // give a small random offset to x so they don't line up perfectly
          e.x += (Math.random()-0.5)*8;
          enemies.push(e);
        }
        lastSpawn = now;
      }
    } else {
      // occasional additional enemies for small waves
      if(now - lastSpawn > 1200 && enemies.length < waveSize){ spawnEnemy(); lastSpawn = now; }
    }

    if(now - lastPower > 7000 && Math.random()<0.5){ spawnPowerup(); lastPower = now; }
  }

  // boss behavior and spawning
  if(boss){
    boss.x += boss.vx; if(boss.x < boss.r || boss.x > W-boss.r) boss.vx *= -1;
    if(boss.y < 120) boss.y += 0.8;
    if(Date.now() - boss.lastShot > 900){
      bullets.push({x:boss.x-24,y:boss.y+boss.r-6, vy:3, enemy:true});
      bullets.push({x:boss.x+24,y:boss.y+boss.r-6, vy:3, enemy:true});
      boss.lastShot = Date.now();
      playSfx('shoot');
    }
    // boss collides with ship
    if(Math.hypot(boss.x-ship.x,boss.y-ship.y) < boss.r + 24){
      // heavy damage
      applyDamage(2);
    }
  }

  updatePhysics(16, tracked);
  render(tracked);
  checkLevelProgress();
}

function render(tracked){
  // space background: deep gradient, nebulas, stars
  ctx.clearRect(0,0,W,H);
  const bg = ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#000012'); bg.addColorStop(0.5,'#070824'); bg.addColorStop(1,'#020416');
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

  // draw Earth (bottom-left) if initialized
  if(earth){
    ctx.save();
    // planet base
    const e = earth;
    const eg = ctx.createRadialGradient(e.x - e.r*0.25, e.y - e.r*0.25, e.r*0.02, e.x, e.y, e.r);
    eg.addColorStop(0,'#9be7ff'); eg.addColorStop(0.3,'#1e90ff'); eg.addColorStop(1,'#042235');
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,Math.PI*2); ctx.fill();
    // simple continents (stylized)
    ctx.fillStyle = '#2ca84a'; ctx.beginPath(); ctx.ellipse(e.x - e.r*0.18, e.y - e.r*0.05, e.r*0.28, e.r*0.16, 0.6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(e.x + e.r*0.14, e.y + e.r*0.06, e.r*0.22, e.r*0.14, -0.4, 0, Math.PI*2); ctx.fill();
    // atmosphere glow
    ctx.strokeStyle = 'rgba(120,200,255,0.14)'; ctx.lineWidth = Math.max(6, e.r*0.06); ctx.beginPath(); ctx.arc(e.x,e.y,e.r + 6,0,Math.PI*2); ctx.stroke();
    // subtle clouds highlight
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.beginPath(); ctx.ellipse(e.x+e.r*0.2, e.y - e.r*0.25, e.r*0.38, e.r*0.12, -0.3, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    // guardian ship near Earth
    ctx.save();
    const sx = e.x + e.r*0.9; const sy = e.y - e.r*0.7; const ss = Math.max(18, e.r*0.22);
    ctx.translate(sx,sy);
    const rot = Math.sin(Date.now()*0.002)*0.08; ctx.rotate(rot);
    // glow
    const sg = ctx.createRadialGradient(0,0,0,0,0,ss*1.6); sg.addColorStop(0,'rgba(120,220,255,0.12)'); sg.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0,0,ss*1.6,0,Math.PI*2); ctx.fill();
    // ship body
    ctx.fillStyle = '#8fe6ff'; ctx.beginPath(); ctx.moveTo(0,-ss*0.6); ctx.lineTo(ss,0); ctx.lineTo(0,ss*0.6); ctx.lineTo(-ss*0.6,0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#045a66'; ctx.beginPath(); ctx.ellipse(-ss*0.08,0,ss*0.28,ss*0.18,0,0,Math.PI*2); ctx.fill();
    // engine glow
    const eg2 = ctx.createRadialGradient(-ss*0.6,0,0,-ss*0.6,0,ss*0.8); eg2.addColorStop(0,'rgba(255,200,90,0.9)'); eg2.addColorStop(1,'rgba(255,80,20,0)'); ctx.fillStyle = eg2; ctx.beginPath(); ctx.ellipse(-ss*0.9,0,ss*0.18,ss*0.32,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // draw nebulas (soft radial gradients)
  ctx.globalCompositeOperation = 'screen';
  for(let i=0;i<nebulas.length;i++){
    const n = nebulas[i];
    const g = ctx.createRadialGradient(n.x, n.y, n.r*0.05, n.x, n.y, n.r);
    g.addColorStop(0, n.cols[2]);
    g.addColorStop(0.35, n.cols[1]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(n.x, n.y, n.r, n.r*0.6, n.angle, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // draw far stars
  ctx.globalCompositeOperation = 'lighter';
  for(let i=0;i<starsFar.length;i++){
    const s = starsFar[i];
    const a = 0.4 + 0.6 * (0.5 + 0.5*Math.sin(s.phase));
    ctx.fillStyle = 'rgba(220,230,255,'+ (a*0.6) +')';
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  // draw near stars with glow
  for(let i=0;i<starsNear.length;i++){
    const s = starsNear[i];
    const a = 0.6 + 0.8 * (0.5 + 0.5*Math.sin(s.phase));
    const rg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 12);
    rg.addColorStop(0,'rgba(255,255,220,'+a+')'); rg.addColorStop(0.4,'rgba(200,230,255,'+(a*0.6)+')'); rg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(s.x, s.y, s.size*2.2, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // apply shake
  const sx = (Math.random()-0.5)*shake; const sy = (Math.random()-0.5)*shake;
  ctx.save(); ctx.translate(sx,sy);

  // draw bullets: player glowy shots and enemy droppings
  ctx.globalCompositeOperation = 'lighter';
  bullets.forEach(b=>{
    if(b.enemy){
      // droppings: darker, larger core with visible tail and slight rim
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      // main brown oval (slightly larger)
      const ang = Math.atan2(b.vy||1, b.vx||0);
      ctx.fillStyle = 'rgba(84,40,6,0.98)';
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 8, 12, ang, 0, Math.PI*2); ctx.fill();
      // darker inner core
      ctx.fillStyle = 'rgba(40,20,4,1)'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 4, 6, ang, 0, Math.PI*2); ctx.fill();
      // subtle rim highlight on top edge
      ctx.strokeStyle = 'rgba(120,80,30,0.06)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(b.x, b.y-1, 8, 12, ang, 0, Math.PI*2); ctx.stroke();
      // tail streak
      ctx.strokeStyle = 'rgba(60,30,6,0.65)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(b.x - (b.vx||0)*8, b.y - (b.vy||0)*8); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
    } else {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 16);
      g.addColorStop(0,'rgba(255,210,74,0.9)'); g.addColorStop(1,'rgba(255,210,74,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x,b.y,6,0,Math.PI*2); ctx.fill();
    }
  });

  // particles
  particles.forEach(p=>{
    ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0,p.life/300);
    ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
  });

  // enemies (flies) with shadow, wings and compound eyes
  ctx.globalCompositeOperation = 'source-over';
  enemies.forEach(e=>{
    const t = Date.now() * 0.01;
    const flap = Math.sin(t*8 + (e.x+e.y)*0.02) * 0.6; // wing flap animation

    // soft shadow under the fly
    ctx.beginPath(); ctx.fillStyle='rgba(0,0,0,0.14)'; ctx.ellipse(e.x+6,e.y+e.r*0.6,e.r*0.95,e.r*0.45,0,0,Math.PI*2); ctx.fill();

    // body (thorax + abdomen) - dark, slightly elongated
    ctx.save();
    // rotate body in travel direction for a natural pose
    const angle = Math.atan2(e.vy||1, e.vx||0);
    ctx.translate(e.x,e.y);
    ctx.rotate(angle);

    // thorax
    ctx.beginPath(); ctx.fillStyle='#121212'; ctx.ellipse(0,0,e.r*0.7,e.r*0.5,0,0,Math.PI*2); ctx.fill();
    // abdomen (rear darker)
    ctx.beginPath(); ctx.fillStyle='#0b0b0b'; ctx.ellipse(-e.r*0.7,0,e.r*0.55,e.r*0.38,0,0,Math.PI*2); ctx.fill();

    // compound eyes (red-ish) on front-right of thorax
    ctx.fillStyle='#c0392b'; ctx.beginPath(); ctx.arc(e.r*0.5,-e.r*0.18,e.r*0.24,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.r*0.5,e.r*0.18,e.r*0.24,0,Math.PI*2); ctx.fill();

    // delicate translucent wings (animated by flap)
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(220,240,255,0.9)';
    ctx.beginPath(); ctx.ellipse(0,-e.r*0.9,e.r*0.95,e.r*0.45, flap*0.9,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0,e.r*0.9,e.r*0.95,e.r*0.45, -flap*0.9,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    // thin legs (suggestion of legs)
    ctx.strokeStyle='rgba(20,20,20,0.9)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-e.r*0.2,e.r*0.4); ctx.lineTo(-e.r*0.9,e.r*0.9); ctx.moveTo(0,e.r*0.45); ctx.lineTo(-e.r*0.9,e.r*1.1); ctx.stroke();

    ctx.restore();
  });

  // draw boss if present (rendered as a large fly)
  if(boss){
    const t = Date.now() * 0.008;
    // soft shadow
    ctx.beginPath(); ctx.fillStyle='rgba(0,0,0,0.24)'; ctx.ellipse(boss.x+8,boss.y+boss.r*0.6,boss.r*1.1,boss.r*0.55,0,0,Math.PI*2); ctx.fill();

    // wings, body, eyes and antennae
    ctx.save();
    const angle = Math.sin(t)*0.08;
    ctx.translate(boss.x,boss.y);
    ctx.rotate(angle);

    // wings (animated flap)
    const wingFlap = Math.sin(t*12) * 0.6;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(220,240,255,0.9)';
    ctx.beginPath(); ctx.ellipse(0,-boss.r*0.6,boss.r*1.1,boss.r*0.6, wingFlap,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0,boss.r*0.6,boss.r*1.1,boss.r*0.6, -wingFlap,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    // main body (thorax + abdomen)
    ctx.fillStyle = '#0b0b0b'; ctx.beginPath(); ctx.ellipse(0,0,boss.r*0.9,boss.r*0.6,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = '#111'; ctx.ellipse(-boss.r*0.9,0,boss.r*0.7,boss.r*0.45,0,0,Math.PI*2); ctx.fill();

    // compound eyes
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(boss.r*0.5,-boss.r*0.22,boss.r*0.35,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(boss.r*0.5,boss.r*0.22,boss.r*0.35,0,Math.PI*2); ctx.fill();

    // antennae
    ctx.strokeStyle = 'rgba(30,30,30,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(boss.r*0.8,-boss.r*0.3); ctx.quadraticCurveTo(boss.r*1.2,-boss.r*0.9,boss.r*1.4,-boss.r*1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(boss.r*0.8,boss.r*0.3); ctx.quadraticCurveTo(boss.r*1.2,boss.r*0.9,boss.r*1.4,boss.r*1.2); ctx.stroke();

    ctx.restore();

    // boss HP bar
    const bossMaxHp = 200 * level;
    ctx.fillStyle='#333'; ctx.fillRect(boss.x - 90, boss.y - boss.r - 22, 180, 12);
    ctx.fillStyle='#e74c3c'; ctx.fillRect(boss.x - 90, boss.y - boss.r - 22, Math.max(0, (boss.hp / bossMaxHp) * 180), 12);
  }

  // powerups with glow
  ctx.globalCompositeOperation = 'lighter';
  powerups.forEach(p=>{
    const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,20);
    if(p.type==='shield'){ g.addColorStop(0,'#4fd1ff'); g.addColorStop(1,'rgba(79,209,255,0)'); }
    if(p.type==='maxHealth'){ g.addColorStop(0,'#ff6b6b'); g.addColorStop(1,'rgba(255,107,107,0)'); }
    if(p.type==='extraBullets'){ g.addColorStop(0,'#ffd24a'); g.addColorStop(1,'rgba(255,210,74,0)'); }
    if(p.type==='rate'){ g.addColorStop(0,'#7ef27a'); g.addColorStop(1,'rgba(127,242,122,0)'); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x,p.y,12,0,Math.PI*2); ctx.fill();
  });

  // improved ship with glow, cockpit and thruster
  ctx.globalCompositeOperation = 'lighter';
  const shipGlow = ctx.createRadialGradient(ship.x,ship.y,0,ship.x,ship.y,80);
  shipGlow.addColorStop(0,'rgba(78,224,255,0.28)'); shipGlow.addColorStop(1,'rgba(78,224,255,0)');
  ctx.fillStyle = shipGlow; ctx.beginPath(); ctx.arc(ship.x,ship.y,52,0,Math.PI*2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.translate(ship.x,ship.y);
  // hull
  ctx.beginPath(); ctx.fillStyle = '#3ec8ff'; ctx.moveTo(0,-22); ctx.quadraticCurveTo(22,6,0,18); ctx.quadraticCurveTo(-22,6,0,-22); ctx.fill();
  // cockpit glass
  const cg = ctx.createLinearGradient(-6,-10,10,6); cg.addColorStop(0,'#d7f7ff'); cg.addColorStop(1,'#7fd6ff');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(6,-6,10,7,-0.25,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(3,-9,5,3,-0.25,0,Math.PI*2); ctx.fill();
  // small rear plate
  ctx.fillStyle='#056974'; ctx.fillRect(-12,8,24,6);
  // thruster flame when recently shot
  const nowt = Date.now(); const firing = (nowt - ship.lastShot) < 220;
  if(firing){
    const fg = ctx.createRadialGradient(0,24,0,0,24,28); fg.addColorStop(0,'rgba(255,200,80,0.95)'); fg.addColorStop(1,'rgba(255,120,20,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(0,30,12,20,0,0,Math.PI*2); ctx.fill();
  } else {
    const eg = ctx.createRadialGradient(0,26,0,0,26,26); eg.addColorStop(0,'rgba(255,180,70,0.06)'); eg.addColorStop(1,'rgba(255,120,20,0)'); ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(0,30,6,10,0,0,Math.PI*2); ctx.fill();
  }
  // outline
  ctx.strokeStyle='rgba(0,0,0,0.18)'; ctx.lineWidth=1; ctx.stroke();
  ctx.restore();

  // shield visual
  if(ship.shield){
    const sg = ctx.createRadialGradient(ship.x,ship.y,0,ship.x,ship.y,70); sg.addColorStop(0,'rgba(79,209,255,0.18)'); sg.addColorStop(1,'rgba(79,209,255,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(ship.x,ship.y,56,0,Math.PI*2); ctx.fill();
  }

  // muzzle flashes
  ctx.globalCompositeOperation = 'lighter';
  flashes.forEach(f=>{
    const a = Math.max(0, f.t / 120);
    const g = ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,32); g.addColorStop(0,'rgba(255,240,200,'+a+')'); g.addColorStop(1,'rgba(255,160,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x,f.y,24*a,0,Math.PI*2); ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore(); // end shake translate

  // Canvas HUD (small) — also update DOM HUD
  ctx.fillStyle='white'; ctx.font='14px sans-serif'; ctx.fillText('Score: '+score,12,22);
  ctx.fillText('Level: '+level,12,42);
  if(tracked){ ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.arc(tracked.x,tracked.y,18,0,Math.PI*2); ctx.fill(); }

  // update DOM HUD
  if(domScore) domScore.textContent = score;
  if(domLevel) domLevel.textContent = level;
  if(domHp) domHp.textContent = (ship.hp||0) + '/' + (ship.maxHp||1);
  if(domHigh) domHigh.textContent = highScore;
}

// Utility: spawn particle explosion
function spawnExplosion(x,y,color){
  playSfx('explosion');
  shake = Math.max(shake, 8);
  for(let i=0;i<28;i++){ const ang = Math.random()*Math.PI*2; const sp = 1+Math.random()*4; particles.push({x:x,y:y,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp-2,life:220+Math.random()*120,size:2+Math.random()*3,color:color||'#ffb86b'}); }
}

// global helper to apply damage (considers shield)
function applyDamage(amount){
  if(ship.shield){ ship.shield = false; playSfx('power'); return; }
  ship.hp = Math.max(0, ship.hp - amount);
  spawnExplosion(ship.x, ship.y, '#f55'); playSfx('hit'); shake = 8;
  if(ship.hp<=0) return gameOver();
}

// Replace enemy removal to spawn explosion
const origSpawnEnemy = spawnEnemy;
function spawnEnemy(){
  const x = Math.random()*(W-40)+20;
  const y = -40;
  // adjust spawn characteristics by current level to increase difficulty gradually
  const baseSpeed = 0.3 + level * 0.06;
  const vx = (Math.random()-0.5) * Math.max(0.5, baseSpeed);
  const vy = baseSpeed + Math.random()*0.6;
  const r = 10 + Math.floor(Math.random()*4);
  const hp = 1 + Math.floor((level-1)/3);
  const canShoot = (level <= 1) ? (Math.random() < 0.06) : (Math.random() < Math.min(0.6, 0.08 + level*0.06));
  const shootProb = 0.002 + level*0.002;
  const dropType = (level===1) ? (Math.random()<0.25 ? 'power' : 'dots') : (Math.random()<0.12 ? 'power' : 'normal');
  enemies.push({x,y,vx,vy,r,hp,canShoot,shootProb,dropType});
}

// wrap enemy destruction to spawn explosion
const oldUpdatePhysics = updatePhysics;

// Simple SFX functions
function playSfx(type){
  if(!audioCtx) return;
  if(type==='shoot'){
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type='square'; o.frequency.value = 900; g.gain.value = 0.0001; o.connect(g); g.connect(audioCtx.destination);
    const now = audioCtx.currentTime; g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.12, now+0.01); g.gain.exponentialRampToValueAtTime(0.001, now+0.12);
    o.start(now); o.stop(now+0.18);
  }
  if(type==='explosion'){
    // noise burst
    const bufferSize = audioCtx.sampleRate * 0.25; const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate); const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * Math.exp(-i/bufferSize*6);
    const src = audioCtx.createBufferSource(); src.buffer = buffer; const f = audioCtx.createBiquadFilter(); f.type='lowpass'; f.frequency.value = 1200; const g = audioCtx.createGain(); g.gain.value = 0.6; src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start();
  }
  if(type==='power'){
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type='sine'; o.frequency.value = 400; o.connect(g); g.connect(audioCtx.destination); const now = audioCtx.currentTime; g.gain.setValueAtTime(0.001,now); g.gain.linearRampToValueAtTime(0.18, now+0.06); g.gain.exponentialRampToValueAtTime(0.001, now+0.5); o.start(now); o.stop(now+0.6);
  }
  if(type==='hit'){
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type='triangle'; o.frequency.value = 200; o.connect(g); g.connect(audioCtx.destination); const now = audioCtx.currentTime; g.gain.setValueAtTime(0.001,now); g.gain.linearRampToValueAtTime(0.12, now+0.02); g.gain.exponentialRampToValueAtTime(0.001, now+0.18); o.start(now); o.stop(now+0.18);
  }
}

function spawnBoss(){
  boss = {x: W/2, y: -160, vx: 1.6, r:100, hp: 200 * level, lastShot: 0};
  // spawn small minion flies around the boss
  const minionCount = 6 + Math.min(12, Math.floor(level * 2));
  for(let i=0;i<minionCount;i++){
    const angle = (i / minionCount) * Math.PI*2;
    const dist = boss.r + 20 + Math.random()*40;
    const mx = boss.x + Math.cos(angle) * dist + (Math.random()-0.5)*30;
    const my = boss.y + Math.sin(angle) * dist + (Math.random()-0.5)*30 - 40;
    const vx = (Math.random()-0.5) * 1.2;
    const vy = 0.5 + Math.random()*0.8;
    const r = 10 + Math.random()*4;
    const hp = 1;
    const canShoot = Math.random() < 0.35; // some minions attack
    const shootProb = 0.008 + level*0.002;
    enemies.push({x:mx,y:my,vx,vy,r,hp,canShoot,shootProb,dropType:'normal',parentBoss:true});
  }
}

function levelUp(){
  level++;
  enemiesKilled = 0;
  // set waveSpawned to allow spawnWave to run for the new level
  waveSpawned = false;
  // tune wave size by level (overridden by spawnWave for level 1/2)
  waveSize = 12 + level * 8;
  playSfx('power');
  if(level % 3 === 0){ enemies = []; powerups = []; spawnBoss(); showTempOverlay('Boss xuất hiện', 1400); }
  else { showOverlay('Level '+level); setTimeout(hideOverlay,900); }
}

function checkLevelProgress(){
  if(boss && boss.hp<=0){
    spawnExplosion(boss.x,boss.y,'#ffb86b'); playSfx('explosion');
    // remove minions that belong to this boss
    enemies = enemies.filter(e => !e.parentBoss);
    boss = null; showOverlay('Boss bị đánh bại!'); setTimeout(()=>{ hideOverlay(); levelUp(); },1200);
  }
  if(!boss && enemiesKilled >= waveSize){ levelUp(); }
}

function gameOver(){
  running = false;
  // update high score
  let newRecord = false;
  if(score > highScore){ highScore = score; saveHighScore(); newRecord = true; }

  const ov = document.getElementById('overlay');
  const t = document.getElementById('overlayText');
  const rb = document.getElementById('restartBtn');
  // set HTML content for a clearer Game Over screen
  t.innerHTML = '<div class="go-title">GAME OVER</div>' +
                '<div class="go-score">Điểm: ' + score + '</div>' +
                (newRecord ? '<div class="go-new">Kỉ lục mới!</div>' : '<div class="go-best">Kỉ lục: ' + highScore + '</div>');
  rb.style.display = 'inline-block';
  if(ov) ov.classList.remove('hidden');
}

function showOverlay(text){ const ov = document.getElementById('overlay'); const t = document.getElementById('overlayText'); const rb = document.getElementById('restartBtn'); t.textContent = text; ov.classList.remove('hidden'); rb.style.display = 'inline-block'; }
function hideOverlay(){ const ov = document.getElementById('overlay'); ov.classList.add('hidden'); const rb = document.getElementById('restartBtn'); rb.style.display = 'none'; }

function showTempOverlay(text, duration){
  const ov = document.getElementById('overlay');
  const t = document.getElementById('overlayText');
  const rb = document.getElementById('restartBtn');
  t.textContent = text;
  rb.style.display = 'none';
  ov.classList.remove('hidden');
  if(duration && duration>0) setTimeout(()=>{ ov.classList.add('hidden'); }, duration);
}

document.getElementById('restartBtn').addEventListener('click', ()=>{ restartGame(); });

// Start screen controls
const startScreen = document.getElementById('startScreen');
const enterLevel1Btn = document.getElementById('enterLevel1');
const skipIntroBtn = document.getElementById('skipIntro');
if(enterLevel1Btn){ enterLevel1Btn.addEventListener('click', ()=>{
  // hide start screen, ensure level 1 state and begin
  if(startScreen) startScreen.style.display = 'none';
  level = 1; enemies = []; pendingWave = []; waveSpawned = false; enemiesKilled = 0; score = 0; ship.hp = ship.maxHp = 1; spawnWave(1); waveSpawned = true; lastSpawn = Date.now();
  if(!running){ running = true; startBtn.textContent='Đang chạy'; gameLoop(); }
}); }
if(skipIntroBtn){ skipIntroBtn.addEventListener('click', ()=>{ if(startScreen) startScreen.style.display='none'; if(!running){ running=true; startBtn.textContent='Đang chạy'; gameLoop(); } }); }

function restartGame(){
  // reset state
  // reset state
  level = 1; enemies = []; bullets = []; powerups = []; particles = []; boss = null; score = 0; enemiesKilled = 0; waveSize = 8;
  waveSpawned = false;
  pendingWave = [];
  // reset ship upgrades/stats
  ship.level = 1; ship.fireRate = 800; ship.maxHp = 1; ship.hp = 1; ship.maxBullets = 1; ship.shield = false;
  hideOverlay();
  if(!running){ running = true; startBtn.textContent='Đang chạy'; lastSpawn = Date.now(); lastPower = Date.now(); gameLoop(); }
}


// Hook enemy removal to spawn explosion when hp <= 0
// We'll override collisions: re-run a small check each frame and spawn explosions for enemies recently removed is handled in updatePhysics above when hp<=0. To be safe, listen for score change is not necessary.


// start camera immediately
startCamera();
