// Solmar Bay entrypoint: hands the game in by copying game/ and screenshots/
// from this repository into the output directory and writing dossier.json
// with buildDossier from vendor/makefun-game.ts. Standard library only,
// deterministic: the same repository always writes the same bytes.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

// Start from a clean output directory so stale files can never leak in.
// Empty its contents instead of removing the directory itself: the grader
// mounts /output and runs as uid 65534, which cannot remove the mount
// point (rmSync of the directory itself fails EACCES/EBUSY), while the
// directory itself is writable, so removing its children always works.
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) {
  rmSync(join(outDir, entry), { recursive: true, force: true });
}

// The game and its screenshots, copied whole.
for (const name of ['game', 'screenshots']) {
  const src = join(repoRoot, name);
  if (!existsSync(src)) throw new Error(`Solmar Bay: missing ${name}/ in ${repoRoot}`);
  cpSync(src, join(outDir, name), { recursive: true });
}

// The dossier, built from exactly what was just copied.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`Solmar Bay: wrote ${outDir} (dossier.json ${dossier.length} bytes)`);
