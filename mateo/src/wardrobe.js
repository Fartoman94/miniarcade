// Mateo: Ciudad de Altura — V2 P2: modos CIVIL / HÉROE y vestuario por ranuras (remera/buzo, pantalón, zapatillas,
// accesorio, traje completo). Mismo rig y misma malla de Mateo (no se reemplaza el cuerpo ni la cara): la ropa se
// «pinta» re-coloreando los vértices de la malla con piel según su color original del traje M y el hueso que la mueve
// (torso, brazos, piernas, pies). En civil se ocultan el emblema M y los emisores de cable; las mangas cortas dejan ver
// los antebrazos. Accesorios (gorra, mochila) = mallas hijas de huesos. Trajes de héroe: variantes de color del traje
// ORIGINAL (azul/rojo con la M propia), desbloqueables por reputación. Sin marcas ni diseños de terceros.
import * as THREE from 'three';

const ORIG = { suit: 0x1f2c52, panel: 0x394150, accent: 0xd63031, trim: 0xf5f5f5 };
const SKIN = 0xf0c6a0;
const _c = new THREE.Color(), _d = new THREE.Color();

/** zona del cuerpo según el hueso dominante del vértice */
function region(bone) {
  if (/^(foot|toes)_/.test(bone)) return 'feet';
  if (/^(hips|upperleg|lowerleg)/.test(bone)) return 'legs';
  if (/^(lowerarm|hand)_/.test(bone)) return 'forearm';
  if (/^(chest|spine|neck|clavicle|upperarm)/.test(bone)) return 'top';
  return 'other';
}

/**
 * @param {{ hero: any, data: any, onChange?: (info:any)=>void }} o
 * data = game/data/vestuario.json
 */
export function createWardrobe({ hero, data }) {
  let body = null;
  hero.group.traverse(o => { if (o.isSkinnedMesh && o.geometry.attributes.color && !body) body = o; });
  const col = body ? body.geometry.attributes.color : null;
  const n = col ? col.count : 0;
  const orig = col ? Float32Array.from({ length: n * 3 }, (_, i) => col.getComponent(Math.floor(i / 3), i % 3)) : new Float32Array(0);
  // clasificación una sola vez: color original (traje/panel/acento/ribete/otro) × zona por hueso dominante
  const pal = Object.fromEntries(Object.entries(ORIG).map(([k, h]) => [k, new THREE.Color().setHex(h)]));
  const cls = new Uint8Array(n), reg = new Uint8Array(n);
  const CLS = ['other', 'suit', 'panel', 'accent', 'trim'], REG = ['other', 'top', 'forearm', 'legs', 'feet'];
  if (body) {
    const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight, bones = body.skeleton.bones;
    for (let i = 0; i < n; i++) {
      _c.setRGB(orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2]);
      let best = 0, bd = 0.004;
      for (let k = 1; k < CLS.length; k++) { const p = pal[CLS[k]], d = (p.r - _c.r) ** 2 + (p.g - _c.g) ** 2 + (p.b - _c.b) ** 2; if (d < bd) { bd = d; best = k; } }
      cls[i] = best;
      let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
      reg[i] = REG.indexOf(region(bones[bi] ? bones[bi].name : ''));
      if (reg[i] < 0) reg[i] = 0;
    }
  }
  const byName = n2 => hero.group.getObjectByName(n2);
  const emblem = byName('emblema_M'), emitters = [byName('emisor_L'), byName('emisor_R')].filter(Boolean);
  const emblemMs = []; if (emblem) emblem.traverse(o => { if (o.isMesh) emblemMs.push(o); });
  const head = (hero.bones && hero.bones.head) || byName('head'), chest = (hero.bones && hero.bones.chest) || byName('chest');

  /* ---------- accesorios (mallas hijas de huesos) ---------- */
  const acc = {};
  if (head) {
    const g = new THREE.Group(); g.name = 'acc_gorra';
    const m = new THREE.MeshStandardMaterial({ color: 0x2f5fb0, roughness: 0.7 });
    const hr = 0.168, cy = hr * 0.95 + 0.045;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.2, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), m); dome.scale.set(1.04, 0.86, 1.08); dome.position.set(0, cy, -0.012);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.95, hr * 0.95, 0.018, 18, 1, false, -Math.PI / 2, Math.PI), m); visor.position.set(0, cy + 0.005, hr * 0.62); visor.scale.set(1, 1, 0.9); visor.rotation.x = 0.12;
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), m); btn.position.set(0, cy + hr * 1.03, -0.012);
    g.add(dome, visor, btn); g.visible = false; head.add(g); acc.gorra = { g, mats: [m] };
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }
  if (chest) {
    const g = new THREE.Group(); g.name = 'acc_mochila';
    const m = new THREE.MeshStandardMaterial({ color: 0xe8b81a, roughness: 0.75 }), s = new THREE.MeshStandardMaterial({ color: 0x5a4a20, roughness: 0.8 });
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.27, 0.11), m); bag.position.set(0, 0.0, -0.17);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.04), m); pocket.position.set(0, -0.07, -0.235);
    for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.02), s); st.position.set(sx * 0.085, 0.02, 0.105); g.add(st); }
    g.add(bag, pocket); g.visible = false; chest.add(g); acc.mochila = { g, mats: [m] };
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }

  const items = {};
  for (const slot of ['top', 'pants', 'shoes', 'accessory']) for (const it of data.civil[slot]) items[it.id] = { ...it, slot };
  const suits = Object.fromEntries(data.heroSuits.map(s => [s.id, s]));
  const state = { mode: 'hero', civil: { ...data.start }, suit: data.heroSuits[0].id, changes: 0 };

  function paint(map) {
    if (!col) return;
    for (let i = 0; i < n; i++) {
      const c = map(CLS[cls[i]], REG[reg[i]], i);
      if (c === null) col.setXYZ(i, orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2]);
      else col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }
  const hex = h => typeof h === 'string' ? parseInt(h.slice(1), 16) : h;
  const shade = (h, k) => _d.setHex(hex(h)).multiplyScalar(k);
  function applyHero() {
    const s = suits[state.suit] || data.heroSuits[0];
    const C = { suit: new THREE.Color().setHex(hex(s.suit)), panel: new THREE.Color().setHex(hex(s.panel)), accent: new THREE.Color().setHex(hex(s.accent)), trim: new THREE.Color().setHex(hex(s.trim)) };
    paint(k => k === 'other' ? null : C[k]);
    if (emblem) emblem.visible = true;
    for (const m of emblemMs) if (m.material && m.material.emissive && m.material.emissive.getHex() !== 0) m.material.color.copy(C.accent);
    for (const e of emitters) { e.visible = true; e.material.color.setHex(hex(s.glow)); }
  }
  function applyCivil() {
    const it = id => items[id] || null;
    const top = it(state.civil.top) || it(data.start.top), pants = it(state.civil.pants) || it(data.start.pants), shoes = it(state.civil.shoes) || it(data.start.shoes);
    const longSleeve = /buzo|campera/.test(top.id);
    const T = new THREE.Color().setHex(hex(top.color)), Tst = new THREE.Color().setHex(hex(top.color)).multiplyScalar(0.82), Tcol = new THREE.Color().setHex(hex(top.color)).multiplyScalar(0.9);
    const Pn = new THREE.Color().setHex(hex(pants.color)), Belt = new THREE.Color().setHex(0x3a2a1c), Sh = new THREE.Color().setHex(hex(shoes.color)), Sole = new THREE.Color().setHex(hex(shoes.sole || '#dddddd')), Sk = new THREE.Color().setHex(SKIN);
    paint((k, r) => {
      if (k === 'other') return null;
      if (r === 'feet') return k === 'trim' ? Sole : Sh;
      if (r === 'legs') return k === 'trim' ? Belt : Pn;
      if (r === 'forearm') { if (k === 'accent') return Sk; return longSleeve ? T : Sk; } // guantes → manos; mangas cortas → antebrazo
      if (r === 'top') return k === 'accent' ? Tst : k === 'panel' ? Tcol : k === 'trim' ? Belt : T;
      return null;
    });
    // la caña de bota del traje (acento sobre la pantorrilla) queda como botamanga del pantalón
    if (emblem) emblem.visible = false;
    for (const e of emitters) e.visible = false;
  }
  function applyAccessories() {
    const a = state.mode === 'civil' ? state.civil.accessory : 'ninguno';
    if (acc.gorra) { acc.gorra.g.visible = a === 'gorra_azul'; if (items.gorra_azul) acc.gorra.mats[0].color.setHex(hex(items.gorra_azul.color)); }
    if (acc.mochila) { acc.mochila.g.visible = a === 'mochila_amarilla'; if (items.mochila_amarilla) acc.mochila.mats[0].color.setHex(hex(items.mochila_amarilla.color)); }
  }
  function apply() { if (state.mode === 'hero') applyHero(); else applyCivil(); applyAccessories(); }

  const api = {
    items, suits, data,
    get mode() { return state.mode; },
    get civil() { return { ...state.civil }; },
    get suit() { return state.suit; },
    /** estado completo (pruebas): modo, prendas, accesorios visibles y una firma del color de los vértices */
    info() {
      let sig = 0; if (col) for (let i = 0; i < n; i += 37) sig = (sig * 31 + Math.round(col.getX(i) * 997 + col.getY(i) * 131 + col.getZ(i) * 17)) % 1000003;
      return { mode: state.mode, civil: { ...state.civil }, suit: state.suit, emblem: emblem ? emblem.visible : null, emitters: emitters.map(e => e.visible), cap: !!(acc.gorra && acc.gorra.g.visible), backpack: !!(acc.mochila && acc.mochila.g.visible), sig, vertices: n, changes: state.changes, classified: { suit: cls.filter(c => c === 1).length, accent: cls.filter(c => c === 3).length } };
    },
    /** fija todo (al cargar la partida): no cuenta como cambio */
    load({ mode, civil, suit }) { state.mode = mode === 'civil' ? 'civil' : 'hero'; for (const k of ['top', 'pants', 'shoes', 'accessory']) if (civil && items[civil[k]] && items[civil[k]].slot === k) state.civil[k] = civil[k]; if (suits[suit]) state.suit = suit; apply(); },
    setMode(m) { const v = m === 'civil' ? 'civil' : 'hero'; if (v !== state.mode) { state.mode = v; state.changes++; apply(); return true; } return false; },
    /** equipa una prenda civil (debe existir y ser de esa ranura) */
    equip(id) { const it = items[id]; if (!it) return false; if (state.civil[it.slot] === id) return true; state.civil[it.slot] = id; state.changes++; apply(); return true; },
    setSuit(id) { if (!suits[id]) return false; state.suit = id; state.changes++; apply(); return true; },
    dispose() { for (const k in acc) { acc[k].g.removeFromParent(); acc[k].g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); } },
  };
  void shade;
  return api;
}
