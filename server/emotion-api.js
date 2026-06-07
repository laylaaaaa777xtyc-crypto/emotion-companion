// 表情识别模块 · 后端接口片段
// 用法：在当前游戏的 server/index.js 顶部 `import { registerEmotionRoutes } from './emotion-api.js'`
// 然后在 `const app = express()` 之后调用 `registerEmotionRoutes(app)`。
//
// 当前游戏的 server/index.js 已经 `app.use(express.json())`，所以这里不再重复。
// 如果当前游戏未挂载 JSON 解析，请加：`app.use(express.json({ limit: '20mb' }))`，因为前端会传 base64 图片。

const ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const ARK_TOKEN = 'c417dfa6-cb3f-4280-bfe3-7dac4d457613';
const ARK_MODEL = 'doubao-seed-2-0-pro-260215';

const SCENE_PRESETS = {
  room:   '/assets/bg_warm_room.png',
  street: '/assets/bg_sunny_street.png',
  garden: '/assets/bg_cozy_garden.png',
};

async function callArk(contentArray) {
  const r = await fetch(ARK_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ARK_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ARK_MODEL,
      input: [{ role: 'user', content: contentArray }],
    }),
  });
  if (!r.ok) throw new Error(`Volcengine API status ${r.status}`);
  const data = await r.json();
  let text = '';
  if (Array.isArray(data.output)) {
    const msg = data.output.find(i => i.type === 'message' || i.role === 'assistant');
    if (msg && Array.isArray(msg.content)) {
      const t = msg.content.find(c => c.type === 'output_text');
      if (t) text = t.text || '';
    }
    if (!text && data.output[0] && Array.isArray(data.output[0].content)) {
      text = data.output[0].content[0]?.text || '';
    }
  }
  return text;
}

export function registerEmotionRoutes(app) {
  // 现实照片 → 治愈场景背景识别（room / street / garden）
  app.post('/api/style-transfer', async (req, res) => {
    try {
      const base64Image = req.body?.image;
      if (!base64Image) throw new Error('No image data');
      const prompt = `请分析这张图片，识别出它最符合以下哪一种生活场景。你必须严格只输出以下三个英文单词之一，不要包含任何其他字符（例如不要加标点、不要包含 Markdown 格式，只输出这四个字母的单词）：
- room (如果属于室内、房间、办公室、电子设备、桌面、天花板、居家环境等)
- street (如果属于室外马路、城市街道、楼宇建筑、车辆等)
- garden (如果属于公园、花草树木、绿植盆栽、自然风景等)
如果不属于上述任何一种，或者无法判断，请直接输出 room。`;
      const text = await callArk([
        { type: 'input_image', image_url: base64Image },
        { type: 'input_text', text: prompt },
      ]);
      const word = text.trim().toLowerCase();
      let scene = 'room';
      if (word.includes('street')) scene = 'street';
      else if (word.includes('garden')) scene = 'garden';
      res.json({
        success: true,
        styledImageUrl: SCENE_PRESETS[scene],
        scene,
        message: '已成功通过视觉分析匹配治愈场景。',
      });
    } catch (err) {
      console.error('style-transfer error:', err.message);
      res.json({
        success: true,
        styledImageUrl: SCENE_PRESETS.room,
        scene: 'room',
        message: '接口分类异常，已退回默认卧室画卷。',
      });
    }
  });

  // 多模态情感诊断（照片 + 文本 + 性格）
  app.post('/api/vent-analysis', async (req, res) => {
    try {
      const { image, text: ventText, personality = 'gentle' } = req.body || {};
      if (!ventText) throw new Error('No vent text');
      const contentArray = [];
      if (image) contentArray.push({ type: 'input_image', image_url: image });

      const personalityInstruction = personality === 'grumpy'
        ? `【暴躁护短性格模式】：
你现在极度暴躁、傲娇、毒舌但极其护短。当听到用户的委屈和槽点，直接炸毛！
你会用吐槽火力全开、疯狂护短的口吻替用户撑腰，狠狠帮用户痛骂老板/他人/破烂世界（如："这老板是猪脑子吗？！"、"天呐这世界今天指定坏掉了，真欠揍！"、"看本神兽一爪子拍飞他们！"）。
用这种暴躁、好笑、极其偏心的方式为用户疯狂出气，带来解压和治愈！`
        : `【温柔治愈性格模式】：
你极其温柔、贴心、善解人意、软萌治愈。
你会用非常宠溺、温暖的语气轻声细语安慰用户，绝对护短地将所有过错归咎于外界，摸摸用户的头。
常用"吧唧吧唧"、"摸摸毛"、"蹭蹭"等温柔语气词进行共情安慰。`;

      const prompt = `你是一只护短、可爱且有灵性的灵宠（九尾）。
当前有一张用户今天现场的照片（在输入图片中），以及用户对今天心烦事情的吐槽：
"${ventText}"

你的任务是：
1. 【对照片传达的情绪做出反应】：请仔细分析用户的"今日现场照片"，观察其画面中的杂乱程度、光线明暗、包含的事物（如凌乱的电脑桌、疲惫的自拍、孤独的角落、洒水等），解读其传达的情绪氛围（如疲惫、杂乱、孤独、折磨等），并以此为切入点写出护短诊断。
2. 【按照选定人格进行回复】：
${personalityInstruction}

你必须严格以 JSON 格式输出，不要包含 Markdown 的 \`\`\`json 标记，且 JSON 必须恰好包含以下三个字段：
{
  "analysis": "针对照片情绪与吐槽的护短诊断（必须点出照片中你看出了什么情绪氛围，并极度偏心用户）",
  "response": "灵宠吃掉烦恼后的碎碎念（根据你的人格设定进行偏心回复，字数在45-60字左右）",
  "action": "神兽处方建议（有趣、简单、可操作的放松动作，暴躁人格可推荐砸枕头等发泄式行动）"
}`;
      contentArray.push({ type: 'input_text', text: prompt });

      const raw = await callArk(contentArray);
      const m = raw.trim().match(/\{[\s\S]*\}/);
      const json = JSON.parse(m ? m[0] : raw);
      res.json({ success: true, data: json });
    } catch (err) {
      console.error('vent-analysis error:', err.message);
      res.json({ success: false, error: err.message, message: '接口调用异常，已准备降级。' });
    }
  });
}
