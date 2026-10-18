'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - light blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - steel gray (tuerca)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (reto)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveRecordBtn = document.getElementById('save-record-btn');
const gameoverRecords = document.getElementById('gameover-records');
const MAX_RECORDS = 5;
const MAX_NAME = 10;

let running = false;
let combo = 0, maxCombo = 0, pendingRecord = false;
let gridColor = '#22222e';
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  combo = clearLines() ? combo + 1 : 0;
  if (combo > maxCombo) maxCombo = combo;
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  showGameOverRecords();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  running = true;
  combo = 0;
  maxCombo = 0;
  pendingRecord = false;
  nameEntry.classList.add('hidden');
  gameoverRecords.classList.add('hidden');
  startScreen.classList.add('hidden');
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return; // input de nombre
  if (!running) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  if (pendingRecord) submitRecord(); // no perder el récord al reiniciar
  restartBtn.blur();
  init();
});

function applyTheme(theme) {
  const light = theme === 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  themeToggle.textContent = light ? '🌙' : '☀️';
  themeToggle.setAttribute('aria-pressed', String(light));
  themeToggle.setAttribute('aria-label', light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
  if (current) draw(); // el loop está cancelado en pausa / game over
}

function loadTheme() {
  try { return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  try { localStorage.setItem('theme', theme); } catch {}
  applyTheme(theme);
  themeToggle.blur(); // evita que Space active el botón
});

// ---- Records ----
function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem('records'));
    if (!Array.isArray(data)) return [];
    return data
      .filter(r => r && typeof r.score === 'number')
      .map(r => ({
        name: String(r.name ?? '').slice(0, MAX_NAME),
        score: r.score, lines: r.lines | 0, level: r.level | 0, date: String(r.date ?? ''),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
  } catch { return []; }
}

function loadRecordStats() {
  try {
    const s = JSON.parse(localStorage.getItem('recordStats')) || {};
    return { bestCombo: Number(s.bestCombo) || 0, maxLines: Number(s.maxLines) || 0 };
  } catch { return { bestCombo: 0, maxLines: 0 }; }
}

function saveRecordsData(list, stats) {
  try {
    if (list) localStorage.setItem('records', JSON.stringify(list));
    if (stats) localStorage.setItem('recordStats', JSON.stringify(stats));
  } catch {}
}

function qualifiesForTop(s) {
  if (s <= 0) return false;
  const list = loadRecords();
  return list.length < MAX_RECORDS || s > list[list.length - 1].score;
}

function renderRecords(table, statsEl, highlight = -1) {
  const tbody = table.tBodies[0];
  tbody.replaceChildren();
  const list = loadRecords();
  if (!list.length) {
    const tr = tbody.insertRow();
    const td = tr.insertCell();
    td.colSpan = 3;
    td.className = 'empty';
    td.textContent = 'Sin records todavía';
  }
  list.forEach((r, i) => {
    const tr = tbody.insertRow();
    if (i === highlight) tr.className = 'highlight';
    tr.insertCell().textContent = i + 1;
    tr.insertCell().textContent = r.name || '---';
    tr.insertCell().textContent = r.score.toLocaleString();
  });
  const st = loadRecordStats();
  statsEl.textContent = `Mejor combo: ${st.bestCombo} · Líneas máx: ${st.maxLines}`;
}

function refreshStartRecords() {
  renderRecords(document.getElementById('start-table'), document.getElementById('start-stats'));
}

function showGameOverRecords() {
  const st = loadRecordStats();
  st.bestCombo = Math.max(st.bestCombo, maxCombo);
  st.maxLines = Math.max(st.maxLines, lines);
  saveRecordsData(null, st);
  gameoverRecords.classList.remove('hidden');
  pendingRecord = qualifiesForTop(score);
  nameEntry.classList.toggle('hidden', !pendingRecord);
  renderRecords(document.getElementById('gameover-table'), document.getElementById('gameover-stats'));
  if (pendingRecord) {
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 0);
  }
}

function submitRecord() {
  if (!pendingRecord) return;
  pendingRecord = false;
  const name = nameInput.value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_NAME) || 'Anónimo';
  const entry = { name, score, lines, level, date: new Date().toISOString() };
  const list = loadRecords();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const idx = list.indexOf(entry);
  saveRecordsData(list.slice(0, MAX_RECORDS), null);
  nameEntry.classList.add('hidden');
  renderRecords(document.getElementById('gameover-table'), document.getElementById('gameover-stats'), idx);
  nameInput.blur();
}

saveRecordBtn.addEventListener('click', submitRecord);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitRecord(); });

document.querySelectorAll('.reset-records-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.blur();
    if (!confirm('¿Borrar todos los records?')) return;
    try { localStorage.removeItem('records'); localStorage.removeItem('recordStats'); } catch {}
    pendingRecord = false;
    nameEntry.classList.add('hidden');
    refreshStartRecords();
    renderRecords(document.getElementById('gameover-table'), document.getElementById('gameover-stats'));
  });
});

playBtn.addEventListener('click', () => { playBtn.blur(); init(); });

applyTheme(loadTheme());
refreshStartRecords();
