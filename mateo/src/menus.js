// Mateo: Ciudad de Altura — pantallas: inicio (Comenzar / Continuar / Nueva partida), pausa, ajustes (sensibilidad,
// invertir Y, cámara automática, calidad, movimiento reducido, sonido, modo del cable, tamaño de botones, vibración,
// retícula, modo fácil, teclas), ayuda con pictogramas para chicos y lista de misiones.
import { esc } from './util.js';
import { DEFAULT_KEYS } from './input.js';

const KEYNAMES = { jump: 'Saltar', cable: 'Cable', action: 'Acción / Golpe / Hablar', sprint: 'Correr', guard: 'Guardia', dodge: 'Esquivar', kick: 'Patada', map: 'Mapa y diario', suit: 'Traje / ropa civil', inv: 'Mochila' };
const label = c => c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : ({ Space: 'Espacio', ShiftLeft: 'Shift', Escape: 'Esc' })[c] || c;

export function createMenus({ ui, save, input, audio, engine, startGame, resume, quests, applySettings, toMenu, openJournal }) {
  const S = () => save.data;
  let sub = '', from = 'main', listening = '';
  function main() {
    from = 'main'; sub = '';
    const s = S(), cont = s.started;
    const done = Object.values(s.quests).filter(q => q.status === 'complete').length;
    ui.screen(`<div class="badgeM" style="width:58px;height:58px;font-size:36px;border-radius:16px">M</div>
      <h1>MATEO<small>CIUDAD DE ALTURA</small></h1>
      <p>Corré, saltá altísimo, balanceate con cables de energía entre los edificios y ayudá a los vecinos. ¡La ciudad es tuya!</p>
      ${cont ? `<p class="small">Partida guardada · ${s.points} puntos · 🏅 ${s.medals.length} medallas · ${done} misiones cumplidas</p>` : ''}
      ${save.recovered ? '<p class="small">⚠ El guardado estaba dañado y se reinició (se guardó una copia).</p>' : ''}
      <div class="btns"><button class="b" data-a="go">${cont ? '▶ CONTINUAR' : '▶ COMENZAR AVENTURA'}</button>${cont ? '<button class="b alt" data-a="new">Nueva partida</button>' : ''}</div>
      <div class="btns"><button class="b alt" data-a="help">📖 Cómo jugar</button><button class="b alt" data-a="opts">⚙ Ajustes</button></div>
      <p class="small">Juego original de muestra con recursos 3D generados para el proyecto. Personaje: versión estilizada (no es un retrato).</p>`);
  }
  function pause() {
    from = 'pause'; sub = '';
    ui.show(false);
    ui.screen(`<h2>PAUSA</h2>
      <div class="btns" style="flex-direction:column;width:min(320px,100%)"><button class="b" data-a="resume">▶ Reanudar</button><button class="b alt" data-a="journal">🗺 Mapa, diario e historia</button><button class="b alt" data-a="quests">📋 Misiones de vecinos</button>
      <button class="b alt" data-a="opts">⚙ Ajustes</button><button class="b alt" data-a="help">📖 Cómo jugar</button><button class="b alt" data-a="restartq">↻ Reiniciar misión</button><button class="b alt" data-a="menu">⌂ Menú principal</button></div>`);
  }
  function help() {
    sub = 'help';
    const t = input.isTouch;
    ui.screen(`<h2>CÓMO JUGAR</h2>
      <div class="picto">
        <div><span>🕹</span>${t ? 'Joystick (izquierda): moverse. Deslizá a la derecha: girar la cámara.' : 'WASD: moverse. Mouse: cámara (hacé clic en la ciudad para capturarlo).'}</div>
        <div><span>⤒</span>${t ? 'SALTO' : 'Espacio'}: saltar. En el aire otra vez: doble salto. Quieto y manteniendo: súper salto.</div>
        <div><span>◉</span>${t ? 'CABLE' : 'F o clic'}: cable de energía al edificio del aro celeste. Otra vez: soltar. ${t ? 'SALTO' : 'Espacio'} en el aire: soltar con impulso.</div>
        <div><span>🧱</span>Corré contra una pared en el aire: corrés por la pared. Empujá hacia ella para trepar.</div>
        <div><span>🪂</span>Después del doble salto, mantené ${t ? 'SALTO' : 'Espacio'} cayendo: planeás (se desbloquea).</div>
        <div><span>✦</span>${t ? 'ACCIÓN' : 'E'}: hablar con vecinos. Cerca de un villano: golpe → cruzado → patada (tocá varias veces). Mantené ${t ? 'ACCIÓN' : 'E'} para el golpe cargado, que rompe la guardia del grandote. ¡Nada se lastima: los villanos se marean y se rinden!</div>
        <div><span>🛡</span>${t ? 'GUARDIA' : 'Q'}: cubrirse de frente. ${t ? 'ESQUIVA' : 'C'}: esquivar rodando (cuando ves el anillo rojo). ${t ? 'PATADA' : 'R'}: patada. ${t ? 'CABLE' : 'F'} apuntando a un villano: lo atás con el cable de energía.</div>
        <div><span>🆘</span>Si un vecino pide ayuda («!» rojo en el mapa), acercate: perseguí al villano, reducilo y devolvé lo que se llevó.</div>
        <div><span>»</span>${t ? 'CORRER (se queda activo)' : 'Shift'}: correr más rápido.</div>
        <div><span>M</span>${t ? 'Botón M' : 'T'}: ropa civil ↔ traje de héroe. De civil se camina, se compra y se maneja el kart; los súper saltos, el cable y el combate son del traje M.</div>
        <div><span>🏠</span>Tu casa está en el Barrio Las Glicinas, sobre la Avenida Prisma: ropero, heladera, mesa para comer, cama para dormir y guardar. ${t ? '🎒' : 'I'}: mochila.</div>
        <div><span>🪙</span>Las monedas M son de juego: se ganan con trabajos del barrio (cartelera junto a tu puerta) y ayudando a vecinos; se gastan en comida, ropa, decoración y karts.</div>
        <div><span>🏎</span>Kart: ${t ? 'joystick para acelerar y girar, SALTO frena, ACCIÓN baja' : 'W/S acelerar y frenar, A/D girar, Espacio freno de mano, E bajar'}. Se compra en «Autos Lumen» y espera en el Garaje M.</div>
        <div><span>❗</span>Los vecinos con «!» te dan misiones. Buscá las medallas M en techos y lugares especiales.</div>
        <div><span>🗺</span>${t ? 'Tocá el minimapa' : 'M (o clic en el minimapa)'}: mapa completo con ruta, diario de Mateo e historia. La línea celeste del minimapa marca el camino al objetivo.</div>
      </div>
      <p class="small">Gamepad: stick izquierdo mover, stick derecho cámara, A saltar, RB/RT cable, X acción/golpe, Y patada, B esquivar, LT guardia, LB correr, Start pausa.</p>
      <div class="btns"><button class="b" data-a="back">Volver</button></div>`);
  }
  function opts() {
    sub = 'opts';
    const s = S().settings;
    const sel = (k, o) => `<select data-k="${k}">${o.map(([v, t]) => `<option value="${v}"${String(s[k]) === String(v) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    const chk = k => `<input type="checkbox" data-k="${k}"${s[k] ? ' checked' : ''}>`;
    ui.screen(`<h2>AJUSTES</h2><div class="opts">
      <label class="opt">Hora del día ${sel('hora', [['ciclo', 'Ciclo día y noche (reloj)'], ['dia', 'Siempre de día'], ['atardecer', 'Siempre atardecer'], ['noche', 'Siempre de noche']])}</label>
      <label class="opt">Duración de un día ${sel('dayMinutes', [[12, '12 minutos'], [24, '24 minutos'], [48, '48 minutos']])}</label>
      <label class="opt">Calidad gráfica ${sel('quality', [['auto', 'Automática'], ['low', 'Baja'], ['medium', 'Media'], ['high', 'Alta']])}</label>
      <label class="opt">Sensibilidad de cámara <input type="range" min="0.3" max="3" step="0.1" value="${s.sensitivity}" data-k="sensitivity" aria-label="Sensibilidad"></label>
      <label class="opt">Invertir eje vertical ${chk('invertY')}</label>
      <label class="opt">Distancia de cámara (zoom) <input type="range" min="0.7" max="1.6" step="0.05" value="${s.camZoom}" data-k="camZoom" aria-label="Distancia de cámara"></label>
      <label class="opt">Campo de visión <input type="range" min="50" max="80" step="1" value="${s.fov}" data-k="fov" aria-label="Campo de visión"></label>
      <label class="opt">Atenuar lo que tapa a Mateo ${chk('occlusionFade')}</label>
      <label class="opt">Mostrar rendimiento (FPS) ${chk('showPerf')}</label>
      <label class="opt">Cámara se alinea sola ${chk('autoCam')}</label>
      <label class="opt">Movimiento reducido (sin sacudidas ni zoom) ${chk('reducedMotion')}</label>
      <label class="opt">Volumen <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-k="volume" aria-label="Volumen"></label>
      <label class="opt">Silenciar ${chk('muted')}</label>
      <label class="opt">Cable ${sel('cableMode', [['toggle', 'Tocar para lanzar / soltar'], ['hold', 'Mantener apretado']])}</label>
      <label class="opt">Retícula de anclaje ${chk('reticle')}</label>
      <label class="opt">Modo fácil (menos daño) ${chk('easy')}</label>
      <label class="opt">Asistencia para apuntar golpes ${chk('autoTarget')}</label>
      <label class="opt">Incidentes en la ciudad (vecinos que piden ayuda) ${chk('incidents')}</label>
      <label class="opt">Tamaño de botones táctiles <input type="range" min="0.8" max="1.4" step="0.05" value="${s.buttonScale}" data-k="buttonScale" aria-label="Tamaño de botones"></label>
      <label class="opt">Vibración ${chk('haptics')}</label>
      ${input.isTouch ? '' : Object.keys(KEYNAMES).map(k => `<div class="opt">${KEYNAMES[k]} <button type="button" data-bind="${k}">${listening === k ? 'Apretá una tecla…' : label(s.binds[k])}</button></div>`).join('')}
      </div><div class="btns"><button class="b" data-a="back">Listo</button><button class="b alt" data-a="defaults">Valores por defecto</button></div>`);
  }
  function questsList() {
    sub = 'quests';
    const s = S();
    const rows = quests.D.quests.map(q => { const st = s.quests[q.id]?.status || (q.id === 'primer_salto' ? 'available' : 'locked'); const giver = quests.D.npcs.find(n => n.id === q.giver).name;
      return `<li class="q ${st === 'complete' ? 'done' : st}"><span>${q.kind === 'side' ? '◆' : '★'}</span><span><b>${esc(q.name)}</b><br><small>${esc(giver)}${q.repeat ? ' · repetible' : ''}${s.quests[q.id]?.best ? ` · récord ${s.quests[q.id].best} s` : ''}</small></span><span class="st">${{ locked: '🔒 BLOQUEADA', available: 'DISPONIBLE', active: 'EN CURSO', complete: '✔ CUMPLIDA' }[st]}</span></li>`; }).join('');
    ui.screen(`<h2>MISIONES</h2><ul class="list">${rows}</ul><p class="small">🏅 Medallas M: ${s.medals.length}/${quests.medalTotal} · Puntos: ${s.points}</p>
      <div class="btns"><button class="b" data-a="back">Volver</button>${quests.byId && from === 'pause' ? '<button class="b alt" data-a="abandon">Abandonar misión actual</button>' : ''}</div>`);
  }
  function back() { listening = ''; if (from === 'main') main(); else pause(); }
  ui.onScreen('[data-a]', t => {
    audio.ui();
    const a = t.getAttribute('data-a');
    if (a === 'go') startGame(false);
    else if (a === 'new') { if (t.dataset.armed) startGame(true); else { t.dataset.armed = '1'; t.textContent = '¿Seguro? Tocá de nuevo'; } }
    else if (a === 'help') help();
    else if (a === 'opts') opts();
    else if (a === 'quests') questsList();
    else if (a === 'journal') { sub = ''; openJournal('mapa'); }
    else if (a === 'back') back();
    else if (a === 'resume') resume();
    else if (a === 'menu') { quests.abandon(); toMenu(); }
    else if (a === 'restartq') { const id = Object.keys(S().quests).find(k => S().quests[k].status === 'active'); quests.abandon(); if (id) quests.start(id); resume(); }
    else if (a === 'abandon') { quests.abandon(); questsList(); }
    else if (a === 'defaults') { S().settings = { ...S().settings, sensitivity: 1, invertY: false, autoCam: true, volume: 0.8, muted: false, cableMode: 'toggle', buttonScale: 1, haptics: true, reticle: true, easy: false, hora: 'ciclo', dayMinutes: 24, quality: 'auto', camZoom: 1, fov: 60, occlusionFade: true, showPerf: false, binds: { ...DEFAULT_KEYS } }; save.flush(); applySettings(); opts(); }
  });
  ui.onScreen('[data-bind]', t => { listening = t.getAttribute('data-bind'); opts(); });
  addEventListener('keydown', e => {
    if (!listening) return;
    e.preventDefault(); e.stopPropagation();
    const fixed = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'KeyP'];
    if (!fixed.includes(e.code)) { const b = S().settings.binds; for (const k in b) if (b[k] === e.code) b[k] = b[listening]; b[listening] = e.code; save.flush(); applySettings(); }
    listening = ''; opts();
  }, true);
  ui.E.scr.addEventListener('input', e => {
    const t = /** @type {HTMLInputElement} */ (e.target), k = t.getAttribute('data-k'); if (!k) return;
    const s = S().settings;
    s[k] = t.type === 'checkbox' ? t.checked : t.type === 'range' || k === 'dayMinutes' ? +t.value : t.value;
    save.flush(); applySettings();
  });
  return { main, pause, help, opts, quests: () => { from = 'pause'; questsList(); }, get subOpen() { return !!sub; } };
}
