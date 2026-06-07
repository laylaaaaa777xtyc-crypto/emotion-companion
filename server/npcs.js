// COCO-SSD 类名 → 灵宠 NPC 数据
// mood: 该物品默认的表情；frontend 也可以根据剧情切换
export const NPCS = {
  'laptop':       { emoji: '💻', name: '电脑灵',   mood: '😎', intro: '我装着无数次专注的目光。',  hint: '它喜欢有屏幕微光的桌前。',   clue: '在屏幕微光的旁边。' },
  'tv':           { emoji: '📺', name: '屏幕灵',   mood: '🤩', intro: '我曾映出过无数张笑脸。',     hint: '它会在荧光中悄悄出现。',     clue: '在荧光闪烁处。' },
  'cell phone':   { emoji: '📱', name: '手机灵',   mood: '😯', intro: '我承载过很多等待和惦记。',   hint: '它会停在被等待的信息旁。',   clue: '被等待的地方。' },
  'cup':          { emoji: '🥤', name: '杯灵',     mood: '😋', intro: '我装过热茶，也装过清水。',   hint: '它会循着热气前来。',         clue: '循着温度走。' },
  'bottle':       { emoji: '🍶', name: '瓶灵',     mood: '🥲', intro: '我装过最甜的水，也听过最轻的笑声。',       hint: '它喜欢甜甜的、会让人心化掉的小弧度。',   clue: '甜甜的、让人心化掉的弧度。' },
  'wine glass':   { emoji: '🍷', name: '杯灵',     mood: '🥰', intro: '我在夜里更愿意现身。',       hint: '它喜欢柔光与轻轻碰撞的声音。', clue: '柔光与轻响处。' },
  'book':         { emoji: '📚', name: '书灵',     mood: '😴', intro: '我藏着许多被反复翻阅的故事。', hint: '它喜欢能听见心跳的安静角落。', clue: '安静而温柔的地方。' },
  'potted plant': { emoji: '🪴', name: '叶灵',     mood: '🥰', intro: '我一直朝着光生长。',         hint: '它跟随生命向光的方向。',     clue: '跟随生命的方向。' },
  'vase':         { emoji: '🏺', name: '瓶灵',     mood: '😌', intro: '我守护着干净而安静的角落。', hint: '它停在被认真照料的地方。',   clue: '被认真照料的地方。' },
  'mouse':        { emoji: '🖱', name: '鼠灵',     mood: '🥺', intro: '我熟悉每一次指尖的停留。',   hint: '它在最常被触碰的地方。',     clue: '指尖常停的位置。' },
  'keyboard':     { emoji: '⌨️', name: '键灵',    mood: '😤', intro: '我能听到敲击声里的温度。',   hint: '它喜欢长久陪伴的位置。',     clue: '长久陪伴之处。' },
  'chair':        { emoji: '🪑', name: '椅灵',     mood: '🤗', intro: '我最喜欢看到坐下的人，嘴角悄悄扬起的那一刻。', hint: '它跟着那条「弯弯的弧度」跑出来。', clue: '一条弯弯上扬的弧度。' },
  'couch':        { emoji: '🛋', name: '沙发灵',   mood: '😪', intro: '我藏在最柔软的角落。',       hint: '它会蜷在最柔软的怀抱里。',   clue: '最柔软的角落。' },
  'bed':          { emoji: '🛏', name: '床灵',     mood: '😴', intro: '我陪伴最深的休息。',         hint: '它喜欢最安心的怀抱。',       clue: '最安心的所在。' },
  'clock':        { emoji: '🕰', name: '时灵',     mood: '🤔', intro: '我数过光照进来的每一刻。',   hint: '它跟随光的时刻而来。',       clue: '光出现的时刻。' },
  'teddy bear':   { emoji: '🧸', name: '毛绒灵',   mood: '🥰', intro: '我被很多人抱过。',           hint: '它需要最柔软的安全感。',     clue: '柔软的怀抱。' },
  'remote':       { emoji: '🎮', name: '控灵',     mood: '😶', intro: '我停在常被注视的方向。',     hint: '它跟随目光所指。',           clue: '目光停留的方向。' },
  'backpack':     { emoji: '🎒', name: '包灵',     mood: '😊', intro: '我装着旅途里的温度。',       hint: '它愿意跟随有故事的人。',     clue: '有故事的角落。' },
  'handbag':      { emoji: '👜', name: '包灵',     mood: '😊', intro: '我装着重要的小东西。',       hint: '它愿意停在被珍惜的物品旁。', clue: '被珍惜的地方。' },
  'dining table': { emoji: '🍽', name: '桌灵',     mood: '🤗', intro: '我见证过每一次团聚。',       hint: '它喜欢有人围坐的地方。',     clue: '有人聚集之处。' },
  'refrigerator': { emoji: '❄️', name: '凉灵',    mood: '🥶', intro: '我守护着温度的另一端。',     hint: '它知道何处会再次变暖。',     clue: '从凉到暖之间。' },
  'microwave':    { emoji: '♨️', name: '热灵',    mood: '😆', intro: '我能让一切重新变暖。',       hint: '它跟随升温的方向。',         clue: '升温之处。' },
  'banana':       { emoji: '🍌', name: '果灵',     mood: '😋', intro: '我装着甜甜的能量。',         hint: '它喜欢被分享的甜。',         clue: '被分享的甜。' },
  'apple':        { emoji: '🍎', name: '果灵',     mood: '😋', intro: '我藏着秋天的味道。',         hint: '它喜欢被留下的果实旁。',     clue: '被留下的甜。' },
  'orange':       { emoji: '🍊', name: '果灵',     mood: '😋', intro: '我藏着阳光的味道。',         hint: '它跟随阳光的甜。',           clue: '阳光的味道。' },
  'sports ball':  { emoji: '⚽', name: '球灵',     mood: '😆', intro: '我曾在很多个午后跳跃。',     hint: '它喜欢动起来的瞬间。',       clue: '热闹与动感处。' },
  'scissors':     { emoji: '✂️', name: '剪灵',    mood: '😯', intro: '我裁出过许多形状。',         hint: '它停在被认真整理的地方。',   clue: '整齐的位置。' },
  'toothbrush':   { emoji: '🪥', name: '刷灵',     mood: '😄', intro: '我守护每天的开始与结束。',   hint: '它喜欢清新的角落。',         clue: '清新的角落。' },
  'person':       { emoji: '🧑', name: '人灵',     mood: '😊', intro: '我就藏在你脸上最温暖、最常被想念的地方。', hint: '它最爱在你眼睛弯起来的那一刻出现。',       clue: '你眼睛弯起来的那一刻。' },
};

export const FALLBACK_NPCS = [
  { class: 'book',         ...{ emoji: '📚', name: '小书灵', mood: '😴', intro: '我藏着许多被反复翻阅的故事。', hint: '它喜欢能听见心跳的安静角落。', clue: '安静而温柔的地方。' } },
  { class: 'cup',          ...{ emoji: '🥤', name: '杯灵',   mood: '😋', intro: '我装过热茶，也装过清水。',     hint: '它会循着热气前来。',           clue: '循着温度走。' } },
  { class: 'lamp',         ...{ emoji: '💡', name: '灯灵',   mood: '🤩', intro: '我守护过无数个夜晚。',         hint: '它喜欢金色而柔软的光。',       clue: '跟随金色的光。' } },
  { class: 'potted plant', ...{ emoji: '🪴', name: '叶灵',   mood: '🥰', intro: '我一直朝着光生长。',           hint: '它跟随生命向光的方向。',       clue: '跟随生命的方向。' } },
  { class: 'window',       ...{ emoji: '🪟', name: '窗灵',   mood: '😯', intro: '我连接着内与外。',             hint: '它藏在阳光照进来的地方。',     clue: '阳光的方向。' } },
  { class: 'teddy bear',   ...{ emoji: '🧸', name: '毛绒灵', mood: '🥰', intro: '我被很多人抱过。',             hint: '它需要最柔软的安全感。',       clue: '柔软的怀抱。' } },
];

export function dialogFor(npc) {
  return [
    '...咦？有人能听见我说话吗？',
    `我是「${npc.name}」，${npc.intro}`,
    `迷路的灵宠... ${npc.hint}`,
    `✦ 线索：${npc.clue}`,
  ];
}

export const INTRO_DIALOG = {
  speaker: '迷路的灵宠',
  icon: '🐱',
  lines: [
    '...呜...有人吗？',
    '我...我好像迷路了。',
    '我感觉到你周围的物品都藏着灵气，',
    '请你帮我和它们说话，收集 3 个线索，',
    '然后...请把我带去「最温暖、最有光的地方」。'
  ],
};

export const FINAL_HINT = {
  speaker: '心里的声音',
  icon: '✦',
  lines: [
    '...你感受到一股温暖的牵引。',
    '远处似乎浮现出什么——「最温暖、最有光的地方」。',
    '走过去看看吧。'
  ],
};

export const ENDING_DIALOG = {
  speaker: '迷路的灵宠',
  icon: '🐱',
  lines: [
    '...啊，是你！',
    '我顺着你给的线索找过来了。',
    '原来「最温暖、最有光的地方」...',
    '就是有人在等我的地方。'
  ],
};

export const ENDING_TEXT = '谢谢你，朋友。<br>有你在的地方，<br>就是最温暖的家。';
