/* 3D 小鎮：島、房子、霓虹燈、樹、雲、狗狗、角色。 */
import * as THREE from '../lib/three.module.min.js';
import { save, reducedMotion } from './store.js';
import { CHEER_WALL } from './config.js';
import { apiOn, remote } from './api.js';

export { THREE };

/* ---------- 渲染器、場景、燈光 ---------- */
export const canvas = document.getElementById('scene');
// WebGL 不能用時這裡會丟出錯誤，main.js 會接住並顯示提示
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.background = new THREE.Color('#DCEBEF');
scene.fog = new THREE.Fog('#DCEBEF', 45, 90);
export const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight('#FFF6E8', '#B7C9A8', 1.6));
const sun = new THREE.DirectionalLight('#FFF1DC', 2.2);
sun.position.set(-14, 24, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 70 });
scene.add(sun);

/* ---------- 小工具 ---------- */
const INK = '#3F322A';
const matCache = new Map();
/** 同色共用材質，省記憶體 */
const M = c => {
  if (!matCache.has(c)) matCache.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
  return matCache.get(c);
};
function mesh(geo, color, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(geo, typeof color === 'string' ? M(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- 島與水面 ---------- */
export const R = 24;
export const ground = mesh(new THREE.CylinderGeometry(R, R - 1.5, 2, 64), [M('#C9A27E'), M('#CFDCC4'), M('#A98564')], 0, -1, 0);
const water = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: '#BFD9DE', roughness: 0.6 }));
water.rotation.x = -Math.PI / 2; water.position.y = -1.6; scene.add(water);

/* ---------- 小路 ---------- */
function pathSeg(x1, z1, x2, z2, w = 2.2) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
  const p = mesh(new THREE.BoxGeometry(w, 0.08, len + w * 0.5), '#E6D3B6', (x1 + x2) / 2, 0.02, (z1 + z2) / 2);
  p.rotation.y = Math.atan2(dx, dz);
  p.castShadow = false;
}

/* ---------- 名牌（文字畫在 canvas 上，再貼成 Sprite） ---------- */
function label(text, opt = {}) {
  const s = 2, c = document.createElement('canvas'), ctx = c.getContext('2d');
  const font = `700 ${44 * s}px "LXGW WenKai TC", serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 56 * s, h = 84 * s;
  c.width = w; c.height = h;
  ctx.font = font;
  ctx.fillStyle = opt.bg || '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 5 * s;
  if (opt.dash) ctx.setLineDash([14 * s, 10 * s]);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(4 * s, 4 * s, w - 8 * s, h - 8 * s, h / 2 - 4 * s);
  else ctx.rect(4 * s, 4 * s, w - 8 * s, h - 8 * s);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 3 * s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  const H = opt.h || 1.1;
  sp.scale.set(H * w / h, H, 1);
  sp.userData.base = sp.scale.clone();
  sp.renderOrder = 10;
  return sp;
}

/* ---------- 房子 ---------- */
function house(g, { w, d, h, body, roof, roofH = 2.4 }) {
  mesh(new THREE.BoxGeometry(w, h, d), body, 0, h / 2, 0, g);
  const rf = mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, roofH, 4), roof, 0, h + roofH / 2, 0, g);
  rf.rotation.y = Math.PI / 4;
  rf.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  mesh(new THREE.BoxGeometry(1.1, 1.8, 0.15), '#8A5A3E', 0, 0.9, d / 2 + 0.05, g);
  mesh(new THREE.BoxGeometry(0.9, 0.8, 0.12), '#DDE7E3', -w / 2 + 1, h * 0.6, d / 2 + 0.05, g);
  mesh(new THREE.BoxGeometry(0.9, 0.8, 0.12), '#DDE7E3', w / 2 - 1, h * 0.6, d / 2 + 0.05, g);
}

/** 所有建築：{ id, name, group, door, label, labelY, neon, solid:[半寬, 半深] } */
export const buildings = [];
/** 可以點的東西（建築點擊框、名牌、霓虹燈、狗狗） */
export const hitMeshes = [];

function building(id, name, x, z, build, size = [4.5, 4.5, 6], opt = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  build(g);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(size[0] + 0.6, size[2], size[1] + 0.6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = size[2] / 2; g.add(hit);
  const lb = label(name, opt.label);
  g.add(lb);
  const b = {
    id, name, group: g, label: lb,
    labelY: opt.labelY ?? 8.1,
    labelOpt: opt.label || {},
    door: new THREE.Vector3(x, 0, z + size[1] / 2 + 1.6),
    solid: opt.solid === false ? null : [2.8, 2.6],
  };
  lb.position.set(0, b.labelY, 0);
  hit.userData.b = b; lb.userData.b = b;
  hitMeshes.push(hit, lb);
  buildings.push(b);
  pathSeg(x, z + size[1] / 2, x, z + size[1] / 2 + 2);
  return b;
}

/* 祝福郵局 */
building('post', '祝福郵局', -9, -6, g => {
  house(g, { w: 4.6, d: 4, h: 3, body: '#FFF8EE', roof: '#D98E6B' });
  mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 12), '#B4704E', 3, 0.6, 2.2, g);
  mesh(new THREE.SphereGeometry(0.36, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#B4704E', 3, 1.2, 2.2, g);
  mesh(new THREE.BoxGeometry(1.4, 0.9, 0.12), '#FFFFFF', 0, 3.6, 2.05, g).rotation.x = -0.15;
}, [4.6, 4, 6.4]);

/* 烘豆小屋（煙囪會冒煙） */
const steam = [];
building('roast', '烘豆小屋', 9, -6, g => {
  house(g, { w: 4.6, d: 4, h: 3, body: '#FFF8EE', roof: '#8A6A55' });
  mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), '#B4704E', 1.2, 4.4, -0.6, g);
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.8 }));
    g.add(s);
    steam.push({ s, o: i / 6, base: new THREE.Vector3(1.2, 5.2, -0.6) });
  }
  mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.8, 16), '#FFFFFF', -3.1, 0.4, 2.3, g);
  mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 12), '#FFFFFF', -2.5, 0.45, 2.3, g);
  mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.05, 16), '#6B4A35', -3.1, 0.79, 2.3, g);
}, [4.6, 4, 6.4]);

/* 市集廣場（三頂帳篷，人可以走進去） */
const flags = [];
building('market', '市集廣場', 0, 3, g => {
  mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.1, 40), '#EADBC3', 0, 0.05, 0, g).castShadow = false;
  [[-2.6, 0, '#B4704E'], [0, -1.6, '#FFFFFF'], [2.6, 0, '#6E8063']].forEach(([tx, tz, c], i) => {
    const t = new THREE.Group(); t.position.set(tx, 0, tz); g.add(t);
    for (const [px, pz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), INK, px, 1.1, pz, t);
    mesh(new THREE.ConeGeometry(1.45, 1, 4), c, 0, 2.6, 0, t).rotation.y = Math.PI / 4;
    mesh(new THREE.BoxGeometry(1.6, 0.7, 0.8), '#E9C9B3', 0, 0.35, 0.3, t);
    for (let j = -1; j <= 1; j++) mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 10), '#FFFFFF', j * 0.45, 0.85, 0.3, t);
    const flagMat = new THREE.MeshStandardMaterial({ color: c === '#FFFFFF' ? '#D98E6B' : '#F2D27A', side: THREE.DoubleSide });
    const f = mesh(new THREE.PlaneGeometry(0.5, 0.32), flagMat, 0.25, 3.35, 0, t);
    f.userData.p = i * 2.1;
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), INK, 0, 3.3, 0, t);
    flags.push(f);
  });
}, [8, 5, 3.6], { labelY: 5, solid: false });

/* 慢讀文章館（書本漂浮在屋頂） */
const bookTops = [];
building('library', '慢讀文章館', -9, 11, g => {
  mesh(new THREE.BoxGeometry(5.4, 0.4, 4.4), '#FFF8EE', 0, 0.2, 0, g);
  mesh(new THREE.BoxGeometry(4.6, 3, 3.4), '#DDE7E3', 0, 1.9, -0.3, g);
  for (const x of [-1.9, -0.65, 0.65, 1.9]) mesh(new THREE.CylinderGeometry(0.18, 0.2, 3, 10), '#FFF8EE', x, 1.9, 1.7, g);
  mesh(new THREE.BoxGeometry(5.2, 0.4, 4.2), '#FFF8EE', 0, 3.6, 0, g);
  const ped = mesh(new THREE.ConeGeometry(3.4, 1.3, 4), '#DDE7E3', 0, 4.45, 0, g);
  ped.rotation.y = Math.PI / 4; ped.scale.set(1, 1, 0.8);
  mesh(new THREE.BoxGeometry(1, 1.7, 0.15), '#6E8063', 0, 1.25, 1.42, g);
  const bk = new THREE.Group(); bk.position.set(0, 5.4, 0); bk.userData.y = 5.4; g.add(bk); bookTops.push(bk);
  mesh(new THREE.BoxGeometry(1.1, 0.12, 0.8), '#B4704E', -0.56, 0, 0, bk).rotation.z = 0.25;
  mesh(new THREE.BoxGeometry(1.1, 0.12, 0.8), '#6E8063', 0.56, 0, 0, bk).rotation.z = -0.25;
}, [5.4, 4.4, 6.4]);

/* 慢熟生活所（施工中） */
building('office', '慢熟生活所', 9, 11, g => {
  const ghost = new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.55, roughness: 1 });
  mesh(new THREE.BoxGeometry(4.6, 3, 4), ghost, 0, 1.5, 0, g);
  const rf = mesh(new THREE.ConeGeometry(3.4, 2.2, 4), new THREE.MeshStandardMaterial({ color: '#E9C9B3', transparent: true, opacity: 0.55 }), 0, 4.1, 0, g);
  rf.rotation.y = Math.PI / 4; rf.scale.set(1, 1, 4 / 4.6);
  const pole = '#B9AFA4';
  for (const x of [-2.6, 2.6]) for (const z of [-2.3, 2.3]) mesh(new THREE.BoxGeometry(0.12, 4.6, 0.12), pole, x, 2.3, z, g);
  for (const y of [1.4, 2.9]) for (const z of [2.3, -2.3]) mesh(new THREE.BoxGeometry(5.3, 0.1, 0.12), pole, 0, y, z, g);
  mesh(new THREE.BoxGeometry(5.6, 0.45, 0.08), '#F2D27A', 0, 1.9, 2.42, g).rotation.z = -0.12;
  const tl = label('施工中', { bg: '#F2D27A', h: 0.7 }); tl.position.set(0, 1.95, 2.6); g.add(tl);
  mesh(new THREE.ConeGeometry(0.3, 0.7, 10), '#E58A4E', -3, 0.35, 2.6, g);
  mesh(new THREE.ConeGeometry(0.3, 0.7, 10), '#E58A4E', 3, 0.35, 2.6, g);
}, [4.6, 4, 6.4], { label: { dash: true } });

/* 閱讀共鳴屋（圓形小屋） */
building('reading', '閱讀共鳴屋', -17, 3, g => {
  mesh(new THREE.CylinderGeometry(2.3, 2.4, 3, 10), '#FFF8EE', 0, 1.5, 0, g);
  mesh(new THREE.ConeGeometry(2.9, 2.4, 10), '#86A379', 0, 4.2, 0, g);
  mesh(new THREE.BoxGeometry(1.1, 1.8, 0.2), '#8A5A3E', 0, 0.9, 2.32, g);
  mesh(new THREE.BoxGeometry(0.8, 0.7, 0.12), '#DDE7E3', -1.4, 1.9, 1.85, g).rotation.y = -0.6;
  mesh(new THREE.BoxGeometry(0.8, 0.7, 0.12), '#DDE7E3', 1.4, 1.9, 1.85, g).rotation.y = 0.6;
  const bk = new THREE.Group(); bk.position.set(0, 5.9, 0); bk.userData.y = 5.9; g.add(bk); bookTops.push(bk);
  mesh(new THREE.BoxGeometry(0.9, 0.1, 0.7), '#F2D27A', -0.46, 0, 0, bk).rotation.z = 0.3;
  mesh(new THREE.BoxGeometry(0.9, 0.1, 0.7), '#E9A6A6', 0.46, 0, 0, bk).rotation.z = -0.3;
  ['#B4704E', '#6E8063', '#8A6A55'].forEach((c, i) => mesh(new THREE.BoxGeometry(0.3, 0.9 - i * 0.1, 0.6), c, 2.6 + i * 0.32, 0.45, 1.6, g));
}, [4.8, 4.6, 6.6]);

/* 打氣小站 */
building('cheer', '打氣小站', 17, 3, g => {
  mesh(new THREE.BoxGeometry(4.4, 3, 4), '#FFF8EE', 0, 1.5, 0, g);
  const rf = mesh(new THREE.ConeGeometry(3.3, 2.2, 4), '#E9A06B', 0, 4.1, 0, g); rf.rotation.y = Math.PI / 4; rf.scale.set(1, 1, 4 / 4.4);
  mesh(new THREE.BoxGeometry(1.1, 1.8, 0.15), '#8A5A3E', -1, 0.9, 2.05, g);
  mesh(new THREE.BoxGeometry(1.9, 1.4, 0.12), '#B98A5E', 0.95, 1.65, 2.06, g);
  ['#F2D27A', '#E9A6A6', '#BFD9DE', '#CFE3B8', '#F6C9A0', '#FFFFFF'].forEach((c, i) => {
    const n = mesh(new THREE.BoxGeometry(0.42, 0.42, 0.05), c, 0.35 + (i % 3) * 0.6, 1.95 - Math.floor(i / 3) * 0.6, 2.14, g); n.rotation.z = (Math.random() - 0.5) * 0.3;
  });
  for (let i = 0; i < 5; i++) { const pw = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 10), '#B4704E', -0.6 + i * 0.5, 0.03, 2.8 + (i % 2) * 0.35, g); pw.castShadow = false; }
}, [4.4, 4, 6.4]);

/* 主要道路 */
pathSeg(0, 20, 0, 6); pathSeg(-9, 15.6, 9, 15.6);
pathSeg(-5, 8.6, 5, 8.6); pathSeg(-5, 8.6, -5, -1.4); pathSeg(5, 8.6, 5, -1.4);
pathSeg(-9, -1.4, 9, -1.4);
pathSeg(-17, 8.6, -5, 8.6); pathSeg(-17, 6.6, -17, 8.6);
pathSeg(5, 8.6, 17, 8.6); pathSeg(17, 6.6, 17, 8.6);

/* ---------- 霓虹燈：每棟房子的造訪次數 ---------- */
const NEON_COLORS = { post: '#FF5C8A', roast: '#FFB23F', market: '#3FE0D0', library: '#7CC6FF', office: '#C59BFF', reading: '#9BF06B', cheer: '#FF9F6B' };
function neonCanvas(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(30,22,18,.88)';
  x.beginPath();
  if (x.roundRect) x.roundRect(10, 10, 492, 140, 36); else x.rect(10, 10, 492, 140);
  x.fill();
  x.lineWidth = 7; x.strokeStyle = color; x.shadowColor = color; x.shadowBlur = 26; x.stroke();
  x.font = '700 64px "Noto Sans TC", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#FFFFFF';
  x.shadowBlur = 30; x.fillText(text, 256, 84);
  x.shadowBlur = 12; x.fillText(text, 256, 84);
  return c;
}
const wallNow = () => (apiOn() && remote.wall) ? remote.wall : CHEER_WALL;
export const cheerNewCount = () => wallNow().filter(m => (Date.now() - new Date(m.date + 'T00:00:00+08:00').getTime()) < 7 * 864e5).length;
const neonText = b => {
  if (b.id === 'cheer') { const k = cheerNewCount(); return k ? `新上牆 ${k} 則` : '打氣中'; }
  if (apiOn() && remote.loaded) { const n = remote.visits[b.id] || 0; return n ? `造訪 ${n} 次` : '等你來逛'; }
  const n = save.visits[b.id] || 0; return n ? `來過 ${n} 次` : '還沒來過';
};
function neonTexture(b) {
  const tex = new THREE.CanvasTexture(neonCanvas(neonText(b), NEON_COLORS[b.id] || '#FFFFFF'));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
for (const b of buildings) {
  const y = b.id === 'market' ? 3.9 : 3.35;
  const z = b.id === 'market' ? 2.2 : b.id === 'reading' ? 2.7 : 2.4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: neonTexture(b), depthTest: false, transparent: true }));
  sp.scale.set(3.2, 1, 1); sp.userData.base = sp.scale.clone();
  sp.position.set(0, y, z); sp.renderOrder = 9; sp.userData.b = b;
  b.group.add(sp); hitMeshes.push(sp); b.neon = sp;
}
/** 造訪次數變了就重畫霓虹燈 */
export function neonUpdate(b) {
  if (!b?.neon) return;
  const m = b.neon.material;
  m.map.dispose(); m.map = neonTexture(b); m.needsUpdate = true;
}

/** 字型載入後重畫名牌（第一次畫的時候霞鶩文楷可能還沒下載完） */
export function refreshLabels() {
  for (const b of buildings) {
    const old = b.label, nl = label(b.name, b.labelOpt);
    nl.position.copy(old.position); nl.userData.b = b;
    b.group.remove(old); old.material.map.dispose(); old.material.dispose();
    b.group.add(nl); b.label = nl;
    hitMeshes.splice(hitMeshes.indexOf(old), 1, nl);
  }
}

/* ---------- 碰撞：房子實體 + 島的邊緣 ---------- */
export function blocked(p) {
  for (const b of buildings) {
    if (!b.solid) continue;
    const g = b.group.position;
    if (Math.abs(p.x - g.x) < b.solid[0] && Math.abs(p.z - g.z) < b.solid[1]) return true;
  }
  return Math.hypot(p.x, p.z) > R - 1.2;
}

/* ---------- 樹、花、雲 ---------- */
const trees = [];
function tree(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
  mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.4, 6), '#8A6A55', 0, 0.7, 0, g);
  mesh(new THREE.IcosahedronGeometry(1.1, 0), Math.random() > 0.5 ? '#9DB58C' : '#86A379', 0, 1.9, 0, g);
  mesh(new THREE.IcosahedronGeometry(0.75, 0), '#B3C9A0', 0.2, 2.7, 0.1, g);
  g.userData.p = Math.random() * 6; trees.push(g);
}
[[-17, -12], [-21, 12], [-14, 17], [17, -12], [21, 9], [14, 17], [-4, -14], [5, -15], [-12, -16], [13, -16], [-5, 18], [5, 18], [-20, -3], [20, -3]]
  .forEach(([x, z]) => tree(x, z, rand(0.8, 1.3)));

const flowerCols = ['#F2D27A', '#E9A6A6', '#FFFFFF', '#D98E6B'];
const flowerGeo = new THREE.SphereGeometry(0.13, 6, 4);
for (let i = 0; i < 70; i++) {
  const a = Math.random() * Math.PI * 2, r = rand(6, 22);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (Math.abs(x) < 1.8 && z > 4) continue; // 不要長在主路上
  mesh(flowerGeo, flowerCols[i % 4], x, 0.15, z).castShadow = false;
}

const clouds = [];
const cloudMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 1, flatShading: true });
for (let i = 0; i < 6; i++) {
  const g = new THREE.Group(); scene.add(g);
  for (let j = 0; j < 4; j++) mesh(new THREE.IcosahedronGeometry(rand(1, 1.8), 1), cloudMat, j * 1.3, Math.random() * 0.5, Math.random() * 0.6, g).castShadow = false;
  g.position.set(rand(-50, 50), rand(6, 12), rand(-48, -36));
  g.userData.v = rand(0.4, 0.9); clouds.push(g);
}

/* ---------- 散步的狗狗（原創低多邊形造型） ---------- */
const DOG_TYPES = [
  { name: 'Coffee', body: '#D9894E', belly: '#FFF3E2', len: 1.1, leg: 0.38, ear: 'up', tail: 'curl', lines: ['我是治療犬，今天上班中。', '摸我之前，先讓我聞聞你的手。', '我把頭轉開的時候，是想休息一下喔。', '累了就休息，這是吱吱教我的。'] },
  { name: '黑糖', body: '#2E2A28', belly: '#E9C9A0', len: 1.1, leg: 0.38, ear: 'up', tail: 'curl' },
  { name: '麻糬', body: '#F6F1E7', belly: '#FFFFFF', len: 1.1, leg: 0.38, ear: 'up', tail: 'curl' },
  { name: '阿福', body: '#E2B66B', belly: '#F2D9A8', len: 1.35, leg: 0.5, ear: 'flop', tail: 'long', s: 1.15 },
  { name: '餅乾', body: '#D9894E', belly: '#FFFFFF', len: 1.15, leg: 0.2, ear: 'up', tail: 'stub' },
  { name: '可可', body: '#7A4A2E', belly: '#9C6A4A', len: 1.55, leg: 0.2, ear: 'flop', tail: 'long', s: 0.9 },
  { name: '布丁', body: '#FFFFFF', belly: '#FFFFFF', len: 1.25, leg: 0.5, ear: 'flop', tail: 'long', spots: '#2B2B2B', s: 1.1 },
  { name: '拿鐵', body: '#C9A27E', belly: '#D9BC9A', len: 1, leg: 0.42, ear: 'flop', tail: 'puff', curly: true },
  { name: '芝麻', body: '#2B2B2B', belly: '#3A3A3A', len: 1.3, leg: 0.5, ear: 'flop', tail: 'long', s: 1.15 },
];
export const dogs = [];
const tmp = new THREE.Vector3();

function randomSpot(minR, maxR, awayFrom) {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(minR, maxR);
    const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (!blocked(p) && (!awayFrom || p.distanceTo(awayFrom) > 3)) return p;
  }
  return null;
}

function makeDog(t) {
  const g = new THREE.Group(); g.scale.setScalar(t.s || 1); scene.add(g);
  const L = t.len, H = t.leg;
  mesh(new THREE.BoxGeometry(0.55, 0.45, L), t.body, 0, H + 0.22, 0, g);
  mesh(new THREE.BoxGeometry(0.5, 0.12, L * 0.8), t.belly, 0, H + 0.02, 0, g);
  if (t.spots) for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(0.12, 0.02, 0.12), t.spots, (Math.random() - 0.5) * 0.4, H + 0.455, (Math.random() - 0.5) * L * 0.8, g);

  const head = new THREE.Group(); head.position.set(0, H + 0.55, L / 2 + 0.12); g.add(head);
  mesh(t.curly ? new THREE.IcosahedronGeometry(0.32, 0) : new THREE.BoxGeometry(0.5, 0.45, 0.45), t.body, 0, 0, 0, head);
  mesh(new THREE.BoxGeometry(0.28, 0.2, 0.28), t.belly, 0, -0.1, 0.3, head);
  mesh(new THREE.BoxGeometry(0.1, 0.08, 0.06), '#1E1A18', 0, -0.02, 0.45, head);
  for (const sx of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.06, 0.06, 0.03), '#1E1A18', sx * 0.12, 0.07, 0.23, head);
    if (t.ear === 'up') mesh(new THREE.ConeGeometry(0.11, 0.24, 4), t.body, sx * 0.16, 0.32, -0.02, head).rotation.y = Math.PI / 4;
    else mesh(new THREE.BoxGeometry(0.1, 0.3, 0.2), t.body === '#FFFFFF' ? '#2B2B2B' : t.body, sx * 0.27, -0.02, 0, head).rotation.z = sx * 0.2;
  }

  const legs = [];
  for (const [lx, lz] of [[-0.18, L / 2 - 0.15], [0.18, L / 2 - 0.15], [-0.18, -L / 2 + 0.15], [0.18, -L / 2 + 0.15]]) {
    const pivot = new THREE.Group(); pivot.position.set(lx, H, lz); g.add(pivot);
    mesh(new THREE.BoxGeometry(0.13, H, 0.13), t.body, 0, -H / 2, 0, pivot);
    legs.push(pivot);
  }

  const tail = new THREE.Group(); tail.position.set(0, H + 0.4, -L / 2); g.add(tail);
  if (t.tail === 'curl') mesh(new THREE.TorusGeometry(0.13, 0.06, 6, 10), t.body, 0, 0.1, -0.05, tail).rotation.y = Math.PI / 2;
  else if (t.tail === 'puff') mesh(new THREE.IcosahedronGeometry(0.14, 0), t.body, 0, 0.08, -0.08, tail);
  else if (t.tail === 'stub') mesh(new THREE.BoxGeometry(0.1, 0.1, 0.12), t.body, 0, 0, -0.05, tail);
  else mesh(new THREE.BoxGeometry(0.07, 0.07, 0.5), t.body, 0, 0.12, -0.22, tail).rotation.x = -0.6;

  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, H + 1, L + 0.6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = (H + 1) / 2; g.add(hit);

  const d = { t, g, head, legs, tail, target: new THREE.Vector3(), speed: rand(1.4, 2.8), wait: rand(0, 3), phase: Math.random() * 6 };
  hit.userData.dog = d; hitMeshes.push(hit);
  const p = randomSpot(4, 21) || new THREE.Vector3(0, 0, 12);
  g.position.copy(p); d.target.copy(p);
  dogs.push(d);
}
DOG_TYPES.forEach(makeDog);

/* ---------- 散步的貓咪和兔子（原創低多邊形造型，和狗狗一起走動） ---------- */
const CAT_LINES = ['喵～今天也慢慢來。', '晒太陽是一種自我照顧。', '先伸個懶腰再說。', '我在等人摸摸頭。'];
const RABBIT_LINES = ['蹦！一步一步慢慢來。', '吃點東西，休息一下。', '耳朵豎起來，聽聽自己的心。', '慢慢熟也很好。'];
const CAT_TYPES = [
  { name: '小橘', body: '#E8A253', belly: '#FFF1DE' },
  { name: '煤球', body: '#2B2B2B', belly: '#3A3A3A', eye: '#F2D27A' },
  { name: '三花', body: '#FBF6EE', belly: '#FFFFFF', spots: ['#E8A253', '#2B2B2B'] },
  { name: '灰灰', body: '#9C9A96', belly: '#D8D6D2', stripes: '#6E6C68' },
];
const RABBIT_TYPES = [
  { name: '雪球', body: '#F7F3EE', inner: '#F2B8B8' },
  { name: '可可亞', body: '#B38B6D', inner: '#E3B9A0' },
  { name: '垂垂', body: '#D8C3A5', inner: '#EBD9C0', lop: true },
];
function makeCat(t) {
  const g = new THREE.Group(); g.scale.setScalar(0.85); scene.add(g);
  const L = 0.95, H = 0.34;
  mesh(new THREE.BoxGeometry(0.42, 0.36, L), t.body, 0, H + 0.18, 0, g);
  mesh(new THREE.BoxGeometry(0.38, 0.1, L * 0.75), t.belly, 0, H + 0.02, 0, g);
  if (t.spots) for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.2, 0.02, 0.22), t.spots[i % 2], (Math.random() - 0.5) * 0.2, H + 0.365, (Math.random() - 0.5) * L * 0.7, g);
  if (t.stripes) for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(0.44, 0.02, 0.06), t.stripes, 0, H + 0.365, -0.3 + i * 0.2, g);
  const head = new THREE.Group(); head.position.set(0, H + 0.45, L / 2 + 0.05); g.add(head);
  mesh(new THREE.BoxGeometry(0.42, 0.36, 0.36), t.body, 0, 0, 0, head);
  mesh(new THREE.BoxGeometry(0.06, 0.04, 0.04), '#E9A6A6', 0, -0.05, 0.19, head);
  for (const sx of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.07, 0.07, 0.03), t.eye || '#1E1A18', sx * 0.1, 0.05, 0.18, head);
    mesh(new THREE.ConeGeometry(0.09, 0.18, 4), t.body, sx * 0.13, 0.25, 0, head).rotation.y = Math.PI / 4;
  }
  const legs = [];
  for (const [lx, lz] of [[-0.13, L / 2 - 0.12], [0.13, L / 2 - 0.12], [-0.13, -L / 2 + 0.12], [0.13, -L / 2 + 0.12]]) {
    const pivot = new THREE.Group(); pivot.position.set(lx, H, lz); g.add(pivot);
    mesh(new THREE.BoxGeometry(0.1, H, 0.1), t.body, 0, -H / 2, 0, pivot); legs.push(pivot);
  }
  const tail = new THREE.Group(); tail.position.set(0, H + 0.3, -L / 2); g.add(tail);
  mesh(new THREE.BoxGeometry(0.07, 0.6, 0.07), t.stripes || t.body, 0, 0.28, -0.08, tail).rotation.x = -0.35;
  return finishCritter(g, { ...t, kind: 'cat', lines: CAT_LINES }, head, legs, tail, H, L, rand(0.8, 1.5));
}
function makeRabbit(t) {
  const g = new THREE.Group(); g.scale.setScalar(0.8); scene.add(g);
  const L = 0.7, H = 0.12;
  mesh(new THREE.IcosahedronGeometry(0.36, 0), t.body, 0, H + 0.3, -0.05, g).scale.set(1, 0.9, 1.2);
  const head = new THREE.Group(); head.position.set(0, H + 0.55, 0.32); g.add(head);
  mesh(new THREE.IcosahedronGeometry(0.24, 0), t.body, 0, 0, 0, head);
  mesh(new THREE.BoxGeometry(0.05, 0.04, 0.03), '#E9A6A6', 0, -0.04, 0.23, head);
  for (const sx of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), '#1E1A18', sx * 0.1, 0.05, 0.2, head);
    const ear = new THREE.Group(); ear.position.set(sx * 0.09, 0.18, -0.02); head.add(ear);
    mesh(new THREE.BoxGeometry(0.1, 0.42, 0.05), t.body, 0, 0.2, 0, ear);
    mesh(new THREE.BoxGeometry(0.05, 0.32, 0.02), t.inner, 0, 0.2, 0.03, ear);
    if (t.lop) { ear.rotation.z = sx * 2.3; ear.position.y = 0.05; } else ear.rotation.z = sx * -0.12;
  }
  const legs = [];
  for (const [lx, lz] of [[-0.12, 0.2], [0.12, 0.2], [-0.15, -0.25], [0.15, -0.25]]) {
    const pivot = new THREE.Group(); pivot.position.set(lx, H + 0.05, lz); g.add(pivot);
    mesh(new THREE.BoxGeometry(0.1, 0.12, lz < 0 ? 0.22 : 0.1), t.body, 0, -0.06, 0, pivot); legs.push(pivot);
  }
  const tail = new THREE.Group(); tail.position.set(0, H + 0.3, -0.45); g.add(tail);
  mesh(new THREE.IcosahedronGeometry(0.11, 0), '#FFFFFF', 0, 0, 0, tail);
  return finishCritter(g, { ...t, kind: 'rabbit', lines: RABBIT_LINES }, head, legs, tail, H + 0.3, L, rand(1.6, 2.4));
}
function finishCritter(g, t, head, legs, tail, H, L, speed) {
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, H + 1, L + 0.6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = (H + 1) / 2; g.add(hit);
  const d = { t, g, head, legs, tail, target: new THREE.Vector3(), speed, wait: rand(0, 3), phase: Math.random() * 6 };
  hit.userData.dog = d; hitMeshes.push(hit);
  const p = randomSpot(4, 21) || new THREE.Vector3(0, 0, 12);
  g.position.copy(p); d.target.copy(p);
  dogs.push(d); return d;
}
CAT_TYPES.forEach(makeCat);
RABBIT_TYPES.forEach(makeRabbit);

function updateDog(d, dt, t) {
  const pos = d.g.position;
  if (d.wait > 0) {
    d.wait -= dt;
    d.legs.forEach(l => (l.rotation.x *= 0.8));
    d.tail.rotation.y = Math.sin(t * 12 + d.phase) * 0.6;
    d.head.rotation.y = Math.sin(t * 0.8 + d.phase) * 0.4;
    if (d.t.kind === 'rabbit') { pos.y = 0; d.head.rotation.x = Math.sin(t * 6 + d.phase) * 0.08; }
    if (d.wait <= 0) { const p = randomSpot(3, 21, pos); if (p) d.target.copy(p); }
    return;
  }
  tmp.subVectors(d.target, pos); tmp.y = 0; pos.y = 0;
  const dist = tmp.length();
  if (dist < 0.3) { d.wait = rand(1.5, 5.5); return; }
  tmp.setLength(Math.min(dist, d.speed * dt)).add(pos);
  if (blocked(tmp)) { d.wait = 0.5; return; }
  const ang = Math.atan2(d.target.x - pos.x, d.target.z - pos.z);
  let da = ang - d.g.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da));
  d.g.rotation.y += da * Math.min(1, dt * 6);
  pos.copy(tmp);
  const sw = Math.sin(t * d.speed * 7 + d.phase) * 0.6;
  d.legs[0].rotation.x = sw; d.legs[3].rotation.x = sw;
  d.legs[1].rotation.x = -sw; d.legs[2].rotation.x = -sw;
  d.tail.rotation.y = Math.sin(t * (d.t.kind === 'cat' ? 3 : 10) + d.phase) * 0.4;
  d.head.rotation.y *= 0.9;
  if (d.t.kind === 'rabbit') {
    const hop = Math.abs(Math.sin(t * d.speed * 3.2 + d.phase));
    pos.y = hop * 0.35;
    d.legs.forEach(l => (l.rotation.x = (hop - 0.5) * 0.8));
  }
}

/** 狗狗停下來（被點到時用） */
export function petDog(d) { d.wait = 3; }

/* ---------- 角色：吱吱與泡芙（圖片 Sprite） ---------- */
const loader = new THREE.TextureLoader();
function charSprite(src, h) {
  const mat = new THREE.SpriteMaterial({ transparent: true });
  const sp = new THREE.Sprite(mat); sp.center.set(0.5, 0); scene.add(sp);
  sp.scale.set(h * 0.7, h, 1);
  loader.load(src, tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex; mat.needsUpdate = true;
    sp.scale.set(h * tex.image.width / tex.image.height, h, 1);
  });
  const sh = new THREE.Mesh(new THREE.CircleGeometry(h * 0.22, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.16, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; scene.add(sh);
  return { sp, sh, pos: new THREE.Vector3() };
}
export const zz = charSprite('img/zz_letsgo.png', 3.1);
export const puff = charSprite('img/puff.png', 1.6);
zz.pos.set(0, 0, 17);
puff.pos.set(1.6, 0, 18);

/** 瞬間移到某棟建築門口（快速前往用） */
export function teleportTo(b) {
  zz.pos.copy(b.door);
  puff.pos.set(b.door.x + 1.5, 0, b.door.z + 1);
}

/* ---------- 點地面時的漣漪 ---------- */
const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24), new THREE.MeshBasicMaterial({ color: '#B4704E', transparent: true, opacity: 0 }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; scene.add(ring);
export function marker(p) {
  ring.position.x = p.x; ring.position.z = p.z;
  ring.material.opacity = 0.9; ring.scale.setScalar(1);
}

/* ---------- 每一格畫面的動態 ---------- */
export function animateWorld(dt, t, { portrait, zzMoving }) {
  const motion = reducedMotion ? 0 : 1;

  zz.sp.position.set(zz.pos.x, zzMoving ? Math.abs(Math.sin(t * 11)) * 0.18 * motion : 0, zz.pos.z);
  zz.sh.position.set(zz.pos.x, 0.04, zz.pos.z);

  // 泡芙跟在吱吱右後方
  tmp.set(zz.pos.x + 1.5, 0, zz.pos.z + 1);
  const pd = puff.pos.distanceTo(tmp);
  if (pd > 0.3) puff.pos.lerp(tmp, Math.min(1, dt * 3));
  puff.sp.position.set(puff.pos.x, (pd > 0.5 ? Math.abs(Math.sin(t * 14)) * 0.14 : Math.sin(t * 2) * 0.02) * motion, puff.pos.z);
  puff.sh.position.set(puff.pos.x, 0.04, puff.pos.z);

  for (const s of steam) {
    const k = (t * 0.35 + s.o) % 1;
    s.s.position.set(s.base.x + Math.sin(k * 6) * 0.2, s.base.y + k * 2.4, s.base.z);
    s.s.scale.setScalar(0.6 + k * 1.2);
    s.s.material.opacity = 0.8 * (1 - k);
  }
  if (motion) {
    for (const g of trees) g.rotation.z = Math.sin(t * 1.3 + g.userData.p) * 0.035;
    for (const f of flags) f.rotation.y = Math.sin(t * 3 + f.userData.p) * 0.4;
    for (const bk of bookTops) bk.position.y = bk.userData.y + Math.sin(t * 2) * 0.12;
  }
  for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 55) c.position.x = -55; }
  for (const d of dogs) updateDog(d, dt, t);

  // 直式手機上把名牌、霓虹燈放大，比較好點
  for (const b of buildings) {
    b.neon.scale.copy(b.neon.userData.base).multiplyScalar(portrait ? 1.5 : 1);
    b.neon.material.opacity = motion ? 0.86 + Math.sin(t * 9 + b.door.x) * 0.06 + (Math.random() < 0.004 ? -0.5 : 0) : 0.9;
    b.label.position.y = b.labelY + Math.sin(t * 2 + b.door.x) * 0.08 * motion;
    b.label.scale.copy(b.label.userData.base).multiplyScalar(portrait ? 1.7 : 1);
  }

  if (ring.material.opacity > 0) {
    ring.material.opacity = Math.max(0, ring.material.opacity - dt * 1.2);
    ring.scale.multiplyScalar(1 + dt * 0.8);
  }
}
