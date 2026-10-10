// @ts-check
/* Reino del Alba — misiones con cadena real, diálogos reactivos de los NPC y lógica de cada objeto del mundo
   (puertas bloqueadas, cofres, tótems, palancas, cerrojo rúnico…). Todo el estado vive en el guardado:
   reabrir un edificio o recargar la página no pierde ni duplica nada. */
import { NPC_DEFS, ROLES } from './npcs.js';
import { SCENE_NAMES } from './world.js';

/** etapas: el índice es la etapa actual; la longitud es «completa» */
export const QUESTS = {
  A: { id: 'A', main: true, title: 'La llave del alba', event: 'mainA', stages: [
    'Hablá con el capitán Leandro', 'Visitá a Bruno, el herrero', 'Conseguí 3 minerales del alba en la cueva del bosque', 'Entregale los minerales a Bruno',
    'Forjá la llave en el yunque de la herrería', 'Abrí la torre del castillo con la Llave del Alba', 'Rescatá a Tomás de la celda de la torre', 'Contale al rey Alberto'] },
  B: { id: 'B', main: true, title: 'El bosque oscuro', event: 'mainB', stages: [
    'Preguntale a Elena (biblioteca) qué le pasa al bosque', 'Limpiá los 3 tótems corrompidos del bosque', 'Derrotá al Guardián del bosque', 'Restaurá el altar del claro'] },
  C: { id: 'C', main: true, title: 'La defensa del reino', event: 'mainC', stages: [
    'Hablá con el capitán Leandro', 'Reforzá las 3 puertas del reino', 'Reuní 3 aliados entre la gente del reino', 'Derrotá al Carcelero en la mazmorra'] },
  libro: { id: 'libro', title: 'Recuperar el libro', event: 'secLibro', stages: ['Hablá con Elena, la bibliotecaria', 'Buscá la Crónica del Alba en el santuario del bosque', 'Devolvele la Crónica a Elena'] },
  medicina: { id: 'medicina', title: 'Entregar medicina', event: 'secMedicina', stages: ['Hablá con Mirta, la curandera', 'Recolectá 3 hierbas de alba en la casa de Mirta', 'Prepará el tónico en el caldero', 'Llevale el tónico a Ramón (Campos Dorados)'] },
  semillas: { id: 'semillas', title: 'Comprar semillas', event: 'secSemillas', stages: ['Comprale semillas a Fermín, el mercader', 'Plantá las semillas en la huerta de la aldea'] },
  molino: { id: 'molino', title: 'Reparar el molino', event: 'secMolino', stages: ['Hablá con Lucas, el aprendiz', 'Colocá el engranaje en el molino de la aldea'] },
  mascota: { id: 'mascota', title: 'Rescatar a Canela', event: 'secMascota', stages: ['Hablá con Saúl, el viajero', 'Buscá a Canela en los Campos Dorados (cerca del establo)', 'Llevá a Canela con Saúl'] },
  puente: { id: 'puente', title: 'Activar el puente viejo', event: 'secPuente', stages: ['Hablá con Iván, el guardia del puente', 'Accioná las dos palancas del puente viejo (Campos Dorados)'] },
};
export const QUEST_ORDER = ['A', 'B', 'C', 'libro', 'medicina', 'semillas', 'molino', 'mascota', 'puente'];
const SYMS = [{ g: '☀', n: 'Sol', c: 0xffc83a }, { g: '☾', n: 'Luna', c: 0xa8c8ff }, { g: '★', n: 'Estrella', c: 0xff5a5a }, { g: '✦', n: 'Runa', c: 0x6ae08a }];
const GATES = { puerta_puente: 'Puerta del Puente', porton: 'Portón del castillo', empalizada: 'Empalizada de los Campos' };
const ALLY_POOL = ['guardia', 'herrero', 'campesino', 'aprendiz', 'viajero'];
const CHESTS = {
  herreria: { coins: 12 }, taberna: { coins: 5, potions: 1 }, patio: { coins: 10 }, cueva: { coins: 15, potions: 1 },
  ruta: { coins: 10, item: 'llaveBronce', itemName: 'Llave de bronce' }, biblioteca: { coins: 25, potions: 1 },
  torre: { coins: 20, item: 'amuleto', itemName: 'Amuleto del alba (+1 ♥ máx.)' }, reliquia: { coins: 40, item: 'reliquia', itemName: 'Reliquia del Alba', fame: 500 },
};

/** @param {any} G */
export function createQuests(G) {
  const S = () => G.S();
  const st = q => S().quests[q] || 0;
  const done = q => st(q) >= QUESTS[q].stages.length;
  const items = () => S().inv.items;
  const has = k => (items()[k] || 0) > 0;
  const give = (k, n = 1) => { items()[k] = (items()[k] || 0) + n; };
  const take = (k, n = 1) => { items()[k] = Math.max(0, (items()[k] || 0) - n); };
  const flags = () => S().flags;
  const npcName = id => NPC_DEFS[id].name;
  const price = base => Math.round(base * G.diff().price);

  /** avanza la misión a la etapa n (y la completa si corresponde) */
  function setStage(q, n) {
    const Q = QUESTS[q], cur = st(q);
    if (n <= cur) return;
    S().quests[q] = Math.min(n, Q.stages.length);
    G.addFame(50 * (n - cur));
    G.emit('stage', q);
    if (done(q)) {
      G.addFame(Q.main ? 400 : 150); G.addCoins(Q.main ? 30 : 12);
      G.emit(Q.event); G.sfx.quest();
      G.banner(Q.main ? '★ MISIÓN PRINCIPAL CUMPLIDA' : '◆ MISIÓN SECUNDARIA CUMPLIDA', Q.title);
      G.persist();
      if (Q.main && ['A', 'B', 'C'].every(done)) G.later(2.2, () => G.victory());
    } else {
      G.sfx.stage();
      G.toast(`📜 ${Q.title}: ${Q.stages[st(q)]}`, 2800);
      G.persist();
    }
  }
  /** pone la misión en marcha (etapa 1) si estaba sin empezar */
  const start = q => { if (st(q) === 0) setStage(q, 1); };

  /* ---------------- objetos del mundo ---------------- */
  const LABELS = {
    pozo: () => 'Tomar agua del pozo',
    huerta: () => flags().sembrado ? 'La huerta ya brota 🌱' : has('semillas') ? 'Plantar semillas' : 'Mirar la huerta',
    molino: () => flags().molino ? 'El molino gira' : has('engranaje') ? 'Colocar el engranaje' : 'Revisar el molino',
    altar: () => flags().altar ? 'Altar restaurado ✨' : st('B') === 3 ? 'Restaurar el altar' : 'Mirar el altar apagado',
    yunque: () => st('A') === 4 ? 'Forjar la Llave del Alba' : 'Mirar el yunque',
    caldero: () => st('medicina') === 2 || (st('medicina') === 1 && S().inv.herbs >= 3) ? 'Preparar el tónico' : 'Mirar el caldero',
    atril: () => done('libro') ? 'Leer la Crónica del Alba' : 'Mirar el atril',
    canela: () => 'Llamar a la perrita escondida en el heno',
    palanca1: () => flags().palanca1 ? 'Palanca norte (accionada)' : 'Accionar la palanca norte',
    palanca2: () => flags().palanca2 ? 'Palanca sur (accionada)' : 'Accionar la palanca sur',
  };
  function label(id, arg) {
    if (id === 'gate') {
      const gs = flags().gates || {};
      if (gs[arg]) return `${GATES[arg]} reforzada ✔`;
      return st('C') === 1 ? `Reforzar · ${GATES[arg]}` : GATES[arg];
    }
    if (/^totem\d$/.test(id)) return flags()[id] ? 'Tótem purificado' : cleansing[id] ? 'Purificando… ¡derrotá a las sombras!' : 'Purificar el tótem corrompido';
    if (/^dial\d$/.test(id)) { const i = +id.slice(4) - 1, v = (flags().dials || [0, 0, 0])[i]; return flags().celda ? 'Cerrojo abierto' : `Girar disco ${i + 1} (${SYMS[v].g} ${SYMS[v].n})`; }
    const f = LABELS[id]; return f ? f() : id;
  }
  const gateUsable = () => true;
  /** @type {Record<string, boolean>} */ const cleansing = {};

  function act(id, arg) {
    const s = S(), f = flags();
    switch (id) {
      case 'deco': {
        const msg = arg === 'casa_tomas' && !f.rescatado ? 'La casa de Tomás está cerrada: dicen que se lo llevaron a la torre del castillo. (No se puede entrar)'
          : arg === 'cocina' ? 'La cocina del castillo está cerrada: el cocinero salió al mercado. (No se puede entrar)'
            : arg === 'establo' ? 'El establo está trabado por dentro: los animales duermen. (No se puede entrar)'
              : 'La puerta está trabada: no hay nadie. (No se puede entrar)';
        G.toast('🚫 ' + msg, 2600); G.sfx.locked(); return;
      }
      case 'pozo': {
        if (G.time() - (f.pozoT ?? -999) < 20) { G.toast('El agua está fría… esperá un rato para tomar de nuevo', 1600); return; }
        f.pozoT = G.time();
        if (G.player.hp < G.player.maxHp) { G.heal(1); G.toast('💧 Agua fresca del pozo (+1 ♥)', 1600); } else G.toast('💧 Agua fresca del pozo', 1400);
        return;
      }
      case 'fragua': G.text('La fragua', 'El carbón brilla al rojo vivo. Bruno dice que «el fuego del alba» sólo lo da el mineral de la cueva del bosque.'); return;
      case 'huerta':
        if (f.sembrado) { G.toast('🌱 Los brotes crecen fuertes', 1500); return; }
        if (!has('semillas')) { G.toast('La tierra está lista para sembrar. Fermín vende semillas en el mercado.', 2400); return; }
        take('semillas'); f.sembrado = true; G.sfx.pick(); G.fx.burst(-22, 0.5, 22, 0x6ad06a, 20, 2);
        if (G.scn().objs.huerta) G.scn().objs.huerta.visible = true;
        if (st('semillas') < 1) S().quests.semillas = 1;
        setStage('semillas', 2); return;
      case 'molino':
        if (f.molino) { G.toast('El molino gira y muele el trigo de los Campos', 1600); return; }
        if (!has('engranaje')) { G.toast('Al molino le falta un engranaje. Lucas, el aprendiz de la herrería, estaba haciendo uno.', 2600); return; }
        take('engranaje'); f.molino = true; G.sfx.hammer(); G.fx.burst(24, 2, 26.6, 0xd0b070, 16, 3);
        setStage('molino', 2); return;
      case 'libro':
        if (s.picked.libro) return;
        s.picked.libro = true; give('cronica'); G.sfx.pick(); if (G.scn().objs.book) G.scn().objs.book.visible = false;
        G.toast('📕 Encontraste la Crónica del Alba', 2000);
        if (st('libro') === 1) setStage('libro', 2); else G.persist();
        return;
      case 'hierba':
        if (s.picked[arg]) return;
        s.picked[arg] = true; s.inv.herbs++; G.sfx.pick();
        if (G.scn().objs.herbs && G.scn().objs.herbs[arg]) G.scn().objs.herbs[arg].visible = false;
        G.toast(`🌿 Hierba de alba (${Math.min(3, s.inv.herbs)}/3)`, 1500);
        if (st('medicina') === 1 && s.inv.herbs >= 3) setStage('medicina', 2); else G.persist();
        return;
      case 'receta': G.text('Receta: Tónico del alba', 'Tres hierbas de alba, un puñado de agua del pozo y un hervor en el caldero de cobre. <b>Calma la fiebre</b> en una noche.'); return;
      case 'caldero':
        if (st('medicina') === 1 && s.inv.herbs >= 3) setStage('medicina', 2);
        if (st('medicina') === 2) { s.inv.herbs -= 3; give('tonico'); G.sfx.heal(); G.fx.burst(0, 1.2, -2, 0x8af08a, 18, 2); G.toast('🧪 Preparaste el Tónico del alba', 2000); setStage('medicina', 3); return; }
        if (st('medicina') === 1) { G.toast(`Te faltan hierbas: ${s.inv.herbs}/3`, 1600); return; }
        G.toast('El caldero burbujea con un aroma a menta y miel', 1600); return;
      case 'atril':
        if (!done('libro')) { G.text('El atril', 'Está vacío. Un cartelito dice: «Aquí descansaba la Crónica del Alba».'); return; }
        f.pista = true; G.persist();
        G.text('Crónica del Alba · capítulo final', '«Cuando el reino fue joven, el primer rey escondió la <b>Reliquia del Alba</b> en un cofre, <b>junto al viejo molino</b> de la aldea. Sólo quien conozca esta crónica podrá abrirlo.»');
        G.emit('clue'); return;
      case 'estante': {
        const L = ['«Malvor, el carcelero del castillo, fue expulsado por sus crueldades. Juró volver.»', '«Los tótems del bosque guardan las runas que alimentan el altar del claro.»', '«El mineral del alba sólo se encuentra en la cueva al norte del bosque.»'];
        f.lore = ((f.lore || 0) + 1) % L.length; G.text('Estantes de la biblioteca', L[f.lore]); return;
      }
      case 'cartel': {
        if (st('B') === 0) { setStage('B', 1); G.text('Cartel de misiones', '<b>SE BUSCA:</b> alguien valiente para purificar los <b>tres tótems</b> del Bosque de las Runas. Pregunten por Elena, la bibliotecaria.'); return; }
        const open = QUEST_ORDER.filter(q => !done(q)).map(q => `• <b>${QUESTS[q].title}:</b> ${q === 'C' && !done('A') ? 'el capitán la anunciará más adelante' : QUESTS[q].stages[st(q)]}`);
        G.text('Cartel de misiones', open.length ? open.join('<br>') : '¡No quedan trabajos! El reino está en paz gracias a vos.');
        return;
      }
      case 'yunque':
        if (st('A') === 4) {
          give('llaveAlba'); G.sfx.hammer(); G.fx.burst(-1.5, 1.2, -1.6, 0xffb84a, 26, 4); G.fx.shake(0.15);
          if (!f.code) f.code = [1 + Math.floor(G.rand() * 3), Math.floor(G.rand() * 4), 1 + Math.floor(G.rand() * 3)];
          setStage('A', 5);
          G.text('Llave del Alba', `Forjaste la llave. En el paletón tiene grabados tres símbolos: <b>${f.code.map(i => SYMS[i].g + ' ' + SYMS[i].n).join(' · ')}</b>.`);
          return;
        }
        G.toast(st('A') === 3 ? 'Primero dale los minerales a Bruno' : 'Un yunque enorme, marcado por mil martillazos', 1800); return;
      case 'mena':
        if (s.picked[arg]) return;
        s.picked[arg] = true; s.inv.ore++; G.sfx.mine(); G.fx.burst(G.player.x, 1.2, G.player.z, 0xffb84a, 14, 3);
        if (G.scn().objs.ores && G.scn().objs.ores[arg]) G.scn().objs.ores[arg].visible = false;
        G.toast(`⛏ Mineral del alba (${Math.min(3, s.inv.ore)}/3)`, 1500);
        if (st('A') === 2 && s.inv.ore >= 3) setStage('A', 3); else G.persist();
        return;
      case 'totem1': case 'totem2': case 'totem3': return totem(id);
      case 'altar':
        if (f.altar) { G.toast('El altar irradia una luz cálida', 1500); return; }
        if (st('B') !== 3) { G.toast(st('B') === 2 ? 'El Guardián todavía protege el claro' : 'El altar está apagado. Lo alimentan las runas de los tres tótems.', 2200); return; }
        f.altar = true; G.sfx.victory(); setStage('B', 4);
        G.restoreForest(); return;
      case 'canela':
        if (f.canela) return;
        f.canela = true; G.sfx.pick(); G.toast('🐕 ¡Canela salió del heno y te sigue!', 2200);
        if (st('mascota') === 1) setStage('mascota', 2); else G.persist();
        G.spawnDog(); return;
      case 'palanca1': case 'palanca2':
        if (f[id]) { G.toast('Esta palanca ya está accionada', 1200); return; }
        f[id] = true; G.sfx.lever(); const lv = G.scn().objs.levers && G.scn().objs.levers[id]; if (lv) lv.rotation.z = -0.8;
        if (f.palanca1 && f.palanca2) { f.puente = true; G.toast('⚙ ¡El puente viejo baja con un crujido!', 2400); G.sfx.door(); if (st('puente') < 1) S().quests.puente = 1; setStage('puente', 2); }
        else { G.toast('⚙ Una palanca lista. Falta la otra.', 1800); G.persist(); }
        return;
      case 'dial': {
        if (f.celda) return;
        const i = +arg.slice(4) - 1;
        f.dials = f.dials || [0, 0, 0]; f.dials[i] = (f.dials[i] + 1) % 4; G.sfx.click();
        G.syncDials();
        const code = f.code;
        if (!code) { G.toast('Los discos giran, pero sin la llave del alba no sabés la combinación', 2200); G.persist(); return; }
        if (f.dials.every((v, k) => v === code[k])) {
          f.celda = true; G.sfx.solve(); G.toast('🔓 ¡El cerrojo rúnico cedió! Los barrotes se levantan', 2400); G.emit('puzzle'); G.persist();
        } else G.persist();
        return;
      }
      case 'gate': {
        const gs = f.gates = f.gates || {};
        if (gs[arg]) { G.toast(`${GATES[arg]} está reforzada`, 1400); return; }
        if (st('C') !== 1) { G.toast(done('C') ? 'La puerta resiste firme' : 'La puerta parece débil… el capitán sabrá qué hacer.', 2000); return; }
        gs[arg] = true; take('refuerzos'); G.sfx.hammer(); G.fx.burst(G.player.x, 1.5, G.player.z, 0xc0a070, 16, 3);
        G.showGate(arg);
        const n = Object.keys(gs).length;
        G.toast(`🛡 ${GATES[arg]} reforzada (${n}/3)`, 1800);
        if (n >= 3) setStage('C', 2); else G.persist();
        return;
      }
    }
  }
  function totem(id) {
    const f = flags();
    if (f[id] || cleansing[id]) return;
    if (st('B') === 0) setStage('B', 1);
    if (st('B') !== 1) return;
    cleansing[id] = true;
    const o = G.scn().objs.totems[id];
    G.toast('¡Las sombras del tótem despiertan! Derrotalas para purificarlo', 2200); G.sfx.growl();
    for (const [ox, oz] of [[-2.5, 2.5], [2.5, 2.5]]) G.combat.spawn('sombra', o.x + ox, o.z + oz, { minion: true, totem: id });
  }
  function onEnemyKilled(kind, e) {
    G.emit('kill');
    if (e && e.totem && cleansing[e.totem]) {
      const left = G.combat.enemies.filter(m => m.totem === e.totem && !m.dead).length;
      if (left === 0) {
        const id = e.totem, f = flags(); f[id] = true; delete cleansing[id];
        const o = G.scn().objs.totems[id]; if (o) o.mat.color.setHex(0x9af0ff);
        G.sfx.solve(); G.fx.burst(o.x, 2, o.z, 0x9af0ff, 24, 3);
        const n = ['totem1', 'totem2', 'totem3'].filter(t => f[t]).length;
        G.toast(`✨ Tótem purificado (${n}/3)`, 2000);
        if (n >= 3) { setStage('B', 2); G.later(1.5, () => G.spawnBoss('guardian')); } else G.persist();
      }
    }
    if (kind === 'golem') { flags().golem = true; G.addFame(150); G.toast('¡Derrotaste al gólem de cristal!', 2200); G.persist(); }
  }
  function onBossDefeated(kind) {
    if (kind === 'guardian') { flags().guardian = true; G.addFame(300); G.banner('JEFE DERROTADO', 'Guardián del bosque'); setStage('B', 3); }
    if (kind === 'carcelero') { flags().carcelero = true; G.addFame(500); G.banner('JEFE DERROTADO', 'Malvor, el Carcelero'); setStage('C', 4); }
  }
  /** al cargar una escena: jefes pendientes */
  function onSceneLoaded(id) {
    for (const k in cleansing) delete cleansing[k];
    if (id === 'bosque' && st('B') === 2 && !flags().guardian) G.spawnBoss('guardian');
    if (id === 'mazmorra' && st('C') === 3 && !flags().carcelero) G.spawnBoss('carcelero');
  }

  /* ---------------- puertas y cofres ---------------- */
  /** mensaje si la puerta está bloqueada (null si se puede abrir). Con apply=true aplica la llave. */
  function doorLock(id, apply = false) {
    if (id === 'torre') {
      if (!flags().torre && !has('llaveAlba')) return '🔒 La torre tiene una cerradura del alba. Pista: el capitán Leandro sabe quién puede forjar la llave.';
      if (apply && !flags().torre) { flags().torre = true; G.toast('🗝 Usaste la Llave del Alba: la torre se abre', 2200); G.persist(); }
      if (apply && st('A') === 5) setStage('A', 6);
    }
    if (id === 'mazmorra') {
      if (st('C') < 3 && !done('C')) return '🔒 La reja de la mazmorra está trabada desde adentro. Pista: hablá con el capitán (La defensa del reino).';
      if (G.sceneId() === 'mazmorra' && G.combat.boss && !G.combat.boss.dead) return '🔒 ¡El Carcelero trabó la reja! Derrotalo para salir.';
    }
    return null;
  }
  function chestUse(c) {
    const s = S(), L = CHESTS[c.id] || { coins: 5 };
    if (c.state === 'locked') {
      const need = c.id === 'biblioteca' ? 'llaveBronce' : c.id === 'torre' ? 'llaveAlba' : c.id === 'reliquia' ? 'pista' : '';
      const ok = need === 'pista' ? !!flags().pista : has(need);
      if (!ok) {
        G.sfx.locked();
        G.toast(c.id === 'reliquia' ? '🔒 Un cofre antiguo con un sello del alba. Pista: la Crónica de la biblioteca habla de él.' : c.id === 'biblioteca' ? '🔒 Candado de bronce. Pista: los comerciantes de la ruta usan llaves así.' : '🔒 Cerradura del alba. Pista: la llave que forja Bruno.', 2600);
        return;
      }
      if (need === 'llaveBronce') take('llaveBronce');
      c.state = 'closed'; G.toast('🔓 Abriste el candado', 1200);
    }
    if (c.state === 'closed') { c.state = 'opened'; c.anim = true; s.chests[c.id] = 'opened'; G.sfx.chest(); G.persist(); G.emit('chestOpen'); return; }
    if (c.state === 'opened') {
      c.state = 'looted'; s.chests[c.id] = 'looted';
      const parts = [];
      if (L.coins) { G.addCoins(L.coins); parts.push(`🪙 ${L.coins}`); }
      if (L.potions) { s.inv.potions += L.potions; parts.push(`🧪 ×${L.potions}`); }
      if (L.item) { give(L.item); parts.push(L.itemName); if (L.item === 'amuleto') G.raiseMaxHp(); }
      G.addFame(L.fame || 25); G.sfx.coin();
      G.toast('Cofre: ' + parts.join(' · '), 2400);
      G.persist(); G.emit('chest');
      if (L.item === 'reliquia') G.banner('✦ TESORO', 'Reliquia del Alba');
    }
  }

  /* ---------------- NPC: agenda alterada por el progreso y marcadores ---------------- */
  function npcOverride(id) {
    const f = flags();
    if (id === 'tomas') return f.rescatado ? (G.hour() >= 8 && G.hour() < 18 ? { scene: 'aldea', anchor: 'plaza' } : { scene: 'aldea', anchor: 'casaTomas' }) : { scene: 'torre', anchor: f.celda ? 'fuera' : 'celda' };
    if (id === 'campesino' && st('medicina') < 4) return { scene: 'campos', anchor: 'arbol', sleep: true };
    if (st('C') === 3 && !f.carcelero && (f.aliados || {})[id]) { const i = Object.keys(f.aliados).indexOf(id); return { scene: 'mazmorra', anchor: 'aliado' + (1 + (i % 3)) }; }
    if (id === 'viajero' && done('mascota') && G.hour() >= 20) return { scene: 'taberna', anchor: 'mesa3' };
    return null;
  }
  function eligibleAlly(id) {
    if (!ALLY_POOL.includes(id) || (flags().aliados || {})[id]) return false;
    if (id === 'campesino') return st('medicina') >= 4;
    if (id === 'viajero') return done('mascota');
    return true;
  }
  /** 'available' (!), 'turnIn' (?), 'none' */
  function npcMarker(id) {
    const s = S(), f = flags();
    switch (id) {
      case 'capitan': return st('A') === 0 || (done('A') && st('C') === 0) ? 'available' : 'none';
      case 'herrero': if (st('A') === 1 || (st('A') === 3)) return 'turnIn'; if (st('A') === 2 && s.inv.ore >= 3) return 'turnIn'; break;
      case 'rey': if (st('A') === 7) return 'turnIn'; break;
      case 'tomas': if (st('A') === 6 && f.celda && !f.rescatado) return 'turnIn'; break;
      case 'bibliotecaria': if (st('libro') === 2 || (st('libro') <= 1 && has('cronica'))) return 'turnIn'; if (st('libro') === 0 || st('B') === 0) return 'available'; break;
      case 'curandera': if (st('medicina') === 0) return 'available'; break;
      case 'campesino': if (st('medicina') === 3) return 'turnIn'; break;
      case 'mercader': if (st('semillas') === 0) return 'available'; break;
      case 'aprendiz': if (st('molino') === 0) return 'available'; break;
      case 'viajero': if (st('mascota') === 2 || (st('mascota') <= 1 && f.canela)) return 'turnIn'; if (st('mascota') === 0) return 'available'; break;
      case 'guardia': if (st('puente') === 0 && !f.puente) return 'available'; break;
    }
    if (st('C') === 2 && eligibleAlly(id)) return 'available';
    return 'none';
  }

  /* ---------------- diálogos ---------------- */
  /** devuelve { lines, choices? }; los efectos se aplican al abrir el diálogo (sin softlocks si se corta) */
  function dialogueFor(id) {
    const s = S(), f = flags(), A = st('A'), B = st('B'), C = st('C');
    const L = /** @type {string[]} */ ([]);
    let choices = null;
    const ally = () => {
      if (C === 2 && eligibleAlly(id)) {
        f.aliados = f.aliados || {}; f.aliados[id] = true;
        const n = Object.keys(f.aliados).length;
        L.push(`¿Defender el reino contra el Carcelero? Contá conmigo. (Aliados: ${Math.min(3, n)}/3)`);
        G.emit('ally');
        if (n >= 3) { setStage('C', 3); L.push('¡Ya son suficientes! La reja de la mazmorra del castillo cederá ahora.'); } else G.persist();
        return true;
      }
      return false;
    };
    switch (id) {
      case 'capitan':
        if (A === 0) { L.push('¡Por fin alguien con agallas! Anoche se llevaron a Tomás, un aldeano, y lo encerraron en la torre.', 'La cerradura sólo cede ante una <b>Llave del Alba</b>. Bruno, el herrero de la aldea, sabe forjarla.'); setStage('A', 1); break; }
        if (A < 8) { L.push(A <= 4 ? '¿Y la llave? Bruno, en la herrería de la aldea, te va a ayudar.' : A === 5 ? 'Con esa llave, abrí la torre del patio. Está al oeste.' : A === 6 ? 'Tomás está en la celda de la torre. ¡Rápido!' : 'Andá a ver al rey: quiere agradecerte en persona.'); break; }
        if (C === 0) { L.push('Tomás nos contó todo: <b>Malvor, el Carcelero</b>, prepara un ataque desde la mazmorra.', 'Tomá estos <b>tres refuerzos de hierro</b>: asegurá la Puerta del Puente, el Portón del castillo y la Empalizada de los Campos.'); give('refuerzos', 3); setStage('C', 1); break; }
        if (C === 1) { L.push(`Faltan puertas por reforzar: ${Object.keys(f.gates || {}).length}/3.`); break; }
        if (C === 2) { L.push('Reuní aliados: Iván, Bruno, Lucas… la gente del reino te va a escuchar.'); break; }
        if (C === 3) { L.push('La reja de la mazmorra ya cede. Tus aliados te esperan adentro. ¡Por el alba!'); break; }
        L.push(G.hour() >= 18 ? 'De noche cuido la sala del trono. Gracias a vos, duermo tranquilo.' : 'El reino está a salvo. Si ves sombras, avisame.');
        break;
      case 'herrero':
        if (A === 1 || A === 2) {
          if (A === 1) { L.push('¿Te manda Leandro? Para una Llave del Alba necesito <b>tres trozos de mineral del alba</b>.', 'Hay vetas en la <b>cueva al norte del Bosque de las Runas</b>. Ojo: un gólem de cristal las cuida.'); setStage('A', 2); }
          if (st('A') === 2 && s.inv.ore >= 3) setStage('A', 3);
          else if (A === 2) L.push(`Todavía no alcanza: tenés ${s.inv.ore}/3 minerales del alba.`);
          if (st('A') !== 3) break;
        }
        if (st('A') === 3) { s.inv.ore -= 3; L.push('¡Qué brillo! Este mineral canta cuando lo tocás.', 'Ahora usá el <b>yunque</b>: yo sostengo, vos golpeás.'); setStage('A', 4); break; }
        if (A === 4) { L.push('El yunque te espera, al lado mío.'); break; }
        if (ally()) break;
        if (A >= 5) { L.push(f.rescatado ? 'Esa llave abrió más que una torre: le devolvió la esperanza a la aldea.' : '¿Ya abriste la torre? La llave tiene la combinación del cerrojo grabada.'); break; }
        L.push(G.sceneId() === 'taberna' ? 'Hasta el herrero descansa. Mañana a primera hora, a la fragua.' : 'Bienvenido a la herrería. El hierro no se forja solo.');
        break;
      case 'aprendiz':
        if (ally()) break;
        if (st('molino') === 0) { L.push('Hice un <b>engranaje</b> nuevo para el molino de la aldea, pero me da miedo subir.', '¿Lo colocás vos? Está en el molino del sudeste.'); give('engranaje'); setStage('molino', 1); break; }
        if (ally()) break;
        L.push(done('molino') ? '¡El molino gira! Bruno dice que algún día voy a ser maestro herrero.' : 'El engranaje va en el eje del molino, al sudeste de la plaza.');
        break;
      case 'tabernera':
        if (!f.rosaPocion) { f.rosaPocion = true; s.inv.potions++; G.persist(); L.push('¡Una cara nueva! Tomá, una <b>poción</b> por la casa.'); }
        L.push(f.rescatado ? '¡Tomás volvió! Esta noche brindamos por vos.' : done('B') ? 'Desde que el bosque sanó, los viajeros volvieron a la taberna.' : 'El cartel de misiones está a la izquierda. Siempre hay trabajo para un valiente.');
        break;
      case 'guardia':
        if (ally()) break;
        if (st('puente') === 0 && !f.puente) { L.push('El <b>puente viejo</b> de los Campos Dorados está levantado desde hace años.', 'Tiene <b>dos palancas oxidadas</b> en la orilla oeste. Si las accionás, se reabre la ruta de comercio.'); setStage('puente', 1); break; }
        if (ally()) break;
        L.push(f.puente ? '¡Bajaste el puente viejo! Los comerciantes ya cruzan otra vez.' : 'Las palancas del puente están en la orilla oeste del río, en los Campos.');
        if (done('C')) L.push('Con las puertas reforzadas, dormimos tranquilos.');
        break;
      case 'rey':
        if (A === 7) { L.push('¡Tomás está libre! Valor y cabeza: eso necesita el reino.', 'Te nombro <b>Protector del Alba</b>. Que el capitán te cuente lo que sigue.'); setStage('A', 8); break; }
        if (done('C')) { L.push('Malvor ya no amenaza a nadie. El Reino del Alba te debe todo.'); break; }
        L.push(A < 7 ? 'Mi capitán te dirá lo que necesitamos. Confío en vos.' : 'El capitán Leandro te necesita para defender el reino.');
        break;
      case 'reina':
        L.push(done('B') ? 'El bosque volvió a respirar: lo siento en el perfume de las rosas.' : 'Las rosas sólo florecen cuando el reino está en paz… y el bosque está enfermo.');
        if (!done('libro')) L.push('Dicen que la Crónica del Alba esconde dónde está una antigua reliquia.');
        break;
      case 'curandera':
        if (st('medicina') === 0) { L.push('Ramón, el campesino, tiene una fiebre que no baja.', 'Necesito <b>3 hierbas de alba</b> (las macetas de mi casa) y preparar el tónico en el <b>caldero</b>.'); setStage('medicina', 1); if (s.inv.herbs >= 3) setStage('medicina', 2); break; }
        if (G.player.hp < G.player.maxHp && G.time() - (f.mirtaT ?? -999) > 60) { f.mirtaT = G.time(); G.heal(99); L.push('Dejame ver esas heridas… listo, como nuevo.'); }
        L.push(st('medicina') === 1 ? `Te faltan hierbas: ${s.inv.herbs}/3. Están en las macetas.` : st('medicina') === 2 ? 'Ya tenés las hierbas: usá el caldero.' : st('medicina') === 3 ? 'Llevale el tónico a Ramón, en los Campos Dorados.' : 'Ramón ya está de pie. Las hierbas de alba nunca fallan.');
        break;
      case 'bibliotecaria':
        if (st('libro') <= 2 && has('cronica')) { take('cronica'); if (st('libro') < 2) S().quests.libro = 2; L.push('¡Mi Crónica del Alba! La dejo en el <b>atril</b>: leé el último capítulo, guarda una pista.'); setStage('libro', 3); break; }
        if (st('libro') === 0) { L.push('Perdí la <b>Crónica del Alba</b> en el santuario en ruinas del bosque, al suroeste del claro.', '¿Me la traerías?'); setStage('libro', 1); break; }
        if (B === 0) { L.push('Las runas del bosque se oscurecieron: hay <b>tres tótems corrompidos</b>.', 'Purificalos y el altar del claro volverá a brillar.'); setStage('B', 1); break; }
        L.push(done('B') ? 'Las runas del bosque brillan otra vez. Lo voy a anotar en la Crónica.' : B === 2 ? 'Un guardián despertó en el claro. Esquivá sus raíces: avisan antes de brotar.' : 'Silencio, por favor… bueno, un poquito de charla está bien.');
        break;
      case 'mercader':
        if (st('semillas') === 0) {
          const p = price(10);
          L.push(`¡Semillas de trigo dorado! Las mejores del reino: <b>${p} monedas</b>.`);
          choices = [{ label: `Comprar (${p} 🪙)`, fn: () => { if (s.inv.coins < p) { G.toast('No te alcanzan las monedas', 1600); G.sfx.denied(); return; } s.inv.coins -= p; give('semillas'); G.sfx.coin(); G.toast('🌾 Compraste semillas: plantalas en la huerta', 2200); setStage('semillas', 1); } }, { label: 'Ahora no', fn: () => {} }];
          break;
        }
        { const p = price(8); L.push(`¿Una <b>poción</b>? Cura heridas al instante: <b>${p} monedas</b>.`);
          choices = [{ label: `Comprar poción (${p} 🪙)`, fn: () => { if (s.inv.coins < p) { G.toast('No te alcanzan las monedas', 1600); G.sfx.denied(); return; } s.inv.coins -= p; s.inv.potions++; G.sfx.coin(); G.toast('🧪 Compraste una poción', 1600); G.persist(); } }, { label: 'No, gracias', fn: () => {} }]; }
        if (f.puente) L.unshift('¡Con el puente viejo abierto llegan mercancías nuevas!');
        break;
      case 'campesino':
        if (st('medicina') < 4) {
          if (st('medicina') === 3 && has('tonico')) { take('tonico'); L.push('*glup*… ¡Me siento nuevo! Mirta es una santa, y vos también.'); setStage('medicina', 4); break; }
          L.push('Cof, cof… la fiebre no me deja levantarme.', 'La curandera Mirta sabrá qué hacer.'); break;
        }
        if (ally()) break;
        L.push(f.sembrado ? '¡Vi que plantaste en la huerta de la aldea! Buena mano.' : 'Los Campos Dorados vuelven a dar trigo.');
        if (!f.canela && st('mascota') >= 1) L.push('¿Una perrita? Escuché ladridos en el heno, junto al establo.');
        break;
      case 'viajero':
        if (st('mascota') <= 2 && f.canela) { if (st('mascota') < 2) S().quests.mascota = 2; L.push('¡CANELA! ¡Viniste! Gracias, de verdad.'); setStage('mascota', 3); G.dogHome(); break; }
        if (ally()) break;
        if (st('mascota') === 0) { L.push('Perdí a <b>Canela</b>, mi perrita, cuando crucé los <b>Campos Dorados</b>.', 'Le encanta esconderse en el heno.'); setStage('mascota', 1); break; }
        if (ally()) break;
        L.push(done('mascota') ? 'Recorrí mil reinos, pero ninguno con gente como esta.' : 'Canela se esconde cuando tiene miedo… seguro está cerca del establo.');
        break;
      case 'tomas':
        if (!f.celda) { L.push('¡Ayuda! El cerrojo tiene tres discos con símbolos…', f.code ? 'La llave que trajiste: ¡mirá los símbolos grabados!' : 'Sólo la Llave del Alba trae la combinación.'); break; }
        if (!f.rescatado) { f.rescatado = true; L.push('¡Libre! Gracias. Malvor, el Carcelero, me encerró por ver demasiado.', 'Planea atacar el reino desde la mazmorra. ¡Avisale al rey!'); G.emit('rescue'); setStage('A', 7); G.later(0.5, () => G.npcs.snap('tomas')); break; }
        L.push('Gracias por sacarme de esa torre. Mi casa queda al oeste de la plaza.');
        break;
      default:
        L.push(id.startsWith('guardia_real') ? (done('A') ? 'Protector del Alba: es un honor.' : 'Nadie se acerca al rey sin permiso… vos sí, claro.') : '¡Hola!');
    }
    if (!L.length) L.push('…');
    const n = s.npcs[id] = s.npcs[id] || { talked: 0 }; n.talked++;
    G.emit('talk', id);
    return { lines: L, choices };
  }

  /* ---------------- objetivo actual y diario ---------------- */
  function whereNpc(id) { const n = G.npcs.get(id); return n ? SCENE_NAMES[n.scene] : ''; }
  const TARGET = {
    A: ['capitan', 'herrero', 'cueva', 'herrero', 'herreria', 'castillo', 'torre', 'rey'],
    B: ['bibliotecaria', 'bosque', 'bosque', 'bosque'], C: ['capitan', 'puertas', 'aliados', 'mazmorra'],
    libro: ['bibliotecaria', 'bosque', 'bibliotecaria'], medicina: ['curandera', 'curandera@', 'curandera@', 'campesino'], semillas: ['mercader', 'aldea'],
    molino: ['aprendiz', 'aldea'], mascota: ['viajero', 'campos', 'viajero'], puente: ['guardia', 'campos'],
  };
  function where(q) {
    const t = TARGET[q][st(q)];
    if (!t) return '';
    if (NPC_DEFS[t]) return whereNpc(t);
    if (t.endsWith('@')) return SCENE_NAMES[t.slice(0, -1)] || '';
    if (t === 'puertas') return 'Aldea, Castillo y Campos';
    if (t === 'aliados') return 'Aldea y Campos';
    return SCENE_NAMES[t] || '';
  }
  function stageText(q) {
    const s = S(), Q = QUESTS[q], i = st(q);
    if (done(q)) return '✔ Completa';
    let t = Q.stages[i];
    if (q === 'A' && i === 2) t += ` (${Math.min(3, s.inv.ore)}/3)`;
    if (q === 'B' && i === 1) t += ` (${['totem1', 'totem2', 'totem3'].filter(k => flags()[k]).length}/3)`;
    if (q === 'C' && i === 1) t += ` (${Object.keys(flags().gates || {}).length}/3)`;
    if (q === 'C' && i === 2) t += ` (${Object.keys(flags().aliados || {}).length}/3)`;
    if (q === 'medicina' && i === 1) t += ` (${Math.min(3, s.inv.herbs)}/3)`;
    if (q === 'A' && i === 6 && flags().celda) t = 'Hablá con Tomás en la torre';
    if (q === 'A' && i === 6 && !flags().celda && flags().code) t += ` · combinación: ${flags().code.map(k => SYMS[k].g).join(' ')}`;
    return t;
  }
  /** misión seguida en el HUD: la primera principal disponible; si no, una secundaria en curso */
  function tracked() {
    for (const q of ['A', 'B', 'C']) { if (q === 'C' && !done('A')) continue; if (!done(q) && (st(q) > 0 || q === 'A')) return q; }
    for (const q of QUEST_ORDER) if (!done(q) && st(q) > 0) return q;
    for (const q of ['B', 'C']) if (!done(q) && !(q === 'C' && !done('A'))) return q;
    return '';
  }
  function objective() {
    const q = tracked();
    if (!q) return { title: 'El reino está en paz', text: 'Explorá, abrí cofres y charlá con la gente.', where: '' };
    return { title: QUESTS[q].title, text: stageText(q), where: where(q), main: !!QUESTS[q].main };
  }
  function journal() {
    return QUEST_ORDER.map(q => ({ id: q, title: QUESTS[q].title, main: !!QUESTS[q].main, stage: st(q), total: QUESTS[q].stages.length, done: done(q),
      locked: q === 'C' && !done('A'), text: q === 'C' && !done('A') ? 'Se desbloquea al terminar «La llave del alba»' : st(q) === 0 && !QUESTS[q].main ? `Disponible: ${QUESTS[q].stages[0]}` : stageText(q), where: done(q) ? '' : where(q) }));
  }
  return {
    QUESTS, SYMS, act, label, doorLock, chestUse, gateUsable, npcOverride, npcMarker, dialogueFor, objective, journal, onEnemyKilled, onBossDefeated, onSceneLoaded,
    stage: st, done, setStage, cleansing, ROLES,
  };
}
