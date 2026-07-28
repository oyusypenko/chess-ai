#!/usr/bin/env node
/**
 * Point git at the tracked hooks directory.
 *
 * `core.hooksPath` is local config, not something a clone inherits, so a hook
 * committed to the repo does nothing until someone runs this. Wiring it to the
 * `prepare` lifecycle means `npm install` sets it up — a setup step people have
 * to remember is a setup step that gets skipped, and a pre-commit hook that
 * only runs on the machine that wrote it is worse than none, because it creates
 * the impression the rules are being enforced.
 *
 * Exits 0 no matter what. This runs on every `npm install`, including in CI and
 * in Docker builds where there is no `.git` at all, and failing there would
 * break an install over a developer convenience.
 */

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const HOOKS_DIR = ".githooks";

try {
  if (!existsSync(".git")) {
    // A tarball install, a Docker build context, or a worktree without config —
    // nothing to wire up, and nothing wrong.
    process.exit(0);
  }

  execFileSync("git", ["config", "core.hooksPath", HOOKS_DIR], { stdio: "ignore" });

  // git will not run a hook it cannot execute, and the executable bit does not
  // survive every checkout path (notably a zip download).
  for (const entry of readdirSync(HOOKS_DIR)) {
    chmodSync(join(HOOKS_DIR, entry), 0o755);
  }

  console.log(`✓ git hooks enabled (core.hooksPath=${HOOKS_DIR})`);
} catch (error) {
  console.warn(`git hooks not installed: ${error instanceof Error ? error.message : error}`);
}
