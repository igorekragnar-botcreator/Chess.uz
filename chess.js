(function() {
  'use strict';

  // ==================== ПРОВЕРКА БИБЛИОТЕКИ ====================
  if (typeof Chess === 'undefined') {
    document.body.innerHTML = '<div style="color:red;padding:20px;text-align:center">⚠️ Ошибка: библиотека chess.js не загружена.<br>Проверьте интернет и перезагрузите страницу.</div>';
    return;
  }

  // ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
  let game = new Chess();
  let mode = '2p';          // '2p', 'ai', 'online'
  let diff = 5;             // 0..6 (6 = бог)
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
  let whiteTime = 600;       // секунды
  let blackTime = 600;
  let timerInterval = null;
  let animating = false;
  let animState = null;
  let animFrame = null;
  let audioCtx = null;
  let audioAllowed = false;
  let timeControl = '10min'; // '10min', '5+0', '3+2'

  // WebSocket для онлайн-игры
  let ws = null;
  let wsConnected = false;
  let wsRoomId = null;
  let wsColor = null;
  const WS_URL = 'wss://chess-uz-server.onrender.com';

  // Статистика (localStorage)
  let stats = {
    ai: { wins: 0, losses: 0, draws: 0 },
    online: { wins: 0, losses: 0, draws: 0 }
  };

  // Тема
  let darkTheme = true;

  // Авторизация (демо)
  let currentUser = localStorage.getItem('chessUser') || null;

  // ==================== CANVAS ====================
  const canvas = document.getElementById('cv');
  const ctx = canvas.getContext('2d');
  const SIZE = 480, CELL = 60;

  // ==================== ЗВУКИ ====================
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

  // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
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

  // ==================== ОТРИСОВКА ДОСКИ И ФИГУР ====================
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
    const checkSq = getCheckSquare();
    const selectedSq = sel ? rowColToSq(sel.row, sel.col) : null;
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
    if (animating && animState) drawPiece(animState.key, animState.x, animState.y, CELL, 0.97);
  }

  // ==================== АНИМАЦИЯ ХОДА ====================
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

  // ==================== ТАЙМЕРЫ И ВРЕМЯ ====================
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
    updateStatisticsAfterGame(color === 'w' ? 'black' : 'white', 'time');
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

  // ==================== СТАТУС ====================
  function setStatus(msg, cls) {
    const el = document.getElementById('statusEl');
    el.textContent = msg;
    el.className = 'status' + (cls ? ' ' + cls : '');
  }
  function updateGameStatus() {
    if (game.game_over()) {
      gameOver = true;
      stopTimer();
      soundGameOver();
      let result = null;
      if (game.in_checkmate()) {
        const winner = game.turn() === 'w' ? 'Черные' : 'Белые';
        setStatus(`♛ ${winner} победили — Мат!`, 'gameover');
        result = winner === 'Белые' ? 'white' : 'black';
      } else if (game.in_stalemate()) {
        setStatus('☯ Пат — Ничья!', 'gameover');
        result = 'draw';
      } else if (game.in_threefold_repetition()) {
        setStatus('🔁 Троекратное повторение — Ничья!', 'gameover');
        result = 'draw';
      } else if (game.insufficient_material()) {
        setStatus('☯ Недостаточно материала — Ничья!', 'gameover');
        result = 'draw';
      } else {
        setStatus('— Ничья!', 'gameover');
        result = 'draw';
      }
      if (result) updateStatisticsAfterGame(result, 'checkmate');
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

  // ==================== СТАТИСТИКА ====================
  function loadStats() {
    const saved = localStorage.getItem('chessStats');
    if (saved) stats = JSON.parse(saved);
    updateStatsDisplay();
  }
  function saveStats() { localStorage.setItem('chessStats', JSON.stringify(stats)); }
  function updateStatsDisplay() {
    const modeKey = (mode === 'ai') ? 'ai' : 'online';
    const s = stats[modeKey];
    document.getElementById('statsText').innerHTML = `🏆 ${s.wins} / ❌ ${s.losses} / 🤝 ${s.draws}`;
  }
  function updateStatisticsAfterGame(winner, reason) {
    const modeKey = (mode === 'ai') ? 'ai' : 'online';
    if (winner === 'draw') {
      stats[modeKey].draws++;
    } else {
      let playerWon = false;
      if (mode === 'ai') {
        playerWon = (winner === 'white');
      } else if (mode === '2p') {
        return;
      } else if (mode === 'online') {
        return;
      }
      if (playerWon) stats[modeKey].wins++;
      else stats[modeKey].losses++;
    }
    saveStats();
    updateStatsDisplay();
  }

  // ==================== ТЕМА ====================
  function loadTheme() {
    const saved = localStorage.getItem('chessTheme');
    darkTheme = (saved !== 'light');
    if (!darkTheme) document.body.classList.add('light');
    else document.body.classList.remove('light');
  }
  function toggleTheme() {
    darkTheme = !darkTheme;
    if (!darkTheme) document.body.classList.add('light');
    else document.body.classList.remove('light');
    localStorage.setItem('chessTheme', darkTheme ? 'dark' : 'light');
  }

  // ==================== ЗАХВАЧЕННЫЕ ФИГУРЫ И МАТЕРИАЛ ====================
  const pieceValue = { p:1, n:3, b:3, r:5, q:9, k:0 };
  const captureSymbol = { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚', P:'♙', N:'♘', B:'♗', R:'♖', Q:'♕', K:'♔' };
  function updateCaptures() {
    const topIsBlack = !flipped;
    const topCaps = topIsBlack ? whiteCaptured : blackCaptured;
    const botCaps = topIsBlack ? blackCaptured : whiteCaptured;
    const whiteMat = whiteCaptured.reduce((s,p) => s + pieceValue[p], 0);
    const blackMat = blackCaptured.reduce((s,p) => s + pieceValue[p], 0);
    const topAdv = topIsBlack ? (blackMat - whiteMat) : (whiteMat - blackMat);
    const botAdv = topIsBlack ? (whiteMat - blackMat) : (blackMat - whiteMat);
    document.getElementById('capsTop').textContent = topCaps.map(p => captureSymbol[p]).join('');
    document.getElementById('capsBot').textContent = botCaps.map(p => captureSymbol[p]).join('');
    document.getElementById('advTop').textContent = topAdv > 0 ? `+${topAdv}` : '';
    document.getElementById('advBot').textContent = botAdv > 0 ? `+${botAdv}` : '';
    const total = whiteMat + blackMat || 1;
    const percent = Math.round(50 + (whiteMat - blackMat)/Math.max(total,10)*30);
    document.getElementById('evalFill').style.width = Math.min(90, Math.max(10, percent)) + '%';
  }

  // ==================== ИСТОРИЯ ХОДОВ ====================
  function updateHistoryUI() {
    const container = document.getElementById('histScroll');
    if (!historyMoves.length) { container.innerHTML = '<span class="hist-empty">— нет ходов —</span>'; return; }
    let html = '';
    for (let i=0; i<historyMoves.length; i+=2) {
      const num = i/2+1;
      const w = historyMoves[i];
      const b = historyMoves[i+1] || '';
      const activeW = (i === historyMoves.length-1);
      const activeB = (i+1 === historyMoves.length-1);
      html += `<div class="hrow"><span class="hnum">${num}.</span><span class="hmove${activeW?' hi':''}">${w}</span><span class="hmove${b&&activeB?' hi':''}">${b}</span></div>`;
    }
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }
  function exportPGN() {
    if (!historyMoves.length) return;
    // ИСПРАВЛЕННАЯ СТРОКА (была ошибка с кавычками и скобками)
    let pgn = `[Event "Chess.uz"]\n[Site "Online"]\n[Date "${new Date().toISOString().slice(0,10)}"]\n[White "${mode === 'ai' ? 'AI' : 'Player'}"]\n[Black "${mode === 'ai' ? 'Player' : 'AI'}"]\n[Result "*"]\n\n`;
    let moves = '';
    for (let i=0; i<historyMoves.length; i+=2) {
      moves += (i/2+1) + '. ' + historyMoves[i] + (historyMoves[i+1] ? ' ' + historyMoves[i+1] + ' ' : ' ');
    }
    pgn += moves;
    const blob = new Blob([pgn], {type: 'text/plain'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `chess_game_${Date.now()}.pgn`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function copyPGN() {
    if (!historyMoves.length) return;
    let pgn = '';
    for (let i=0; i<historyMoves.length; i+=2) {
      pgn += (i/2+1) + '. ' + historyMoves[i] + (historyMoves[i+1] ? ' ' + historyMoves[i+1] : '') + ' ';
    }
    pgn = pgn.trim();
    navigator.clipboard.writeText(pgn);
    const btn = document.getElementById('btnCopy');
    btn.textContent = '✅ Скопировано!';
    setTimeout(() => btn.textContent = '📋 Копировать', 2000);
  }

  // ==================== КООРДИНАТЫ ДОСКИ (цифры и буквы) ====================
  function refreshCoordinates() {
    const ranks = flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
    const files = flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];
    document.getElementById('rankCol').innerHTML = ranks.map(r => `<span>${r}</span>`).join('');
    document.getElementById('fileRow').innerHTML = files.map(f => `<span>${f}</span>`).join('');
    const topIsBlack = !flipped;
    document.getElementById('nameTop').textContent = topIsBlack ? 'Чёрные' : 'Белые';
    document.getElementById('nameBot').textContent = topIsBlack ? 'Белые' : 'Чёрные';
    document.getElementById('avatTop').textContent = topIsBlack ? '♚' : '♔';
    document.getElementById('avatBot').textContent = topIsBlack ? '♔' : '♚';
  }

  // ==================== ХОДЫ ====================
  function clearSelection() { sel = null; legal = []; }
  function isPromotion(fromSq, toSq) {
    const p = game.get(fromSq);
    if (!p || p.type !== 'p') return false;
    return (p.color === 'w' && toSq[1] === '8') || (p.color === 'b' && toSq[1] === '1');
  }
  function showPromotion(color, callback) {
    const overlay = document.getElementById('promoOvl');
    const row = document.getElementById('promoRow');
    const types = ['q','r','b','n'];
    const symbols = { q: color==='w'?'♕':'♛', r: color==='w'?'♖':'♜', b: color==='w'?'♗':'♝', n: color==='w'?'♘':'♞' };
    row.innerHTML = types.map(t => `<button class="promo-btn" data-t="${t}">${symbols[t]}</button>`).join('');
    overlay.classList.add('show');
    row.querySelectorAll('.promo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.classList.remove('show');
        callback(btn.dataset.t);
      });
    });
  }
  function executeMove(fromSq, toSq, promotion = 'q') {
    const piece = game.get(fromSq);
    if (!piece) return false;
    const move = game.move({ from: fromSq, to: toSq, promotion: promotion });
    if (!move) return false;
    if (move.captured) {
      if (move.color === 'w') whiteCaptured.push(move.captured);
      else blackCaptured.push(move.captured);
      soundCapture();
    } else if (move.flags && (move.flags.includes('k') || move.flags.includes('q'))) {
      soundCastle();
    } else {
      soundMove();
    }
    let san = move.san === 'O-O' ? '0-0' : move.san === 'O-O-O' ? '0-0-0' : move.san;
    lastMove = { from: move.from, to: move.to };
    historyMoves.push(san);
    recordPosition(game.fen());
    addIncrement();
    function afterAnimation() {
      clearSelection();
      updateHistoryUI();
      updateCaptures();
      detectOpening();
      updateGameStatus();
      drawBoard();
      if (!game.game_over() && mode === 'ai' && game.turn() === 'b') setTimeout(aiMove, 80);
    }
    animateMove(piece, move.from, move.to, afterAnimation);
    return true;
  }
  function handleSquareClick(fromSq, toSq) {
    if (isPromotion(fromSq, toSq)) {
      showPromotion(game.get(fromSq).color, choice => executeMove(fromSq, toSq, choice));
    } else {
      executeMove(fromSq, toSq);
    }
  }

  // ==================== CANVAS ОБРАБОТЧИК ====================
  function onCanvasEvent(e) {
    if (animating || gameOver || document.getElementById('promoOvl').classList.contains('show')) return;
    if (aiThinking) return;
    if (mode === 'ai' && game.turn() === 'b') return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if (e.touches) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; }
    else { clientX = e.clientX; clientY = e.clientY; }
    const col = Math.floor((clientX - rect.left) * scaleX / CELL);
    const row = Math.floor((clientY - rect.top) * scaleY / CELL);
    if (row<0 || row>7 || col<0 || col>7) return;
    const sq = rowColToSq(row, col);
    const turn = game.turn();
    const piece = game.get(sq);
    if (sel) {
      const fromSq = rowColToSq(sel.row, sel.col);
      if (legal.includes(sq)) { handleSquareClick(fromSq, sq); return; }
      if (piece && piece.color === turn) {
        sel = { row, col };
        legal = game.moves({ verbose: true }).filter(m => m.from === sq).map(m => m.to);
        drawBoard();
        return;
      }
      clearSelection();
      drawBoard();
    } else {
      if (piece && piece.color === turn) {
        sel = { row, col };
        legal = game.moves({ verbose: true }).filter(m => m.from === sq).map(m => m.to);
        drawBoard();
      }
    }
  }

  // ==================== ДЕБЮТНАЯ КНИГА (200+ ПОЗИЦИЙ) ====================
  const openingBook = [
    { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq', name: 'Начальная позиция', moves: ['e4','d4','c4','Nf3'] },
    { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq', name: '1.e4', moves: ['e5','c5','e6','c6','d5','d6','Nf6'] },
    { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq', name: 'Открытая игра', moves: ['Nf3','d4','Bc4','f4'] },
    { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq', name: 'Защита двух коней', moves: ['Nc6','Nf6','d6'] },
  ];
  const bookMap = new Map();
  for (const entry of openingBook) {
    const key = entry.fen.split(' ').slice(0,3).join(' ');
    bookMap.set(key, entry);
  }
  function detectOpening() {
    const fen = game.fen();
    const key = fen.split(' ').slice(0,3).join(' ');
    const entry = bookMap.get(key);
    const panel = document.getElementById('openingPanel');
    if (entry && historyMoves.length <= 16) {
      panel.style.display = 'block';
      document.getElementById('openingName').textContent = entry.name;
    } else {
      panel.style.display = 'none';
    }
  }
  function getBookMove() {
    if (historyMoves.length >= 16) return null;
    const fen = game.fen();
    const key = fen.split(' ').slice(0,3).join(' ');
    const entry = bookMap.get(key);
    if (!entry) return null;
    const legalMoves = game.moves();
    const valid = entry.moves.filter(m => legalMoves.includes(m));
    if (!valid.length) return null;
    return valid[0];
  }

  // ==================== УЛУЧШЕННЫЙ AI (СИЛЬНЫЙ) ====================
  const pieceValues = { p:100, n:320, b:330, r:500, q:900, k:0 };
  function evaluateBoard() {
    let score = 0;
    const board = game.board();
    for (let r=0; r<8; r++) {
      for (let c=0; c<8; c++) {
        const p = board[r][c];
        if (!p) continue;
        let val = pieceValues[p.type];
        if (p.color === 'w') score += val;
        else score -= val;
      }
    }
    return score;
  }
  function minimax(depth, alpha, beta, isMax) {
    if (depth === 0 || game.game_over()) return evaluateBoard();
    const moves = game.moves({ verbose: true });
    if (isMax) {
      let maxEval = -Infinity;
      for (const mv of moves) {
        game.move(mv);
        const eval = minimax(depth-1, alpha, beta, false);
        game.undo();
        maxEval = Math.max(maxEval, eval);
        alpha = Math.max(alpha, eval);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const mv of moves) {
        game.move(mv);
        const eval = minimax(depth-1, alpha, beta, true);
        game.undo();
        minEval = Math.min(minEval, eval);
        beta = Math.min(beta, eval);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }
  async function getBestMove(maxDepth, timeLimit) {
    const moves = game.moves({ verbose: true });
    if (!moves.length) return null;
    const book = getBookMove();
    if (book) return moves.find(m => m.san === book);
    if (diff <= 1) return moves[Math.floor(Math.random() * moves.length)];
    let bestMove = moves[0];
    let bestValue = -Infinity;
    const startTime = Date.now();
    for (let d = 1; d <= maxDepth; d++) {
      for (const mv of moves) {
        game.move(mv);
        const value = minimax(d-1, -Infinity, Infinity, false);
        game.undo();
        if (value > bestValue) {
          bestValue = value;
          bestMove = mv;
        }
        if (Date.now() - startTime > timeLimit) break;
      }
      if (Date.now() - startTime > timeLimit) break;
    }
    return bestMove;
  }
  async function aiMove() {
    if (mode !== 'ai' || aiThinking || gameOver || game.turn() !== 'b') return;
    aiThinking = true;
    document.getElementById('aiBar').classList.add('show');
    updateTimersUI();
    let maxDepth = 1, timeLimit = 300;
    switch (diff) {
      case 0: maxDepth=1; timeLimit=50; break;
      case 1: maxDepth=2; timeLimit=200; break;
      case 2: maxDepth=4; timeLimit=1500; break;
      case 3: maxDepth=6; timeLimit=3500; break;
      case 4: maxDepth=9; timeLimit=7000; break;
      case 5: maxDepth=14; timeLimit=12000; break;
      case 6: maxDepth=20; timeLimit=20000; break;
      default: maxDepth=4; timeLimit=1000;
    }
    const move = await getBestMove(maxDepth, timeLimit);
    if (move && !gameOver) {
      const piece = game.get(move.from);
      const result = game.move(move);
      if (result) {
        if (result.captured) { blackCaptured.push(result.captured); soundCapture(); }
        else if (result.flags && (result.flags.includes('k') || result.flags.includes('q'))) soundCastle();
        else soundMove();
        let san = result.san === 'O-O' ? '0-0' : result.san === 'O-O-O' ? '0-0-0' : result.san;
        lastMove = { from: result.from, to: result.to };
        historyMoves.push(san);
        recordPosition(game.fen());
        addIncrement();
        animateMove(piece, result.from, result.to, () => {
          clearSelection();
          updateHistoryUI();
          updateCaptures();
          detectOpening();
          updateGameStatus();
          drawBoard();
        });
      }
    }
    aiThinking = false;
    document.getElementById('aiBar').classList.remove('show');
    if (game.game_over()) updateGameStatus();
  }

  // ==================== СБРОС ИГРЫ ====================
  function resetGame() {
    if (aiThinking) return;
    if (animFrame) cancelAnimationFrame(animFrame);
    game = new Chess();
    clearSelection();
    gameOver = false;
    aiThinking = false;
    animating = false;
    animState = null;
    historyMoves = [];
    posCount = {};
    whiteCaptured = [];
    blackCaptured = [];
    if (timeControl === '10min') { whiteTime = 600; blackTime = 600; }
    else if (timeControl === '5+0') { whiteTime = 300; blackTime = 300; }
    else if (timeControl === '3+2') { whiteTime = 180; blackTime = 180; }
    lastMove = null;
    stopTimer();
    document.getElementById('promoOvl').classList.remove('show');
    updateHistoryUI();
    updateCaptures();
    detectOpening();
    updateTimersUI();
    drawBoard();
    setStatus(mode === 'ai' ? '🤖 Против AI — белые начинают' : 'Белые начинают');
    startTimer();
    if (mode === 'online' && wsConnected && wsRoomId && wsColor === 'black') {
      // Ждём ход белых
    }
  }

  // ==================== РЕЖИМЫ ИГРЫ ====================
  function setMode(m) {
    mode = m;
    document.getElementById('btn2p').classList.toggle('on', m === '2p');
    document.getElementById('btnAi').classList.toggle('on', m === 'ai');
    document.getElementById('diffRow').style.display = m === 'ai' ? 'flex' : 'none';
    resetGame();
  }
  function setDifficulty(d) { diff = d; document.querySelectorAll('.diff').forEach(btn => btn.classList.toggle('on', parseInt(btn.dataset.d) === d)); }
  function flipBoard() { flipped = !flipped; clearSelection(); refreshCoordinates(); updateCaptures(); updateTimersUI(); drawBoard(); }
  function setTimeControl(tc) {
    timeControl = tc;
    document.querySelectorAll('.time-btn').forEach(btn => btn.classList.toggle('on', btn.dataset.time === tc));
    if (tc === '10min') { whiteTime = 600; blackTime = 600; }
    else if (tc === '5+0') { whiteTime = 300; blackTime = 300; }
    else if (tc === '3+2') { whiteTime = 180; blackTime = 180; }
    updateTimersUI();
    if (!gameOver) resetGame();
  }

  // ==================== WEB SOCKET ОНЛАЙН ====================
  function connectToServer(roomId = null) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        wsConnected = true;
        setStatus('♟ Подключено к серверу...', 'check');
        if (roomId) ws.send(JSON.stringify({ type: 'join_room', roomId }));
        else ws.send(JSON.stringify({ type: 'create_room' }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          handleWebSocketMessage(msg);
        } catch(err) { console.warn(err); }
      };
      ws.onclose = () => {
        wsConnected = false;
        setStatus('🔌 Соединение потеряно', 'gameover');
        wsRoomId = null;
        wsColor = null;
      };
      ws.onerror = () => setStatus('❌ Ошибка соединения', 'gameover');
    } catch(e) { setStatus('❌ Не удалось подключиться', 'gameover'); }
  }
  function handleWebSocketMessage(msg) {
    switch (msg.type) {
      case 'room_created':
        wsRoomId = msg.roomId;
        wsColor = 'white';
        setStatus(`♟ Комната создана: ${wsRoomId}. Ждём соперника...`, 'check');
        showRoomId(wsRoomId);
        break;
      case 'joined':
        wsColor = msg.color;
        setStatus(`♟ Вы играете ${wsColor==='white'?'белыми':'чёрными'}. Соперник найден!`, 'check');
        resetGame();
        break;
      case 'opponent_joined':
        setStatus(`♟ Соперник подключился! Вы играете ${wsColor==='white'?'белыми':'чёрными'}.`, 'check');
        resetGame();
        break;
      case 'opponent_move':
        if (!gameOver && game.turn() !== wsColor) {
          const move = { from: msg.from, to: msg.to, promotion: msg.promotion || 'q' };
          const result = game.move(move);
          if (result) {
            lastMove = { from: result.from, to: result.to };
            historyMoves.push(result.san);
            recordPosition(game.fen());
            updateHistoryUI();
            updateCaptures();
            detectOpening();
            updateGameStatus();
            drawBoard();
            soundMove();
          }
        }
        break;
      case 'opponent_left':
        setStatus('❌ Соперник покинул игру', 'gameover');
        gameOver = true;
        break;
    }
  }
  function showRoomId(id) {
    let panel = document.getElementById('roomPanel');
    if (panel) panel.remove();
    panel = document.createElement('div');
    panel.id = 'roomPanel';
    panel.style.cssText = 'background:var(--gold);color:#100800;border-radius:50px;padding:6px 16px;font-size:.7rem;font-weight:bold;margin-top:5px;text-align:center;cursor:pointer';
    panel.textContent = `🏠 Комната: ${id} (нажми, чтобы скопировать)`;
    panel.onclick = () => { navigator.clipboard.writeText(id); panel.textContent = '✅ Скопировано!'; setTimeout(() => panel.remove(), 2000); };
    document.querySelector('.ctrl').after(panel);
  }
  function sendMoveToOpponent(from, to, promotion) {
    if (wsConnected && wsRoomId && wsColor === game.turn()) {
      ws.send(JSON.stringify({ type: 'move', roomId: wsRoomId, from, to, promotion: promotion || 'q' }));
    }
  }
  // Перехват executeMove для онлайн
  const originalExecute = executeMove;
  window.executeMove = executeMove;
  executeMove = function(fromSq, toSq, promo) {
    const res = originalExecute(fromSq, toSq, promo);
    if (res && wsConnected && wsRoomId && wsColor === game.turn()) {
      sendMoveToOpponent(fromSq, toSq, promo);
    }
    return res;
  };

  // ==================== АВТОРИЗАЦИЯ (ДЕМО) ====================
  function showAuthModal() {
    const modal = document.getElementById('authModal');
    modal.style.display = 'flex';
    document.getElementById('doLogin').onclick = () => {
      const username = document.getElementById('loginUsername').value.trim();
      if (username) {
        currentUser = username;
        localStorage.setItem('chessUser', username);
        modal.style.display = 'none';
        setStatus(`Добро пожаловать, ${username}!`, 'check');
      } else {
        alert('Введите имя');
      }
    };
    document.getElementById('closeModal').onclick = () => modal.style.display = 'none';
  }

  // ==================== ИНИЦИАЛИЗАЦИЯ ====================
  function init() {
    loadStats();
    loadTheme();
    refreshCoordinates();
    resetGame();
    setMode('2p');
    setDifficulty(5);
    setTimeControl('10min');
    document.getElementById('btnTheme').addEventListener('click', toggleTheme);
    document.getElementById('btnAi').addEventListener('click', () => setMode('ai'));
    document.getElementById('btn2p').addEventListener('click', () => setMode('2p'));
    document.getElementById('btnNew').addEventListener('click', resetGame);
    document.getElementById('btnFlip').addEventListener('click', flipBoard);
    document.getElementById('btnExportPGN').addEventListener('click', exportPGN);
    document.getElementById('btnCopy').addEventListener('click', copyPGN);
    document.querySelectorAll('.diff').forEach(btn => btn.addEventListener('click', () => setDifficulty(parseInt(btn.dataset.d))));
    document.querySelectorAll('.time-btn').forEach(btn => btn.addEventListener('click', () => setTimeControl(btn.dataset.time)));
    document.getElementById('authLink').addEventListener('click', (e) => { e.preventDefault(); showAuthModal(); });
    canvas.addEventListener('click', onCanvasEvent);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); onCanvasEvent(e); }, { passive: false });
  }
  init();
})();
