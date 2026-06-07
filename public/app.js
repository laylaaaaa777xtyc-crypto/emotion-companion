'use strict';

// ============== 工具 ==============
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const api = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`POST ${path} → ${r.status}`);
    return r.json();
  },
};

// ============== 全局状态 ==============
const state = {
  sessionId: null,
  npcs: {},          // class -> npc
  fallbackNpcs: [],
  clues: 0,
  hasCamera: false,
  hasModel: false,
  scanning: false,
  sketchOn: false,
  ended: false,
  bubbleOpen: false,
  finalUnlocked: false,
  /** 当前场景中的可点击物体 */
  objects: [],       // {id, class, npc, screenBbox, hitZoneEl}
  timerStart: 0,
  timerId: null,
};

const PET_INTRO_LINES = [
  '呜...我好像走丢了。',
  '我能感觉到你周围的物品里，藏着一点点灵气。',
  '请你和它们交流，收集 3 个线索。',
  '帮我找到回家的路好吗(＞﹏＜)',
];

// ============== 计时器 ==============
function startTimer() {
  state.timerStart = Date.now();
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    const t = Math.floor((Date.now() - state.timerStart) / 1000);
    const m = String(Math.floor(t / 60)).padStart(2, '0');
    const s = String(t % 60).padStart(2, '0');
    const el = $('timer-clock');
    if (el) el.textContent = `${m}:${s}`;
  }, 500);
}
function stopTimer() {
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
}

// ============== 背景装饰 ==============
function makeStars() {
  const stars = $('stars');
  for (let i = 0; i < 50; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 2 + 1;
    s.style.width = s.style.height = size + 'px';
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.animationDelay = (Math.random() * 3) + 's';
    stars.appendChild(s);
  }
}
function makeParticles() {
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 5 + 3;
    p.style.width = p.style.height = size + 'px';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDelay = (Math.random() * 10) + 's';
    p.style.animationDuration = (7 + Math.random() * 5) + 's';
    document.body.appendChild(p);
  }
}

// ============== 摄像头 ==============
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showStatus('⚠ 浏览器不支持摄像头，使用梦幻背景模式'); showFallback(); return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    const video = $('video');
    video.srcObject = stream;
    await new Promise(res => {
      if (video.readyState >= 2 && video.videoWidth) return res();
      video.onloadedmetadata = () => res();
    });
    await video.play().catch(() => {});
    let waits = 0;
    while ((!video.videoWidth || !video.videoHeight) && waits < 20) {
      await sleep(100); waits++;
    }
    state.hasCamera = true;
    return true;
  } catch (e) {
    console.warn('摄像头不可用：', e);
    showStatus('⚠ 摄像头未授权，使用梦幻背景模式');
    showFallback();
    return false;
  }
}
function showFallback() {
  $('fallback-bg').style.display = 'block';
  $('video').style.display = 'none';
}

function showStatus(text, dur = 3500) {
  const bar = $('status-bar');
  bar.textContent = text;
  bar.style.display = 'block';
  clearTimeout(showStatus._t);
  if (dur > 0) showStatus._t = setTimeout(() => { bar.style.display = 'none'; }, dur);
}

// ============== 识别（COCO-SSD）==============
let cocoModel = null;

async function loadModel() {
  if (cocoModel) return true;
  if (typeof cocoSsd === 'undefined') {
    $('scan-text').innerHTML = '❌ 识别模型未加载<br><span style="font-size:12px">（CDN 不可达，将进入随机模式）</span>';
    await sleep(1500);
    return false;
  }
  try {
    $('scan-text').innerHTML = '正在召唤识别之灵...<br><span style="font-size:12px;opacity:.8">首次加载约 3–8 秒</span>';
    cocoModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    state.hasModel = true;
    return true;
  } catch (e) {
    console.warn('模型加载失败：', e);
    $('scan-text').innerHTML = '❌ 模型加载失败<br><span style="font-size:12px">' + (e.message || '') + '</span>';
    await sleep(1500);
    return false;
  }
}

// video pixel → 屏幕 pixel（适配 object-fit: cover）
function getVideoMapper(video) {
  const W = window.innerWidth, H = window.innerHeight;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.max(W / vw, H / vh);
  const dispW = vw * scale, dispH = vh * scale;
  const offX = (dispW - W) / 2, offY = (dispH - H) / 2;
  return {
    box: ([bx, by, bw, bh]) => ({
      x: bx * scale - offX,
      y: by * scale - offY,
      w: bw * scale,
      h: bh * scale,
    }),
  };
}

function drawDetections(canvas, ctx, dets, video) {
  const m = getVideoMapper(video);
  if (!m) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const d of dets) {
    if (d.score < 0.3) continue;
    const npc = state.npcs[d.class];
    const known = !!npc;
    const r = m.box(d.bbox);

    if (known) {
      ctx.shadowColor = 'rgba(255, 200, 230, 0.95)';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = 'rgba(255, 230, 250, 0.95)';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
    } else {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
    }
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);

    const label = known ? `${npc.mood} ${npc.name}` : d.class;
    ctx.font = '13px -apple-system, "PingFang SC", sans-serif';
    const padX = 8, lh = 22;
    const tw = ctx.measureText(label).width;
    const ly = Math.max(0, r.y - lh - 2);
    ctx.fillStyle = known ? 'rgba(120, 60, 160, 0.92)' : 'rgba(40, 25, 70, 0.75)';
    ctx.beginPath();
    ctx.roundRect(r.x, ly, tw + padX * 2, lh, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, r.x + padX, ly + lh - 7);

    const conf = Math.round(d.score * 100) + '%';
    ctx.font = '11px -apple-system, sans-serif';
    const cw = ctx.measureText(conf).width;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(r.x + r.w - cw - 8, r.y + 2, cw + 6, 16);
    ctx.fillStyle = '#ffe066';
    ctx.fillText(conf, r.x + r.w - cw - 5, r.y + 14);
  }
}

async function liveDetect(durationMs = 4500) {
  const video = $('video');
  const canvas = $('boxes');
  const ctx = canvas.getContext('2d');

  if (!ctx.roundRect) {
    ctx.roundRect = function (x, y, w, h, r) {
      this.moveTo(x + r, y); this.lineTo(x + w - r, y);
      this.quadraticCurveTo(x + w, y, x + w, y + r);
      this.lineTo(x + w, y + h - r);
      this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      this.lineTo(x + r, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - r);
      this.lineTo(x, y + r);
      this.quadraticCurveTo(x, y, x + r, y);
    };
  }

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.opacity = '1';
  canvas.style.display = 'block';

  const agg = new Map();
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    let dets = [];
    try { dets = await cocoModel.detect(video, 20); } catch (e) { console.warn(e); }
    for (const d of dets) {
      if (d.score < 0.3) continue;
      if (!state.npcs[d.class]) continue;
      const prev = agg.get(d.class);
      if (!prev || d.score > prev.score) agg.set(d.class, d);
    }
    drawDetections(canvas, ctx, dets, video);

    const knownCount = agg.size;
    const totalCount = dets.filter(d => d.score >= 0.3).length;
    const names = [...agg.values()].sort((a, b) => b.score - a.score)
      .slice(0, 4).map(d => state.npcs[d.class].name).join('、');
    const sec = Math.max(0, ((durationMs - (Date.now() - start)) / 1000)).toFixed(1);
    $('scan-text').innerHTML = knownCount > 0
      ? `✦ 已识别 <b>${knownCount}</b> 个灵气物品<br><span style="font-size:13px;opacity:.85">${names}</span><br><span style="font-size:11px;opacity:.6">还有 ${sec}s</span>`
      : `扫描中... <span style="opacity:.7">画面里 ${totalCount} 个物体</span><br><span style="font-size:12px;opacity:.75">把镜头对准物品（电脑/水杯/书/盆栽…）</span><br><span style="font-size:11px;opacity:.6">还有 ${sec}s</span>`;

    await sleep(60);
  }
  for (let i = 0; i < 8; i++) { canvas.style.opacity = (1 - i / 8).toFixed(2); await sleep(40); }
  canvas.style.display = 'none';
  canvas.style.opacity = '1';

  return [...agg.values()].sort((a, b) => b.score - a.score);
}

// ============== 摄像头截图 → 手绘风冻结 ==============
function captureSketchSnapshot() {
  const video = $('video');
  const canvas = $('sketch-snap');
  if (!video || !canvas) return false;
  if (!video.videoWidth || !video.videoHeight) return false;

  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;

  // 复刻 object-fit: cover 的裁剪算法
  const vw = video.videoWidth, vh = video.videoHeight;
  const scale = Math.max(W / vw, H / vh);
  const dw = vw * scale, dh = vh * scale;
  const dx = (W - dw) / 2, dy = (H - dh) / 2;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  try {
    ctx.drawImage(video, dx, dy, dw, dh);
  } catch (_) {
    return false;
  }

  canvas.style.display = 'block';
  $('sketch-paper').style.display = 'block';
  // 等浏览器套上 display 后再加 .show 触发淡入
  requestAnimationFrame(() => {
    canvas.classList.add('show');
    $('sketch-paper').classList.add('show');
  });
  video.style.opacity = '0';
  state.sketchOn = true;
  return true;
}

function clearSketchSnapshot() {
  const canvas = $('sketch-snap');
  const paper = $('sketch-paper');
  if (canvas) {
    canvas.classList.remove('show');
    canvas.style.display = 'none';
  }
  if (paper) {
    paper.classList.remove('show');
    paper.style.display = 'none';
  }
  const v = $('video');
  if (v) v.style.opacity = '';
  state.sketchOn = false;
}

// ============== 把识别结果转成可点击 hit-zone（表情贴脸）==============
function clearObjects() {
  state.objects.forEach(o => o.hitZoneEl && o.hitZoneEl.remove());
  state.objects = [];
}

function placeObjectFromDetection(detection, video) {
  const m = getVideoMapper(video);
  if (!m) return null;
  const npc = state.npcs[detection.class];
  if (!npc) return null;
  const r = m.box(detection.bbox);
  return createHitZone({
    class: detection.class,
    npc,
    bbox: r,
  });
}

function createHitZone({ class: cls, npc, bbox }) {
  const W = window.innerWidth, H = window.innerHeight;
  // 钳制到屏幕内（hud 区上方留 70px，底部留 40px）
  const minSize = 70;
  let { x, y, w, h } = bbox;
  if (w < minSize) { x -= (minSize - w) / 2; w = minSize; }
  if (h < minSize) { y -= (minSize - h) / 2; h = minSize; }
  x = Math.max(8, Math.min(W - w - 8, x));
  y = Math.max(70, Math.min(H - h - 40, y));

  const zone = document.createElement('div');
  zone.className = 'hit-zone';
  zone.style.left = x + 'px';
  zone.style.top  = y + 'px';
  zone.style.width  = w + 'px';
  zone.style.height = h + 'px';

  const faceSize = Math.max(38, Math.min(72, Math.min(w, h) * 0.5));
  const face = document.createElement('div');
  face.className = 'face';
  face.textContent = npc.mood;
  face.style.fontSize = faceSize + 'px';
  zone.appendChild(face);

  const tag = document.createElement('div');
  tag.className = 'name-tag';
  tag.textContent = `${npc.emoji} ${npc.name}`;
  zone.appendChild(tag);

  const obj = {
    id: cls + '_' + Math.random().toString(36).slice(2, 8),
    class: cls,
    npc,
    screenBbox: { x, y, w, h },
    hitZoneEl: zone,
  };
  zone.addEventListener('click', (e) => {
    e.stopPropagation();
    onObjectTap(obj);
  });
  document.body.appendChild(zone);
  return obj;
}

// 随机投放（识别失败 / 无摄像头）
function placeFallbackObjects() {
  const W = window.innerWidth, H = window.innerHeight;
  const fall = [...state.fallbackNpcs].sort(() => Math.random() - 0.5).slice(0, 5);
  const taken = [];
  for (const npc of fall) {
    let tries = 0, x, y;
    const w = 120, h = 120;
    do {
      x = 40 + Math.random() * (W - 80 - w);
      y = 100 + Math.random() * (H - 240 - h);
      tries++;
    } while (tries < 60 && taken.some(t => Math.hypot(t.x - x, t.y - y) < 130));
    taken.push({ x, y });
    const obj = createHitZone({ class: npc.class || npc.name, npc, bbox: { x, y, w, h } });
    state.objects.push(obj);
  }
}

// ============== 漫画式悬浮气泡 ==============
let currentBubble = null;

function closeBubble() {
  if (!currentBubble) return;
  const b = currentBubble; currentBubble = null;
  state.bubbleOpen = false;
  b.classList.add('closing');
  setTimeout(() => b.remove(), 240);
}

function openSpeechBubble(obj, lines, { onDone } = {}) {
  closeBubble();
  state.bubbleOpen = true;

  const bb = obj.screenBbox;
  const cx = bb.x + bb.w / 2;

  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  bubble.innerHTML = `
    <div class="bubble-header">
      <span class="ic">${obj.npc.mood}</span>
      <span class="nm">${obj.npc.name}</span>
    </div>
    <div class="bubble-text"><span class="typed"></span><span class="bubble-cursor"></span></div>
    <div class="bubble-next">▾ 点击继续</div>
  `;
  document.body.appendChild(bubble);

  // 测得尺寸后决定上/下放置
  const rect = bubble.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  const spaceAbove = bb.y;
  const spaceBelow = H - (bb.y + bb.h);
  const margin = 22;

  let placeAbove;
  if (spaceAbove >= rect.height + margin + 20) placeAbove = true;
  else if (spaceBelow >= rect.height + margin + 20) placeAbove = false;
  else placeAbove = spaceAbove >= spaceBelow;

  bubble.classList.add(placeAbove ? 'tail-bottom' : 'tail-top');

  let by;
  if (placeAbove) by = bb.y - rect.height - margin;
  else            by = bb.y + bb.h + margin;
  by = Math.max(12, Math.min(H - rect.height - 12, by));

  let bx = cx - rect.width / 2;
  bx = Math.max(12, Math.min(W - rect.width - 12, bx));
  bubble.style.left = bx + 'px';
  bubble.style.top  = by + 'px';

  let tailX = cx - bx;
  tailX = Math.max(22, Math.min(rect.width - 22, tailX));
  bubble.style.setProperty('--tail-x', tailX + 'px');

  currentBubble = bubble;

  // 打字机
  const typedEl  = bubble.querySelector('.typed');
  const cursorEl = bubble.querySelector('.bubble-cursor');
  const nextEl   = bubble.querySelector('.bubble-next');

  let lineIdx = 0, charIdx = 0, typing = false, curLine = '', timer = null;
  function startLine() {
    if (lineIdx >= lines.length) {
      closeBubble();
      if (onDone) onDone();
      return;
    }
    curLine = lines[lineIdx];
    charIdx = 0;
    typedEl.textContent = '';
    cursorEl.style.display = 'inline-block';
    nextEl.style.display = 'none';
    typing = true;
    timer = setInterval(() => {
      charIdx++;
      typedEl.textContent = curLine.slice(0, charIdx);
      if (charIdx >= curLine.length) {
        clearInterval(timer); timer = null;
        typing = false;
        nextEl.style.display = 'block';
      }
    }, 42);
  }
  function advance() {
    if (typing) {
      if (timer) { clearInterval(timer); timer = null; }
      typedEl.textContent = curLine;
      typing = false;
      nextEl.style.display = 'block';
      return;
    }
    lineIdx++;
    startLine();
  }
  bubble.onclick = (e) => { e.stopPropagation(); advance(); };
  startLine();
}

// ============== 物品专属对话覆盖层（椅子 / 瓶子 等）==============
const SPECIAL_DIALOGS = {
  chair: {
    bg: '/assets/chair-dialog.png',
    title: '椅子的心事',
    narrator: {
      open:  '这是一把椅子...它好像在等什么人坐下来。',
      react: '它在回想一件让人嘴角扬起的事？',
      thank: '原来它的灵气藏在一条「弯弯的弧度」里...',
    },
  },
  bottle: {
    bg: '/assets/bottle-dialog.png',
    title: '瓶子的低语',
    narrator: {
      open:  '一只小瓶子...它身上的水珠像在偷偷打招呼。',
      react: '它好像懂得很多甜甜的、轻轻的话。',
    thank: '甜甜的、让人心化掉的弧度...好像又出现了一次。',
    },
  },
  vase: {
    bg: '/assets/bottle-dialog.png',
    title: '瓶子的低语',
    narrator: {
      open:  '一只小瓶子...它静静地待在那儿，好像有话想说。',
      react: '它好像懂得很多甜甜的、轻轻的话。',
      thank: '甜甜的、让人心化掉的弧度...好像又出现了一次。',
    },
  },
  person: {
    bg: '/assets/person-dialog.png',
    title: '小幽灵的悄悄话',
    narrator: {
      open:  '那个软软的小幽灵...好像一直在守护着谁。',
      react: '它...指着你的方向。',
      thank: '「你眼睛弯起来的那一刻」...线索都连起来了！',
    },
  },
};

async function showSpecialDialog(obj) {
  const overlay = $('chair-dialog');
  if (!overlay) return;

  const cfg = SPECIAL_DIALOGS[obj.class];
  if (!cfg) return;

  // 切换背景图、面板标题
  const bg = overlay.querySelector('.chair-bg');
  if (bg) bg.src = cfg.bg;
  const titleEl = overlay.querySelector('.chair-bubble-right .cb-title');
  if (titleEl) titleEl.textContent = cfg.title;

  // 拿对话内容（先服务端、失败回退本地）
  let npcLines = null;
  try {
    const d = await api.get(`/api/dialog/${encodeURIComponent(obj.class)}`);
    npcLines = d.lines;
  } catch (_) {}
  if (!npcLines) {
    const n = obj.npc;
    npcLines = [
      '...咦？有人能听见我说话吗？',
      `我是「${n.name}」，${n.intro}`,
      `迷路的灵宠... ${n.hint}`,
      `✦ 线索：${n.clue}`,
    ];
  }

  // 编排成左右交替的剧本：[side, text]
  // side: 'left' = 旁白/你；'right' = 物品
  const script = [
    ['left',  cfg.narrator.open],
    ['right', npcLines[0]],
    ['left',  cfg.narrator.react],
    ['right', npcLines[1]],
    ['right', npcLines[2]],
    ['left',  cfg.narrator.thank],
    ['right', npcLines[3]],
  ];

  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  state.bubbleOpen = true;

  const leftBubble  = $('chair-bubble-left');
  const rightBubble = $('chair-bubble-right');
  const leftTyped   = leftBubble.querySelector('.cb-typed');
  const leftCursor  = leftBubble.querySelector('.cb-cursor');
  const rightTyped  = rightBubble.querySelector('.cb-typed');
  const rightCursor = rightBubble.querySelector('.cb-cursor');
  const nextBtn     = $('chair-next-btn');
  const footer      = $('chair-dialog-footer');

  // 复位
  leftTyped.textContent = '';
  rightTyped.textContent = '';
  leftBubble.classList.remove('active');
  rightBubble.classList.remove('active');
  nextBtn.classList.remove('show');

  let idx = 0, typeTimer = null, typing = false, curText = '', curCharIdx = 0, activeSide = null;

  function getActiveTyped() {
    return activeSide === 'left' ? leftTyped : rightTyped;
  }
  function getActiveCursor() {
    return activeSide === 'left' ? leftCursor : rightCursor;
  }

  function startLine() {
    if (idx >= script.length) {
      finish();
      return;
    }
    const [side, text] = script[idx];
    activeSide = side;
    leftBubble.classList.toggle('active', side === 'left');
    rightBubble.classList.toggle('active', side === 'right');
    // 清空两边文字，确保只显示当前一句（避免堆积）
    leftTyped.textContent = '';
    rightTyped.textContent = '';
    nextBtn.classList.remove('show');
    footer.textContent = side === 'right' ? '点击「继续倾听」或任意位置推进' : '点击任意位置继续';

    curText = text;
    curCharIdx = 0;
    typing = true;
    getActiveCursor().style.display = 'inline-block';
    typeTimer = setInterval(() => {
      curCharIdx++;
      getActiveTyped().textContent = curText.slice(0, curCharIdx);
      if (curCharIdx >= curText.length) {
        clearInterval(typeTimer); typeTimer = null;
        typing = false;
        nextBtn.classList.add('show');
      }
    }, 42);
  }

  function advance() {
    if (typing) {
      if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
      getActiveTyped().textContent = curText;
      typing = false;
      nextBtn.classList.add('show');
      return;
    }
    idx++;
    startLine();
  }

  function finish() {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.removeEventListener('click', onOverlayClick);
    nextBtn.removeEventListener('click', onNextClick);
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    state.bubbleOpen = false;

    if (obj && !obj.hitZoneEl.classList.contains('collected')) {
      obj.hitZoneEl.classList.add('collected');
      state.clues++;
      updateProgress();
      if (state.sessionId) {
        api.post(`/api/sessions/${state.sessionId}/collect`, { class: obj.class }).catch(() => {});
      }
      maybeUnlockGuess();
    }
  }

  const onOverlayClick = (e) => {
    if (e.target.closest('.chair-dialog-close')) { finish(); return; }
    if (e.target.closest('.cb-next-btn')) return; // 由按钮自己处理
    advance();
  };
  const onNextClick = (e) => { e.stopPropagation(); advance(); };

  overlay.addEventListener('click', onOverlayClick);
  nextBtn.addEventListener('click', onNextClick);

  startLine();
}

// ============== 物体被点击 ==============
async function onObjectTap(obj) {
  if (state.bubbleOpen) return;
  if (state.ended) return;
  if (obj.hitZoneEl.classList.contains('collected')) return;

  if (obj.dataset && obj.dataset.final === '1') { triggerEnding(); return; }

  // 椅子 / 瓶子 等使用专属对话覆盖层
  if (SPECIAL_DIALOGS[obj.class]) {
    showSpecialDialog(obj);
    return;
  }

  // 拉取对话（先尝试服务端，失败回退本地）
  let lines = null;
  try {
    if (state.npcs[obj.class]) {
      const d = await api.get(`/api/dialog/${encodeURIComponent(obj.class)}`);
      lines = d.lines;
    }
  } catch (_) {}
  if (!lines) {
    const n = obj.npc;
    lines = [
      '...咦？有人能听见我说话吗？',
      `我是「${n.name}」，${n.intro}`,
      `迷路的灵宠... ${n.hint}`,
      `✦ 线索：${n.clue}`,
    ];
  }

  obj.hitZoneEl.classList.add('collected');
  // 收线索：先本地 +1，再异步上报（容错）
  state.clues++;
  updateProgress();
  if (state.sessionId) {
    api.post(`/api/sessions/${state.sessionId}/collect`, { class: obj.class }).catch(() => {});
  }

  openSpeechBubble(obj, lines, {
    onDone: async () => {
      maybeUnlockGuess();
    },
  });
}

// 收到第 1 个线索 → 解锁"我要猜"按钮
function maybeUnlockGuess() {
  if (state.clues >= 1 && !state.finalUnlocked) {
    state.finalUnlocked = true;
    $('guess-btn').style.display = 'block';
    showStatus('✦ 收集到线索！可以「猜一猜」灵宠藏在哪里啦', 5000);
  }
}

function updateProgress() {
  const got = Math.min(state.clues, 3);
  // 4 个爪印代表 4 个段：0/3 → 1 个 active，1/3 → 2 个 active... 满 3 → 全亮（含✨）
  const paws = document.querySelectorAll('#hud .paw-progress .paw');
  paws.forEach((p, i) => {
    if (i <= got) p.classList.add('active');
    else p.classList.remove('active');
  });
  const fill = $('paw-fill');
  if (fill) {
    const pct = (got / 3) * 100;
    fill.style.width = pct + '%';
  }
  updatePetStatus();
}

function updatePetStatus() {
  const got = Math.min(state.clues, 3);
  const faces = ['😢', '🥺', '🙂', '😄'];
  const moods = ['难过', '期待', '安心', '开心'];
  const faceEl = $('pet-mood-face');
  const moodEl = $('pet-mood-text');
  if (faceEl) faceEl.textContent = faces[got];
  if (moodEl) moodEl.textContent = moods[got];

  const heart = $('pet-heart-meter');
  const hunger = $('pet-hunger-meter');
  const energy = $('pet-energy-meter');
  if (heart) heart.style.width = Math.min(100, 28 + got * 24) + '%';
  if (hunger) hunger.style.width = Math.max(18, 46 - got * 8) + '%';
  if (energy) energy.style.width = Math.min(100, 54 + got * 12) + '%';
}

// ============== 猜测：谜底是「微笑」 ==============
const SMILE_WORDS = [
  '微笑', '笑容', '开心', '高兴', '喜悦',
  '笑', '微笑里', '笑容里', '笑里', '欢笑', '笑脸', '笑意',
  'smile', 'smiles', 'happy', 'joy', 'joyful',
];

function normalize(s) { return (s || '').toLowerCase().replace(/\s+/g, '').trim(); }

function isGuessCorrect(guess) {
  const g = normalize(guess);
  if (!g) return false;
  for (const w of SMILE_WORDS) {
    const wn = normalize(w);
    if (g === wn || g.includes(wn) || wn.includes(g)) return true;
  }
  return false;
}

function openGuessModal() {
  const modal = $('guess-modal');
  const cluesEl = $('guess-clues');
  const input = $('guess-input');
  const feedback = $('guess-feedback');

  // 列出已收集的线索
  const collected = state.objects.filter(o => o.hitZoneEl && o.hitZoneEl.classList.contains('collected'));
  if (!collected.length) {
    cluesEl.innerHTML = '<div class="empty">还没收集到任何线索...</div>';
  } else {
    cluesEl.innerHTML = collected.map(o => {
      const n = o.npc;
      return `<div class="clue"><span class="ic">${n.emoji || '✦'}</span>${n.clue || n.hint || ''}</div>`;
    }).join('');
  }

  feedback.textContent = '';
  feedback.className = 'guess-feedback';
  input.value = '';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => input.focus(), 200);
}

function closeGuessModal() {
  const modal = $('guess-modal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
}

function submitGuess() {
  const input = $('guess-input');
  const feedback = $('guess-feedback');
  if (isGuessCorrect(input.value)) {
    feedback.textContent = '✦ 你猜到了！原来小灵宠就藏在那里 ✦';
    feedback.className = 'guess-feedback right';
    setTimeout(() => {
      closeGuessModal();
      playPetReveal();
    }, 900);
  } else {
    feedback.textContent = '...好像不是。再想想线索：弯弯的弧度、甜甜的、眼睛弯起来...';
    feedback.className = 'guess-feedback wrong';
    input.focus();
    input.select();
  }
}

// ============== 自拍上传 ==============
function openSelfieModal() {
  const m = $('selfie-modal');
  const drop = $('selfie-drop');
  const preview = $('selfie-preview');
  const file = $('selfie-file');
  const done = $('selfie-done');
  // 复位
  file.value = '';
  preview.removeAttribute('src');
  preview.classList.remove('show');
  drop.classList.remove('has-image');
  done.disabled = true;
  m.classList.add('show');
  m.setAttribute('aria-hidden', 'false');
}
function closeSelfieModal() {
  const m = $('selfie-modal');
  m.classList.remove('show');
  m.setAttribute('aria-hidden', 'true');
}

function onSelfieFile(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const preview = $('selfie-preview');
    const drop = $('selfie-drop');
    preview.src = ev.target.result;
    preview.classList.add('show');
    drop.classList.add('has-image');
    $('selfie-done').disabled = false;
  };
  reader.readAsDataURL(f);
}

function showPolaroid(photoSrc) {
  const overlay = $('polaroid-overlay');
  const img = $('polaroid-photo');
  const date = $('polaroid-date');
  if (img) img.src = photoSrc;
  if (date) {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    date.textContent = `${y}.${m}.${day}`;
  }
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  state.ended = true;
  if (state.sessionId) {
    api.post(`/api/sessions/${state.sessionId}/complete`, {}).catch(() => {});
  }
}

async function playPetReveal() {
  const reveal = $('pet-reveal');
  const video = $('pet-reveal-video');
  const msg = $('pet-reveal-msg');
  if (msg) msg.textContent = '✨ 你找到它了！✨';
  reveal.classList.add('show');
  reveal.setAttribute('aria-hidden', 'false');
  try {
    video.currentTime = 0;
    await video.play();
  } catch (_) {}

  // 视频结束 → 切到"拍拍乐"提示 → 打开自拍上传
  const goNext = () => {
    video.removeEventListener('ended', goNext);
    clearTimeout(t);
    if (msg) msg.textContent = '笑一笑，和灵宠一起拍拍乐吧 📸';
    setTimeout(() => {
      reveal.classList.remove('show');
      reveal.setAttribute('aria-hidden', 'true');
      openSelfieModal();
    }, 1600);
  };
  video.addEventListener('ended', goNext);
  const t = setTimeout(goNext, 4400);
}

// ============== 最终阶段 ==============
async function spawnFinal() {
  let hint;
  try { hint = await api.get('/api/final-hint'); }
  catch (_) {
    hint = { speaker: '心里的声音', icon: '✦', lines: [
      '...你感受到一股温暖的牵引。',
      '远处似乎浮现出什么——「最温暖、最有光的地方」。',
      '走过去看看吧。',
    ] };
  }
  // 借用屏幕中心位置创建一个虚拟"物体"承载最终对话
  const W = window.innerWidth, H = window.innerHeight;
  const fakeBbox = { x: W/2 - 60, y: H/2 - 60, w: 120, h: 120 };
  const fakeObj = {
    id: 'final_hint',
    class: '__final_hint',
    npc: { emoji: hint.icon, mood: hint.icon, name: hint.speaker },
    screenBbox: fakeBbox,
  };
  openSpeechBubble(fakeObj, hint.lines, {
    onDone: () => {
      // 生成最终金光物体
      const zone = document.createElement('div');
      zone.className = 'hit-zone';
      const w = 130, h = 130;
      const x = W / 2 - w / 2;
      const y = Math.max(110, H * 0.32 - h / 2);
      zone.style.left = x + 'px'; zone.style.top = y + 'px';
      zone.style.width = w + 'px'; zone.style.height = h + 'px';
      zone.style.borderColor = 'rgba(255, 230, 150, 0.9)';
      zone.style.background  = 'radial-gradient(circle, rgba(255,240,180,0.25), rgba(255,180,100,0.1))';
      zone.style.boxShadow = '0 0 40px rgba(255,220,140,0.7) inset, 0 0 60px rgba(255,200,100,0.6)';
      const face = document.createElement('div');
      face.className = 'face';
      face.textContent = '✨';
      face.style.fontSize = '60px';
      zone.appendChild(face);
      const tag = document.createElement('div');
      tag.className = 'name-tag';
      tag.textContent = '最温暖、最有光的地方';
      zone.appendChild(tag);

      zone.addEventListener('click', triggerEnding);
      document.body.appendChild(zone);

      // 把它也登记到 objects，方便清场
      state.objects.push({ id: 'final_target', class: '__final', npc: null, screenBbox: { x, y, w, h }, hitZoneEl: zone });
    }
  });
}

async function triggerEnding() {
  if (state.ended) return;
  state.ended = true;
  closeBubble();
  document.querySelectorAll('.hit-zone').forEach(z => z.remove());

  if (state.sessionId) {
    api.post(`/api/sessions/${state.sessionId}/complete`, {}).catch(() => {});
  }

  // 精简结局：不显示 🐱 emoji、不显示对话气泡，只保留「再玩一次」
  const pf = $('pet-final'); if (pf) pf.style.display = 'none';
  const ep = $('ending-pet'); if (ep) ep.style.display = 'none';
  const et = $('ending-text'); if (et) et.innerHTML = '';
  $('ending').style.display = 'flex';
}

// ============== 扫描 / 重扫 ==============
async function doScanAndSpawn(showIntro) {
  if (state.scanning) return;
  state.scanning = true;
  $('rescan-btn').style.display = 'none';

  // 重扫时把上一轮的手绘冻结画面收掉，恢复实时摄像头
  clearSketchSnapshot();

  // 清掉旧的（未收集）hit-zone
  state.objects = state.objects.filter(o => {
    if (o.hitZoneEl.classList.contains('collected') || o.class === '__final') return true;
    o.hitZoneEl.remove();
    return false;
  });

  $('scan-overlay').style.display = 'flex';

  const REQUIRED = 1;
  let placed = 0;
  let detectedNames = [];
  let modelReady = false;

  if (state.hasCamera) {
    modelReady = await loadModel();
    if (modelReady) {
      const video = $('video');
      if (!video.videoWidth) await sleep(500);
      const detections = await liveDetect(4500);
      const picked = detections.slice(0, 5);
      for (const d of picked) {
        const obj = placeObjectFromDetection(d, video);
        if (obj) {
          state.objects.push(obj);
          detectedNames.push(state.npcs[d.class].name);
          placed++;
        }
      }
    }
  }

  // 摄像头模式下：必须识别到 3 个物体才能进入下一步
  if (state.hasCamera && modelReady && placed < REQUIRED) {
    const need = REQUIRED - placed;
    const found = placed > 0
      ? `已识别到 <b>${placed}</b> 个（${detectedNames.join('、')}）`
      : '还没识别到熟悉的物品';
    $('scan-text').innerHTML =
      `${found}<br>` +
      `还差 <b>${need}</b> 个才能开启下一步<br>` +
      `<span style="font-size:12px;opacity:.85">请移动镜头对准更多物品（电脑/水杯/书/盆栽…）<br>然后点击右下角「重扫」继续寻找</span>`;
    await sleep(1400);
    $('scan-overlay').style.display = 'none';
    $('rescan-btn').style.display = 'block';
    showStatus(`✦ 还差 ${need} 个物品，请继续寻找后点「重扫」`, 5000);
    state.scanning = false;
    return;
  }

  if (placed === 0) {
    $('scan-text').innerHTML = state.hasCamera
      ? '未识别到熟悉的物品<br><span style="font-size:12px;opacity:.8">将召唤随机灵气陪你</span>'
      : '使用梦幻背景模式';
    await sleep(900);
    placeFallbackObjects();
    detectedNames = state.objects.map(o => o.npc.name);
  }

  // 摄像头模式识别到 3 个以上：把当前画面冻结成手绘风
  if (state.hasCamera && modelReady && placed >= REQUIRED) {
    $('scan-text').innerHTML =
      `✦ 识别到 <b>${placed}</b> 个灵气物品<br>` +
      `<span style="font-size:13px;opacity:.9">${detectedNames.join('、')}</span><br>` +
      `<span style="font-size:12px;opacity:.7">正在把场景画进画册里…</span>`;
    await sleep(500);
    captureSketchSnapshot();
    await sleep(700);
  }

  $('scan-overlay').style.display = 'none';
  $('hud').style.display = 'flex';

  if (placed > 0) showStatus(`✦ 识别到：${detectedNames.join('、')}　点一点物品听它说话`, 4500);
  else if (state.hasCamera) showStatus('✦ 随机模式（可按右下角「重扫」再试）', 4500);

  if (state.clues < 3) $('rescan-btn').style.display = 'block';

  state.scanning = false;

  if (showIntro) {
    await sleep(700);
    let intro;
    try { intro = await api.get('/api/intro'); }
    catch (_) {
      intro = { speaker: '迷路的灵宠', icon: '🐱', lines: [
        '...呜...有人吗？', '我...我好像迷路了。',
        '我感觉到你周围的物品都藏着灵气，',
        '请你帮我和它们说话，收集 3 个线索，',
        '然后...请把我带去「最温暖、最有光的地方」。',
      ]};
    }
    const W = window.innerWidth, H = window.innerHeight;
    const introObj = {
      id: 'intro', class: '__intro',
      npc: { emoji: intro.icon, mood: intro.icon, name: intro.speaker },
      screenBbox: { x: W/2 - 60, y: H - 220, w: 120, h: 120 },
    };
    openSpeechBubble(introObj, intro.lines);
  }
}

// ============== 主流程 ==============
async function preloadData() {
  try {
    const data = await api.get('/api/npcs');
    state.npcs = data.npcs || {};
    state.fallbackNpcs = data.fallback || [];
  } catch (e) {
    console.warn('加载 NPC 数据失败：', e);
  }
  try {
    const s = await api.post('/api/sessions');
    state.sessionId = s.id;
  } catch (e) {
    console.warn('开局会话失败：', e);
  }
}

async function begin() {
  $('start-screen').style.display = 'none';
  const preloadPromise = preloadData();
  await runPetIntroScene();
  $('hint-card').style.display = 'block';
  updatePetStatus();
  startTimer();
  await preloadPromise;
  await startCamera();
  await doScanAndSpawn(false);
}

function runPetIntroScene() {
  return new Promise((resolve) => {
    const scene = $('pet-intro-scene');
    const video = $('intro-pet-video');
    const line = $('intro-dialog-line');
    const next = $('intro-next-btn');
    let idx = 0;

    scene.classList.add('show');
    scene.setAttribute('aria-hidden', 'false');
    video.currentTime = 0;
    video.play().catch(() => {});

    function renderLine() {
      line.textContent = PET_INTRO_LINES[idx];
      next.textContent = idx >= PET_INTRO_LINES.length - 1 ? '开始寻找' : '点击继续';
    }

    function finish() {
      next.removeEventListener('click', advance);
      scene.classList.remove('show');
      scene.setAttribute('aria-hidden', 'true');
      video.pause();
      resolve();
    }

    function advance() {
      idx++;
      if (idx >= PET_INTRO_LINES.length) {
        finish();
        return;
      }
      renderLine();
    }

    renderLine();
    next.addEventListener('click', advance);
  });
}

// ============== 事件绑定 ==============
makeStars();
makeParticles();
$('start-btn').addEventListener('click', begin);
$('ending-btn').addEventListener('click', () => location.reload());
$('rescan-btn').addEventListener('click', () => {
  if (state.bubbleOpen || state.scanning) return;
  doScanAndSpawn(false);
});

// 猜测弹窗
$('guess-btn').addEventListener('click', () => {
  if (state.bubbleOpen || state.scanning || state.ended) return;
  openGuessModal();
});
$('guess-close').addEventListener('click', closeGuessModal);
$('guess-submit').addEventListener('click', submitGuess);
$('guess-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); submitGuess(); }
});
$('guess-modal').addEventListener('click', (e) => {
  if (e.target === $('guess-modal')) closeGuessModal();
});

// 自拍上传
$('selfie-file').addEventListener('change', onSelfieFile);
$('selfie-close').addEventListener('click', closeSelfieModal);
$('selfie-done').addEventListener('click', () => {
  if ($('selfie-done').disabled) return;
  const previewSrc = $('selfie-preview').src;
  closeSelfieModal();
  showPolaroid(previewSrc);
});
$('polaroid-again').addEventListener('click', () => location.reload());
$('selfie-modal').addEventListener('click', (e) => {
  if (e.target === $('selfie-modal')) closeSelfieModal();
});

// 帮助 / 主页 / 关闭帮助
$('help-btn').addEventListener('click', () => $('help-modal').classList.add('show'));
$('help-close').addEventListener('click', () => $('help-modal').classList.remove('show'));
$('help-modal').addEventListener('click', (e) => {
  if (e.target === $('help-modal')) $('help-modal').classList.remove('show');
});
$('home-btn').addEventListener('click', () => {
  if (confirm('回到主页将重新开始本次冒险，确认吗？')) location.reload();
});

// 点击空白处关闭气泡
document.addEventListener('click', (e) => {
  if (!currentBubble) return;
  if (currentBubble.contains(e.target)) return;
  if (e.target.closest('.hit-zone')) return;
  // 只关 intro / 普通气泡；这里宽松处理：什么都不做，让用户必须看完
});

window.addEventListener('resize', () => {
  const c = $('boxes');
  c.width = window.innerWidth; c.height = window.innerHeight;
});

// === 表情识别模块：仅绑首页 #emotion-btn 跳转，不影响首页结构和捉迷藏流程 ===
document.getElementById('emotion-btn')?.addEventListener('click', () => {
  location.href = '/emotion.html';
});
