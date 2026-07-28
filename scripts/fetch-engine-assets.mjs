/**
 * Stage the Stockfish engine assets into `public/engine/` (US-C1, NFR-L3, FR-7).
 *
 * Why a script instead of committing the files:
 *   - The NNUE network is several MB of binary. Committing it bloats every
 *     clone forever and gains nothing — it is a reproducible download pinned by
 *     content hash in its own filename.
 *   - The WASM/glue come from node_modules, so they are already pinned by the
 *     lockfile. Copying keeps `public/` the single serving root.
 *
 * Why self-hosted rather than a CDN:
 *   COEP `require-corp` (FR-7) blocks cross-origin subresources that do not opt
 *   in via CORP. Fetching the network from Stockfish's CDN at runtime would be
 *   blocked by our own isolation headers — the very headers the engine needs to
 *   run multithreaded. Self-hosting is not a preference here, it is a
 *   consequence.
 *
 * GPLv3 (NFR-L3): these artifacts stay separate files loaded at runtime over a
 * postMessage/UCI boundary. They are never bundled or linked into our code.
 * See docs/attribution.md for the notice and source offer.
 *
 * Run: npm run engine:assets  (also wired into `prebuild`)
 */
import { createWriteStream } from "node:fs";
import { mkdir, copyFile, stat, readFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules", "@lichess-org", "stockfish-web");
const outDir = join(root, "public", "engine");

/**
 * P0 ships the **small net** build.
 *
 * The big net (`sf_18`) needs two networks totalling far more download for a
 * strength difference that does not change a move's classification at depth 18.
 * On mobile web — our primary surface (US-G1) — payload is the constraint that
 * decides whether the feature is usable at all (NFR-P1).
 */
const BUILD = "sf_18_smallnet";

/** Content-hashed filename, read from the build itself rather than hardcoded. */
const NNUE_SOURCES = [
  (name) => `https://data.stockfishchess.org/nn/${name}`,
  (name) => `https://tests.stockfishchess.org/api/nn/${name}`,
  (name) => `https://lichess1.org/assets/lifat/nnue/${name}`,
];

async function main() {
  await mkdir(outDir, { recursive: true });

  for (const file of [`${BUILD}.js`, `${BUILD}.wasm`]) {
    await copyFile(join(pkgDir, file), join(outDir, file));
    console.log(`copied  ${file}`);
  }
  // GPLv3 obligation: the licence travels with the artifact.
  await copyFile(join(pkgDir, "LICENSE"), join(outDir, "LICENSE.stockfish.txt"));

  const nnueName = await discoverNnueName(join(pkgDir, `${BUILD}.wasm`));
  const nnuePath = join(outDir, nnueName);

  if (await exists(nnuePath)) {
    const { size } = await stat(nnuePath);
    console.log(`cached  ${nnueName} (${mb(size)} MB)`);
    return;
  }

  await downloadWithFallback(nnueName, nnuePath);
}

/**
 * The network filename is embedded in the WASM binary. Reading it there means
 * an engine upgrade cannot silently pair a new build with a stale network —
 * the name is content-hashed, so a mismatch is impossible rather than merely
 * unlikely.
 */
async function discoverNnueName(wasmPath) {
  const buf = await readFile(wasmPath);
  const match = buf.toString("latin1").match(/nn-[a-f0-9]{12}\.nnue/);
  if (!match) throw new Error(`Could not find an NNUE filename inside ${wasmPath}`);
  return match[0];
}

async function downloadWithFallback(name, destPath) {
  let lastError;
  for (const makeUrl of NNUE_SOURCES) {
    const url = makeUrl(name);
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(destPath));
      const { size } = await stat(destPath);
      if (size < 1024) throw new Error(`suspiciously small (${size} bytes)`);
      console.log(`fetched ${name} (${mb(size)} MB) from ${new URL(url).host}`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`  ${new URL(url).host}: ${error.message}`);
    }
  }
  throw new Error(`Could not download ${name} from any source: ${lastError?.message}`);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const mb = (bytes) => (bytes / 1048576).toFixed(1);

await main();
