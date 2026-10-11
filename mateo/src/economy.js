// Mateo: Ciudad de Altura — V2 P2: economía de FICCIÓN (monedas «M»; sin dinero real ni compras dentro de la app).
// Basada en el ejemplo del kit (docs/kit_v2/examples/economy.mjs): billetera con libro de transacciones e ids
// idempotentes (el mismo id nunca se cobra ni se paga dos veces: doble clic, recarga, reintento), sin saldos ni
// cantidades negativas, sin comprar productos inexistentes. Cada operación es ATÓMICA: valida todo, recién después
// modifica saldo + inventario + libro juntos y guarda una sola vez. Mochila (inv) y heladera (fridge) son inventarios.
const MAXQ = 99;
const okId = s => typeof s === 'string' && s.length > 0 && s.length < 80;

/**
 * @param {{ save: any, catalog: (sku:string) => any }} o  catalog(sku) → definición del ítem o null si no existe
 */
export function createEconomy({ save, catalog }) {
  const D = () => save.data;
  const W = () => D().wallet;
  let txSeq = 0;
  const stats = { ok: 0, duplicate: 0, funds: 0, invalid: 0, unknown: 0, overflow: 0 };
  function record(id, delta, what) {
    const w = W();
    w.processed.push(id); if (w.processed.length > 400) w.processed.splice(0, w.processed.length - 400);
    w.ledger.push({ id, delta, what, bal: w.balance }); if (w.ledger.length > 40) w.ledger.splice(0, w.ledger.length - 40);
  }
  const seen = id => W().processed.includes(id);
  const api = {
    get balance() { return W().balance; },
    get stats() { return { ...stats }; },
    count(sku, where = 'inv') { return D()[where][sku] || 0; },
    /** id de transacción nuevo (cada botón de compra trae el suyo: un doble clic reusa el mismo y no cobra dos veces) */
    newTx(prefix = 'tx') { txSeq++; return `${prefix}:${Date.now().toString(36)}:${txSeq}:${Math.floor(Math.random() * 1e6).toString(36)}`; },
    /**
     * compra atómica: { transactionId, sku, price, quantity, to: 'inv'|'none', apply?: () => void }
     * apply() (opcional) desbloquea lo comprado (prenda, kart, mejora) en el mismo paso, antes de guardar.
     */
    buy({ transactionId, sku, price, quantity = 1, to = 'inv', apply = null, what = '' }) {
      if (!okId(transactionId)) { stats.invalid++; return { ok: false, reason: 'invalid' }; }
      if (seen(transactionId)) { stats.duplicate++; return { ok: true, duplicate: true, balance: W().balance }; }
      if (typeof sku !== 'string' || !catalog(sku)) { stats.unknown++; return { ok: false, reason: 'unknown' }; }
      if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAXQ) { stats.invalid++; return { ok: false, reason: 'invalid' }; }
      const cost = price * quantity;
      if (!Number.isSafeInteger(cost)) { stats.overflow++; return { ok: false, reason: 'overflow' }; }
      if (W().balance < cost) { stats.funds++; return { ok: false, reason: 'funds', balance: W().balance }; }
      if (to === 'inv' && (D().inv[sku] || 0) + quantity > MAXQ) { stats.invalid++; return { ok: false, reason: 'full' }; }
      // --- commit (todo junto) ---
      W().balance -= cost;
      if (to === 'inv') D().inv[sku] = (D().inv[sku] || 0) + quantity;
      if (apply) apply();
      record(transactionId, -cost, what || sku);
      save.flush(); stats.ok++;
      return { ok: true, duplicate: false, balance: W().balance };
    },
    /** cobra una recompensa con id único (trabajo, incidente): nunca dos veces el mismo id */
    earn({ transactionId, credits, what = '' }) {
      if (!okId(transactionId) || !Number.isSafeInteger(credits) || credits < 0) { stats.invalid++; return false; }
      if (seen(transactionId)) { stats.duplicate++; return false; }
      if (!Number.isSafeInteger(W().balance + credits) || W().balance + credits > 1e7) { stats.overflow++; return false; }
      W().balance += credits; record(transactionId, credits, what); save.flush(); stats.ok++;
      return true;
    },
    /** consume UNA unidad (o q) de un inventario; false si no alcanza (nunca negativo) */
    consume(sku, q = 1, where = 'inv') {
      if (!Number.isSafeInteger(q) || q < 1 || q > MAXQ) return false;
      const inv = D()[where], have = inv[sku] || 0; if (have < q) return false;
      if (have - q === 0) delete inv[sku]; else inv[sku] = have - q;
      return true;
    },
    /** pasa q unidades entre mochila y heladera (atómico) */
    move(sku, from, to, q = 1) {
      const a = D()[from], b = D()[to]; if (!a || !b || !Number.isSafeInteger(q) || q < 1 || (a[sku] || 0) < q || (b[sku] || 0) + q > MAXQ) return false;
      if (a[sku] - q === 0) delete a[sku]; else a[sku] -= q;
      b[sku] = (b[sku] || 0) + q; save.flush(); return true;
    },
    get ledger() { return W().ledger.slice(); },
    processed: id => seen(id),
  };
  return api;
}
