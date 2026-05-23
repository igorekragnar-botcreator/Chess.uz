(function() {
  'use strict';

  // ========== ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ОШИБОК ==========
  window.onerror = function(msg, url, line, col, error) {
    console.error('🔴 ГЛОБАЛЬНАЯ ОШИБКА:', msg, 'в строке', line, error);
    const statusDiv = document.getElementById('statusEl');
    if (statusDiv) statusDiv.textContent = '⚠️ Ошибка! Смотри консоль (F12)';
    return false;
  };

  // ========== ПРОВЕРКА БИБЛИОТЕКИ ==========
  if (typeof Chess === 'undefined') {
    document.body.innerHTML = '<div style="color:red;padding:20px;text-align:center">⚠️ Ошибка: библиотека chess.js не загружена.<br>Проверьте интернет и перезагрузите страницу.</div>';
    throw new Error('Chess library not loaded');
  }

  // ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
  let game = new Chess();
  let mode = '2p';
  let diff = 5;
  let sel = null;
  let legal = [];
  let gameOver = false;
  let aiThinking = false;
  let flipped = false;
  let lastMove = null;
  let historyMoves = [];
  let posCount = {};
  let whiteCaptured = [];
  let blackCaptured = [];
  let whiteTime = 600;
  let blackTime = 600;
  let timerInterval = null;
  let animating = false;
  let animState = null;
  let animFrame = null;
  let audioCtx = null;
  let audioAllowed = false;
  let timeControl = '10min';

  // ========== CANVAS С ПОДДЕРЖКОЙ RETINA ==========
  const canvas = document.getElementById('cv');
  if (!canvas) {
    throw new Error('Canvas element #cv not found!');
  }
  const ctx = canvas.getContext('2d');
  const BASE_SIZE = 480;
  let SIZE = BASE_SIZE;
  let CELL = SIZE / 8;

  function setCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    SIZE = BASE_SIZE;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    CELL = SIZE / 8;
    console.log(`📐 Canvas размер: ${SIZE}x${SIZE}, DPR=${dpr}`);
  }
  setCanvasSize();
  window.addEventListener('resize', setCanvasSize);

  // ========== ТЕСТОВЫЙ КРАСНЫЙ КВАДРАТ (проверка работы canvas) ==========
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 100, 100);
  console.log('🔴 Тестовый красный квадрат нарисован в (0,0,100,100)');

  // ========== ЗВУКИ ==========
  function initAudio() {
    if (audioAllowed) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioAllowed = true;
    } catch(e) { console.warn('Audio not supported'); }
  }
  function playTone(freq, type, dur, vol = 0.1, delay = 0) {
    if (!audioAllowed || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(vol, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur);
    } catch(e) {}
  }
  function soundMove() { playTone(520, 'sine', 0.07, 0.08); }
  function soundCapture() { playTone(260, 'sawtooth', 0.12, 0.12); playTone(200, 'sawtooth', 0.1, 0.08, 0.06); }
  function soundCheck() { playTone(880, 'sine', 0.05, 0.1); playTone(1100, 'sine', 0.08, 0.07, 0.1); }
  function soundCastle() { playTone(480, 'square', 0.07, 0.07); playTone(640, 'square', 0.07, 0.06, 0.08); }
  function soundGameOver() { [440,370,330,260].forEach((f,i)=>playTone(f,'sine',0.3,0.1,i*0.18)); }

  document.body.addEventListener('click', () => { if (!audioAllowed) initAudio(); }, { once: true });
  canvas.addEventListener('touchstart', () => { if (!audioAllowed) initAudio(); }, { once: true });

  // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
  function fenKey(fen) { return fen.split(' ').slice(0,4).join(' '); }
  function recordPosition(fen) { const k = fenKey(fen); posCount[k] = (posCount[k] || 0) + 1; }

  function sqToRowCol(sq) {
    const col = sq.charCodeAt(0) - 97;
    const row = parseInt(sq[1]) - 1;
    return flipped ? { row: row, col: 7 - col } : { row: 7 - row, col: col };
  }
  function rowColToSq(row, col) {
    if (flipped) {
      const file = String.fromCharCode(97 + (7 - col));
      return file + (row + 1);
    } else {
      const file = String.fromCharCode(97 + col);
      return file + (8 - row);
    }
  }

  // ========== ОТРИСОВКА ФИГУР ==========
  const pieceSymbol = { wk:'♔', wq:'♕', wr:'♖', wb:'♗', wn:'♘', wp:'♙', bk:'♚', bq:'♛', br:'♜', bb:'♝', bn:'♞', bp:'♟' };
  function drawPiece(key, x, y, size, alpha=1) {
    const isWhite = key[0] === 'w';
    const cx = x + size/2, cy = y + size/2;
    const r = size * 0.4;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = size*0.12;
    ctx.shadowOffsetX = size*0.04;
    ctx.shadowOffsetY = size*0.06;
    const grad = ctx.createRadialGradient(cx - r*0.25, cy - r*0.3, r*0.05, cx, cy, r);
    if (isWhite) {
      grad.addColorStop(0, '#fffff0');
      grad.addColorStop(0.55, '#f0e6c8');
      grad.addColorStop(1, '#c8b080');
    } else {
      grad.addColorStop(0, '#50402a');
      grad.addColorStop(0.5, '#20180c');
      grad.addColorStop(1, '#0e0905');
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.font = `500 ${size*0.62}px 'Segoe UI Symbol','Apple Color Emoji','Noto Sans Symbols',serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isWhite ? '#2a1a06' : '#e8c87a';
    ctx.fillText(pieceSymbol[key], cx, cy + size*0.02);
    ctx.restore();
  }

  function getCheckSquare() {
    if (!game.in_check()) return null;
    const board = game.board();
    const turn = game.turn();
    for (let r=0; r<8; r++) {
      for (let c=0; c<8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === turn) return String.fromCharCode(97+c) + (8-r);
      }
    }
    return null;
  }

  function drawBoard() {
    console.log('🎨 drawBoard() вызван');
    // КРИТИЧЕСКОЕ: очистка перед рисованием
    ctx.clearRect(0, 0, SIZE, SIZE);
    
    const checkSq = getCheckSquare();
    const selectedSq = sel ? rowColToSq(sel.row, sel.col) : null;
    // Клетки
    for (let r=0; r<8; r++) {
      for (let c=0; c<8; c++) {
        const sq = rowColToSq(r, c);
        const light = (r+c)%2 === 0;
        let color = light ? '#f0d9b5' : '#b58863';
        if (lastMove && (sq === lastMove.from || sq === lastMove.to)) color = light ? '#cdd26a' : '#aaa23a';
        if (sq === selectedSq) color = light ? '#7dc97d' : '#4a9e4a';
        if (sq === checkSq) color = light ? '#ff8a7a' : '#cc4433';
        ctx.fillStyle = color;
        ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
      }
    }
    // Легальные ходы
    for (const t of legal) {
      const { row, col } = sqToRowCol(t);
      const hasPiece = !!game.get(t);
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      if (hasPiece) {
        ctx.beginPath();
        ctx.arc(col*CELL+CELL/2, row*CELL+CELL/2, CELL*0.46, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        const light = (row+col)%2 === 0;
        ctx.fillStyle = light ? '#f0d9b5' : '#b58863';
        ctx.arc(col*CELL+CELL/2, row*CELL+CELL/2, CELL*0.35, 0, Math.PI*2, true);
        ctx.fill('evenodd');
      } else {
        ctx.beginPath();
        ctx.arc(col*CELL+CELL/2, row*CELL+CELL/2, CELL*0.17, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }
    // Фигуры
    const boardArr = game.board();
    for (let r=0; r<8; r++) {
      for (let c=0; c<8; c++) {
        const sq = rowColToSq(r, c);
        if (animating && animState && (sq === animState.fromSq || sq === animState.toSq)) continue;
        const p = game.get(sq);
        if (!p) continue;
        drawPiece(p.color + p.type, c*CELL, r*CELL, CELL);
      }
    }
    // Анимированная фигура
    if (animating && animState) drawPiece(animState.key, animState.x, animState.y, CELL, 0.97);
    
    console.log('✅ drawBoard() завершён, фигур на доске:', boardArr.flat().filter(p => p).length);
  }

  // ========== АНИМАЦИЯ ХОДА ==========
  function animateMove(piece, fromSq, toSq, callback) {
    if (animFrame) cancelAnimationFrame(animFrame);
    const { row: fr, col: fc } = sqToRowCol(fromSq);
    const { row: tr, col: tc } = sqToRowCol(toSq);
    const fx = fc*CELL, fy = fr*CELL, tx = tc*CELL, ty = tr*CELL;
    const key = piece.color + piece.type;
    const start = performance.now();
    const duration = 190;
    animating = true;
    animState = { key, fromSq, toSq, x: fx, y: fy };
    function step(now) {
      const t = Math.min((now-start)/duration, 1);
      const ease = t<0.5 ? 2*t*t : -1+(4-2*t)*t;
      animState.x = fx + (tx-fx)*ease;
      animState.y = fy + (ty-fy)*ease;
      drawBoard();
      if (t<1) {
        animFrame = requestAnimationFrame(step);
      } else {
        animating = false;
        animState = null;
        drawBoard();
        if (callback) callback();
      }
    }
    animFrame = requestAnimationFrame(step);
  }

  // ========== ТАЙМЕРЫ ==========
  function formatTime(sec) {
    const mins = Math.floor(Math.max(0, sec)/60);
    const s = Math.floor(Math.max(0, sec)%60);
    return `${mins}:${String(s).padStart(2,'0')}`;
  }
  function stopTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; }
  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      if (gameOver || aiThinking) return;
      if (game.turn() === 'w') { whiteTime--; if (whiteTime <= 0) timeout('w'); }
      else { blackTime--; if (blackTime <= 0) timeout('b'); }
      updateTimersUI();
    }, 1000);
  }
  function timeout(color) {
    stopTimer();
    gameOver = true;
    setStatus((color==='w'?'Белые':'Черные')+' превысили время!', 'gameover');
    soundGameOver();
  }
  function addIncrement() {
    if (timeControl === '3+2') {
      if (game.turn() === 'w') blackTime += 2;
      else whiteTime += 2;
      updateTimersUI();
    }
  }
  function updateTimersUI() {
    const topIsBlack = !flipped;
    const topSec = topIsBlack ? blackTime : whiteTime;
    const botSec = topIsBlack ? whiteTime : blackTime;
    document.getElementById('tmTop').textContent = formatTime(topSec);
    document.getElementById('tmBot').textContent = formatTime(botSec);
    const wTurn = game.turn() === 'w';
    const topActive = topIsBlack ? !wTurn : wTurn;
    const botActive = topIsBlack ? wTurn : !wTurn;
    document.getElementById('cardTop').classList.toggle('active', topActive && !gameOver);
    document.getElementById('cardBot').classList.toggle('active', botActive && !gameOver);
    document.getElementById('cardTop').classList.toggle('timelw', topSec < 60);
    document.getElementById('cardBot').classList.toggle('timelw', botSec < 60);
  }

  // ========== СТАТУС ==========
  function setStatus(msg, cls) {
    const el = document.getElementById('statusEl');
    if (el) { el.textContent = msg; el.className = 'status' + (cls ? ' ' + cls : ''); }
    else console.warn('statusEl not found');
  }
  function updateGameStatus() {
    if (game.game_over()) {
      gameOver = true;
      stopTimer();
      soundGameOver();
      if (game.in_checkmate()) {
        const winner = game.turn() === 'w' ? 'Черные' : 'Белые';
        setStatus(`♛ ${winner} победили — Мат!`, 'gameover');
      } else if (game.in_stalemate()) setStatus('☯ Пат — Ничья!', 'gameover');
      else if (game.in_threefold_repetition()) setStatus('🔁 Троекратное повторение — Ничья!', 'gameover');
      else if (game.insufficient_material()) setStatus('☯ Недостаточно материала — Ничья!', 'gameover');
      else setStatus('— Ничья!', 'gameover');
      return;
    }
    gameOver = false;
    const turn = game.turn() === 'w' ? 'Белые' : 'Черные';
    const inCheck = game.in_check();
    if (inCheck) soundCheck();
    if (mode === 'ai' && game.turn() === 'b') {
      setStatus(inCheck ? '🤖 AI в шахе! Думает...' : '🤖 Ход AI...', inCheck ? 'check' : '');
    } else {
      setStatus(inCheck ? `⚡ ШАХ! Ходят ${turn}` : `Ходят ${turn}`, inCheck ? 'check' : '');
    }
    updateTimersUI();
  }

  // ========== ИСТОРИЯ, ЗАХВАТЫ, КООРДИНАТЫ (сокращённо для краткости, но можно оставить как ранее) ==========
  // Здесь должны быть функции refreshCoordinates, updateCaptures, updateHistoryUI, exportPGN, copyPGN, но в этом исправлении я сосредоточусь на canvas.
  // Они уже были в предыдущих версиях. Для полной функциональности вы можете их скопировать из последнего рабочего chess.js.
  // Чтобы не растягивать, я покажу минимально необходимые заглушки, но в вашем проекте они уже есть.
  // ========== ОСТАЛЬНЫЕ ФУНКЦИИ (инициализация, AI, онлайн) ==========
  // ... (здесь оставьте ваш существующий код для этих функций, он не меняется)
  // Важно: после всех определений вызовите drawBoard() в конце init.

  // ========== ИНИЦИАЛИЗАЦИЯ ==========
  function init() {
    console.log('🚀 Инициализация Chess.uz');
    setCanvasSize();
    drawBoard();
    console.log('🎯 Первый drawBoard выполнен');
    // Проверка: нарисовать ещё раз через секунду
    setTimeout(() => { drawBoard(); console.log('🔄 Повторный drawBoard через 1с'); }, 1000);
    // Здесь добавьте остальную инициализацию (режимы, кнопки, таймеры и т.д.)
  }
  init();
})();
