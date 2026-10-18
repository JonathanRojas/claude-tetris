# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no build, no tests, no linter. README and UI text are in Spanish.

## Running

Open `index.html` directly, or serve locally (e.g. `python3 -m http.server 8000`) and visit `http://localhost:8000`.

## Architecture

Three files, all logic in `game.js` (single script, `'use strict'`, global state, no modules):

- `index.html` — fixed element IDs that `game.js` looks up at load (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `theme-toggle`). Renaming an ID breaks the script. Main canvas is 300×600 = `COLS*BLOCK` × `ROWS*BLOCK` (10×20, 30px); if these constants change, update the canvas attrs.
- `style.css` — layout/theme only.
- `game.js` — module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, ...) reset by `init()`.

Game flow: `init()` → `spawn()` (promotes `next`, ends game if spawn collides) → `loop()` (rAF; accumulates `dt` into `dropAccum`, gravity step when `>= dropInterval`) → `lockPiece()` = `merge()` + `clearLines()` + `spawn()`.

Details worth knowing:
- Piece types are indices 1–7 into `PIECES`/`COLORS` (index 0 = empty); the board stores the type index per cell, so colors come from `COLORS[cell]`.
- Rotation is matrix rotate CW (`rotateCW`) with horizontal-only wall kicks `[0,-1,1,-2,2]` in `tryRotate`; no SRS, no CCW.
- Scoring: `LINE_SCORES[cleared] * level`; soft drop +1/cell, hard drop +2/cell. Level = `floor(lines/10)+1`; `dropInterval = max(100, 1000-(level-1)*90)`.
- Pause/game-over cancel the rAF (`cancelAnimationFrame(animId)`); resume resets `lastTime` and calls `loop` manually. `init()` also cancels the previous frame to avoid duplicate loops on restart.
- Ghost piece is drawn via `ghostY()` with alpha 0.2; `drawBlock` is shared by the main and next-piece canvases.
- Theming: colors in `style.css` are CSS variables (`:root` = dark, `[data-theme="light"]` overrides). `applyTheme()` sets `data-theme` on `<html>`, caches `--grid` into `gridColor` for `drawGrid()`, and redraws (loop is cancelled when paused/game over). Choice persisted in `localStorage['theme']`; default dark.
- Piece spawn uses `Math.random()` per piece (no 7-bag).
