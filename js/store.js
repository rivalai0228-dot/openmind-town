/* 儲存與共用小工具：集章、造訪次數、按讚，只存在這台裝置的瀏覽器。 */
import { STAMPS, BOOKS, STORAGE_KEY, LINE_OA_URL } from './config.js';

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

/** 把文字轉成安全的 HTML（使用者輸入或設定檔內容都先經過這裡） */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/** 跳脫後把 \n 換成 <br> */
export const escBr = s => esc(s).replace(/\n/g, '<br>');

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 讀寫 ---------- */
export const save = { stamps: {}, visited: {}, visits: {}, likes: {}, code: '', dealSeen: '', bagNote: null, paws: {}, cheerSeen: 0 };
try {
  const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (s && typeof s === 'object') {
    for (const k of Object.keys(save)) if (s[k] != null) save[k] = s[k];
    // 舊版用書本順序 0,1,2 當按讚鑰匙，轉成書本 id
    for (const [k, v] of Object.entries(save.likes)) {
      if (/^\d+$/.test(k) && BOOKS[+k]) { if (v) save.likes[BOOKS[+k].id] = true; delete save.likes[k]; }
    }
  }
} catch (e) { /* 私密模式或被封鎖的儲存空間：照樣能逛，只是不會記住 */ }

export function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch (e) {}
}

/* ---------- 集章 ---------- */
export const stampCount = () => STAMPS.filter(([k]) => save.stamps[k]).length;

export function renderPass() {
  $('#passCount').textContent = stampCount();
  $('#passDots').innerHTML = STAMPS.map(([k]) => `<i class="${save.stamps[k] ? 'on' : ''}"></i>`).join('');
}

let onComplete = () => {};
/** 集滿五章時要做的事（由 main.js 設定，通常是打開護照） */
export function onAllStamps(fn) { onComplete = fn; }

export function addStamp(k) {
  if (save.stamps[k]) return;
  save.stamps[k] = Date.now();
  persist(); renderPass();
  const name = STAMPS.find(s => s[0] === k)[1];
  toast(`蓋章！「${esc(name)}」<br>${stampCount()} / ${STAMPS.length}`);
  if (stampCount() === STAMPS.length) setTimeout(onComplete, 1400);
}

/** 集滿時產生一次兌換碼（避開容易看錯的 0/O、1/I） */
export function ensureCode() {
  if (save.code) return save.code;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(6);
  (crypto.getRandomValues ? crypto.getRandomValues(buf) : buf.forEach((_, i) => (buf[i] = Math.random() * 1e9)));
  save.code = [...buf].map(n => chars[n % chars.length]).join('');
  persist();
  return save.code;
}

/* ---------- 提示 ---------- */
let toastTimer = 0;
export function toast(html) {
  const t = $('#toast');
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/** LINE 按鈕：沒填連結時顯示「準備中」 */
export function lineLink(label) {
  return LINE_OA_URL
    ? `<a class="btn" href="${esc(LINE_OA_URL)}" target="_blank" rel="noopener">${esc(label)}</a>`
    : `<span class="btn light static">${esc(label)}（LINE 連結準備中）</span>`;
}

/** 複製文字，舊瀏覽器退回 execCommand */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove(); return ok;
  } catch (e) { return false; }
}
