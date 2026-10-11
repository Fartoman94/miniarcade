// Sincroniza el juego «Mateo: Ciudad de Altura» desde su repo privado a miniarcade/mateo/.
// Copia SOLO la carpeta game/ (nunca private_refs, docs/concepts ni qa/), sin tocar el código del juego,
// y agrega en index.html la intro de MateLabs, el SDK del arcade y el puente con el portal.
// Uso: node tools/sync-mateo.mjs [ruta del repo de Mateo] [rama]
import { execSync } from 'node:child_process';
import { cpSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2] || '/srv/repositories/mateo-ciudad-altura';
const BRANCH = process.argv[3] || 'feat/mateo-ciudad-viva-v2';
const DEST = new URL('../mateo/', import.meta.url).pathname;

const sha = execSync(`git -C ${SRC} rev-parse --short ${BRANCH}`).toString().trim();
const dirty = execSync(`git -C ${SRC} status --porcelain`).toString().trim();
if (dirty) throw new Error('El repo de Mateo tiene cambios sin commitear; sincronizá desde un commit limpio.');
const cur = execSync(`git -C ${SRC} branch --show-current`).toString().trim();
if (cur !== BRANCH) throw new Error(`El repo de Mateo está en ${cur}, se esperaba ${BRANCH}.`);

rmSync(DEST, { recursive: true, force: true });
cpSync(join(SRC, 'game'), DEST, {
  recursive: true,
  // fuera: herramientas de desarrollo y cualquier cosa que no sea del juego publicado
  filter: p => !/\/(tools|\.gitignore)(\/|$)/.test(p.replace(join(SRC, 'game'), '')),
});

// salvaguarda de privacidad: no debe viajar ninguna foto (los assets del juego son .glb y texturas generadas)
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk(DEST)) {
  if (/private_refs|concept/i.test(f)) throw new Error('Archivo privado en la copia: ' + f);
  if (/\.(jpe?g|heic)$/i.test(f)) throw new Error('Foto no permitida en la copia: ' + f);
  if (/\.(png|webp)$/i.test(f) && !/\/assets\/textures\//.test(f)) throw new Error('Imagen fuera de assets/textures: ' + f);
}

let html = readFileSync(join(DEST, 'index.html'), 'utf8');
html = html.replace('<title>Mateo: Ciudad de Altura</title>', '<title>Mateo: Ciudad de Altura — MateLabs</title>\n<link rel="icon" type="image/png" href="../matelabs/favicon.png">\n<script src="../matelabs/arcade.js"></script>');
html = html.replace('<body>', '<body>\n<script src="../matelabs/intro.js" data-game="MATEO: CIUDAD DE ALTURA" data-accent="#ff4d4d"></script>');
html = html.replace('<script type="module" src="./src/main.js"></script>', '<script type="module" src="./src/main.js"></script>\n<script src="../games/mateo/bridge.js"></script>');
writeFileSync(join(DEST, 'index.html'), html);
writeFileSync(join(DEST, 'VERSION.txt'), `Copia de ${BRANCH}@${sha} (repo privado mateo-ciudad-altura). No editar a mano: usar tools/sync-mateo.mjs.\n`);
console.log('Mateo sincronizado desde', BRANCH, sha, '→', DEST);
