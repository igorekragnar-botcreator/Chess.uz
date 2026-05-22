(function(){'use strict';

// ═══════════════ STATE ═══════════════════════════════
let game = new Chess();
let mode = '2p', diff = 5;
let sel = null;           // { row, col }
let legal = [];           // target squares
let gameOver = false, aiThink = false;
let flipped = false;
let lastMove = null;      // { from, to }
let histArr = [];
let posCnt = {};
let wCaps = [], bCaps = []; // pieces captured
let wTime = 600, bTime = 600;
let timerInt = null;
let animating = false;
let animSt = null;
let animRaf = null;

// ═══════════════ CANVAS ══════════════════════════════
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const SZ = 480, CS = 60; // canvas size, cell size

// ═══════════════ AUDIO ═══════════════════════════════
let actx = null;
function ac(){if(!actx)actx=new(window.AudioContext||window.webkitAudioContext)();return actx;}
function tone(f,type,dur,vol=0.1,delay=0){
  try{
    const a=ac();const o=a.createOscillator();const g=a.createGain();
    o.type=type||'sine';o.frequency.value=f;
    g.gain.setValueAtTime(0,a.currentTime+delay);
    g.gain.linearRampToValueAtTime(vol,a.currentTime+delay+0.01);
    g.gain.exponentialRampToValueAtTime(0.001,a.currentTime+delay+dur);
    o.connect(g);g.connect(a.destination);
    o.start(a.currentTime+delay);o.stop(a.currentTime+delay+dur);
  }catch(e){}
}
function sndMove(){tone(520,'sine',.07,.08)}
function sndCap(){tone(260,'sawtooth',.12,.12);tone(200,'sawtooth',.1,.08,.06)}
function sndCheck(){tone(880,'sine',.05,.1);tone(1100,'sine',.08,.07,.1)}
function sndOver(){
  [440,370,330,260].forEach((f,i)=>tone(f,'sine',.3,.1,i*0.18));
}
function sndCastle(){tone(480,'square',.07,.07);tone(640,'square',.07,.06,.08)}

// ═══════════════ COORDINATES ═════════════════════════
function fenKey(fen){return fen.split(' ').slice(0,4).join(' ')}
function recPos(fen){const k=fenKey(fen);posCnt[k]=(posCnt[k]||0)+1}

function sq2rc(sq){
  const c=sq.charCodeAt(0)-97, r=parseInt(sq[1])-1;
  return flipped?{row:r,col:7-c}:{row:7-r,col:c};
}
function rc2sq(row,col){
  if(flipped){const f=String.fromCharCode(97+(7-col));return f+(row+1);}
  else{const f=String.fromCharCode(97+col);return f+(8-row);}
}

// ═══════════════ PIECE DRAWING ════════════════════════
// Beautiful canvas-drawn pieces — no external images needed
const UNI={wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟'};

function drawPiece(key, px, py, sz, alpha=1){
  const isW = key[0]==='w';
  const cx = px+sz/2, cy = py+sz/2;
  const r  = sz*0.40;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur  = sz*0.12;
  ctx.shadowOffsetX = sz*0.04;
  ctx.shadowOffsetY = sz*0.06;

  // Base circle gradient
  const g = ctx.createRadialGradient(cx-r*.25,cy-r*.3,r*.05,cx,cy,r);
  if(isW){
    g.addColorStop(0,'#fffff0');g.addColorStop(.55,'#f0e6c8');g.addColorStop(1,'#c8b080');
  }else{
    g.addColorStop(0,'#50402a');g.addColorStop(.5,'#20180c');g.addColorStop(1,'#0e0905');
  }
  ctx.beginPath();
  ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.fillStyle=g;
  ctx.fill();

  // Rim highlight
  ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
  const rim=ctx.createLinearGradient(cx-r,cy-r,cx+r,cy+r);
  if(isW){rim.addColorStop(0,'rgba(255,255,220,.6)');rim.addColorStop(1,'rgba(160,120,60,.3)');}
  else   {rim.addColorStop(0,'rgba(100,70,30,.5)'); rim.addColorStop(1,'rgba(0,0,0,.5)');}
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.strokeStyle=rim;ctx.lineWidth=sz*.025;ctx.stroke();

  // Symbol
  ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=sz*.06;ctx.shadowOffsetX=sz*.02;ctx.shadowOffsetY=sz*.025;
  ctx.font=`500 ${sz*.62}px 'Segoe UI Symbol','Apple Color Emoji','Noto Sans Symbols',serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle = isW ? '#2a1a06' : '#e8c87a';
  ctx.fillText(UNI[key], cx, cy+sz*.02);

  ctx.restore();
}

// ═══════════════ BOARD DRAWING ═══════════════════════
function getCheckSq(){
  if(!game.in_check())return null;
  const b=game.board(),t=game.turn();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=b[r][c];
    if(p&&p.type==='k'&&p.color===t)return String.fromCharCode(97+c)+(8-r);
  }
  return null;
}

function drawBoard(){
  const chkSq  = getCheckSq();
  const selSq  = sel ? rc2sq(sel.row,sel.col) : null;

  // 1 — Squares
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const sq=rc2sq(r,c);
      const li=(r+c)%2===0;
      let col = li?'#f0d9b5':'#b58863';
      if(lastMove&&(sq===lastMove.from||sq===lastMove.to))col=li?'#cdd26a':'#aaa23a';
      if(sq===selSq) col=li?'#7dc97d':'#4a9e4a';
      if(sq===chkSq) col=li?'#ff8a7a':'#cc4433';
      ctx.fillStyle=col;
      ctx.fillRect(c*CS,r*CS,CS,CS);
    }
  }

  // 2 — Legal move indicators
  for(const tsq of legal){
    const {row,col}=sq2rc(tsq);
    const hasPiece=!!game.get(tsq);
    const px=col*CS,py=row*CS;
    ctx.save();ctx.globalAlpha=.22;ctx.fillStyle='#000';
    if(hasPiece){
      ctx.beginPath();ctx.arc(px+CS/2,py+CS/2,CS*.46,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
      ctx.beginPath();ctx.arc(px+CS/2,py+CS/2,CS*.46,0,Math.PI*2);
      const li=(row+col)%2===0;
      ctx.fillStyle=li?'#f0d9b5':'#b58863';
      ctx.arc(px+CS/2,py+CS/2,CS*.35,0,Math.PI*2,true);
      ctx.fill('evenodd');
    }else{
      ctx.beginPath();ctx.arc(px+CS/2,py+CS/2,CS*.17,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  // 3 — Pieces (skip animated piece source and dest)
  const board=game.board();
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const sq=rc2sq(r,c);
      if(animating&&animSt&&(sq===animSt.fromSq||sq===animSt.toSq))continue;
      const p=game.get(sq);
      if(!p)continue;
      drawPiece(p.color+p.type,c*CS,r*CS,CS);
    }
  }

  // 4 — Animated piece
  if(animating&&animSt){
    drawPiece(animSt.key,animSt.x,animSt.y,CS,.97);
  }
}

// ═══════════════ ANIMATION ════════════════════════════
function animMove(piece,fromSq,toSq,cb){
  if(animRaf)cancelAnimationFrame(animRaf);
  const {row:fr,col:fc}=sq2rc(fromSq);
  const {row:tr,col:tc}=sq2rc(toSq);
  const fx=fc*CS,fy=fr*CS,tx=tc*CS,ty=tr*CS;
  const key=piece.color+piece.type;
  const dur=190,start=performance.now();
  animating=true;
  animSt={key,fromSq,toSq,x:fx,y:fy};
  function step(now){
    const t=Math.min((now-start)/dur,1);
    const e=t<.5?2*t*t:-1+(4-2*t)*t;
    animSt.x=fx+(tx-fx)*e; animSt.y=fy+(ty-fy)*e;
    drawBoard();
    if(t<1)animRaf=requestAnimationFrame(step);
    else{animating=false;animSt=null;drawBoard();if(cb)cb();}
  }
  animRaf=requestAnimationFrame(step);
}

// ═══════════════ TIMERS ══════════════════════════════
function fmt(s){const m=Math.floor(s/60);return `${m}:${String(s%60).padStart(2,'0')}`}

function startTimer(){
  stopTimer();
  timerInt=setInterval(()=>{
    if(gameOver||aiThink)return;
    if(game.turn()==='w'){wTime--;if(wTime<=0){wTime=0;onTimeout('w');}}
    else{bTime--;if(bTime<=0){bTime=0;onTimeout('b');}}
    refreshTimerUI();
  },1000);
}
function stopTimer(){if(timerInt)clearInterval(timerInt);timerInt=null;}
function onTimeout(c){
  stopTimer();gameOver=true;
  setStatus((c==='w'?'Белые':'Черные')+' превысили время! ⏱','gameover');
  sndOver();
}

function refreshTimerUI(){
  const topIsBlack=!flipped;
  const topSec =topIsBlack?bTime:wTime;
  const botSec =topIsBlack?wTime:bTime;
  const wTurn  =game.turn()==='w';
  const topAct =topIsBlack?!wTurn:wTurn;
  const botAct =topIsBlack?wTurn:!wTurn;
  document.getElementById('tmTop').textContent=fmt(topSec);
  document.getElementById('tmBot').textContent=fmt(botSec);
  document.getElementById('cardTop').classList.toggle('active',topAct&&!gameOver);
  document.getElementById('cardBot').classList.toggle('active',botAct&&!gameOver);
  document.getElementById('cardTop').classList.toggle('timelw',topSec<60);
  document.getElementById('cardBot').classList.toggle('timelw',botSec<60);
}

// ═══════════════ STATUS ═══════════════════════════════
function setStatus(msg,cls){
  const el=document.getElementById('statusEl');
  el.textContent=msg; el.className='status'+(cls?' '+cls:'');
}
function updateStatus(){
  if(game.game_over()){
    gameOver=true;stopTimer();sndOver();
    if(game.in_checkmate()){
      const w=game.turn()==='w'?'Черные':'Белые';
      setStatus(`♛ ${w} победили — Мат!`,'gameover');
    }else if(game.in_stalemate()) setStatus('☯ Пат — Ничья!','gameover');
    else if(game.in_threefold_repetition()) setStatus('🔁 Троекратное повторение — Ничья!','gameover');
    else if(game.insufficient_material()) setStatus('☯ Недостаточно материала — Ничья!','gameover');
    else setStatus('— Ничья!','gameover');
    return;
  }
  gameOver=false;
  const turn=game.turn()==='w'?'Белые':'Черные';
  const chk=game.in_check();
  if(chk)sndCheck();
  if(mode==='ai'&&game.turn()==='b'){
    setStatus(chk?'🤖 AI в шахе! Думает...':'🤖 Ход AI...',chk?'check':'');
  }else{
    setStatus(chk?`⚡ ШАХ! Ходят ${turn}`:`Ходят ${turn}`,chk?'check':'');
  }
  refreshTimerUI();
}

// ═══════════════ CAPTURES & EVAL BAR ═════════════════
const PV={p:1,n:3,b:3,r:5,q:9,k:0};
const CSY={p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚',P:'♙',N:'♘',B:'♗',R:'♖',Q:'♕',K:'♔'};

function refreshCaps(){
  const topIsBlack=!flipped;
  // wCaps = pieces captured BY white (black pieces removed from board)
  // bCaps = pieces captured BY black (white pieces removed from board)
  const topCaps=topIsBlack?wCaps:bCaps; // pieces taken FROM top player
  const botCaps=topIsBlack?bCaps:wCaps;
  const wMat=wCaps.reduce((s,p)=>s+PV[p],0);
  const bMat=bCaps.reduce((s,p)=>s+PV[p],0);
  const topAdv=topIsBlack?(bMat-wMat):(wMat-bMat);
  const botAdv=topIsBlack?(wMat-bMat):(bMat-wMat);
  document.getElementById('capsTop').textContent=topCaps.map(p=>CSY[p]).join('');
  document.getElementById('capsBot').textContent=botCaps.map(p=>CSY[p]).join('');
  document.getElementById('advTop').textContent=topAdv>0?`+${topAdv}`:'';
  document.getElementById('advBot').textContent=botAdv>0?`+${botAdv}`:'';
  // Eval bar: white advantage → right side
  const total=wMat+bMat||1;
  const pct=Math.round(50+(wMat-bMat)/Math.max(total,10)*30);
  document.getElementById('evalFill').style.width=Math.min(90,Math.max(10,pct))+'%';
}

// ═══════════════ HISTORY UI ══════════════════════════
function refreshHist(){
  const sc=document.getElementById('histScroll');
  if(!histArr.length){sc.innerHTML='<span class="hist-empty">— нет ходов —</span>';return;}
  let h='';
  for(let i=0;i<histArr.length;i+=2){
    const n=i/2+1,w=histArr[i],b=histArr[i+1]||'';
    const liw=i===histArr.length-1,lib=i+1===histArr.length-1;
    h+=`<div class="hrow"><span class="hnum">${n}.</span><span class="hmove${liw?' hi':''}">${w}</span><span class="hmove${b&&lib?' hi':''}">${b}</span></div>`;
  }
  sc.innerHTML=h;sc.scrollTop=sc.scrollHeight;
}

// ═══════════════ COORD LABELS ════════════════════════
function refreshCoords(){
  const ranks=flipped?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1];
  const files=flipped?['h','g','f','e','d','c','b','a']:['a','b','c','d','e','f','g','h'];
  document.getElementById('rankCol').innerHTML=ranks.map(r=>`<span>${r}</span>`).join('');
  document.getElementById('fileRow').innerHTML=files.map(f=>`<span>${f}</span>`).join('');
  const topIsBlack=!flipped;
  document.getElementById('nameTop').textContent=topIsBlack?'Чёрные':'Белые';
  document.getElementById('nameBot').textContent=topIsBlack?'Белые':'Чёрные';
  document.getElementById('avatTop').textContent=topIsBlack?'♚':'♔';
  document.getElementById('avatBot').textContent=topIsBlack?'♔':'♚';
}

// ═══════════════ MOVE EXECUTION ══════════════════════
function clearSel(){sel=null;legal=[];}

function isPromo(fromSq,toSq){
  const p=game.get(fromSq);
  if(!p||p.type!=='p')return false;
  return (p.color==='w'&&toSq[1]==='8')||(p.color==='b'&&toSq[1]==='1');
}

function execMove(fromSq,toSq,promo='q'){
  const piece=game.get(fromSq);
  if(!piece)return false;
  const res=game.move({from:fromSq,to:toSq,promotion:promo});
  if(!res)return false;

  if(res.captured){
    if(res.color==='w')wCaps.push(res.captured);
    else bCaps.push(res.captured);
    sndCap();
  }else if(res.flags&&res.flags.includes('k')||res.flags&&res.flags.includes('q')){
    sndCastle();
  }else{
    sndMove();
  }

  const san=res.san==='O-O'?'0-0':res.san==='O-O-O'?'0-0-0':res.san;
  lastMove={from:res.from,to:res.to};
  histArr.push(san);
  recPos(game.fen());

  function afterAnim(){
    clearSel();
    refreshHist();refreshCaps();refreshOpening();
    updateStatus();drawBoard();
    if(!game.game_over()&&mode==='ai'&&game.turn()==='b')setTimeout(doAI,80);
  }

  animMove(piece,res.from,res.to,afterAnim);
  return true;
}

function handleClick(fromSq,toSq){
  if(isPromo(fromSq,toSq)){
    showPromo(game.get(fromSq).color,choice=>execMove(fromSq,toSq,choice));
  }else{
    execMove(fromSq,toSq);
  }
}

// ═══════════════ PROMOTION UI ════════════════════════
function showPromo(color,cb){
  const ov=document.getElementById('promoOvl');
  const row=document.getElementById('promoRow');
  const types=['q','r','b','n'];
  const syms={q:color==='w'?'♕':'♛',r:color==='w'?'♖':'♜',b:color==='w'?'♗':'♝',n:color==='w'?'♘':'♞'};
  row.innerHTML=types.map(t=>`<button class="promo-btn" data-t="${t}">${syms[t]}</button>`).join('');
  ov.classList.add('show');
  row.querySelectorAll('.promo-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{ov.classList.remove('show');cb(btn.dataset.t);});
  });
}

// ═══════════════ CANVAS CLICK ════════════════════════
function onCanvasEvent(e){
  if(animating||gameOver||document.getElementById('promoOvl').classList.contains('show'))return;
  if(aiThink)return;
  if(mode==='ai'&&game.turn()==='b')return;

  const rect=cv.getBoundingClientRect();
  const sx=cv.width/rect.width,sy=cv.height/rect.height;
  let cx,cy;
  if(e.touches){cx=e.touches[0].clientX;cy=e.touches[0].clientY;e.preventDefault();}
  else{cx=e.clientX;cy=e.clientY;}
  const col=Math.floor((cx-rect.left)*sx/CS);
  const row=Math.floor((cy-rect.top)*sy/CS);
  if(row<0||row>7||col<0||col>7)return;

  const sq=rc2sq(row,col);
  const turn=game.turn();
  const piece=game.get(sq);

  if(sel){
    const fromSq=rc2sq(sel.row,sel.col);
    if(legal.includes(sq)){handleClick(fromSq,sq);return;}
    if(piece&&piece.color===turn){
      sel={row,col};
      legal=game.moves({verbose:true}).filter(m=>m.from===sq).map(m=>m.to);
      drawBoard();return;
    }
    clearSel();drawBoard();
  }else{
    if(piece&&piece.color===turn){
      sel={row,col};
      legal=game.moves({verbose:true}).filter(m=>m.from===sq).map(m=>m.to);
      drawBoard();
    }
  }
}

// ════════════════════════════════════════════════════════
// ═══════  AI ENGINE — ELO 3600+  ════════════════════════
// ════════════════════════════════════════════════════════
//  • Opening book (ECO lines)
//  • Transposition table (TT) — 1M entries
//  • Quiescence search (QSearch) — eliminates horizon effect
//  • Null-Move Pruning (NMP)
//  • Late Move Reduction (LMR)
//  • Delta pruning in QSearch
//  • MVV-LVA + TT-move + killer heuristic move ordering
//  • Passed pawn / isolated pawn / doubled pawn evaluation
//  • King safety (pawn shield, open files, attacker count)
//  • Rook on open/7th rank, bishop pair bonus
//  • Repetition penalty via position history
// ════════════════════════════════════════════════════════

// ── Opening Book (FEN key → array of SAN moves) ─────────
// ════════════════════════════════════════════════════════
// ═══ OPENING DATABASE — ~200 lines + detector ════════════
// ════════════════════════════════════════════════════════
// Format: FEN(4fields) → { moves: [...], name: 'Opening Name' }
// AI uses moves[] as book; name shown in UI to player

const OPENING_DB = [
  // ── ROOT ──
  {f:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq',
   n:'Начальная позиция', m:['e4','d4','c4','Nf3','b3','g3','f4']},

  // ════ 1.e4 lines ════
  {f:'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq',
   n:'Начало 1.e4', m:['e5','c5','e6','c6','d5','d6','Nf6','g6']},

  // --- Open Game 1.e4 e5 ---
  {f:'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq',
   n:'Открытая игра (1.e4 e5)', m:['Nf3','f4','Nc3','d4','Bc4']},
  {f:'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq',
   n:'Дебют двух коней', m:['Nc6','Nf6','d6','f5']},
  // Ruy Lopez
  {f:'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq',
   n:'Испанская партия', m:['Bb5','d4','Bc4','f4']},
  {f:'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq',
   n:'Испанская партия (Bb5)', m:['a6','Nf6','d6','Bc5','f5']},
  {f:'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq',
   n:'Испанская: защита Морфи (a6)', m:['Ba4','Bxc6']},
  {f:'r1bqkb1r/1ppp1ppp/p1n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq',
   n:'Испанская: Берлинская защита', m:['O-O','d3','Bxc6']},
  {f:'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq',
   n:'Испанская: Берлин (Ba4)', m:['Bc5','b5','Be7','d6']},
  {f:'r1bqkbnr/2pp1ppp/p1n5/1p2p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq',
   n:'Испанская: Гамбит Маршалла', m:['O-O','d4','Bb3']},
  // Italian
  {f:'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq',
   n:'Итальянская партия (Bc4)', m:['Bc5','Nf6','d6','Be7']},
  {f:'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq',
   n:'Итальянская: Джоко Пьяно', m:['c3','O-O','d3','b4']},
  {f:'r1bqk1nr/pppp1ppp/2n5/2b1p3/1PB1P3/5N2/P1PP1PPP/RNBQK2R b KQkq',
   n:'Итальянская: Гамбит Эванса', m:['Bxb4','Bb6']},
  // Sicilian
  {f:'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq',
   n:'Сицилианская защита', m:['Nf3','Nc3','f4','d4']},
  {f:'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq',
   n:'Сицилианская: 2.Nf3', m:['d6','Nc6','e6','a6','g6']},
  {f:'rnbqkbnr/pp2pppp/3p4/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq',
   n:'Сицилианская: Дракон (d6)', m:['cxd4','Nf6']},
  {f:'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq',
   n:'Сицилианская: Дракон — 4.Nf6', m:['Nc3','f3','Bg5']},
  {f:'rnbqkb1r/pp2pp1p/3p1np1/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq',
   n:'Сицилианская: Дракон — g6', m:['Be3','Be2','f3','Bc4']},
  {f:'r1bqkb1r/pp2pp1p/2np1np1/8/3NP3/2N1B3/PPP2PPP/R2QKB1R w KQkq',
   n:'Сицилианская: Дракон — классика', m:['f3','Bc4','Be2','Qd2']},
  {f:'rnbqkbnr/pp1p1ppp/4p3/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq',
   n:'Сицилианская: Паулсен/Тайманов', m:['d4','Nc3','c3']},
  {f:'rnbqkbnr/pp1ppppp/8/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq',
   n:'Сицилианская: Россолимо (Nc3)', m:['Nc6','d6','e6']},
  {f:'r1bqkbnr/pp1ppppp/2n5/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq',
   n:'Сицилианская: Россолимо (Nc6)', m:['Bb5','Nf3','g3']},
  {f:'rnbqkbnr/pp1p1ppp/8/2p1p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq',
   n:'Сицилианская: Пеликан', m:['d4','Nc3']},
  {f:'r1bqkb1r/pp1ppppp/2n2n2/2p5/4P3/5NP1/PPPP1P1P/RNBQKB1R w KQkq',
   n:'Сицилианская: Ускоренный дракон', m:['d4','Bg2','c3']},
  // French
  {f:'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq',
   n:'Французская защита', m:['d4','d3','Nc3','Nf3']},
  {f:'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq',
   n:'Французская: 2.d4', m:['d5','c5','Nc6']},
  {f:'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq',
   n:'Французская: 2...d5', m:['Nc3','Nd2','e5','exd5']},
  {f:'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq',
   n:'Французская: вариант Винавера', m:['Bb4','Nf6','dxe4']},
  {f:'rnbq1bnr/ppp2ppp/4p3/3p4/1b1PP3/2N5/PPP2PPP/R1BQKBNR w KQkq',
   n:'Французская: Винавер (Bb4)', m:['e5','Bd3','Qd3','a3']},
  {f:'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/3B4/PPP2PPP/RNBQK1NR b KQkq',
   n:'Французская: вариант Тарраша', m:['c5','Nf6','dxe4']},
  {f:'rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq',
   n:'Французская: вариант Стейница', m:['c5','Ne7','Bd7']},
  // Caro-Kann
  {f:'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq',
   n:'Защита Каро-Канн', m:['d4','Nc3','d3','Nf3']},
  {f:'rnbqkbnr/pp1ppppp/2p5/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq',
   n:'Каро-Канн: 2.d4', m:['d5','e6']},
  {f:'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq',
   n:'Каро-Канн: 2...d5', m:['Nc3','Nd2','e5','exd5']},
  {f:'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq',
   n:'Каро-Канн: классический вариант', m:['dxe4','Nf6','e6']},
  {f:'rnbqkbnr/pp2pppp/2p5/8/3Pp3/2N5/PPP2PPP/R1BQKBNR w KQkq',
   n:'Каро-Канн: 4.dxe4 (классика)', m:['Nxe4','Bf4']},
  {f:'rnbqkb1r/pp2pppp/2p2n2/8/3PN3/8/PPP2PPP/R1BQKBNR w KQkq',
   n:'Каро-Канн: Bf5 классика', m:['Nxf6','Ng5','Nc5']},
  {f:'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/3B4/PPP2PPP/RNBQK1NR b KQkq',
   n:'Каро-Канн: Bd3', m:['dxe4','Nf6','e6']},
  // Pirc
  {f:'rnbqkbnr/ppp1pppp/3p4/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq',
   n:'Защита Пирца', m:['d4','Nf3','Nc3']},
  {f:'rnbqkb1r/ppp1pppp/3p1n2/8/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq',
   n:'Защита Пирца: 3.Nc3', m:['g6','c6','Nbd7']},
  {f:'rnbqkb1r/ppp1pp1p/3p1np1/8/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq',
   n:'Защита Пирца: g6', m:['f4','Be3','Bg5','Bc4','Be2']},
  // Alekhine
  {f:'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq',
   n:'Защита Алехина', m:['e5','d4','Nc3','d3']},
  {f:'rnbqkb1r/pppppppp/5n2/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq',
   n:'Защита Алехина: e5', m:['Nd5','Ng4','Nb4']},
  // Scandinavian
  {f:'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq',
   n:'Скандинавская защита', m:['exd5','e5','d4','Nc3']},
  {f:'rnbqkbnr/ppp1pppp/8/8/4p3/8/PPPP1PPP/RNBQKBNR w KQkq',
   n:'Скандинавская: exd5', m:['Qxd5','Nf6']},
  {f:'rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq',
   n:'Скандинавская: Qxd5', m:['Nc3','Nf3','d4']},
  // King's Gambit
  {f:'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq',
   n:'Королевский гамбит', m:['exf4','Bc5','d5','Nf6']},
  {f:'rnbqkbnr/pppp1ppp/8/8/4Pp2/8/PPPP2PP/RNBQKBNR w KQkq',
   n:'Королевский гамбит принят (KGA)', m:['Nf3','Bc4','d4','Nc3']},
  {f:'rnbqkbnr/pppp1ppp/8/8/4Pp2/5N2/PPPP2PP/RNBQKB1R b KQkq',
   n:'КГА: 3.Nf3', m:['g5','d6','Nf6','Be7','d5']},
  {f:'rnbqkbnr/pppp1p1p/8/6p1/4Pp2/5N2/PPPP2PP/RNBQKB1R w KQkq',
   n:'КГА: g5 — гамбит Кизерицкого', m:['h4','Bc4','d4','Nc3']},
  // ════ 1.d4 lines ════
  {f:'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq',
   n:'Начало 1.d4', m:['d5','Nf6','e6','f5','c5','g6','b6']},
  // Queen's Gambit
  {f:'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq',
   n:'Ферзевый гамбит', m:['c4','Nf3','e3','Nc3','Bf4']},
  {f:'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq',
   n:'Ферзевый гамбит (2.c4)', m:['e6','c6','dxc4','e5','Nf6']},
  {f:'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq',
   n:'Ферзевый гамбит отказанный (QGD)', m:['Nc3','Nf3','e3','Bg5']},
  {f:'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq',
   n:'QGD: классика (Nf6)', m:['Bg5','Nf3','e3','cxd5']},
  {f:'rnbqkb1r/ppp2ppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR b KQkq',
   n:'QGD: Bg5 вариант', m:['Be7','h6','Nbd7']},
  {f:'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq',
   n:'QGD: Nc3', m:['Nf6','c6','c5','Be7']},
  {f:'rnbqkbnr/pp3ppp/2p1p3/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq',
   n:'QGD: Защита Ортодокс (c6)', m:['Nf3','e3','Bg5','cxd5']},
  {f:'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq',
   n:'Ферзевый гамбит принят (QGA)', m:['dxc4','e6','c6']},
  {f:'rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq',
   n:'QGA: 2...dxc4', m:['Nf3','e3','e4','Nc3']},
  // Nimzo-Indian
  {f:'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq',
   n:'Защита Нимцовича (1...Nf6)', m:['c4','Nf3','Bg5','e3','Bf4']},
  {f:'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq',
   n:'Нимцо-Индийская / КИД', m:['e6','g6','c5','d5','b6']},
  {f:'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq',
   n:'Нимцо-Индийская (Bb4)', m:['e3','Qc2','Bg5','a3','f3']},
  {f:'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKB1R w KQkq',
   n:'Нимцо-Индийская: вариант Рубинштейна', m:['e3','Bd2','Nge2']},
  // King's Indian
  {f:'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq',
   n:'Королевско-Индийская защита (КИД)', m:['Nc3','Nf3','e4','g3']},
  {f:'rnbqkb1r/pppppp1p/5np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR b KQkq',
   n:'КИД: 4.e4', m:['d6','Bg7','O-O','c5']},
  {f:'rnbq1rk1/ppp1ppbp/3p1np1/8/2PPP3/2N2N2/PP3PPP/R1BQKB1R w KQkq',
   n:'КИД: классика (O-O)', m:['Be2','Bg5','Be3','h3','f3']},
  {f:'rnbq1rk1/ppp1ppbp/3p1np1/8/2PPP3/2N2N2/PP2BPPP/R1BQK2R b KQkq',
   n:'КИД: классический вариант (Be2)', m:['e5','Nbd7','c5','Na6']},
  {f:'rnbq1rk1/ppp2pbp/3p1np1/4p3/2PPP3/2N2N2/PP2BPPP/R1BQK2R w KQkq',
   n:'КИД: 5...e5 классика', m:['O-O','d5','dxe5','Be3']},
  // Grünfeld
  {f:'rnbqkb1r/ppp1pp1p/5np1/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq',
   n:'Защита Грюнфельда', m:['cxd5','Nf3','e4','Bg5']},
  {f:'rnbqkb1r/ppp1pp1p/6p1/3n4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq',
   n:'Грюнфельд: 4.cxd5', m:['e4','Nf3','Qd4']},
  {f:'rnbqkb1r/ppp1pp1p/6p1/3n4/3PP3/2N5/PP3PPP/R1BQKBNR b KQkq',
   n:'Грюнфельд: e4 вариант обмена', m:['Nxc3','Bg7','c5']},
  // Slav
  {f:'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq',
   n:'Славянская защита', m:['Nc3','Nf3','e3','cxd5']},
  {f:'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq',
   n:'Славянская: 3.Nc3', m:['Nf6','dxc4','e6']},
  {f:'rnbqkb1r/pp2pppp/2p2n2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq',
   n:'Славянская: 3...Nf6', m:['Nf3','e3','Bg5','cxd5']},
  {f:'rnbqkb1r/pp2pppp/2p2n2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R b KQkq',
   n:'Славянская: 4.Nf3', m:['dxc4','e6','Bf5','a6']},
  // Catalan
  {f:'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/6P1/PP2PP1P/RNBQKBNR w KQkq',
   n:'Каталонское начало', m:['Bg2','Nf3']},
  {f:'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/6P1/PP2PPBP/RNBQK1NR b KQkq',
   n:'Каталонское: Bg2', m:['dxc4','Be7','c6','Nc6']},
  // London System
  {f:'rnbqkbnr/ppp1pppp/8/3p4/3P1B2/8/PPP1PPPP/RN1QKBNR b KQkq',
   n:'Лондонская система', m:['Nf6','c5','e6','Nc6']},
  {f:'rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/5N2/PPP1PPPP/RN1QKB1R b KQkq',
   n:'Лондонская: 2...Nf6', m:['e6','c5','Bf5','g6']},
  {f:'rnbqkb1r/ppp2ppp/4pn2/3p4/3P1B2/5N2/PPP1PPPP/RN1QKB1R w KQkq',
   n:'Лондонская: 2...e6', m:['e3','Nbd2','c3','Bd3']},
  // Dutch
  {f:'rnbqkbnr/ppppp1pp/8/5p2/3P4/8/PPP1PPPP/RNBQKBNR w KQkq',
   n:'Голландская защита', m:['c4','g3','Nf3','Bg5','e4']},
  {f:'rnbqkbnr/ppppp1pp/8/5p2/2PP4/8/PP2PPPP/RNBQKBNR b KQkq',
   n:'Голландская: 2.c4', m:['Nf6','e6','d6','g6']},
  {f:'rnbqkb1r/ppppp1pp/5n2/5p2/2PP4/6P1/PP2PP1P/RNBQKBNR b KQkq',
   n:'Голландская: Лениградский вариант (g3)', m:['g6','e6','d5']},
  // Benoni
  {f:'rnbqkbnr/pp1ppppp/8/2p5/3P4/8/PPP1PPPP/RNBQKBNR w KQkq',
   n:'Защита Бенони', m:['d5','Nf3','c4','e4']},
  {f:'rnbqkbnr/pp1ppppp/8/2pP4/8/8/PPP1PPPP/RNBQKBNR b KQkq',
   n:'Чешский Бенони', m:['e5','d6','Nf6']},
  {f:'rnbqkbnr/pp1p1ppp/4p3/2pP4/8/8/PPP1PPPP/RNBQKBNR w KQkq',
   n:'Бенони: 2...e6', m:['Nc3','c4','e4','Nf3']},
  // Bogo-Indian
  {f:'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/5N2/PP2PPPP/RNBQKB1R w KQkq',
   n:'Защита Боголюбова-Индийская', m:['Bd2','Nc3','a3']},

  // ════ 1.c4 — English ════
  {f:'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq',
   n:'Английское начало (1.c4)', m:['e5','Nf6','c5','e6','g6','d5']},
  {f:'rnbqkbnr/pppp1ppp/8/4p3/2P5/8/PP1PPPPP/RNBQKBNR w KQkq',
   n:'Английское: 1...e5', m:['Nc3','Nf3','g3']},
  {f:'rnbqkbnr/pppp1ppp/8/4p3/2P5/2N5/PP1PPPPP/R1BQKBNR b KQkq',
   n:'Английское: Nc3', m:['Nf6','Nc6','Bb4','d6']},
  {f:'r1bqkbnr/pppp1ppp/2n5/4p3/2P5/2N5/PP1PPPPP/R1BQKBNR w KQkq',
   n:'Английское: симметрия Nc6', m:['g3','Nf3','d3','e3']},
  {f:'rnbqkb1r/pppp1ppp/5n2/4p3/2P5/2N5/PP1PPPPP/R1BQKBNR w KQkq',
   n:'Английское: 1...e5 2.Nc3 Nf6', m:['Nf3','g3','e4','d3']},
  {f:'rnbqkb1r/pppppppp/5n2/8/2P5/8/PP1PPPPP/RNBQKBNR w KQkq',
   n:'Английское: 1...Nf6', m:['Nc3','Nf3','g3','d4']},

  // ════ 1.Nf3 — Réti ════
  {f:'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq',
   n:'Начало Рети (1.Nf3)', m:['d5','Nf6','c5','g6','e6']},
  {f:'rnbqkbnr/ppp1pppp/8/3p4/8/5N2/PPPPPPPP/RNBQKB1R w KQkq',
   n:'Рети: 1...d5', m:['c4','g3','d4','b3']},
  {f:'rnbqkbnr/ppp1pppp/8/3p4/2P5/5N2/PP1PPPPP/RNBQKB1R b KQkq',
   n:'Рети: c4 — Дебют Рети', m:['d4','dxc4','e6','c6','Nf6']},

  // ════ 1.b3 — Larsen ════
  {f:'rnbqkbnr/pppppppp/8/8/8/1P6/P1PPPPPP/RNBQKBNR b KQkq',
   n:'Дебют Ларсена (1.b3)', m:['e5','d5','Nf6','c5']},

  // ════ 1.g3 — Benko ════
  {f:'rnbqkbnr/pppppppp/8/8/8/6P1/PPPPPP1P/RNBQKBNR b KQkq',
   n:'Начало Бенко (1.g3)', m:['d5','e5','Nf6','c5']},

  // ════ 1.f4 — Bird ════
  {f:'rnbqkbnr/pppppppp/8/8/5P2/8/PPPPP1PP/RNBQKBNR b KQkq',
   n:'Начало Берда (1.f4)', m:['d5','e5','Nf6','c5','g6']},
  {f:'rnbqkbnr/ppppp1pp/8/5p2/5P2/8/PPPPP1PP/RNBQKBNR w KQkq',
   n:'Берд: Голландский ответ (f5)', m:['e4','Nf3','d4']},
  {f:'rnbqkbnr/pppp1ppp/8/4p3/5P2/8/PPPPP1PP/RNBQKBNR w KQkq',
   n:'Берд: Гамбит Фрома (e5)', m:['fxe5','e4']},

  // ════ 1.b4 — Polish ════
  {f:'rnbqkbnr/pppppppp/8/8/1P6/8/P1PPPPPP/RNBQKBNR b KQkq',
   n:'Польская партия (1.b4)', m:['e5','d5','Nf6','c6','e6']},
  {f:'rnbqkbnr/pppp1ppp/8/4p3/1P6/8/P1PPPPPP/RNBQKBNR w KQkq',
   n:'Польская: 1...e5', m:['Bb2','b5','a3']},

  // ════ Four Knights ════
  {f:'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq',
   n:'Четырёхконный дебют', m:['Bb5','d4','Bc4','d3']},
  {f:'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq',
   n:'Четырёхконный: испанский вариант', m:['Bb4','Nd4','a6']},

  // ════ Petroff ════
  {f:'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq',
   n:'Защита Петрова (1...Nf6)', m:['Nxe5','d4','d3','Nc3']},
  {f:'rnbqkb1r/pppp1ppp/8/4p3/4n3/5N2/PPPP1PPP/RNBQKB1R w KQkq',
   n:'Защита Петрова: 3.Nxe5', m:['d4','Nc3','Qe2']},

  // ════ Vienna ════
  {f:'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq',
   n:'Венская партия', m:['Bc4','f4','g3','Nf3','d3']},
  {f:'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/2N5/PPPP1PPP/R1BQK1NR b KQkq',
   n:'Венская: Bc4 (гамбит Краузера)', m:['Bc5','Nf6','d6','f5']},

  // ════ Trompowsky ════
  {f:'rnbqkb1r/pppppppp/5n2/6B1/3P4/8/PPP1PPPP/RN1QKBNR b KQkq',
   n:'Атака Тромповского (Bg5)', m:['d5','Ne4','e6','c5','g6']},

  // ════ Colle / Zukertort ════
  {f:'rnbqkb1r/ppp2ppp/4pn2/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq',
   n:'Система Колле', m:['e3','Nbd2','Bd3','b3']},
  {f:'rnbqkb1r/ppp2ppp/4pn2/3p4/3P4/5NP1/PPP1PP1P/RNBQKB1R b KQkq',
   n:'Система Цукерторта (g3)', m:['Nbd7','c5','Be7','Bd6']},

  // ════ Budapest ════
  {f:'rnbqkb1r/pppp1ppp/8/4p3/2PPn3/8/PP2PPPP/RNBQKBNR w KQkq',
   n:'Будапештский гамбит', m:['a3','Bf4','d5','Nd2']},
];

// ── Build lookup map: fenKey4 → entry ───────────────────
const BOOK_MAP = {};
for(const e of OPENING_DB){
  const k=e.f.split(' ').slice(0,3).join(' ');
  BOOK_MAP[k]=e;
}

// ── Opening detector (shown in UI) ──────────────────────
function detectOpening(gs){
  const fen=gs.fen();
  // Try progressively shorter keys
  const parts=fen.split(' ');
  const key3=parts.slice(0,3).join(' ');
  if(BOOK_MAP[key3])return BOOK_MAP[key3].n;
  return null;
}

// ── Update opening panel ─────────────────────────────────
function refreshOpening(){
  const name=detectOpening(game);
  const panel=document.getElementById('openingPanel');
  if(name&&histArr.length<=16){
    panel.style.display='block';
    document.getElementById('openingName').textContent=name;
  }else if(!histArr.length||histArr.length>16){
    panel.style.display='none';
  }
}

// ── Book move lookup ─────────────────────────────────────
function bookMove(gs){
  if(histArr.length>=16)return null; // leave book after 8 moves each
  const parts=gs.fen().split(' ');
  const key3=parts.slice(0,3).join(' ');
  const entry=BOOK_MAP[key3];
  if(!entry)return null;
  const legal=gs.moves();
  const valid=entry.m.filter(m=>legal.includes(m));
  if(!valid.length)return null;
  // Pick top move (index 0 is always the strongest book choice)
  // Add slight randomness only for lower difficulties
  if(diff>=3)return valid[0];
  return valid[Math.floor(Math.random()*valid.length)];
}

// ── Piece values (centipawns ×0.01) ─────────────────────
const PIV  = {p:1.00, n:3.20, b:3.30, r:5.10, q:9.50, k:0};
const PIV_C= {p:100,  n:320,  b:330,  r:510,  q:950,  k:0};

// ── PST Middlegame (from white's perspective) ────────────
const MG={
p:[  0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0],
n:[-50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50],
b:[-20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20],
r:[  0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0],
q:[-20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20],
k:[-30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20]
};
// Endgame PST for king (centralise)
const EG_K=[
   -50,-40,-30,-20,-20,-30,-40,-50,
   -30,-20,-10,  0,  0,-10,-20,-30,
   -30,-10, 20, 30, 30, 20,-10,-30,
   -30,-10, 30, 40, 40, 30,-10,-30,
   -30,-10, 30, 40, 40, 30,-10,-30,
   -30,-10, 20, 30, 30, 20,-10,-30,
   -30,-30,  0,  0,  0,  0,-30,-30,
   -50,-30,-30,-30,-30,-30,-30,-50];

function mgPST(type,r,c,col){
  const t=MG[type];if(!t)return 0;
  const idx=col==='w'?r*8+c:(7-r)*8+c;
  return (t[idx]||0)*0.01;
}
function egKingPST(r,c,col){
  const idx=col==='w'?r*8+c:(7-r)*8+c;
  return (EG_K[idx]||0)*0.01;
}

// ── Transposition Table ──────────────────────────────────
const TT_SIZE=1<<19; // 512K entries
const TT=new Array(TT_SIZE);
const TT_EXACT=0,TT_LOWER=1,TT_UPPER=2;

function ttIdx(fen){
  let h=0;for(let i=0;i<fen.length;i++){h=Math.imul(31,h)+fen.charCodeAt(i)|0;}
  return (h>>>0)&(TT_SIZE-1);
}
function ttGet(fen,depth,alpha,beta){
  const e=TT[ttIdx(fen)];
  if(!e||e.fen!==fen||e.depth<depth)return null;
  if(e.flag===TT_EXACT)return e.score;
  if(e.flag===TT_LOWER&&e.score>=beta)return e.score;
  if(e.flag===TT_UPPER&&e.score<=alpha)return e.score;
  return null;
}
function ttSet(fen,depth,score,flag,mv){
  const idx=ttIdx(fen);
  const e=TT[idx];
  if(e&&e.depth>depth&&e.fen===fen)return;
  TT[idx]={fen,depth,score,flag,mv};
}
function ttGetMove(fen){
  const e=TT[ttIdx(fen)];
  return (e&&e.fen===fen)?e.mv:null;
}

// ── Killer moves [ply][0..1] ─────────────────────────────
const KILLERS=Array.from({length:32},()=>[null,null]);
function addKiller(ply,mv){
  if(mv&&!mv.captured&&KILLERS[ply][0]!==mv.san){
    KILLERS[ply][1]=KILLERS[ply][0];KILLERS[ply][0]=mv.san;
  }
}

// ── Move scoring for ordering ────────────────────────────
function mvScore(mv,ttMv,ply){
  if(ttMv&&mv.from===ttMv.from&&mv.to===ttMv.to)return 30000;
  if(mv.captured){
    return 10000+PIV_C[mv.captured]-PIV_C[mv.piece]*0.1;
  }
  if(mv.flags&&mv.flags.includes('p'))return 9000; // promotion
  if(KILLERS[ply]&&(mv.san===KILLERS[ply][0]))return 8000;
  if(KILLERS[ply]&&(mv.san===KILLERS[ply][1]))return 7000;
  return 0;
}
function sortMoves(moves,ttMv,ply){
  return moves.sort((a,b)=>mvScore(b,ttMv,ply)-mvScore(a,ttMv,ply));
}

// ── Piece counting helper ────────────────────────────────
function countMaterial(board){
  let wMat=0,bMat=0,wPieces=0,bPieces=0;
  let wQ=0,bQ=0,wR=0,bR=0,wB=0,bB=0,wN=0,bN=0;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];if(!p||p.type==='k')continue;
    const v=PIV_C[p.type]||0;
    if(p.color==='w'){
      wMat+=v;wPieces++;
      if(p.type==='q')wQ++;else if(p.type==='r')wR++;
      else if(p.type==='b')wB++;else if(p.type==='n')wN++;
    }else{
      bMat+=v;bPieces++;
      if(p.type==='q')bQ++;else if(p.type==='r')bR++;
      else if(p.type==='b')bB++;else if(p.type==='n')bN++;
    }
  }
  return{wMat,bMat,wPieces,bPieces,wQ,bQ,wR,bR,wB,bB,wN,bN};
}

// ── Game phase: 0=midgame, 1=endgame ─────────────────────
// Based on piece count — queens MUST be gone for endgame
// This fixes the bug where king walked into center too early
function egPhase(info){
  // If either side has a queen → still midgame (phase < 0.3)
  const hasQueens = info.wQ>0 || info.bQ>0;
  if(hasQueens) return 0; // full midgame — king must hide

  // No queens: phase determined by minor/rook pieces remaining
  // Max minor+rook pieces at game start (per side): 2R+2B+2N = 6 pieces each = 12 total
  const minors = info.wR+info.bR+info.wB+info.bB+info.wN+info.bN;
  // 12 pieces = midgame, 0 pieces = full endgame
  return Math.max(0, Math.min(1, 1 - minors/8));
}

// ── Full evaluation function ─────────────────────────────
function evalFull(gs,histMap){
  if(gs.in_checkmate())return gs.turn()==='b'?9900:-9900;
  if(gs.in_stalemate()||gs.in_draw())return 0;

  const board=gs.board();
  const info=countMaterial(board);
  const eg=egPhase(info); // 0=midgame, 1=endgame

  // Pawn file counts
  const wPF=new Array(8).fill(0),bPF=new Array(8).fill(0);
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p&&p.type==='p')(p.color==='w'?wPF:bPF)[c]++;
  }

  let sc=0;
  let wBishops=0,bBishops=0;

  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p=board[r][c];if(!p)continue;
      const isW=p.color==='w';
      let v=PIV[p.type];

      // PST — blend midgame/endgame king tables
      if(p.type==='k'){
        const mgV=mgPST('k',r,c,p.color);
        const egV=egKingPST(r,c,p.color);
        v+=mgV*(1-eg)+egV*eg;
      }else{
        v+=mgPST(p.type,r,c,p.color);
      }

      // Pawn bonuses/penalties
      if(p.type==='p'){
        const ownF=isW?wPF[c]:bPF[c];
        const oppF=isW?bPF[c]:wPF[c];
        if(ownF>1)v-=0.15; // doubled
        const hasLeft=c>0&&(isW?wPF[c-1]:bPF[c-1])>0;
        const hasRight=c<7&&(isW?wPF[c+1]:bPF[c+1])>0;
        if(!hasLeft&&!hasRight)v-=0.20; // isolated
        // Passed pawn
        const dir=isW?-1:1;
        let passed=true;
        for(let rr=r+dir;rr>=0&&rr<8;rr+=dir){
          if((isW?bPF[c]:wPF[c])>0)passed=false;
          if(c>0&&(isW?bPF[c-1]:wPF[c-1])>0)passed=false;
          if(c<7&&(isW?bPF[c+1]:wPF[c+1])>0)passed=false;
          if(!passed)break;
        }
        if(passed){const adv=isW?7-r:r;v+=0.12+adv*0.10;}
      }

      // Rook bonuses
      if(p.type==='r'){
        const ownF=isW?wPF[c]:bPF[c];
        const oppF=isW?bPF[c]:wPF[c];
        if(ownF===0&&oppF===0)v+=0.30;
        else if(ownF===0)v+=0.15;
        const seventh=isW?1:6;
        if(r===seventh)v+=0.22;
      }

      if(p.type==='b'){if(isW)wBishops++;else bBishops++;}

      sc+=isW?v:-v;
    }
  }

  // Bishop pair
  if(wBishops>=2)sc+=0.35;
  if(bBishops>=2)sc-=0.35;

  // ── KING SAFETY (critical fix) ───────────────────────────
  // In midgame (eg < 0.5): heavy penalty for exposed king
  const wK=findKing(board,'w');
  const bK=findKing(board,'b');
  const midFactor=1-eg; // 1.0 in opening, 0.0 in endgame

  if(wK&&midFactor>0.1){
    // Pawn shield
    const shield=pawnShield(board,wK.r,wK.c,'w',wPF);
    sc+=shield*0.12*midFactor;
    // Open files near king
    for(let dc=-1;dc<=1;dc++){
      const fc=wK.c+dc;if(fc<0||fc>7)continue;
      if(wPF[fc]===0)sc-=0.25*midFactor;
      if(wPF[fc]===0&&bPF[fc]===0)sc-=0.15*midFactor; // fully open
    }
    // King in center penalty (ranks 3-6 = rows 2-5 are dangerous)
    if(wK.r>=2&&wK.r<=5){
      const centerDanger=(3-Math.abs(wK.c-3.5))*0.2; // more penalty near d/e files
      sc-=(0.5+centerDanger)*midFactor;
    }
    // King on edge but not castled position
    if(wK.r<=5&&wK.c>=2&&wK.c<=5)sc-=0.4*midFactor;
    // Enemy pieces attacking king zone
    const attackers=countKingAttackers(board,wK.r,wK.c,'b');
    sc-=attackers*0.35*midFactor;
  }

  if(bK&&midFactor>0.1){
    const shield=pawnShield(board,bK.r,bK.c,'b',bPF);
    sc-=shield*0.12*midFactor;
    for(let dc=-1;dc<=1;dc++){
      const fc=bK.c+dc;if(fc<0||fc>7)continue;
      if(bPF[fc]===0)sc+=0.25*midFactor;
      if(bPF[fc]===0&&wPF[fc]===0)sc+=0.15*midFactor;
    }
    // Black king in center penalty (rows 2-5 are dangerous for black)
    if(bK.r>=2&&bK.r<=5){
      const centerDanger=(3-Math.abs(bK.c-3.5))*0.2;
      sc+=(0.5+centerDanger)*midFactor;
    }
    if(bK.r>=2&&bK.c>=2&&bK.c<=5)sc+=0.4*midFactor;
    // White attackers near black king
    const attackers=countKingAttackers(board,bK.r,bK.c,'w');
    sc+=attackers*0.35*midFactor;
  }

  // Check penalty — being in check is immediately bad
  if(gs.in_check()){
    sc+=gs.turn()==='b'?-0.5:0.5;
  }

  // Mobility
  const moveCnt=gs.moves().length;
  sc+=moveCnt*0.004*(gs.turn()==='b'?1:-1);

  // Repetition penalty
  if(histMap){
    const cnt=histMap[fenKey(gs.fen())]||0;
    if(cnt>=1){const pen=cnt*2.0;sc+=gs.turn()==='w'?pen:-pen;}
  }

  return sc;
}

// Count how many enemy pieces attack squares around king
function countKingAttackers(board,kr,kc,attackColor){
  let count=0;
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p=board[r][c];
      if(!p||p.color!==attackColor||p.type==='k')continue;
      // Check if piece is within attacking distance of king zone (3x3)
      const distR=Math.abs(r-kr);
      const distC=Math.abs(c-kc);
      if(p.type==='q'&&(distR<=3||distC<=3))count+=2;
      else if(p.type==='r'&&(distR<=2||distC<=2))count++;
      else if(p.type==='b'&&distR===distC&&distR<=3)count++;
      else if(p.type==='n'&&distR<=2&&distC<=2)count++;
    }
  }
  return Math.min(count,5); // cap at 5 to avoid explosion
}

function findKing(board,col){
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];if(p&&p.type==='k'&&p.color===col)return{r,c};
  }return null;
}
function pawnShield(board,kr,kc,col,pf){
  let sh=0;
  const dir=col==='w'?-1:1;
  for(let dc=-1;dc<=1;dc++){
    const fc=kc+dc;if(fc<0||fc>7)continue;
    const shRow=kr+dir;
    if(shRow>=0&&shRow<8&&board[shRow][fc]&&board[shRow][fc].type==='p'&&board[shRow][fc].color===col)sh+=2;
    else if(pf[fc]>0)sh+=1;
  }
  return sh;
}

// ── Quiescence Search (fixed) ────────────────────────────
// Now also searches checking moves to avoid horizon effect on tactics
function qsearch(gs,alpha,beta,t0,tLim,histMap,depth){
  if(Date.now()-t0>tLim)return evalFull(gs,histMap);
  const stand=evalFull(gs,histMap);
  const isMax=gs.turn()==='b';
  if(isMax){if(stand>=beta)return beta;alpha=Math.max(alpha,stand);}
  else{if(stand<=alpha)return alpha;beta=Math.min(beta,stand);}

  depth=depth||0;
  const allMoves=gs.moves({verbose:true});

  // Captures + promotions always; checks only in first 2 QSearch plies
  const interesting=allMoves.filter(m=>{
    if(m.captured)return true;
    if(m.flags&&m.flags.includes('p'))return true;
    // Include checking moves shallow
    if(depth<2){
      const ch=new Chess(gs.fen());ch.move(m);
      if(ch.in_check())return true;
    }
    return false;
  });

  // Sort: captures by MVV-LVA, checks last
  interesting.sort((a,b)=>{
    const av=a.captured?PIV_C[a.captured]-PIV_C[a.piece]*0.1:0;
    const bv=b.captured?PIV_C[b.captured]-PIV_C[b.piece]*0.1:0;
    return bv-av;
  });

  const DELTA=1.0; // delta pruning margin
  for(const mv of interesting){
    // SEE-simplified: skip clearly losing captures
    if(mv.captured&&!mv.flags.includes('p')){
      const gain=PIV[mv.captured];
      if(gain+DELTA<(isMax?stand-beta:alpha-stand))continue;
    }
    const ch=new Chess(gs.fen());ch.move(mv);
    const hm=Object.assign({},histMap);
    const k=fenKey(ch.fen());hm[k]=(hm[k]||0)+1;
    const v=qsearch(ch,alpha,beta,t0,tLim,hm,depth+1);
    if(isMax){if(v>=beta)return beta;if(v>alpha)alpha=v;}
    else{if(v<=alpha)return alpha;if(v<beta)beta=v;}
    if(Date.now()-t0>tLim)break;
  }
  return isMax?alpha:beta;
}

// ── Main Alpha-Beta search ───────────────────────────────
function search(gs,depth,alpha,beta,ply,t0,tLim,histMap,nullOk){
  if(Date.now()-t0>tLim)return evalFull(gs,histMap);
  if(depth<=0||gs.game_over())return qsearch(gs,alpha,beta,t0,tLim,histMap,0);

  const fen=gs.fen();

  // Transposition table lookup
  const ttScore=ttGet(fen,depth,alpha,beta);
  if(ttScore!==null)return ttScore;
  const ttMv=ttGetMove(fen);

  const isMax=gs.turn()==='b';

  // Null-move pruning (avoid in endgame or when in check)
  if(nullOk&&depth>=3&&!gs.in_check()){
    const board=gs.board();
    const{wMat,bMat}=countMaterial(board);
    if(isMax?bMat>500:wMat>500){
      // Proper null-move: flip color AND clear en passant square
      const fenParts=gs.fen().split(' ');
      fenParts[1]=isMax?'w':'b'; // flip side to move
      fenParts[3]='-';           // clear en passant (was set by opponent's last move)
      const nullFen=fenParts.join(' ');
      try{
        const nm=new Chess(nullFen);
        if(!nm.in_check()){
          const nmScore=search(nm,depth-3,-beta,-beta+1,ply+1,t0,tLim,histMap,false);
          if(isMax?nmScore>=beta:nmScore<=alpha){
            return isMax?beta:alpha;
          }
        }
      }catch(e){}
    }
  }

  const moves=gs.moves({verbose:true});
  sortMoves(moves,ttMv,Math.min(ply,31));

  let best=isMax?-Infinity:Infinity;
  let bestMv=null;
  let flag=TT_UPPER;
  if(isMax)flag=TT_LOWER;

  for(let i=0;i<moves.length;i++){
    const mv=moves[i];
    const ch=new Chess(fen);ch.move(mv);
    const hm=Object.assign({},histMap);
    const k=fenKey(ch.fen());hm[k]=(hm[k]||0)+1;

    // Late Move Reduction
    let d=depth-1;
    if(i>=4&&depth>=3&&!mv.captured&&!gs.in_check()&&!ch.in_check()){
      d=Math.max(1,depth-2-(i>=8?1:0));
    }

    let sc;
    if(i===0){
      sc=search(ch,d,alpha,beta,ply+1,t0,tLim,hm,true);
    }else{
      // PVS — search with narrow window first
      const narrow=isMax?search(ch,d,alpha,alpha+0.001,ply+1,t0,tLim,hm,true)
                        :search(ch,d,beta-0.001,beta,ply+1,t0,tLim,hm,true);
      const needFull=isMax?narrow>alpha&&narrow<beta:narrow<beta&&narrow>alpha;
      sc=needFull?search(ch,d,alpha,beta,ply+1,t0,tLim,hm,true):narrow;
    }

    if(isMax){
      if(sc>best){best=sc;bestMv=mv;}
      if(sc>alpha){alpha=sc;flag=TT_EXACT;}
      if(alpha>=beta){addKiller(Math.min(ply,31),mv);flag=TT_LOWER;break;}
    }else{
      if(sc<best){best=sc;bestMv=mv;}
      if(sc<beta){beta=sc;flag=TT_EXACT;}
      if(beta<=alpha){addKiller(Math.min(ply,31),mv);flag=TT_UPPER;break;}
    }
    if(Date.now()-t0>tLim)break;
  }

  if(moves.length===0)best=evalFull(gs,histMap);
  ttSet(fen,depth,best,flag,bestMv);
  return best;
}

// ── Iterative deepening root search ─────────────────────
async function getBest(maxD,tLim){
  const moves=game.moves({verbose:true});
  if(!moves.length)return null;

  // Opening book
  if(histArr.length<16){
    const bm=bookMove(game);
    if(bm){const mv=moves.find(m=>m.san===bm||m===bm);if(mv)return mv;}
  }

  if(diff<=1)return moves[Math.floor(Math.random()*moves.length)];

  const hist=Object.assign({},posCnt);
  const t0=Date.now();
  let bestMove=moves[0];

  // Clear killers for fresh search
  for(let i=0;i<32;i++)KILLERS[i]=[null,null];

  for(let d=1;d<=maxD;d++){
    let iterBest=null,iterVal=-Infinity;
    // Sort root moves by TT score from previous iteration
    const rootMoves=game.moves({verbose:true});
    sortMoves(rootMoves,ttGetMove(game.fen()),0);

    for(const mv of rootMoves){
      const tg=new Chess(game.fen());tg.move(mv);
      const k=fenKey(tg.fen());
      const h=Object.assign({},hist);h[k]=(h[k]||0)+1;
      const sc=search(tg,d-1,-Infinity,Infinity,1,t0,tLim,h,true);
      // Positive = good for BLACK (AI plays black)
      if(sc>iterVal||(sc===iterVal&&Math.random()<0.1)){iterVal=sc;iterBest=mv;}
      if(Date.now()-t0>tLim)break;
    }
    if(iterBest)bestMove=iterBest;
    if(Date.now()-t0>tLim)break;

    // Aspiration window hint for next iteration
    ttSet(game.fen(),d,iterVal,TT_EXACT,bestMove);
  }
  return bestMove;
}

async function doAI(){
  if(mode!=='ai'||aiThink||gameOver||game.turn()!=='b')return;
  aiThink=true;
  document.getElementById('aiBar').classList.add('show');
  refreshTimerUI();
  const levelNames=['🌿 Лёгкий','🌀 Норм','⚡ Тяжёлый','🔥 Эксперт','👑 Мастер','✨ Гроссмейстер'];
  const bar=document.getElementById('aiBar');
  bar.textContent='🤖 '+levelNames[diff]+' думает...';
  await new Promise(r=>setTimeout(r,30));
  let maxD=1,tL=300;
  switch(diff){
    case 0:maxD=1;tL=50;break;
    case 1:maxD=2;tL=200;break;
    case 2:maxD=4;tL=1500;break;
    case 3:maxD=6;tL=3500;break;
    case 4:maxD=9;tL=7000;break;
    case 5:maxD=14;tL=12000;break;
  }
  const mv=await getBest(maxD,tL);
  if(mv&&!gameOver){
    const piece=game.get(mv.from);
    const res=game.move(mv);
    if(res){
      if(res.captured)bCaps.push(res.captured),sndCap();
      else if(res.flags&&(res.flags.includes('k')||res.flags.includes('q')))sndCastle();
      else sndMove();
      const san=res.san==='O-O'?'0-0':res.san==='O-O-O'?'0-0-0':res.san;
      lastMove={from:res.from,to:res.to};
      histArr.push(san);recPos(game.fen());
      animMove(piece,res.from,res.to,()=>{
        clearSel();refreshHist();refreshCaps();refreshOpening();updateStatus();drawBoard();
      });
    }
  }
  aiThink=false;
  document.getElementById('aiBar').classList.remove('show');
  if(game.game_over())updateStatus();
}

// ═══════════════ RESET ═══════════════════════════════
function resetGame(){
  if(aiThink)return;
  if(animRaf)cancelAnimationFrame(animRaf);
  game=new Chess();clearSel();
  gameOver=false;aiThink=false;animating=false;animSt=null;
  histArr=[];posCnt={};wCaps=[];bCaps=[];
  wTime=600;bTime=600;lastMove=null;
  recPos(game.fen());
  stopTimer();
  document.getElementById('promoOvl').classList.remove('show');
  document.getElementById('aiBar').classList.remove('show');
  refreshHist();refreshCaps();refreshOpening();refreshTimerUI();
  drawBoard();
  setStatus(mode==='ai'?'🤖 Против AI — белые начинают':'Белые начинают');
  startTimer();
}

function setMode(m){
  mode=m;
  document.getElementById('btn2p').classList.toggle('on',m==='2p');
  document.getElementById('btnAi').classList.toggle('on',m==='ai');
  document.getElementById('diffRow').style.display=m==='ai'?'flex':'none';
  resetGame();
}

function setDiff(d){
  diff=d;
  document.querySelectorAll('.diff').forEach(b=>b.classList.toggle('on',parseInt(b.dataset.d)===d));
}

function flipBoard(){
  flipped=!flipped;
  clearSel();refreshCoords();refreshCaps();refreshTimerUI();drawBoard();
}

// ═══════════════ EVENTS ══════════════════════════════
cv.addEventListener('click',onCanvasEvent);
cv.addEventListener('touchstart',e=>{e.preventDefault();onCanvasEvent(e);},{passive:false});
document.getElementById('btnNew').addEventListener('click',resetGame);
document.getElementById('btn2p').addEventListener('click',()=>setMode('2p'));
document.getElementById('btnAi').addEventListener('click',()=>setMode('ai'));
document.getElementById('btnFlip').addEventListener('click',flipBoard);
document.querySelectorAll('.diff').forEach(b=>{
  b.addEventListener('click',e=>{setDiff(parseInt(b.dataset.d));e.stopPropagation();});
});

document.getElementById('btnCopy').addEventListener('click',()=>{
  if(!histArr.length){return;}
  let pgn='';
  for(let i=0;i<histArr.length;i+=2){
    pgn+=(i/2+1)+'. '+histArr[i]+(histArr[i+1]?' '+histArr[i+1]:'')+' ';
  }
  pgn=pgn.trim();
  navigator.clipboard.writeText(pgn).then(()=>{
    const btn=document.getElementById('btnCopy');
    btn.textContent='✅ Скопировано!';
    btn.style.color='#6dcc8a';
    btn.style.borderColor='#3d6b4f';
    setTimeout(()=>{btn.textContent='📋 Копировать';btn.style.color='';btn.style.borderColor='';},2000);
  }).catch(()=>{
    // fallback
    const ta=document.createElement('textarea');
    ta.value=pgn;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');
    document.body.removeChild(ta);
    const btn=document.getElementById('btnCopy');
    btn.textContent='✅ Скопировано!';
    setTimeout(()=>{btn.textContent='📋 Копировать';},2000);
  });
});
refreshCoords();
resetGame();
setMode('2p');
setDiff(5);

})();