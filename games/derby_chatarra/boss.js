// @ts-check
/* Derby de Chatarra — Triturador Omega (gran evento de la Gran Final).
   Fase 1 «Escudo»: pala frontal que anula los golpes de frente; carga telegrafiada (carril rojo + bocina). Si choca contra
     un muro, una columna o una barrera eléctrica queda aturdido y expone la cola.
   Fase 2 «Triturador» (≤55 % de vida): sin escudo, el triturador gira; alterna imán triturador (te arrastra hacia la
     trituradora), salto sísmico (círculo naranja + onda expansiva que se esquiva en el aire o lejos) y cargas más rápidas. */
import * as THREE from 'three';
import { BOSS } from './config.js';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/** Calcomanías de telegrafía en el piso. @param {'lane'|'circle'|'ring'} kind @param {number} color */
export function makeDecal(kind, color) {
  let g;
  if (kind === 'lane') { g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); }
  else if (kind === 'ring') { g = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2); }
  else { g = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2); }
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.renderOrder = 3; m.visible = false;
  return m;
}

/**
 * @param {{scene:THREE.Scene, cars:any, arena:()=>any, fx:any, sfx:any, diff:()=>any, player:()=>any, rand:()=>number,
 *   hurtPlayer:(n:number, x:number, z:number, kind:string, knock:number)=>void, onPhase:(n:number)=>void, onDefeat:()=>void,
 *   tip:(id:string)=>void, toast:(t:string, ms?:number)=>void, sparkAt:(x:number,y:number,z:number,c:number)=>void}} G
 */
export function createBoss(G) {
  const d = G.diff();
  const car = G.cars.make({ id: 'omega', name: BOSS.name, model: 'monster', color: 0xd04a2a, isBoss: true, scale: 1.6, hp: d.bossHp, markColor: 0xff3040,
    spec: { mass: BOSS.mass, radius: BOSS.radius, maxSpeed: BOSS.maxSpeed, accel: 15, grip: 9, turn: 1.45, frontDmg: 1.5, nitroRegen: 0 } });
  car.root.visible = false; car.fx.visible = false; car.retired = true;
  const lane = makeDecal('lane', 0xff2020), target = makeDecal('circle', 0xff8a1a), targetRing = makeDecal('ring', 0xffd23a), wave = makeDecal('ring', 0xffa040), magRing = makeDecal('ring', 0xc04dff);
  G.scene.add(lane, target, targetRing, wave, magRing);
  const B = {
    car, phase: 0, sub: 'idle', st: 0, lockYaw: 0, tx: 0, tz: 0, sx: 0, sz: 0, jumpT: 1, attackI: 0, grindCd: 0, ringCd: 0,
    wave: { on: false, x: 0, z: 0, r: 0, hit: false }, deadT: 0, defeated: false, hits: 0, stuns: 0, elecStuns: 0,
    get active() { return B.phase >= 1 && B.phase <= 2; },
    get hp() { return car.hp; }, get maxHp() { return car.maxHp; },
    start, startPhase, update, onWall, zoneMul, onRam, ui, dispose, hurt,
  };

  /** Aparición: entra por el portón norte. */
  function start() {
    const A = G.arena();
    car.retired = false; car.root.visible = true; car.fx.visible = true; car.wrecked = false;
    car.x = 0; car.z = A.gate ? A.gate.z + 8 : 48; car.y = 0; car.yaw = Math.PI; car.vx = car.vz = 0; car.ignoreBounds = true;
    car.hp = car.maxHp = G.diff().bossHp;
    if (car.shield) car.shield.visible = true;
    B.phase = 0; B.sub = 'enter'; B.st = 0;
  }
  /** @param {number} n */
  function startPhase(n) {
    B.phase = n; B.sub = 'pursue'; B.st = n === 1 ? 1.5 : 1.2; car.ignoreBounds = false;
    if (car.z > 34) car.z = 30;
    car.grinderFast = n === 2;
  }
  function nextAttack() {
    const tele = G.diff().bossTele;
    if (B.phase === 1) { B.sub = 'aim'; B.st = tele; G.tip('bossCharge'); G.sfx.horn(true); return; }
    const k = ['magnet', 'jump', 'charge'][B.attackI++ % 3];
    if (k === 'charge') { B.sub = 'aim'; B.st = tele * 0.85; G.sfx.horn(true); }
    else if (k === 'magnet') { B.sub = 'magTele'; B.st = 1.0; G.tip('bossMagnet'); G.sfx.magnetCharge(); }
    else { const P = G.player(); B.sub = 'jumpTele'; B.st = tele * 1.1; B.tx = P.x; B.tz = P.z; G.tip('bossJump'); G.sfx.roar(0.6); }
  }
  /** Multiplicador de daño recibido según la zona golpeada y el estado. @param {string} zone */
  function zoneMul(zone) {
    if (B.sub === 'enter' || B.sub === 'trans' || B.sub === 'dead' || B.phase === 0) return 0;
    const stun = car.stunT > 0 ? (B.phase === 1 ? 1.25 : 1.3) : 1;
    if (B.phase === 1) return (zone === 'f' ? 0 : zone === 'b' ? 1.6 : 1.0) * stun;
    return (zone === 'f' ? 0.6 : zone === 'b' ? 1.5 : 1.0) * stun;
  }
  /** daño directo (barrera eléctrica, minas) @param {number} n */
  function hurt(n) {
    if (B.sub === 'enter' || B.sub === 'trans' || B.sub === 'dead' || B.phase === 0) return;
    car.hp = Math.max(0, car.hp - n); car.flashT = 0.12; check();
  }
  function check() {
    if (B.phase === 1 && car.hp <= car.maxHp * 0.55) {
      B.sub = 'trans'; B.st = 2.4; car.stunT = 0; lane.visible = false;
      if (car.shield) car.shield.visible = false;
      G.fx.debris(car.x + Math.sin(car.yaw) * 4, 2.5, car.z + Math.cos(car.yaw) * 4, 24, 0x3ec8ff, 10);
      G.fx.explosion(car.x + Math.sin(car.yaw) * 4, 1.5, car.z + Math.cos(car.yaw) * 4, 1.2);
      G.sfx.shieldBreak(); G.sfx.roar(1);
      G.onPhase(2);
    }
    if (car.hp <= 0 && B.sub !== 'dead') {
      B.sub = 'dead'; B.deadT = 0; car.wrecked = true; car.stunT = 0; lane.visible = target.visible = targetRing.visible = magRing.visible = false;
      G.sfx.explosion(1.5);
    }
  }
  /** El jefe chocó contra algo (muro, columna, barrera). */
  function onWall(impact, obj) {
    if (B.sub !== 'charge' || impact < 9) return;
    const elec = obj && obj.kind === 'elec';
    car.stunT = elec ? 4.2 : 3.0; B.sub = 'stun'; B.st = car.stunT; B.stuns++;
    car.vx *= 0.2; car.vz *= 0.2;
    G.fx.sparks(car.x + Math.sin(car.yaw) * 4, 1.5, car.z + Math.cos(car.yaw) * 4, 26, elec ? 0x3cf0ff : 0xffd27a, 12);
    G.fx.shake(0.7);
    if (elec) { B.elecStuns++; hurt(40); G.sfx.zap(); G.toast('⚡ ¡Omega electrocutado! −40 y aturdido: pegale atrás', 2200); }
    else G.toast('💫 ¡Omega aturdido! Pegale en la cola o los costados', 2000);
    G.sfx.crash(1.2);
  }
  /** El jefe embistió a un auto durante la carga. */
  function onRam() { if (B.sub === 'charge') B.st = Math.max(B.st, 0.6); }

  function update(dt) {
    const A = G.arena(), P = G.player(), ctl = car.ctl;
    ctl.throttle = 0; ctl.steer = 0; ctl.handbrake = false; ctl.nitro = false;
    if (B.sub === 'idle') return;
    if (car.stunT > 0) car.stunT -= dt;
    B.st -= dt;
    const aimP = () => { const ang = wrap(Math.atan2(P.x - car.x, P.z - car.z) - car.yaw); return { steer: clamp(-ang * 2.5, -1, 1), ang, dist: Math.hypot(P.x - car.x, P.z - car.z) }; };
    // calcomanías
    lane.visible = B.sub === 'aim';
    if (lane.visible) { lane.position.set(car.x, A.heightAt(car.x, car.z) + 0.06, car.z); lane.rotation.y = car.yaw; lane.scale.set(5.5, 1, 46); /** @type {any} */ (lane.material).opacity = 0.25 + 0.35 * Math.abs(Math.sin(B.st * 14)); }
    target.visible = targetRing.visible = B.sub === 'jumpTele' || B.sub === 'jump';
    if (target.visible) {
      const k = B.sub === 'jumpTele' ? 1 : 1 - B.jumpT;
      target.position.set(B.tx, A.heightAt(B.tx, B.tz) + 0.07, B.tz); target.scale.setScalar(4.5 * (0.4 + 0.6 * Math.min(1, k + 0.2)));
      targetRing.position.copy(target.position); targetRing.scale.setScalar(4.6);
      /** @type {any} */ (target.material).opacity = 0.25 + 0.25 * Math.abs(Math.sin(B.st * 10));
    }
    magRing.visible = B.sub === 'magTele' || B.sub === 'magnet';
    if (magRing.visible) { const k = (performance.now() / 600) % 1; magRing.position.set(car.x, 0.1, car.z); magRing.scale.setScalar(B.sub === 'magnet' ? 22 - k * 18 : 4 + k * 14); }
    // onda sísmica
    if (B.wave.on) {
      B.wave.r += dt * 24;
      wave.visible = true; wave.position.set(B.wave.x, 0.12, B.wave.z); wave.scale.setScalar(B.wave.r);
      /** @type {any} */ (wave.material).opacity = Math.max(0, 1 - B.wave.r / 24);
      if (!B.wave.hit && P && !P.wrecked && P.grounded && P.y < 0.6) {
        const dd = Math.hypot(P.x - B.wave.x, P.z - B.wave.z);
        if (Math.abs(dd - B.wave.r) < 1.6) { B.wave.hit = true; G.hurtPlayer(14, B.wave.x, B.wave.z, 'onda', 14); }
      }
      if (B.wave.r > 24) { B.wave.on = false; wave.visible = false; }
    }

    switch (B.sub) {
      case 'enter': {
        car.speedMul = 0.35; ctl.throttle = 0.8;
        const ang = wrap(Math.atan2(0 - car.x, 22 - car.z) - car.yaw); ctl.steer = clamp(-ang * 2, -1, 1);
        if (car.z < 34) car.ignoreBounds = false;
        if (car.z < 24) ctl.throttle = car.speed > 1 ? -1 : 0;
        break;
      }
      case 'pursue': {
        car.speedMul = B.phase === 1 ? 0.36 : 0.45;
        const w = aimP(); ctl.steer = w.steer; ctl.throttle = 1;
        if (B.st <= 0) nextAttack();
        break;
      }
      case 'aim': {
        car.speedMul = 1;
        const w = aimP(); ctl.steer = w.steer; ctl.throttle = car.speed > 2 ? -1 : 0;
        if (B.st <= 0) { B.sub = 'charge'; B.st = 3.4; B.lockYaw = car.yaw; G.sfx.roar(0.8); }
        break;
      }
      case 'charge': {
        car.speedMul = 1; ctl.throttle = 1; ctl.steer = clamp(-wrap(B.lockYaw - car.yaw) * 2, -0.2, 0.2);
        if (B.st <= 0) { B.sub = 'recover'; B.st = 0.8; }
        break;
      }
      case 'stun': if (car.stunT <= 0) { B.sub = 'pursue'; B.st = B.phase === 1 ? 1.6 : 1.1; } break;
      case 'recover': ctl.throttle = car.speed > 1 ? -1 : 0; if (B.st <= 0) { B.sub = 'pursue'; B.st = B.phase === 1 ? 2.2 : 1.6; } break;
      case 'trans': {
        ctl.throttle = car.speed > 1 ? -1 : 0;
        if (Math.random() < dt * 8) G.fx.sparks(car.x, 3, car.z, 4, 0xff5a1a, 8);
        G.fx.shake(dt * 0.6);
        if (B.st <= 0) startPhase(2);
        break;
      }
      case 'magTele': {
        const w = aimP(); ctl.steer = w.steer; ctl.throttle = car.speed > 1 ? -1 : 0;
        if (B.st <= 0) { B.sub = 'magnet'; B.st = 2.6; G.sfx.magnet(); }
        break;
      }
      case 'magnet': {
        const w = aimP(); ctl.steer = w.steer; ctl.throttle = car.speed > 1 ? -1 : 0;
        const fx = car.x + Math.sin(car.yaw) * 4.6, fz = car.z + Math.cos(car.yaw) * 4.6;
        if (P && !P.wrecked) {
          const dx = fx - P.x, dz = fz - P.z, dd = Math.hypot(dx, dz) || 1;
          const pull = (P.spec.magnetImmune ? 0.25 : 1) * (P.shieldT > 0 ? 0.2 : 1) * G.diff().magnetPull;
          P.vx += dx / dd * pull * dt; P.vz += dz / dd * pull * dt;
          B.grindCd -= dt;
          if (dd < P.radius + 2.4 && B.grindCd <= 0) { B.grindCd = 0.35; G.hurtPlayer(5, car.x, car.z, 'triturador', 3); G.sparkAt(fx, 1.2, fz, 0xffd27a); G.sfx.grind(); }
        }
        B.ringCd -= dt; if (B.ringCd <= 0) { B.ringCd = 0.3; G.fx.ring(car.x, 0.2, car.z, 0xc04dff, 18, 0.5); }
        if (B.st <= 0) { B.sub = 'pursue'; B.st = 1.6; }
        break;
      }
      case 'jumpTele': {
        ctl.throttle = car.speed > 1 ? -1 : 0;
        car.bounce = -0.5 * Math.min(1, 1 - B.st);
        if (B.st <= 0) { B.sub = 'jump'; B.jumpT = 1.0; B.sx = car.x; B.sz = car.z; car.manualY = true; G.sfx.jumpBig(); }
        break;
      }
      case 'jump': {
        B.jumpT -= dt;
        const k = 1 - Math.max(0, B.jumpT);
        const nx = B.sx + (B.tx - B.sx) * k, nz = B.sz + (B.tz - B.sz) * k;
        car.vx = (nx - car.x) / dt; car.vz = (nz - car.z) / dt; car.vy = 0;
        car.x = nx - car.vx * dt; car.z = nz - car.vz * dt; // la física integra hasta nx,nz
        car.y = A.heightAt(nx, nz) + Math.sin(k * Math.PI) * 9;
        if (B.jumpT <= 0) {
          car.manualY = false; car.vx = car.vz = 0; car.y = A.heightAt(car.x, car.z); car.grounded = true;
          B.wave = { on: true, x: B.tx, z: B.tz, r: 1, hit: false };
          G.fx.explosion(B.tx, 0.3, B.tz, 1.1); G.fx.ring(B.tx, 0.2, B.tz, 0xffa040, 20, 0.9); G.sfx.slam(1.4);
          if (P && !P.wrecked && P.y < 2 && Math.hypot(P.x - B.tx, P.z - B.tz) < car.radius + P.radius + 0.8) { B.wave.hit = true; G.hurtPlayer(22, B.tx, B.tz, 'aplastado', 16); }
          car.stunT = 1.6; B.sub = 'stun'; B.st = 1.6;
        }
        break;
      }
      case 'dead': {
        B.deadT += dt;
        if (Math.random() < dt * 6) G.fx.explosion(car.x + (Math.random() - 0.5) * 6, 1 + Math.random() * 2, car.z + (Math.random() - 0.5) * 6, 0.7);
        if (B.deadT > 2.4 && !B.defeated) { B.defeated = true; B.phase = 3; G.fx.explosion(car.x, 2, car.z, 2); G.fx.debris(car.x, 3, car.z, 40, 0x5a2a1e, 14); G.onDefeat(); }
        break;
      }
    }
  }
  function ui() {
    return { name: BOSS.name, hp: Math.max(0, car.hp), max: car.maxHp, phase: B.phase, sub: B.sub,
      label: B.phase === 1 ? 'FASE 1 · ESCUDO FRONTAL' : B.phase === 2 ? 'FASE 2 · TRITURADOR' : B.sub === 'enter' ? 'LLEGANDO' : '' };
  }
  function dispose() {
    for (const m of [lane, target, targetRing, wave, magRing]) { m.removeFromParent(); m.geometry.dispose(); /** @type {any} */ (m.material).dispose(); }
    G.cars.remove(car);
  }
  return B;
}
