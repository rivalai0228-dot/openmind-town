/**
 * Openmind 不設限的慢熟小鎮｜Google 試算表後台
 *
 * 使用方式（只要做一次）：
 * 1. 在 script.google.com 建立專案，把這整段程式貼上、存檔（SHEET_ID 填後台試算表的 ID）。
 * 2. 上方函式選單選「setup」，按「執行」，依畫面允許權限。
 *    → 會自動建立「打氣牆留言」和「造訪統計」兩個分頁。
 * 3. 右上角「部署 → 新增部署作業」，類型選「網頁應用程式」：
 *      執行身分：我
 *      誰可以存取：所有人
 *    部署後複製「網頁應用程式網址」（https://script.google.com/macros/s/.../exec），交給 Claude。
 *
 * 日常使用：
 * - 訪客在打氣小站送出的留言，會出現在「打氣牆留言」分頁。
 * - 想放上打氣牆，就把那一列「上牆」打勾；取消勾選就會從牆上拿掉。
 * - 「腳印」欄是大家蓋腳印的總數，「造訪統計」是每棟房子被打開的總次數。
 */

/** 後台試算表的 ID（網址 /d/ 後面那一串） */
const SHEET_ID = '1PmUGmcuyueZeqS9on-iKwOQSDSVghVWLbneadP5j5Eg';
const book = () => SpreadsheetApp.openById(SHEET_ID);

const WALL_SHEET = '打氣牆留言';
const STAT_SHEET = '造訪統計';
const WALL_HEADERS = ['時間', '留言', '暱稱', '同意刊登', '上牆', '腳印', '編號', '來源'];
const BUILDINGS = {
  post: '祝福郵局', roast: '烘豆小屋', market: '市集廣場', library: '慢讀文章館',
  office: '慢熟生活所', reading: '閱讀共鳴屋', cheer: '打氣小站',
};
const MAX_TEXT = 80, MAX_NAME = 10;

/** 第一次使用：建立分頁、標題、打勾框 */
function setup() {
  const ss = book();
  let ws = ss.getSheetByName(WALL_SHEET) || ss.insertSheet(WALL_SHEET);
  if (ws.getLastRow() === 0) ws.appendRow(WALL_HEADERS);
  ws.setFrozenRows(1);
  ws.getRange(1, 1, 1, WALL_HEADERS.length).setFontWeight('bold').setBackground('#F3EADB');
  ws.setColumnWidth(2, 360); ws.setColumnWidth(1, 150);
  ws.getRange('B:B').setWrap(true);

  let st = ss.getSheetByName(STAT_SHEET) || ss.insertSheet(STAT_SHEET);
  if (st.getLastRow() === 0) {
    st.appendRow(['代號', '建築', '造訪次數']);
    Object.keys(BUILDINGS).forEach(k => st.appendRow([k, BUILDINGS[k], 0]));
  }
  st.setFrozenRows(1);
  st.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#F3EADB');

  // 歡迎留言（已上牆）
  if (ws.getLastRow() === 1) {
    ws.appendRow([new Date(), '歡迎來到打氣小站！累了就在這裡坐一下，看看大家的打氣，也留一句給自己或別人。', '吱吱', '是', true, 0, 'zz-001', '吱吱']);
    ws.getRange(ws.getLastRow(), 5).insertCheckboxes().setValue(true);
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'wall') return json({ ok: true, wall: getWall() });
  if (action === 'stats') return json({ ok: true, visits: getStats() });
  if (action === 'all') return json({ ok: true, wall: getWall(), visits: getStats() });
  return json({ ok: true, name: 'openmind-town' });
}

function doPost(e) {
  let d = {};
  try { d = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json({ ok: false, error: 'bad_json' }); }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(8000);
    if (d.action === 'submit') return json(submit(d));
    if (d.action === 'paw') return json(paw(d));
    if (d.action === 'visit') return json(visit(d));
    return json({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json({ ok: false, error: 'busy' });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function clean(s, max) {
  return String(s || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 訪客投稿：先進試算表，等吱吱勾選才上牆 */
function submit(d) {
  const text = clean(d.text, MAX_TEXT);
  const name = clean(d.name, MAX_NAME);
  if (!text) return { ok: false, error: 'empty' };
  if (d.website) return { ok: true }; // 防機器人欄位，真人不會填
  const ws = book().getSheetByName(WALL_SHEET);
  const id = 'm' + Utilities.getUuid().slice(0, 8);
  ws.appendRow([new Date(), text, name, d.agree ? '是' : '否', false, 0, id, 'web']);
  ws.getRange(ws.getLastRow(), 5).insertCheckboxes();
  return { ok: true, id: id };
}

/** 蓋腳印 / 收回腳印 */
function paw(d) {
  const ws = book().getSheetByName(WALL_SHEET);
  const ids = ws.getRange(2, 7, Math.max(ws.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(d.id)) {
      const cell = ws.getRange(i + 2, 6);
      const n = Math.max(0, (Number(cell.getValue()) || 0) + (d.delta < 0 ? -1 : 1));
      cell.setValue(n);
      return { ok: true, paws: n };
    }
  }
  return { ok: false, error: 'not_found' };
}

/** 房子被打開一次 */
function visit(d) {
  const st = book().getSheetByName(STAT_SHEET);
  const rows = st.getRange(2, 1, Math.max(st.getLastRow() - 1, 1), 3).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === d.id) {
      const n = (Number(rows[i][2]) || 0) + 1;
      st.getRange(i + 2, 3).setValue(n);
      return { ok: true, visits: n };
    }
  }
  if (BUILDINGS[d.id]) { st.appendRow([d.id, BUILDINGS[d.id], 1]); return { ok: true, visits: 1 }; }
  return { ok: false, error: 'unknown_building' };
}

/** 已勾選上牆的留言（最新的在前，最多 100 則） */
function getWall() {
  const ws = book().getSheetByName(WALL_SHEET);
  if (!ws || ws.getLastRow() < 2) return [];
  const rows = ws.getRange(2, 1, ws.getLastRow() - 1, WALL_HEADERS.length).getValues();
  const tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  return rows
    .filter(r => r[4] === true && String(r[1]).trim())
    .map(r => ({
      id: String(r[6]),
      text: String(r[1]),
      from: String(r[2] || '匿名'),
      date: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]).slice(0, 10),
      paws: Number(r[5]) || 0,
    }))
    .reverse()
    .slice(0, 100);
}

function getStats() {
  const st = book().getSheetByName(STAT_SHEET);
  const out = {};
  if (!st || st.getLastRow() < 2) return out;
  st.getRange(2, 1, st.getLastRow() - 1, 3).getValues().forEach(r => { if (r[0]) out[r[0]] = Number(r[2]) || 0; });
  return out;
}

/** 整理：拿掉多餘的空白打勾框，補上歡迎留言（執行一次即可） */
function fixRows() {
  const ws = book().getSheetByName(WALL_SHEET);
  const max = ws.getMaxRows();
  const colB = ws.getRange(1, 2, max, 1).getValues();
  let last = 1;
  for (let i = 0; i < colB.length; i++) if (String(colB[i][0]).trim()) last = i + 1;
  if (max > last) ws.getRange(last + 1, 5, max - last, 1).removeCheckboxes();
  const ids = last > 1 ? ws.getRange(2, 7, last - 1, 1).getValues().map(r => r[0]) : [];
  if (ids.indexOf('zz-001') < 0) {
    ws.getRange(last + 1, 1, 1, 8).setValues([[new Date(), '歡迎來到打氣小站！累了就在這裡坐一下，看看大家的打氣，也留一句給自己或別人。', '吱吱', '是', true, 0, 'zz-001', '吱吱']]);
    ws.getRange(last + 1, 5).insertCheckboxes().setValue(true);
  }
}

/** 整理：刪掉中間空白的列，讓留言從第 2 列開始排（執行一次即可） */
function compactRows() {
  const ws = book().getSheetByName(WALL_SHEET);
  const last = ws.getLastRow();
  if (last < 2) return;
  const colB = ws.getRange(2, 2, last - 1, 1).getValues();
  for (let i = colB.length - 1; i >= 0; i--) {
    if (!String(colB[i][0]).trim()) {
      let j = i; while (j > 0 && !String(colB[j - 1][0]).trim()) j--;
      ws.deleteRows(j + 2, i - j + 1); i = j;
    }
  }
  const max = ws.getMaxRows(), lr = ws.getLastRow();
  if (max > lr) ws.getRange(lr + 1, 5, max - lr, 1).removeCheckboxes();
}
