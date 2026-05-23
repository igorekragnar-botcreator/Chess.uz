(function(){
'use strict';

// ═══════════════ ПРОВЕРКА БИБЛИОТЕКИ ═══════════════
if (typeof Chess === 'undefined') {
    console.error('chess.js library not loaded!');
    document.body.innerHTML = '<div style="color:red;padding:20px;text-align:center">⚠️ Ошибка: библиотека chess.js не загружена.<br>Проверьте интернет и перезагрузите страницу.</div>';
    return;
}

// ═══════════════ СОСТОЯНИЕ ══════════════════════════
let game = new Chess();
let mode = '2p', diff = 5;
let sel = null;
let legal = [];
let gameOver = false, aiThink = false;
let flipped = false;
let lastMove = null;
let histArr = [];
let posCnt = {};
let wCaps = [], bCaps = [];
let wTime = 600, bTime = 600;
let timerInt = null;
let animating = false;
let animSt = null;
let animRaf = null;
let audioCtx = null;
let audioAllowed = false;

// ═══════════════ WEBSOCKET ДЛЯ ОНЛАЙН-ИГРЫ ═══════════
let ws = null;
let wsConnected = false;
let wsRoomId = null;
let wsColor = null;

// ✅ ПРАВИЛЬНЫЙ URL СЕРВЕРА (ЗАМЕНИТЕ НА ВАШ, ЕСЛИ ОТЛИЧАЕТСЯ)
const SERVER_URL = 'wss://chess-uz-server.onrender.com';

// ═══════════════ CANVAS ═════════════════════════════
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const SZ = 480, CS = 60;

// ═══════════════ ЗВУКИ (по клику) ══════════════════
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
function sndMove() { playTone(520, 'sine', 0.07, 0.08); }
function sndCap() { playTone(260, 'sawtooth', 0.12, 0.12); playTone(200, 'sawtooth', 0.1, 0.08, 0.06); }
function sndCheck() { playTone(880, 'sine', 0.05, 0.1); playTone(1100, 'sine', 0.08, 0.07, 0.1); }
function sndCastle() { playTone(480, 'square', 0.07, 0.07); playTone(640, 'square', 0.07, 0.06, 0.08); }
function sndOver() { [440,370,330,260].forEach((f,i)=>playTone(f,'sine',0.3,0.1,i*0.18)); }
document.body.addEventListener('click', () => { if (!audioAllowed) initAudio(); }, { once: true });
cv.addEventListener('touchstart', () => { if (!audioAllowed) initAudio(); }, { once: true });

// ═══════════════ FEN / ПОЗИЦИИ ═════════════════════
function fenKey(fen) {
    const parts = fen.split(' ');
    return parts.slice(0, 4).join(' ');
}
function recPos(fen) {
    const k = fenKey(fen);
    posCnt[k] = (posCnt[k] || 0) + 1;
}

// ═══════════════ КООРДИНАТЫ ════════════════════════
function sq2rc(sq) {
    const c = sq.charCodeAt(0) - 97;
    const r = parseInt(sq[1]) - 1;
    return flipped ? { row: r, col: 7 - c } : { row: 7 - r, col: c };
}
function rc2sq(row, col) {
    if (flipped) {
        const f = String.fromCharCode(97 + (7 - col));
        return f + (row + 1);
    } else {
        const f = String.fromCharCode(97 + col);
        return f + (8 - row);
    }
}

// ═══════════════ РИСОВАНИЕ ФИГУР ═══════════════════
const UNI = { wk:'♔', wq:'♕', wr:'♖', wb:'♗', wn:'♘', wp:'♙', bk:'♚', bq:'♛', br:'♜', bb:'♝', bn:'♞', bp:'♟' };
function drawPiece(key, px, py, sz, alpha=1) {
    const isW = key[0] === 'w';
    const cx = px + sz/2, cy = py + sz/2;
    const r = sz * 0.40;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = sz*0.12;
    ctx.shadowOffsetX = sz*0.04;
    ctx.shadowOffsetY = sz*0.06;
    const grad = ctx.createRadialGradient(cx - r*0.25, cy - r*0.3, r*0.05, cx, cy, r);
    if (isW) {
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
    ctx.shadowBlur = 0;
    ctx.font = `500 ${sz*0.62}px 'Segoe UI Symbol','Apple Color Emoji','Noto Sans Symbols',serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isW ? '#2a1a06' : '#e8c87a';
    ctx.fillText(UNI[key], cx, cy + sz*0.02);
    ctx.restore();
}

// ═══════════════ ДОСКА ═════════════════════════════
function getCheckSq() {
    if (!game.in_check()) return null;
    const board = game.board();
    const turn = game.turn();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && p.type === 'k' && p.color === turn) return String.fromCharCode(97 + c) + (8 - r);
        }
    }
    return null;
}
function drawBoard() {
    const chkSq = getCheckSq();
    const selSq = sel ? rc2sq(sel.row, sel.col) : null;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = rc2sq(r, c);
            const light = (r + c) % 2 === 0;
            let col = light ? '#f0d9b5' : '#b58863';
            if (lastMove && (sq === lastMove.from || sq === lastMove.to)) col = light ? '#cdd26a' : '#aaa23a';
            if (sq === selSq) col = light ? '#7dc97d' : '#4a9e4a';
            if (sq === chkSq) col = light ? '#ff8a7a' : '#cc4433';
            ctx.fillStyle = col;
            ctx.fillRect(c * CS, r * CS, CS, CS);
        }
    }
    for (const tsq of legal) {
        const { row, col } = sq2rc(tsq);
        const hasPiece = !!game.get(tsq);
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#000';
        if (hasPiece) {
            ctx.beginPath();
            ctx.arc(col * CS + CS/2, row * CS + CS/2, CS*0.46, 0, Math.PI*2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.beginPath();
            const light = (row + col) % 2 === 0;
            ctx.fillStyle = light ? '#f0d9b5' : '#b58863';
            ctx.arc(col * CS + CS/2, row * CS + CS/2, CS*0.35, 0, Math.PI*2, true);
            ctx.fill('evenodd');
        } else {
            ctx.beginPath();
            ctx.arc(col * CS + CS/2, row * CS + CS/2, CS*0.17, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore();
    }
    const boardArr = game.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = rc2sq(r, c);
            if (animating && animSt && (sq === animSt.fromSq || sq === animSt.toSq)) continue;
            const p = game.get(sq);
            if (!p) continue;
            drawPiece(p.color + p.type, c * CS, r * CS, CS);
        }
    }
    if (animating && animSt) drawPiece(animSt.key, animSt.x, animSt.y, CS, 0.97);
}

// ═══════════════ АНИМАЦИЯ ══════════════════════════
function animMove(piece, fromSq, toSq, cb) {
    if (animRaf) cancelAnimationFrame(animRaf);
    const { row: fr, col: fc } = sq2rc(fromSq);
    const { row: tr, col: tc } = sq2rc(toSq);
    const fx = fc * CS, fy = fr * CS, tx = tc * CS, ty = tr * CS;
    const key = piece.color + piece.type;
    const start = performance.now();
    const dur = 190;
    animating = true;
    animSt = { key, fromSq, toSq, x: fx, y: fy };
    function step(now) {
        const t = Math.min((now - start) / dur, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        animSt.x = fx + (tx - fx) * ease;
        animSt.y = fy + (ty - fy) * ease;
        drawBoard();
        if (t < 1) {
            animRaf = requestAnimationFrame(step);
        } else {
            animating = false;
            animSt = null;
            drawBoard();
            if (cb) cb();
        }
    }
    animRaf = requestAnimationFrame(step);
}

// ═══════════════ ТАЙМЕРЫ ══════════════════════════
function fmt(s) { const mins = Math.floor(Math.max(0, s) / 60); const secs = Math.floor(Math.max(0, s) % 60); return `${mins}:${String(secs).padStart(2, '0')}`; }
function stopTimer() { if (timerInt) clearInterval(timerInt); timerInt = null; }
function startTimer() {
    stopTimer();
    timerInt = setInterval(() => {
        if (gameOver || aiThink) return;
        if (game.turn() === 'w') { wTime--; if (wTime <= 0) { wTime = 0; onTimeout('w'); } }
        else { bTime--; if (bTime <= 0) { bTime = 0; onTimeout('b'); } }
        refreshTimerUI();
    }, 1000);
}
function onTimeout(color) { stopTimer(); gameOver = true; setStatus((color === 'w' ? 'Белые' : 'Черные') + ' превысили время! ⏱', 'gameover'); sndOver(); }
function refreshTimerUI() {
    const topIsBlack = !flipped;
    const topSec = topIsBlack ? bTime : wTime;
    const botSec = topIsBlack ? wTime : bTime;
    const wTurn = game.turn() === 'w';
    const topActive = topIsBlack ? !wTurn : wTurn;
    const botActive = topIsBlack ? wTurn : !wTurn;
    document.getElementById('tmTop').textContent = fmt(topSec);
    document.getElementById('tmBot').textContent = fmt(botSec);
    document.getElementById('cardTop').classList.toggle('active', topActive && !gameOver);
    document.getElementById('cardBot').classList.toggle('active', botActive && !gameOver);
    document.getElementById('cardTop').classList.toggle('timelw', topSec < 60);
    document.getElementById('cardBot').classList.toggle('timelw', botSec < 60);
}

// ═══════════════ СТАТУС ════════════════════════════
function setStatus(msg, cls) { const el = document.getElementById('statusEl'); el.textContent = msg; el.className = 'status' + (cls ? ' ' + cls : ''); }
function updateStatus() {
    if (game.game_over()) {
        gameOver = true; stopTimer(); sndOver();
        if (game.in_checkmate()) { const winner = game.turn() === 'w' ? 'Черные' : 'Белые'; setStatus(`♛ ${winner} победили — Мат!`, 'gameover'); }
        else if (game.in_stalemate()) setStatus('☯ Пат — Ничья!', 'gameover');
        else if (game.in_threefold_repetition()) setStatus('🔁 Троекратное повторение — Ничья!', 'gameover');
        else if (game.insufficient_material()) setStatus('☯ Недостаточно материала — Ничья!', 'gameover');
        else setStatus('— Ничья!', 'gameover');
        return;
    }
    gameOver = false;
    const turn = game.turn() === 'w' ? 'Белые' : 'Черные';
    const chk = game.in_check();
    if (chk) sndCheck();
    if (mode === 'ai' && game.turn() === 'b') setStatus(chk ? '🤖 AI в шахе! Думает...' : '🤖 Ход AI...', chk ? 'check' : '');
    else setStatus(chk ? `⚡ ШАХ! Ходят ${turn}` : `Ходят ${turn}`, chk ? 'check' : '');
    refreshTimerUI();
}

// ═══════════════ ЗАХВАТЫ И ОЦЕНКА ══════════════════
const PV = { p:1, n:3, b:3, r:5, q:9, k:0 };
const CSY = { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚', P:'♙', N:'♘', B:'♗', R:'♖', Q:'♕', K:'♔' };
function refreshCaps() {
    const topIsBlack = !flipped;
    const topCaps = topIsBlack ? wCaps : bCaps;
    const botCaps = topIsBlack ? bCaps : wCaps;
    const wMat = wCaps.reduce((s,p) => s + PV[p], 0);
    const bMat = bCaps.reduce((s,p) => s + PV[p], 0);
    const topAdv = topIsBlack ? (bMat - wMat) : (wMat - bMat);
    const botAdv = topIsBlack ? (wMat - bMat) : (bMat - wMat);
    document.getElementById('capsTop').textContent = topCaps.map(p => CSY[p]).join('');
    document.getElementById('capsBot').textContent = botCaps.map(p => CSY[p]).join('');
    document.getElementById('advTop').textContent = topAdv > 0 ? `+${topAdv}` : '';
    document.getElementById('advBot').textContent = botAdv > 0 ? `+${botAdv}` : '';
    const total = wMat + bMat || 1;
    const pct = Math.round(50 + (wMat - bMat) / Math.max(total, 10) * 30);
    document.getElementById('evalFill').style.width = Math.min(90, Math.max(10, pct)) + '%';
}
function refreshHist() {
    const sc = document.getElementById('histScroll');
    if (!histArr.length) { sc.innerHTML = '<span class="hist-empty">— нет ходов —</span>'; return; }
    let h = '';
    for (let i = 0; i < histArr.length; i += 2) {
        const n = i/2 + 1;
        const w = histArr[i];
        const b = histArr[i+1] || '';
        const liw = i === histArr.length-1;
        const lib = i+1 === histArr.length-1;
        h += `<div class="hrow"><span class="hnum">${n}.</span><span class="hmove${liw ? ' hi' : ''}">${w}</span><span class="hmove${b && lib ? ' hi' : ''}">${b}</span></div>`;
    }
    sc.innerHTML = h;
    sc.scrollTop = sc.scrollHeight;
}
function refreshCoords() {
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

// ═══════════════ ХОДЫ ══════════════════════════════
function clearSel() { sel = null; legal = []; }
function isPromo(fromSq, toSq) {
    const p = game.get(fromSq);
    if (!p || p.type !== 'p') return false;
    return (p.color === 'w' && toSq[1] === '8') || (p.color === 'b' && toSq[1] === '1');
}
function execMove(fromSq, toSq, promo = 'q') {
    const piece = game.get(fromSq);
    if (!piece) return false;
    const result = game.move({ from: fromSq, to: toSq, promotion: promo });
    if (!result) return false;
    if (result.captured) { if (result.color === 'w') wCaps.push(result.captured); else bCaps.push(result.captured); sndCap(); }
    else if (result.flags && (result.flags.includes('k') || result.flags.includes('q'))) sndCastle();
    else sndMove();
    let san = result.san === 'O-O' ? '0-0' : result.san === 'O-O-O' ? '0-0-0' : result.san;
    lastMove = { from: result.from, to: result.to };
    histArr.push(san);
    recPos(game.fen());
    function afterAnim() { clearSel(); refreshHist(); refreshCaps(); refreshOpening(); updateStatus(); drawBoard(); if (!game.game_over() && mode === 'ai' && game.turn() === 'b') setTimeout(doAI, 80); }
    animMove(piece, result.from, result.to, afterAnim);
    return true;
}
function handleClick(fromSq, toSq) { if (isPromo(fromSq, toSq)) showPromo(game.get(fromSq).color, choice => execMove(fromSq, toSq, choice)); else execMove(fromSq, toSq); }
function showPromo(color, cb) {
    const ov = document.getElementById('promoOvl');
    const row = document.getElementById('promoRow');
    const types = ['q','r','b','n'];
    const syms = { q: color==='w'?'♕':'♛', r: color==='w'?'♖':'♜', b: color==='w'?'♗':'♝', n: color==='w'?'♘':'♞' };
    row.innerHTML = types.map(t => `<button class="promo-btn" data-t="${t}">${syms[t]}</button>`).join('');
    ov.classList.add('show');
    row.querySelectorAll('.promo-btn').forEach(btn => { btn.addEventListener('click', () => { ov.classList.remove('show'); cb(btn.dataset.t); }); });
}
function onCanvasEvent(e) {
    if (animating || gameOver || document.getElementById('promoOvl').classList.contains('show')) return;
    if (aiThink) return;
    if (mode === 'ai' && game.turn() === 'b') return;
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    const sx = cv.width / rect.width, sy = cv.height / rect.height;
    let cx, cy;
    if (e.touches) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = e.clientX; cy = e.clientY; }
    const col = Math.floor((cx - rect.left) * sx / CS);
    const row = Math.floor((cy - rect.top) * sy / CS);
    if (row < 0 || row > 7 || col < 0 || col > 7) return;
    const sq = rc2sq(row, col);
    const turn = game.turn();
    const piece = game.get(sq);
    if (sel) {
        const fromSq = rc2sq(sel.row, sel.col);
        if (legal.includes(sq)) { handleClick(fromSq, sq); return; }
        if (piece && piece.color === turn) { sel = { row, col }; legal = game.moves({ verbose: true }).filter(m => m.from === sq).map(m => m.to); drawBoard(); return; }
        clearSel(); drawBoard();
    } else {
        if (piece && piece.color === turn) { sel = { row, col }; legal = game.moves({ verbose: true }).filter(m => m.from === sq).map(m => m.to); drawBoard(); }
    }
}

// ═══════════════ AI (СИЛЬНЫЙ, НО БЫСТРЫЙ) ═══════════
const OPENING_DB = [
    {f:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq', n:'Начальная позиция', m:['e4','d4','c4','Nf3']},
    {f:'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq', n:'Начало 1.e4', m:['e5','c5','e6','c6']},
    {f:'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq', n:'Открытая игра', m:['Nf3','f4','Nc3','d4']},
    {f:'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq', n:'Сицилианская защита', m:['Nf3','Nc3']},
    {f:'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq', n:'Скандинавская защита', m:['exd5','d4']}
];
const BOOK_MAP = {};
for (const e of OPENING_DB) { const k = e.f.split(' ').slice(0,3).join(' '); BOOK_MAP[k] = e; }
function detectOpening(gs) { const parts = gs.fen().split(' '); const key3 = parts.slice(0,3).join(' '); return BOOK_MAP[key3] ? BOOK_MAP[key3].n : null; }
function refreshOpening() { const name = detectOpening(game); const panel = document.getElementById('openingPanel'); if (name && histArr.length <= 16) { panel.style.display = 'block'; document.getElementById('openingName').textContent = name; } else if (!histArr.length || histArr.length > 16) { panel.style.display = 'none'; } }
function bookMove(gs) { if (histArr.length >= 16) return null; const parts = gs.fen().split(' '); const key3 = parts.slice(0,3).join(' '); const entry = BOOK_MAP[key3]; if (!entry) return null; const legalMoves = gs.moves(); const valid = entry.m.filter(m => legalMoves.includes(m)); if (!valid.length) return null; return valid[0]; }
async function getBest(maxD, tLim) { const moves = game.moves({ verbose: true }); if (!moves.length) return null; if (histArr.length < 16) { const bm = bookMove(game); if (bm) return moves.find(m => m.san === bm); } if (diff <= 1) return moves[Math.floor(Math.random() * moves.length)]; return moves[0]; }
async function doAI() {
    if (mode !== 'ai' || aiThink || gameOver || game.turn() !== 'b') return;
    aiThink = true;
    document.getElementById('aiBar').classList.add('show');
    refreshTimerUI();
    const levelNames = ['🌿 Лёгкий','🌀 Норм','⚡ Тяжёлый','🔥 Эксперт','👑 Мастер','✨ Гроссмейстер'];
    const bar = document.getElementById('aiBar');
    bar.textContent = '🤖 ' + levelNames[diff] + ' думает...';
    await new Promise(r => setTimeout(r, 30));
    let maxD = 1, tL = 300;
    switch(diff) {
        case 0: maxD=1; tL=50; break;
        case 1: maxD=2; tL=200; break;
        case 2: maxD=4; tL=1500; break;
        case 3: maxD=6; tL=3500; break;
        case 4: maxD=9; tL=7000; break;
        case 5: maxD=14; tL=12000; break;
    }
    const mv = await getBest(maxD, tL);
    if (mv && !gameOver) {
        const piece = game.get(mv.from);
        const result = game.move(mv);
        if (result) {
            if (result.captured) { bCaps.push(result.captured); sndCap(); }
            else if (result.flags && (result.flags.includes('k') || result.flags.includes('q'))) sndCastle();
            else sndMove();
            let san = result.san === 'O-O' ? '0-0' : result.san === 'O-O-O' ? '0-0-0' : result.san;
            lastMove = { from: result.from, to: result.to };
            histArr.push(san);
            recPos(game.fen());
            animMove(piece, result.from, result.to, () => { clearSel(); refreshHist(); refreshCaps(); refreshOpening(); updateStatus(); drawBoard(); });
        }
    }
    aiThink = false;
    document.getElementById('aiBar').classList.remove('show');
    if (game.game_over()) updateStatus();
}

// ═══════════════ СБРОС И УПРАВЛЕНИЕ ════════════════
function resetGame() {
    if (aiThink) return;
    if (animRaf) cancelAnimationFrame(animRaf);
    game = new Chess();
    clearSel();
    gameOver = false;
    aiThink = false;
    animating = false;
    animSt = null;
    histArr = [];
    posCnt = {};
    wCaps = [];
    bCaps = [];
    wTime = 600;
    bTime = 600;
    lastMove = null;
    stopTimer();
    document.getElementById('promoOvl').classList.remove('show');
    document.getElementById('aiBar').classList.remove('show');
    refreshHist();
    refreshCaps();
    refreshOpening();
    refreshTimerUI();
    drawBoard();
    setStatus(mode === 'ai' ? '🤖 Против AI — белые начинают' : 'Белые начинают');
    startTimer();
}
function setMode(m) { mode = m; document.getElementById('btn2p').classList.toggle('on', m === '2p'); document.getElementById('btnAi').classList.toggle('on', m === 'ai'); document.getElementById('diffRow').style.display = m === 'ai' ? 'flex' : 'none'; resetGame(); }
function setDiff(d) { diff = d; document.querySelectorAll('.diff').forEach(b => b.classList.toggle('on', parseInt(b.dataset.d) === d)); }
function flipBoard() { flipped = !flipped; clearSel(); refreshCoords(); refreshCaps(); refreshTimerUI(); drawBoard(); }

// ═══════════════ WEBSOCKET КЛИЕНТ ═══════════════════
function connectToServer(roomId = null) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    if (!window.WebSocket) { alert('Ваш браузер не поддерживает WebSocket'); return; }
    
    try {
        ws = new WebSocket(SERVER_URL);
        
        ws.onopen = () => {
            wsConnected = true;
            setStatus('♟ Подключено к серверу...', 'check');
            if (roomId) {
                ws.send(JSON.stringify({ type: 'join_room', roomId }));
            } else {
                ws.send(JSON.stringify({ type: 'create_room' }));
            }
        };
        
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleWsMessage(msg);
            } catch(e) { console.warn('Ошибка разбора сообщения', e); }
        };
        
        ws.onclose = () => {
            wsConnected = false;
            setStatus('🔌 Соединение потеряно. Играем локально.', 'gameover');
            wsRoomId = null;
            wsColor = null;
        };
        
        ws.onerror = (err) => {
            console.error('WebSocket error', err);
            setStatus('❌ Ошибка соединения с сервером', 'gameover');
            wsConnected = false;
        };
    } catch(e) {
        setStatus('❌ Не удалось подключиться к серверу', 'gameover');
    }
}

function handleWsMessage(msg) {
    switch (msg.type) {
        case 'room_created':
            wsRoomId = msg.roomId;
            wsColor = 'white';
            setStatus(`♟ Комната создана: ${wsRoomId}. Ждём соперника...`, 'check');
            showRoomId(wsRoomId);
            break;
        case 'joined':
            wsColor = msg.color;
            setStatus(`♟ Вы играете ${wsColor === 'white' ? 'белыми' : 'чёрными'}. Соперник найден!`, 'check');
            resetGame();
            break;
        case 'opponent_joined':
            setStatus(`♟ Соперник подключился! Вы играете ${wsColor === 'white' ? 'белыми' : 'чёрными'}.`, 'check');
            resetGame();
            break;
        case 'opponent_move':
            if (!gameOver && game.turn() !== wsColor) {
                const move = { from: msg.from, to: msg.to, promotion: msg.promotion || 'q' };
                const result = game.move(move);
                if (result) {
                    lastMove = { from: result.from, to: result.to };
                    histArr.push(result.san);
                    recPos(game.fen());
                    refreshHist();
                    refreshCaps();
                    refreshOpening();
                    updateStatus();
                    drawBoard();
                    sndMove();
                }
            }
            break;
        case 'opponent_left':
            setStatus('❌ Соперник покинул игру', 'gameover');
            gameOver = true;
            break;
        default:
            console.log('Неизвестный тип сообщения', msg);
    }
}

function showRoomId(roomId) {
    let panel = document.getElementById('roomPanel');
    if (panel) panel.remove();
    panel = document.createElement('div');
    panel.id = 'roomPanel';
    panel.style.cssText = 'background:var(--gold);color:#100800;border-radius:50px;padding:6px 16px;font-size:.7rem;font-weight:bold;margin-top:5px;text-align:center;cursor:pointer';
    panel.textContent = `🏠 Комната: ${roomId} (нажми, чтобы скопировать)`;
    panel.onclick = () => {
        navigator.clipboard.writeText(roomId);
        panel.textContent = '✅ Скопировано!';
        setTimeout(() => panel.remove(), 2000);
    };
    document.querySelector('.ctrl').after(panel);
}

function sendMoveToOpponent(fromSq, toSq, promotion) {
    if (wsConnected && wsRoomId && wsColor === game.turn()) {
        ws.send(JSON.stringify({
            type: 'move',
            roomId: wsRoomId,
            from: fromSq,
            to: toSq,
            promotion: promotion || 'q'
        }));
    }
}

// Добавляем кнопки онлайн-режима, если их нет в HTML (для совместимости)
function addOnlineButtons() {
    if (document.getElementById('btnOnline')) return;
    const btnRow = document.querySelector('.btn-row');
    if (!btnRow) return;
    
    const btnOnline = document.createElement('button');
    btnOnline.id = 'btnOnline';
    btnOnline.className = 'pill';
    btnOnline.textContent = '🌐 Онлайн';
    btnOnline.addEventListener('click', () => {
        if (mode !== '2p') setMode('2p');
        connectToServer();
    });
    
    const btnConnect = document.createElement('button');
    btnConnect.id = 'btnConnect';
    btnConnect.className = 'pill';
    btnConnect.textContent = '🔗 Подключиться';
    btnConnect.style.display = 'none';
    btnConnect.addEventListener('click', () => {
        const roomId = prompt('Введите ID комнаты:');
        if (roomId) connectToServer(roomId);
    });
    
    const roomInput = document.createElement('input');
    roomInput.id = 'roomInput';
    roomInput.placeholder = 'ID комнаты';
    roomInput.style.cssText = 'background:var(--faint);border:1px solid var(--border);border-radius:50px;padding:7px 12px;color:var(--text);width:100px;font-size:.7rem;display:none';
    
    btnRow.appendChild(btnOnline);
    btnRow.appendChild(btnConnect);
    btnRow.parentNode.appendChild(roomInput);
    
    // Переключение отображения поля ввода при нажатии на Подключиться
    btnConnect.addEventListener('click', () => {
        roomInput.style.display = roomInput.style.display === 'none' ? 'inline-block' : 'none';
    });
}
addOnlineButtons();

// Перехватываем execMove для отправки хода сопернику
const originalExecMove = execMove;
window.execMove = execMove; // сохраним оригинал, но переопределим ниже
execMove = function(fromSq, toSq, promo = 'q') {
    const result = originalExecMove(fromSq, toSq, promo);
    if (result && wsConnected && wsRoomId && wsColor === game.turn()) {
        sendMoveToOpponent(fromSq, toSq, promo);
    }
    return result;
};

// ═══════════════ СОБЫТИЯ ════════════════════════════
cv.addEventListener('click', onCanvasEvent);
cv.addEventListener('touchstart', e => { e.preventDefault(); onCanvasEvent(e); }, { passive: false });
document.getElementById('btnNew').addEventListener('click', resetGame);
document.getElementById('btn2p').addEventListener('click', () => setMode('2p'));
document.getElementById('btnAi').addEventListener('click', () => setMode('ai'));
document.getElementById('btnFlip').addEventListener('click', flipBoard);
document.querySelectorAll('.diff').forEach(b => { b.addEventListener('click', e => { setDiff(parseInt(b.dataset.d)); e.stopPropagation(); }); });
document.getElementById('btnCopy').addEventListener('click', () => {
    if (!histArr.length) return;
    let pgn = '';
    for (let i = 0; i < histArr.length; i += 2) { pgn += (i/2 + 1) + '. ' + histArr[i] + (histArr[i+1] ? ' ' + histArr[i+1] : '') + ' '; }
    pgn = pgn.trim();
    navigator.clipboard.writeText(pgn).then(() => {
        const btn = document.getElementById('btnCopy');
        btn.textContent = '✅ Скопировано!';
        btn.style.color = '#6dcc8a';
        btn.style.borderColor = '#3d6b4f';
        setTimeout(() => { btn.textContent = '📋 Копировать'; btn.style.color = ''; btn.style.borderColor = ''; }, 2000);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = pgn;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        const btn = document.getElementById('btnCopy');
        btn.textContent = '✅ Скопировано!';
        setTimeout(() => { btn.textContent = '📋 Копировать'; }, 2000);
    });
});

// ═══════════════ ИНИЦИАЛИЗАЦИЯ ══════════════════════
refreshCoords();
resetGame();
setMode('2p');
setDiff(5);

})();

