/* Google 試算表後台連線。config.js 的 API_URL 有填才會啟用；沒填就維持原本的做法。 */
import { API_URL } from './config.js?v=20261116a';

export const apiOn = () => !!API_URL;

/** 最新資料（大家共用）：已上牆的留言、各房子造訪總數 */
export const remote = { wall: null, visits: {}, loaded: false };
const listeners = new Set();
export const onRemote = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => { try { fn(remote); } catch (e) {} });

async function getJSON(params) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`${API_URL}?${new URLSearchParams(params)}`, { signal: ctrl.signal });
    return await r.json();
  } finally { clearTimeout(timer); }
}
async function post(body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    // text/plain 避免瀏覽器多送一次預檢請求，Apps Script 才收得到
    const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl.signal });
    return await r.json();
  } finally { clearTimeout(timer); }
}

/** 讀取全部（開站時、打開打氣小站時） */
export async function refresh() {
  if (!apiOn()) return remote;
  try {
    const d = await getJSON({ action: 'all', t: Date.now() });
    if (d && d.ok) { remote.wall = d.wall || []; remote.visits = d.visits || {}; remote.loaded = true; emit(); }
  } catch (e) { /* 連不上就沿用舊資料 */ }
  return remote;
}

export async function sendVisit(id) {
  if (!apiOn()) return;
  remote.visits[id] = (remote.visits[id] || 0) + 1; emit();
  try { const d = await post({ action: 'visit', id }); if (d && d.ok && typeof d.visits === 'number') { remote.visits[id] = d.visits; emit(); } } catch (e) {}
}

export async function sendPaw(id, delta) {
  if (!apiOn()) return null;
  try { const d = await post({ action: 'paw', id, delta }); return d && d.ok ? d.paws : null; } catch (e) { return null; }
}

export async function submitCheer(text, name, agree, website) {
  if (!apiOn()) return { ok: false, error: 'off' };
  try { return await post({ action: 'submit', text, name, agree, website }); } catch (e) { return { ok: false, error: 'network' }; }
}
