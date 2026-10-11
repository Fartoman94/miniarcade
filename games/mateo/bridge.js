/* Puente entre «Mateo: Ciudad de Altura» y MiniArcade, sin modificar el código del juego.
   - Registra el juego en el SDK (estadísticas, telemetría y aviso de errores). Mateo tiene su propia
     pausa y HUD, así que la barra y la pausa del SDK quedan desactivadas.
   - Agrega «⌂ Volver a MiniArcade» en el menú principal y en la pausa del juego. */
(() => {
  const A = window.MLArcade;
  if (A) {
    A.init({ id: 'mateo_ciudad', title: 'MATEO: CIUDAD DE ALTURA', toolbar: 'none', gamepad: false, pauseKeys: [], isActive: () => false });
    A.started();
  }
  const portal = (A && A.portalUrl) || '../index.html';
  const add = () => {
    const ui = document.getElementById('ui');
    if (!ui) return;
    ui.querySelectorAll('.btns').forEach(row => {
      const screen = row.closest('div');
      if (!screen || screen.querySelector('[data-ml-home]')) return;
      // sólo en el menú principal (tiene data-a="go") y en la pausa (tiene data-a="resume")
      if (!row.querySelector('[data-a="go"],[data-a="resume"]')) return;
      const a = document.createElement('a');
      a.href = portal; a.className = 'b alt'; a.dataset.mlHome = '1'; a.textContent = '⌂ Volver a MiniArcade';
      a.style.textDecoration = 'none'; a.style.textAlign = 'center';
      a.addEventListener('click', () => { if (A) A.track('exit', { via: 'mateo' }); });
      row.appendChild(a);
    });
  };
  new MutationObserver(add).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('DOMContentLoaded', add);
})();
