import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import {
  NPCS, FALLBACK_NPCS, dialogFor,
  INTRO_DIALOG, FINAL_HINT, ENDING_DIALOG, ENDING_TEXT,
} from './npcs.js';
import { registerEmotionRoutes } from './emotion-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(PUBLIC_DIR));
registerEmotionRoutes(app);

// 简单内存会话存储（重启即清）
const sessions = new Map();

function newId() { return crypto.randomBytes(8).toString('hex'); }

// === API ===

// 拿全部 NPC 元数据（前端用来根据 detect 出来的 class 渲染表情/对话）
app.get('/api/npcs', (req, res) => {
  res.json({ npcs: NPCS, fallback: FALLBACK_NPCS });
});

// 拿单个 NPC 的对话（含开场白 → 介绍 → 提示 → 线索）
app.get('/api/dialog/:class', (req, res) => {
  const cls = req.params.class;
  const npc = NPCS[cls];
  if (!npc) return res.status(404).json({ error: 'unknown class', class: cls });
  res.json({
    class: cls,
    speaker: npc.name,
    icon: npc.emoji,
    mood: npc.mood,
    clue: npc.clue,
    lines: dialogFor(npc),
  });
});

// 剧情段落
app.get('/api/intro',  (_, res) => res.json(INTRO_DIALOG));
app.get('/api/final-hint', (_, res) => res.json(FINAL_HINT));
app.get('/api/ending', (_, res) => res.json({ dialog: ENDING_DIALOG, text: ENDING_TEXT }));

// 开局
app.post('/api/sessions', (req, res) => {
  const id = newId();
  sessions.set(id, {
    id,
    startedAt: Date.now(),
    clues: [],         // [{ class, at }]
    completed: false,
    completedAt: null,
  });
  res.json({ id });
});

// 收集线索
app.post('/api/sessions/:id/collect', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const cls = req.body?.class;
  if (!cls) return res.status(400).json({ error: 'missing class' });
  if (s.clues.find(c => c.class === cls)) {
    return res.json({ ok: true, clues: s.clues.length, already: true });
  }
  s.clues.push({ class: cls, at: Date.now() });
  res.json({
    ok: true,
    clues: s.clues.length,
    unlocked: s.clues.length >= 3,
  });
});

// 完成结局
app.post('/api/sessions/:id/complete', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  if (!s.completed) {
    s.completed = true;
    s.completedAt = Date.now();
  }
  res.json({
    ok: true,
    duration: s.completedAt - s.startedAt,
    clues: s.clues.length,
  });
});

// 看自己当前进度
app.get('/api/sessions/:id', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(s);
});

// 简单的统计接口（可在控制台查看）
app.get('/api/stats', (_, res) => {
  const all = [...sessions.values()];
  res.json({
    total: all.length,
    completed: all.filter(s => s.completed).length,
    avgClues: all.length ? (all.reduce((a, s) => a + s.clues.length, 0) / all.length).toFixed(2) : 0,
  });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`✦ 灵宠寻踪 server running at http://localhost:${PORT}`);
  console.log(`  API:   http://localhost:${PORT}/api/npcs`);
  console.log(`  Stats: http://localhost:${PORT}/api/stats`);
});
