/* 主程式：操作（點擊、鍵盤、縮放）、鏡頭、面板開關、畫面迴圈。 */
import { $, save, persist, renderPass, onAllStamps, addStamp, toast, esc, reducedMotion } from './store.js';
import { DOG_LINES } from './config.js';
import { apiOn, refresh, sendVisit, onRemote } from './api.js';

renderPass();

/* ---------- 載入 3D 小鎮；瀏覽器不支援就顯示提示 ---------- */
let W, makePanels;
try {
  W = await import('./world.js');
  ({ makePanels } = await import('./panels.js'));
} catch (e) {
  console.error(e);
  $('#intro').hidden = true;
  $('#err').hidden = false;
  throw e;
}
const { THREE, renderer, scene, camera, canvas, ground, R, buildings, hitMeshes, zz, blocked, marker, neonUpdate, refreshLabels, animateWorld, petDog } = W;

/* ---------- 後台資料（有設定試算表才會用到） ---------- */
onRemote(() => buildings.forEach(neonUpdate));
if (apiOn()) { refresh(); setInterval(() => { if (!document.hidden) refresh(); }, 60000); }

/* ---------- 狀態 ---------- */
let running = false;       // 按下「開始逛小鎮」之後才能走
let panelOpen = false;
let target = null;         // 吱吱要走去的點
let pending = null;        // 走到門口後要打開的建築
let stuck = 0;             // 走太久走不到就放棄
let nearB = null;          // 目前站在哪棟建築門口
let lastFocus = null;      // 面板關掉後把焦點還回去
const keys = {};

/* ---------- 面板 ---------- */
const sheet = $('#sheet'), mask = $('#mask'), enterBtn = $('#enter');
const PANELS = makePanels({ openPanel });

function openPanel(id) {
  const P = PANELS[id];
  if (!P) return;
  if (!panelOpen) lastFocus = document.activeElement;
  panelOpen = true; target = null; pending = null;
  for (const k in keys) keys[k] = false;

  const b = buildings.find(x => x.id === id);
  if (b) {
    save.visits[id] = (save.visits[id] || 0) + 1;
    save.visited[id] = 1;
    persist(); neonUpdate(b); sendVisit(id);
    if (buildings.every(x => save.visited[x.id])) setTimeout(() => addStamp('visit'), 600);
  }

  $('#sheetTitle').textContent = P.title;
  $('#sheetBody').innerHTML = P.html();
  $('#sheetBody').scrollTop = 0;
  P.bind?.();
  sheet.classList.add('show'); mask.classList.add('show');
  sheet.setAttribute('aria-hidden', 'false');
  enterBtn.classList.remove('show');
  setTimeout(() => $('#close').focus(), 50);
}

function closePanel() {
  if (!panelOpen) return;
  panelOpen = false;
  sheet.classList.remove('show'); mask.classList.remove('show');
  sheet.setAttribute('aria-hidden', 'true');
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

onAllStamps(() => openPanel('passport'));
$('#close').onclick = closePanel;
mask.onclick = closePanel;
$('#passBtn').onclick = () => openPanel('passport');
$('#goBtn').onclick = () => openPanel('go');
enterBtn.onclick = () => nearB && openPanel(nearB.id);

// 面板開著時，Tab 只在面板裡面繞
sheet.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const f = [...sheet.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ---------- 鍵盤 ---------- */
const isField = el => el && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName);
addEventListener('keydown', e => {
  if (e.key === 'Escape' && panelOpen) { closePanel(); return; }
  if (panelOpen || !running) return;
  if (e.key === 'Enter' && nearB && !isField(e.target)) { openPanel(nearB.id); return; }
  if (isField(e.target) && e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    keys[k] = true;
    if (k.startsWith('arrow')) e.preventDefault();
  }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/* ---------- 縮放（滾輪、兩指、按鈕） ---------- */
let zoom = 1;
const ZMIN = 0.4, ZMAX = 1.8;
const setZoom = z => (zoom = Math.min(ZMAX, Math.max(ZMIN, z)));
$('#zin').onclick = () => setZoom(zoom * 0.8);
$('#zout').onclick = () => setZoom(zoom / 0.8);
$('#zall').onclick = () => setZoom(zoom > 1.6 ? 1 : ZMAX);
canvas.addEventListener('wheel', e => { e.preventDefault(); if (!panelOpen) setZoom(zoom * (e.deltaY > 0 ? 1.08 : 0.93)); }, { passive: false });

const pts = new Map();
let pinch0 = 0, zoom0 = 1, down = null;
const pinchDist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
canvas.addEventListener('pointerdown', e => {
  down = { x: e.clientX, y: e.clientY };
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { pinch0 = pinchDist(); zoom0 = zoom; }
});
canvas.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2 && pinch0) { setZoom(zoom0 * pinch0 / Math.max(1, pinchDist())); down = null; }
});
const endPt = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
canvas.addEventListener('pointerup', endPt);
canvas.addEventListener('pointercancel', endPt);

/* ---------- 點擊：狗狗、建築、地面 ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('click', e => {
  if (panelOpen || !running) return;
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 14) return; // 拖曳或兩指縮放不算點
  const rect = canvas.getBoundingClientRect();
  ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);

  const hit = ray.intersectObjects(hitMeshes, false)[0];
  if (hit?.object.userData.dog) {
    const d = hit.object.userData.dog;
    petDog(d);
    const lines = d.t.lines || DOG_LINES;
    toast(`我是${esc(d.t.name)}<br><span class="thin">${esc(lines[Math.floor(Math.random() * lines.length)])}</span>`);
    return;
  }
  if (hit?.object.userData.b) {
    const b = hit.object.userData.b;
    if (b.door.distanceTo(zz.pos) < 4.5) { openPanel(b.id); return; }
    target = b.door.clone(); pending = b; stuck = 0;
    return;
  }
  const hg = ray.intersectObject(ground, false)[0];
  if (hg) {
    const p = hg.point; p.y = 0;
    if (p.length() > R - 1.5) p.setLength(R - 1.5);
    target = p; pending = null; stuck = 0;
    marker(p);
  }
});

/* ---------- 開始 ---------- */
$('#start').onclick = () => {
  $('#intro').hidden = true;
  running = true;
  canvas.focus({ preventScroll: true });
  setTimeout(() => $('#hint').classList.add('fade'), 6000);
};

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

document.fonts?.load('700 40px "LXGW WenKai TC"').then(refreshLabels).catch(() => {});

/* ---------- 畫面迴圈 ---------- */
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
const camFocus = new THREE.Vector3(0, 1, 15);
const camOff = new THREE.Vector3();
const PITCH = THREE.MathUtils.degToRad(40);
const HALF_VFOV = THREE.MathUtils.degToRad(15); // camera.fov = 30
const SPEED = 7;

function moveZZ(dt) {
  if (!running || panelOpen) return false;
  const kx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  const kz = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  if (kx || kz) {
    target = null; pending = null;
    tmp.set(kx, 0, kz).normalize().multiplyScalar(SPEED * dt).add(zz.pos);
    if (!blocked(tmp)) { zz.pos.copy(tmp); return true; }
    // 斜走撞牆時沿著牆滑
    for (const [sx, sz] of [[kx, 0], [0, kz]]) {
      if (!sx && !sz) continue;
      tmp.set(sx, 0, sz).multiplyScalar(SPEED * dt).add(zz.pos);
      if (!blocked(tmp)) { zz.pos.copy(tmp); return true; }
    }
    return false;
  }
  if (!target) return false;
  tmp.subVectors(target, zz.pos); tmp.y = 0;
  const d = tmp.length();
  if (pending) stuck += dt;
  if (d < (pending ? 0.8 : 0.15) || stuck > 6) {
    target = null; stuck = 0;
    if (pending) { const p = pending; pending = null; openPanel(p.id); }
    return false;
  }
  tmp.setLength(Math.min(d, SPEED * dt)).add(zz.pos);
  if (blocked(tmp) && !pending) { target = null; return false; }
  zz.pos.copy(tmp);
  return true;
}

function updateNear() {
  let nb = null, nd = 3;
  for (const b of buildings) { const d = b.door.distanceTo(zz.pos); if (d < nd) { nd = d; nb = b; } }
  if (nb !== nearB) { nearB = nb; if (nb) enterBtn.textContent = '進入 ' + nb.name; }
  enterBtn.classList.toggle('show', !!nearB && !panelOpen && running);
}

function updateCamera(dt, portrait) {
  // 固定 40 度俯角 + 窄視角，畫面不變形；縮小時鏡頭往小鎮中心靠
  const asp = innerWidth / innerHeight;
  const viewW = (portrait ? 21 : 40) * zoom;
  const hHalf = Math.atan(Math.tan(HALF_VFOV) * asp);
  const D = viewW / 2 / Math.tan(hHalf);
  const ov = THREE.MathUtils.clamp((zoom - 1.1) / 0.6, 0, 1);
  const fx = THREE.MathUtils.lerp(zz.pos.x * 0.85, 0, ov);
  const fz = THREE.MathUtils.lerp(zz.pos.z - (portrait ? 5 : 7.5), 1, ov);
  camFocus.lerp(tmp.set(fx, 1, fz), reducedMotion ? 1 : Math.min(1, dt * 2.5));
  camOff.set(0, D * Math.sin(PITCH), D * Math.cos(PITCH));
  camera.position.copy(camFocus).add(camOff);
  scene.fog.near = D * 0.95; scene.fog.far = D * 1.9;
  if (camera.far < D * 3) { camera.far = D * 3; camera.updateProjectionMatrix(); }
  camera.lookAt(camFocus);
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const portrait = innerWidth / innerHeight < 0.8;
  const moving = moveZZ(dt);
  updateNear();
  animateWorld(dt, t, { portrait, zzMoving: moving });
  updateCamera(dt, portrait);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
camera.position.set(0, 40, 60);
loop();
