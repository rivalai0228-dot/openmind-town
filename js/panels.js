/* 每棟房子打開後的內容。html() 產生畫面，bind() 綁定按鈕。 */
import { CHEER_FORM_URL, CHEER_WALL, LINE_OA_ID, TODAY_DEAL, TODAY_BEAN, PREORDER, BAG_NOTE_ENABLED, CARDS, SW_CARDS, FLAVORS, PRICES, MARKETS, MARKET_CODE, TOPICS, BOOKS, SERVICES, STAMPS } from './config.js';
import { apiOn, remote, refresh, sendPaw, submitCheer } from './api.js';
import { $, $$, esc, escBr, save, persist, addStamp, stampCount, ensureCode, lineLink, copyText } from './store.js';
import { buildings, teleportTo } from './world.js';

let drawn = null; // 目前抽到的祝福卡 {deck, i}（關掉面板再打開還會在）
const DECKS = { all: () => CARDS, sw: () => SW_CARDS };
const curCard = () => DECKS[drawn.deck]()[drawn.i];

/* 今日優惠菜單（小黑板） */
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
function showDeal() {
  closeDeal();
  const D = TODAY_DEAL, d = new Date();
  const el = document.createElement('div');
  el.id = 'dealPop';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'dealTitle');
  el.innerHTML = `
    <div class="deal-board">
      <div class="deal-head">
        <div><p class="deal-date">${d.getMonth() + 1}/${d.getDate()}　TODAY</p><h3 id="dealTitle" class="wk">${esc(D.title)}</h3></div>
        <img src="img/zz_break.png" alt="">
      </div>
      <ul class="deal-list">${D.items.map(([n, p, s, sub]) => `
        <li><span class="deal-name">${esc(n)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="deal-dots" aria-hidden="true"></span>${s
          ? `<span><s aria-label="原價 ${esc(p)} 元">${esc(p)}</s> <b class="wk">${esc(s)}</b></span>`
          : `<b class="wk">${esc(p)}</b>`}</li>`).join('')}
      </ul>
      ${D.perks.length ? `<div class="deal-perks">${D.perks.map(x => `<p>☕ ${esc(x)}</p>`).join('')}</div>` : ''}
      ${D.note ? `<p class="deal-note">${esc(D.note)}</p>` : ''}
      <button class="btn deal-ok" id="dealOk">看好了，選這包要給誰</button>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) closeDeal(); });
  $('#dealOk').onclick = closeDeal;
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => $('#dealOk')?.focus(), 60);
  save.dealSeen = todayKey(); persist();
}


/* 祝福圖卡：把卡片畫成一張 1080×1350 的圖片 */
let lastBlob = null;
let _dl;
function claudeDownloads() {
  if (_dl !== undefined) return Promise.resolve(_dl);
  try {
    if (!window.claude || !window.claude.use) return Promise.resolve(_dl = null);
    return Promise.race([window.claude.use('downloads'), new Promise(r => setTimeout(() => r(null), 4000))])
      .then(d => (_dl = d || null)).catch(() => (_dl = null));
  } catch (e) { return Promise.resolve(_dl = null); }
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const ch of [...para]) {
      if (ctx.measureText(cur + ch).width > maxW && cur) {
        // 標點不放行首
        if ('，。、！？；：」）'.includes(ch)) { cur += ch; continue; }
        out.push(cur); cur = ch;
      } else cur += ch;
    }
    out.push(cur);
  }
  return out;
}
async function makeCardImage(to, line, name, msg, sw) {
  try { await Promise.all([document.fonts.load('700 70px "LXGW WenKai TC"'), document.fonts.load('500 30px "Noto Sans TC"')]); } catch (e) {}
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const WK = '"LXGW WenKai TC", serif', NS = '"Noto Sans TC", sans-serif';
  // 背景與裁切虛線
  x.fillStyle = '#F3EADB'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#FBF7F0'; x.beginPath(); x.roundRect ? x.roundRect(60, 60, W - 120, H - 120, 40) : x.rect(60, 60, W - 120, H - 120); x.fill();
  x.setLineDash([16, 12]); x.lineWidth = 4; x.strokeStyle = '#B9AFA4'; x.stroke(); x.setLineDash([]);
  // 送給
  x.textBaseline = 'top';
  let tx = 130;
  if (sw) {
    x.font = `700 30px ${NS}`; const tw = x.measureText('社工專屬').width + 36;
    x.fillStyle = '#6E8063'; x.beginPath(); x.roundRect ? x.roundRect(130, 136, tw, 50, 25) : x.rect(130, 136, tw, 50); x.fill();
    x.fillStyle = '#FFFFFF'; x.fillText('社工專屬', 148, 145); tx = 130 + tw + 18;
  }
  x.fillStyle = '#8E5A40'; x.font = `500 38px ${NS}`;
  x.fillText(`送給・${name || to}`, tx, 140);
  // 小咖啡杯
  x.strokeStyle = '#6B5444'; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(820, 168); x.lineTo(900, 168); x.lineTo(900, 200); x.quadraticCurveTo(900, 236, 862, 236); x.quadraticCurveTo(820, 236, 820, 200); x.closePath(); x.stroke();
  x.beginPath(); x.moveTo(900, 178); x.quadraticCurveTo(930, 178, 930, 196); x.quadraticCurveTo(930, 214, 900, 214); x.stroke();
  for (const sx of [845, 875]) { x.beginPath(); x.moveTo(sx, 152); x.bezierCurveTo(sx - 12, 140, sx + 12, 128, sx, 114); x.stroke(); }
  // 祝福主句
  x.font = `700 72px ${WK}`;
  const lines = wrapLines(x, line, W - 260);
  x.font = `400 44px ${WK}`;
  const mlines = msg ? wrapLines(x, msg, W - 260) : [];
  const blockH = lines.length * 112 + (mlines.length ? 40 + mlines.length * 66 : 0);
  let y = Math.max(260, 270 + (500 - blockH) / 2);
  x.fillStyle = '#3F322A'; x.font = `700 72px ${WK}`;
  for (const l of lines) { x.fillText(l, 130, y); y += 112; }
  // 想多說的話
  if (mlines.length) {
    y += 40; x.font = `400 44px ${WK}`; x.fillStyle = '#5E4E43';
    for (const l of mlines) { x.fillText(l, 130, y); y += 66; }
  }
  // 吱吱貼圖
  try { const im = await loadImg('img/zz_break.png'); const h = 250, w = h * im.width / im.height; x.drawImage(im, W - 120 - w, H - 300 - h, w, h); } catch (e) {}
  // 品牌 LOGO（放在白色名牌上）
  x.strokeStyle = '#D9C7AE'; x.lineWidth = 3; x.setLineDash([10, 10]); x.beginPath(); x.moveTo(130, H - 300); x.lineTo(W - 130, H - 300); x.stroke(); x.setLineDash([]);
  try { const lg = await loadImg('img/logo.png'); const lh = 170, lw = Math.min(W - 260, lh * lg.width / lg.height), lh2 = lw * lg.height / lg.width; x.drawImage(lg, (W - lw) / 2, H - 290 + (190 - lh2) / 2, lw, lh2); }
  catch (e) { x.fillStyle = '#6F6056'; x.font = `500 34px ${NS}`; x.fillText('不設限慢熟生活所｜Care & Brew', 140, H - 215); }
  const dataUrl = c.toDataURL('image/jpeg', 0.92);
  const blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/jpeg', 0.92));
  return { blob, dataUrl };
}


/* 集章完成卡：1080×1350 圖片 */
async function makePassImage(code) {
  try { await Promise.all([document.fonts.load('700 70px "LXGW WenKai TC"'), document.fonts.load('700 30px "Noto Sans TC"')]); } catch (e) {}
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.textBaseline = 'top';
  const WK = '"LXGW WenKai TC", serif', NS = '"Noto Sans TC", sans-serif';
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.roundRect ? x.roundRect(X, Y, w, h, r) : x.rect(X, Y, w, h); };
  x.fillStyle = '#F3EADB'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#FBF7F0'; rr(60, 60, W - 120, H - 120, 40); x.fill();
  x.setLineDash([16, 12]); x.lineWidth = 4; x.strokeStyle = '#B9AFA4'; x.stroke(); x.setLineDash([]);
  const d = new Date();
  x.fillStyle = '#6E8063'; x.font = `700 30px ${NS}`; x.fillText(`OPENMIND 不設限的慢熟小鎮　${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`, 130, 130);
  x.fillStyle = '#3F322A'; x.font = `700 92px ${WK}`; x.fillText('集章護照 完成！', 130, 190);
  // 五個章
  const n = STAMPS.length, size = 150, gap = (W - 260 - n * size) / (n - 1);
  STAMPS.forEach(([, t], i) => {
    const cx = 130 + i * (size + gap) + size / 2, cy = 420;
    x.save(); x.translate(cx, cy); x.rotate(-0.14 + (i % 2) * 0.1);
    x.fillStyle = '#F6E3D7'; x.beginPath(); x.arc(0, 0, size / 2, 0, Math.PI * 2); x.fill();
    x.lineWidth = 6; x.strokeStyle = '#B4704E'; x.stroke();
    x.fillStyle = '#7A4127'; x.font = `700 30px ${NS}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(t, 0, 0); x.restore();
  });
  x.textAlign = 'left'; x.textBaseline = 'top';
  // 兌換碼
  x.fillStyle = '#FFFFFF'; rr(130, 540, W - 260, 220, 28); x.fill(); x.lineWidth = 4; x.strokeStyle = '#B4704E'; x.stroke();
  x.fillStyle = '#7A4127'; x.font = `500 34px ${NS}`; x.fillText('兌換碼', 170, 572);
  x.fillStyle = '#3F322A'; x.font = `700 110px ${WK}`; x.fillText(code, 170, 620);
  x.fillStyle = '#3F322A'; x.font = `500 38px ${NS}`;
  x.fillText('下次購買時，', 130, 805);
  x.fillText('寄送一包濾掛咖啡給你。', 130, 860);
  try { const im = await loadImg('img/zz_happy.png'); const h = 260, w = h * im.width / im.height; x.drawImage(im, W - 120 - w, 770, w, h); } catch (e) {}
  x.strokeStyle = '#D9C7AE'; x.lineWidth = 3; x.setLineDash([10, 10]); x.beginPath(); x.moveTo(130, H - 300); x.lineTo(W - 130, H - 300); x.stroke(); x.setLineDash([]);
  try { const lg = await loadImg('img/logo.png'); const lh = 170, lw = Math.min(W - 260, lh * lg.width / lg.height), lh2 = lw * lg.height / lg.width; x.drawImage(lg, (W - lw) / 2, H - 290 + (190 - lh2) / 2, lw, lh2); } catch (e) {}
  const dataUrl = c.toDataURL('image/jpeg', 0.92);
  const blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/jpeg', 0.92));
  return { blob, dataUrl };
}

/* 本次市集互動：這包濾掛要給誰？ */
function bagRender(step) {
  const box = $('#bagBox'); if (!box) return;
  const n = save.bagNote;
  if (!step && n) step = 'done';
  if (!step) step = 'choose';
  if (step === 'choose') {
    box.innerHTML = `
      <div class="bag-choice">
        <button class="bag-btn" data-go="self"><b class="wk">自己喝</b><span>留一句最近的心情，吱吱寫在濾掛上回你</span></button>
        <button class="bag-btn" data-go="share"><b class="wk">分享出去</b><span>自己親筆寫，或請吱吱幫你寫</span></button>
      </div>`;
  } else if (step === 'self') {
    box.innerHTML = `
      <form id="bagForm" class="stack">
        <label>最近的心情或狀態，留一句給吱吱<textarea id="bagMood" maxlength="60" rows="3" placeholder="例如：最近照顧家人有點累，想好好睡一覺" required></textarea></label>
        <label>怎麼稱呼你？（可不填）<input type="text" id="bagName" maxlength="12" autocomplete="off" placeholder="例如：小芳"></label>
        <p class="muted">吱吱會依照你的留言，在你買的濾掛上寫一句話給你。請不要留電話、地址這類資料。</p>
        <div class="row"><button class="btn" type="submit">交給吱吱</button><button class="btn light" type="button" data-go="choose">上一步</button></div>
      </form>`;
    $('#bagForm').onsubmit = e => {
      e.preventDefault();
      const mood = $('#bagMood').value.trim(); if (!mood) return;
      bagSave({ type: 'self', mood, name: $('#bagName').value.trim() });
    };
  } else if (step === 'share') {
    box.innerHTML = `
      <div class="bag-choice">
        <button class="bag-btn" data-go="hand"><b class="wk">我自己親筆寫</b><span>攤位上有空白祝福小卡</span></button>
        <button class="bag-btn" data-go="ask"><b class="wk">請吱吱幫我寫</b><span>告訴吱吱送給誰、他最近怎麼樣</span></button>
      </div>
      <button class="btn light" data-go="choose">上一步</button>`;
  } else if (step === 'hand') {
    box.innerHTML = `
      <div class="rec flip"><p class="wk mid">親筆寫最有溫度</p>
      <p>結帳時跟吱吱說「我要自己寫」，就會拿到一張空白祝福小卡。不知道怎麼下筆？可以先去祝福郵局抽一張找靈感。</p></div>
      <div class="row"><button class="btn" id="toPost">去祝福郵局抽靈感</button><button class="btn light" data-go="share">上一步</button></div>`;
    $('#toPost').onclick = () => _open && _open('post');
  } else if (step === 'ask') {
    box.innerHTML = `
      <form id="bagForm" class="stack">
        <label>想送給誰？<input type="text" id="bagTo" maxlength="20" autocomplete="off" placeholder="例如：剛升主管的同事" required></label>
        <label>他最近的狀態<textarea id="bagState" maxlength="60" rows="3" placeholder="例如：最近很忙，常常忘記吃飯" required></textarea></label>
        <label>你的稱呼（可不填）<input type="text" id="bagName" maxlength="12" autocomplete="off" placeholder="寫在小卡的「From」"></label>
        <div class="row"><button class="btn" type="submit">請吱吱幫我寫</button><button class="btn light" type="button" data-go="share">上一步</button></div>
      </form>`;
    $('#bagForm').onsubmit = e => {
      e.preventDefault();
      const to = $('#bagTo').value.trim(), state = $('#bagState').value.trim(); if (!to || !state) return;
      bagSave({ type: 'ask', to, state, name: $('#bagName').value.trim() });
    };
  } else if (step === 'done') {
    const lines = n.type === 'self'
      ? `<p><b>自己喝</b>${n.name ? `・${esc(n.name)}` : ''}</p><p>「${esc(n.mood)}」</p>`
      : `<p><b>請吱吱代寫</b>・送給 ${esc(n.to)}${n.name ? `（From ${esc(n.name)}）` : ''}</p><p>「${esc(n.state)}」</p>`;
    const msg = n.type === 'self'
      ? `留言單 No.${n.no}\n自己喝${n.name ? '・' + n.name : ''}\n最近的心情：${n.mood}`
      : `留言單 No.${n.no}\n請吱吱代寫・送給${n.to}${n.name ? '（From ' + n.name + '）' : ''}\n他最近的狀態：${n.state}`;
    box.innerHTML = `
      <div class="bag-ticket flip">
        <p class="bag-no">留言單 <b class="wk">No.${esc(n.no)}</b></p>
        ${lines}
        <p class="muted">結帳時把這個畫面給吱吱看，她會把話寫在你的濾掛上。</p>
      </div>
      <div class="row"><a class="btn" href="https://line.me/R/oaMessage/${encodeURIComponent(LINE_OA_ID)}/?${encodeURIComponent(msg)}" target="_blank" rel="noopener">也用 LINE 傳給吱吱</a><button class="btn light" id="bagNew">重新填一張</button></div>
      <p class="muted">按下後會打開吱吱的 LINE 官方帳號，留言已經幫你填好，按送出就可以。</p>`;
    $('#bagNew').onclick = () => { save.bagNote = null; persist(); bagRender('choose'); };
  }
  box.querySelectorAll('[data-go]').forEach(b => b.onclick = () => bagRender(b.dataset.go));
}
function bagSave(o) {
  o.no = String(100 + Math.floor(Math.random() * 900));
  o.at = Date.now();
  save.bagNote = o; persist();
  bagRender('done');
}
let _open = null;

function closeDeal() { document.getElementById('dealPop')?.remove(); }
addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('dealPop')) { e.stopImmediatePropagation(); closeDeal(); } }, true);

export function makePanels({ openPanel }) {
  _open = openPanel;
  return {
    /* ---------- 祝福郵局 ---------- */
    post: {
      title: '祝福郵局',
      html: () => `
        <div class="guide"><img src="img/zz_ok.png" alt=""><p>今天想把這杯咖啡，送給誰呢？先抽一張看看。</p></div>
        <div id="cardBox" aria-live="polite"></div>
        <div class="row draw-row">
          <button class="btn" id="drawBtn">抽一張祝福</button>
          <button class="btn sw" id="swBtn">抽社工專屬祝福</button>
        </div>
        <div id="writeBox" class="stack" hidden>
          <label>想送給誰？<input type="text" id="toName" maxlength="20" placeholder="例如：媽媽" autocomplete="off"></label>
          <label>想多說一句話（可不填）<input type="text" id="toMsg" maxlength="40" placeholder="例如：週末一起喝咖啡吧" autocomplete="off"></label>
          <button class="btn" id="imgBtn">做成祝福圖卡</button>
          <div id="imgBox" class="stack" aria-live="polite"></div>
          <div class="row">
            <a class="btn light" id="shareLine" href="#" target="_blank" rel="noopener">只傳文字到 LINE</a>
            <button class="btn light" id="copyBtn">複製祝福文字</button>
          </div>
          <p class="muted" id="copyMsg" aria-live="polite"></p>
        </div>`,
      bind() {
        const text = () => {
          const [, line] = curCard();
          const name = $('#toName').value.trim(), msg = $('#toMsg').value.trim();
          return `${name ? name + '，' : ''}送你一張祝福：\n${line.replace(/\n/g, '')}${msg ? '\n' + msg : ''}\n— 來自 Openmind 不設限的慢熟小鎮`;
        };
        const updateShare = () => { $('#shareLine').href = 'https://line.me/R/share?text=' + encodeURIComponent(text()); };
        const show = (animate) => {
          const [to, line] = curCard();
          $('#cardBox').innerHTML = `
            <div class="card${animate ? ' flip' : ''}">
              <span class="to">${drawn.deck === 'sw' ? '<em class="sw-tag">社工專屬</em>' : ''}送給・${esc(to)}</span>
              <span class="line wk">${escBr(line)}</span>
              <span class="brand">Openmind 不設限的慢熟小鎮｜Care &amp; Brew</span>
            </div>`;
          $('#writeBox').hidden = false;
          $('#drawBtn').textContent = '再抽一張';
          $('#swBtn').textContent = '再抽社工專屬';
          updateShare();
        };
        $('#drawBtn').onclick = () => {
          let n;
          do { n = Math.floor(Math.random() * CARDS.length); } while (drawn && drawn.deck === 'all' && n === drawn.i && CARDS.length > 1);
          drawn = { deck: 'all', i: n }; show(true); addStamp('draw');
        };
        $('#swBtn').onclick = () => {
          let n;
          do { n = Math.floor(Math.random() * SW_CARDS.length); } while (drawn && drawn.deck === 'sw' && n === drawn.i && SW_CARDS.length > 1);
          drawn = { deck: 'sw', i: n }; show(true); addStamp('draw');
        };
        $('#toName').oninput = updateShare;
        $('#toMsg').oninput = updateShare;
        $('#shareLine').onclick = () => addStamp('write');
        $('#imgBtn').onclick = async () => {
          const [to, line] = curCard();
          $('#imgBtn').disabled = true; $('#imgBtn').textContent = '製作中…';
          try {
            const { blob, dataUrl } = await makeCardImage(to, line, $('#toName').value.trim(), $('#toMsg').value.trim(), drawn.deck === 'sw');
            lastBlob = blob;
            $('#imgBox').innerHTML = `
              <img class="card-img" src="${dataUrl}" alt="祝福圖卡：送給${esc(to)}">
              <div class="how-share">
                <p><b>把圖片傳給朋友</b></p>
                <p>① 用手指<b>長按上面的圖片</b></p>
                <p>② iPhone 選「分享」或「儲存到照片」；Android 選「下載圖片」或「分享圖片」</p>
                <p>③ 打開 LINE，選朋友，從相簿傳出這張圖</p>
              </div>
              <button class="btn" id="saveImg" hidden>下載這張圖卡</button>`;
            addStamp('write');
            setTimeout(() => $('#imgBox .card-img')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
            const dl = await claudeDownloads();
            if (dl) {
              $('#saveImg').hidden = false;
              $('#saveImg').onclick = async () => {
                try { await dl.save({ filename: '慢熟小鎮祝福卡.jpg', data: lastBlob }); }
                catch (err) { if (err && err.code !== 'declined') $('#saveImg').textContent = '這裡沒辦法儲存，請長按圖片'; }
              };
            }
          } catch (e) {
            $('#imgBox').innerHTML = `<p class="muted">圖卡做不出來，請改用下面的「只傳文字到 LINE」。</p>`;
          }
          $('#imgBtn').disabled = false; $('#imgBtn').textContent = '重新做一張圖卡';
        };
        $('#copyBtn').onclick = async () => {
          if (await copyText(text())) { $('#copyMsg').textContent = '已複製，可以貼給對方了。'; addStamp('write'); }
          else $('#copyMsg').textContent = '這裡沒辦法複製，請改用「用 LINE 傳給他」。';
        };
        if (drawn !== null) show(false);
      },
    },

    /* ---------- 烘豆小屋 ---------- */
    roast: {
      title: '烘豆小屋',
      html: () => `
        ${TODAY_DEAL.enabled ? `<button class="btn light deal-open" id="dealBtn">今日優惠菜單</button>` : ''}
        ${BAG_NOTE_ENABLED ? `
        <section class="bag" aria-labelledby="bagT">
          <h3 id="bagT" class="wk">這包濾掛，要給誰？</h3>
          <div id="bagBox"></div>
        </section>` : ''}
        <p>用心情溫度計選一下，今天的你大概幾分？</p>
        <input type="range" id="mood" min="1" max="10" value="5" aria-label="心情溫度計，1 有點累，10 很有精神">
        <div class="thermo"><span>1 有點累</span><span id="moodVal" class="wk">5</span><span>10 很有精神</span></div>
        <button class="btn" id="moodBtn">幫我選一杯</button>
        <div id="rec" aria-live="polite"></div>
        <section class="bag order" aria-labelledby="ordT">
          <h3 id="ordT" class="wk">預訂・寄送</h3>
          <div class="plan-card">
            <p class="plan-tag">吱吱推薦方案</p>
            <p class="wk plan-title">${esc(PREORDER.plan.title)}</p>
            <p class="plan-price"><b class="wk">${PREORDER.plan.price.toLocaleString()}</b> 元</p>
            <p>${esc(PREORDER.plan.desc)}</p>
          </div>
          <fieldset class="seg"><legend>你是？</legend>
            <label><input type="radio" name="who" value="market" checked> 市集好友（享市集價）</label>
            <label><input type="radio" name="who" value="regular"> 一般預訂</label>
          </fieldset>
          <div class="ord-items">${PREORDER.items.map(it => `
            <div class="ord-row" data-id="${it.id}">
              <div class="ord-name"><b>${esc(it.name)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}<span class="ord-price" data-id="${it.id}"></span></div>
              <div class="qty"><button type="button" class="q-minus" aria-label="${esc(it.name)} 減一">－</button><output class="q-n" aria-live="polite">0</output><button type="button" class="q-plus" aria-label="${esc(it.name)} 加一">＋</button></div>
            </div>`).join('')}
          </div>
          <fieldset class="seg"><legend>怎麼拿？</legend>
            ${PREORDER.pickup.map((p, i) => `<label><input type="radio" name="pick" value="${esc(p)}" ${i ? '' : 'checked'}> ${esc(p)}</label>`).join('')}
          </fieldset>
          <label>想說的話或指定（可不填）<input type="text" id="ordNote" maxlength="40" autocomplete="off" placeholder="例如：要附給媽媽的祝福小卡"></label>
          <p class="ord-total">商品小計 <b class="wk" id="ordSum">0</b> 元<span id="ordShip">，運費另計</span></p>
          <a class="btn" id="ordSend" href="#" target="_blank" rel="noopener">用 LINE 傳預訂單給吱吱</a>
          <p class="muted" id="ordMsg" aria-live="polite">吱吱收到後，會在 LINE 回覆總金額、運費和付款方式；收件資料到時再私訊就好。</p>
        </section>
        <p class="muted">心情分數只拿來推薦咖啡，不會被記錄。</p>`,
      bind() {
        if (TODAY_DEAL.enabled) {
          $('#dealBtn').onclick = showDeal;
          if (save.dealSeen !== todayKey()) setTimeout(showDeal, 350);
        }
        if (BAG_NOTE_ENABLED) bagRender();
        /* 預訂・寄送 */
        const qty = {}; PREORDER.items.forEach(it => (qty[it.id] = 0));
        const who = () => (document.querySelector('input[name=who]:checked') || {}).value || 'market';
        const pick = () => (document.querySelector('input[name=pick]:checked') || {}).value || PREORDER.pickup[0];
        const ordUpd = () => {
          const w = who(); let sum = 0; const lines = [];
          PREORDER.items.forEach(it => {
            const p = w === 'market' ? it.market : it.regular;
            const el = document.querySelector(`.ord-price[data-id="${it.id}"]`);
            el.textContent = `${p.toLocaleString()} 元`;
            document.querySelector(`.ord-row[data-id="${it.id}"] .q-n`).textContent = qty[it.id];
            if (qty[it.id]) { sum += p * qty[it.id]; lines.push(`・${it.name} × ${qty[it.id]}（${(p * qty[it.id]).toLocaleString()} 元）`); }
          });
          $('#ordSum').textContent = sum.toLocaleString();
          const ship = pick().includes('宅配');
          $('#ordShip').textContent = ship ? '，運費另計' : '';
          const note = $('#ordNote').value.trim();
          const msg = `【預訂單】${w === 'market' ? '市集好友' : '一般預訂'}\n${lines.join('\n')}\n商品小計：${sum.toLocaleString()} 元${ship ? '（運費另計）' : ''}\n取貨方式：${pick().replace('（運費另計）', '')}${note ? '\n備註：' + note : ''}`;
          $('#ordSend').href = `https://line.me/R/oaMessage/${encodeURIComponent(LINE_OA_ID)}/?${encodeURIComponent(msg)}`;
          return sum;
        };
        $$('.ord-row').forEach(row => {
          const id = row.dataset.id;
          row.querySelector('.q-plus').onclick = () => { qty[id] = Math.min(20, qty[id] + 1); ordUpd(); };
          row.querySelector('.q-minus').onclick = () => { qty[id] = Math.max(0, qty[id] - 1); ordUpd(); };
        });
        $$('input[name=who], input[name=pick]').forEach(r => (r.onchange = ordUpd));
        $('#ordNote').oninput = ordUpd;
        $('#ordSend').onclick = e => { if (!ordUpd()) { e.preventDefault(); $('#ordMsg').textContent = '先選要預訂的品項和數量喔。'; } else $('#ordMsg').textContent = '謝謝你！吱吱會在 LINE 回覆總金額、運費和付款方式。'; };
        ordUpd();
        $('#mood').oninput = e => ($('#moodVal').textContent = e.target.value);
        $('#moodBtn').onclick = () => {
          const v = +$('#mood').value;
          const B = TODAY_BEAN, m = v <= 3 ? B.moods.low : v <= 7 ? B.moods.mid : B.moods.high;
          $('#rec').innerHTML = `<div class="rec flip bean">
            <p class="muted">今天的你，適合</p>
            <p class="wk big">${esc(B.name)}</p>
            <div class="bean-notes">${B.notes.map(n => `<span class="${n === m.note ? 'on' : ''}">${esc(n)}</span>`).join('')}</div>
            <p class="bean-line wk">${esc(m.line)}</p>
            <p class="muted">${esc(B.desc)}</p>
          </div>`;
          addStamp('mood');
        };
      },
    },

    /* ---------- 市集廣場 ---------- */
    market: {
      title: '市集廣場',
      html: () => `
        ${MARKETS.map(m => `<div class="rec"><p class="wk mid">${esc(m.date)}　${esc(m.time)}</p><p>${esc(m.place)}</p><p class="muted">${esc(m.note)}</p></div>`).join('')}
        ${save.stamps.market
          ? `<p class="ok">✓ 已經蓋過市集章了，謝謝你來！</p>`
          : `<p>來到攤位，找找立牌上的「現場暗號」，輸入就能蓋章。</p>
             <form id="codeForm" class="stack">
               <label>現場暗號<input type="text" id="code" maxlength="10" placeholder="輸入暗號" autocomplete="off"></label>
               <button class="btn" type="submit">蓋章</button>
             </form>
             <p class="muted" id="codeMsg" aria-live="polite"></p>`}`,
      bind() {
        const form = $('#codeForm');
        if (!form) return;
        const norm = s => s.normalize('NFKC').trim().toLowerCase();
        form.onsubmit = e => {
          e.preventDefault();
          if (norm($('#code').value) === norm(MARKET_CODE)) {
            $('#codeMsg').textContent = '答對了，謝謝你來市集！';
            addStamp('market');
          } else {
            $('#codeMsg').textContent = '好像不太對，再看一下攤位上的立牌。';
          }
        };
      },
    },

    /* ---------- 慢讀文章館 ---------- */
    library: {
      title: '慢讀文章館',
      html: () => `
        <p class="muted">吱吱社工師的觀察筆記，一杯咖啡的時間就能讀完。</p>
        <div class="shelves">${TOPICS.map(([t, c], i) => `<button class="shelf" data-i="${i}"><i style="background:${esc(c)}"></i>${esc(t)}</button>`).join('')}</div>
        <div id="shelfMsg" aria-live="polite"></div>`,
      bind() {
        $$('.shelf').forEach(el => (el.onclick = () => {
          const [t, , url] = TOPICS[+el.dataset.i];
          $$('.shelf').forEach(x => x.classList.toggle('picked', x === el));
          $('#shelfMsg').innerHTML = `<div class="rec flip"><p class="wk mid">${esc(t)}</p>${
            url
              ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">去讀文章</a>`
              : `<p class="muted">這個書架的文章正在整理中，很快就會上架。</p>`
          }</div>`;
        }));
      },
    },

    /* ---------- 閱讀共鳴屋 ---------- */
    reading: {
      title: '閱讀共鳴屋',
      html: () => `
        <p class="muted">吱吱最近在讀的書，和讀完留在心裡的一句話。有共鳴就按一下。</p>
        ${BOOKS.map(b => `<div class="rec">
          <p class="wk mid">${esc(b.title)}</p>
          <p class="muted">${esc(b.author)}</p>
          <p class="gap">${esc(b.note)}</p>
          <div class="row gap"><button class="btn light like" data-id="${esc(b.id)}" aria-pressed="${save.likes[b.id] ? 'true' : 'false'}">${save.likes[b.id] ? '♥ 已有共鳴' : '♡ 我也有共鳴'}</button></div>
        </div>`).join('')}
        ${lineLink('推薦一本書給吱吱')}`,
      bind() {
        $$('.like').forEach(el => (el.onclick = () => {
          const id = el.dataset.id;
          save.likes[id] = !save.likes[id];
          if (!save.likes[id]) delete save.likes[id];
          persist();
          el.textContent = save.likes[id] ? '♥ 已有共鳴' : '♡ 我也有共鳴';
          el.setAttribute('aria-pressed', save.likes[id] ? 'true' : 'false');
        }));
      },
    },

    /* ---------- 打氣小站 ---------- */
    cheer: {
      title: '打氣小站',
      html: () => `
        <div class="guide"><img src="img/zz_break.png" alt=""><p>累了就在這裡坐一下。看看大家的打氣，有共鳴就蓋個腳印說「我懂」。</p></div>
        <p class="muted" id="wallInfo">吱吱精選打氣牆</p>
        <div class="wall" id="wallBox" aria-live="polite"></div>

        <form class="bag" id="cheerForm" aria-labelledby="cheerT">
          <h3 id="cheerT" class="wk">我也想留一句</h3>
          <label>想紓壓、想替誰加油，都可以寫在這裡<textarea id="cheerText" maxlength="80" rows="3" placeholder="例如：今天也辛苦了，晚餐記得吃熱的！"></textarea></label>
          <label>暱稱（會跟留言一起上牆，可不填）<input type="text" id="cheerName" maxlength="10" autocomplete="off" placeholder="例如：小芳"></label>
          <input type="text" id="cheerWeb" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
          <label class="check"><input type="checkbox" id="cheerOk"> 同意吱吱挑選後，把這段話用暱稱放上打氣牆</label>
          ${apiOn() ? `<button class="btn" type="submit" id="cheerSubmit">送出給吱吱</button>` : ''}
          <a class="btn ${apiOn() ? 'light' : ''}" id="cheerSend" href="#" target="_blank" rel="noopener">${apiOn() ? '改用 LINE 傳給吱吱' : '用 LINE 傳給吱吱'}</a>
          ${CHEER_FORM_URL ? `<a class="btn light" href="${esc(CHEER_FORM_URL)}" target="_blank" rel="noopener">不用 LINE，改用表單投稿</a>` : ''}
          <p class="muted" id="cheerMsg" aria-live="polite">吱吱看過後，會挑選放上打氣牆；請不要留下電話、地址或真實姓名。</p>
        </form>
        <p class="muted">如果你現在真的很辛苦，可以撥 1925 安心專線，24 小時都有人接。</p>`,
      bind() {
        const lastSeen = save.cheerSeen || 0;
        save.cheerSeen = Date.now(); persist();
        const colors = ['#FFF1C7', '#FCE1E1', '#E3F0F2', '#E7F1DC', '#FBE5D2'];
        const isNew = m => (Date.now() - new Date(m.date + 'T00:00:00+08:00').getTime()) < 7 * 864e5;
        const pawSvg = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><ellipse cx="6" cy="9" rx="2.2" ry="2.8"/><ellipse cx="10.5" cy="5.5" rx="2.2" ry="2.8"/><ellipse cx="15.5" cy="5.5" rx="2.2" ry="2.8"/><ellipse cx="19" cy="9.5" rx="2.1" ry="2.7"/><path d="M12.5 11c3 0 6 3.6 6 6.4 0 2-1.6 2.9-3.2 2.4-1.1-.3-1.9-.8-2.8-.8s-1.7.5-2.8.8C8.1 20.3 6.5 19.4 6.5 17.4 6.5 14.6 9.5 11 12.5 11z"/></svg>';
        const render = () => {
          const box = $('#wallBox'); if (!box) return;
          const list = apiOn() ? (remote.wall || null) : CHEER_WALL;
          if (!list) { box.innerHTML = '<p class="muted">打氣牆載入中…</p>'; return; }
          const fresh = list.filter(isNew).length;
          $('#wallInfo').innerHTML = `吱吱精選打氣牆${fresh ? `・本週新上牆 <b>${fresh}</b> 則` : ''}`;
          if (!list.length) { box.innerHTML = '<p class="muted">打氣牆還在等第一則留言。</p>'; return; }
          box.innerHTML = list.map((m, i) => {
            const on = !!save.paws[m.id];
            const nw = isNew(m) && new Date(m.date + 'T00:00:00+08:00').getTime() > lastSeen - 864e5;
            const cnt = apiOn() && typeof m.paws === 'number' ? `<b class="paw-n">${m.paws}</b>` : '';
            return `<article class="note" style="background:${colors[i % colors.length]};transform:rotate(${(i % 2 ? 1 : -1) * (0.6 + (i % 3) * 0.4)}deg)">
              ${nw ? '<span class="new">新</span>' : ''}
              <p class="wk">${esc(m.text)}</p>
              <div class="note-foot"><span>— ${esc(m.from || '匿名')}・${esc(String(m.date).slice(5).replace('-', '/'))}</span>
                <button type="button" class="paw ${on ? 'on' : ''}" data-id="${esc(m.id)}" aria-pressed="${on}" aria-label="${on ? '已蓋腳印' : '蓋腳印表示支持'}">${pawSvg}<span>${on ? '已蓋腳印' : '蓋腳印'}</span>${cnt}</button></div>
            </article>`;
          }).join('');
          $$('.paw').forEach(btn => btn.onclick = async () => {
            const id = btn.dataset.id, on = !save.paws[id];
            if (on) save.paws[id] = true; else delete save.paws[id];
            persist();
            btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on);
            btn.querySelector('span').textContent = on ? '已蓋腳印' : '蓋腳印';
            btn.setAttribute('aria-label', on ? '已蓋腳印' : '蓋腳印表示支持');
            const nEl = btn.querySelector('.paw-n');
            const m = (remote.wall || []).find(x => x.id === id);
            if (m && nEl) { m.paws = Math.max(0, (m.paws || 0) + (on ? 1 : -1)); nEl.textContent = m.paws; }
            const n = await sendPaw(id, on ? 1 : -1);
            if (n != null && m && nEl) { m.paws = n; nEl.textContent = n; }
          });
        };
        render();
        if (apiOn()) refresh().then(render);

        const upd = () => {
          const t = $('#cheerText').value.trim(), n = $('#cheerName').value.trim();
          const msg = `【打氣牆投稿】\n${t}\n— ${n || '匿名'}\n（同意以暱稱刊登）`;
          $('#cheerSend').href = `https://line.me/R/oaMessage/${encodeURIComponent(LINE_OA_ID)}/?${encodeURIComponent(msg)}`;
        };
        $('#cheerText').oninput = upd; $('#cheerName').oninput = upd; upd();
        const check = () => {
          if (!$('#cheerText').value.trim()) { $('#cheerMsg').textContent = '先寫一句話再送出喔。'; $('#cheerText').focus(); return false; }
          if (!$('#cheerOk').checked) { $('#cheerMsg').textContent = '請先勾選同意，吱吱才能放上打氣牆。'; return false; }
          return true;
        };
        $('#cheerSend').onclick = e => { if (!check()) { e.preventDefault(); return; } $('#cheerMsg').textContent = '謝謝你！吱吱看過後會挑選放上打氣牆。'; };
        $('#cheerForm').onsubmit = async e => {
          e.preventDefault();
          if (!apiOn() || !check()) return;
          const btn = $('#cheerSubmit'); btn.disabled = true; btn.textContent = '送出中…';
          const r = await submitCheer($('#cheerText').value.trim(), $('#cheerName').value.trim(), true, $('#cheerWeb').value);
          if (r && r.ok) {
            $('#cheerMsg').textContent = '送出了，謝謝你！吱吱看過後會挑選放上打氣牆。';
            $('#cheerText').value = ''; upd(); btn.textContent = '再留一句';
          } else {
            $('#cheerMsg').textContent = '現在送不出去，可以改用下面的 LINE 傳給吱吱。';
            btn.textContent = '再試一次';
          }
          btn.disabled = false;
        };
      },
    },

    /* ---------- 慢熟生活所 ---------- */
    office: {
      title: '慢熟生活所',
      html: () => `
        <div class="guide"><img src="img/zz_break.png" alt=""><p>這棟房子還在慢慢蓋。未來會是照顧者可以停下來喘口氣的地方。</p></div>
        <p><b>正在準備的服務</b></p>
        <ul class="list">${SERVICES.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        ${lineLink('想邀約講座或工作坊')}
        <p class="muted">若你正處在危機中，請直接撥打 <a href="tel:1925">1925 安心專線</a>或 <a href="tel:113">113 保護專線</a>。</p>`,
    },

    /* ---------- 快速前往 ---------- */
    go: {
      title: '快速前往',
      html: () => `
        <p class="muted">點一下就走到建築門口，直接進去逛。</p>
        <div class="shelves">${buildings.map(b => `<button class="shelf go" data-id="${b.id}">${save.visited[b.id] ? '<i class="seen" aria-label="逛過"></i>' : '<i></i>'}${esc(b.name)}</button>`).join('')}</div>`,
      bind() {
        $$('.go').forEach(el => (el.onclick = () => {
          const b = buildings.find(x => x.id === el.dataset.id);
          teleportTo(b);
          openPanel(b.id);
        }));
      },
    },

    /* ---------- 集章護照 ---------- */
    passport: {
      title: '集章護照',
      html: () => {
        const n = stampCount(), total = STAMPS.length, done = n === total;
        const visited = buildings.filter(b => save.visited[b.id]).length;
        return `
          <div class="stamps">${STAMPS.map(([k, t]) => `<div class="stamp ${save.stamps[k] ? 'on' : ''}" aria-label="${esc(t)}${save.stamps[k] ? '，已蓋章' : '，還沒蓋'}">${esc(t)}</div>`).join('')}</div>
          ${done
            ? `<div class="guide"><img src="img/zz_happy.png" alt=""><p>集滿了！謝謝你慢慢逛完小鎮。</p></div>
               <div class="rec"><p>兌換碼 <b class="wk big">${esc(ensureCode())}</b></p><p class="muted">把下面這張「集章完成卡」傳到吱吱的 LINE 官方帳號，下次購買時寄送一包濾掛咖啡。</p></div>
               <div id="passImg" class="stack" aria-live="polite"><p class="muted">完成卡製作中…</p></div>`
            : `<p>已集 ${n} / ${total} 個章。抽祝福、寫祝福、心情咖啡、市集暗號，再加上逛遍每一棟房子，就能集滿。</p>
               <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${buildings.length}" aria-valuenow="${visited}"><i style="width:${(visited / buildings.length) * 100}%"></i></div>
               <p class="muted">已逛過 ${visited} / ${buildings.length} 棟建築${visited < buildings.length ? `：還沒去 ${buildings.filter(b => !save.visited[b.id]).map(b => esc(b.name)).join('、')}` : ''}</p>`}
          <p class="muted">集章記錄只存在這支手機或這台電腦的瀏覽器。</p>`;
      },
      async bind() {
        if (stampCount() !== STAMPS.length) return;
        const code = ensureCode();
        try {
          const { blob, dataUrl } = await makePassImage(code);
          const box = $('#passImg'); if (!box) return;
          box.innerHTML = `
            <img class="card-img" src="${dataUrl}" alt="集章完成卡，兌換碼 ${esc(code)}">
            <div class="how-share">
              <p><b>傳給吱吱兌換</b></p>
              <p>① <b>長按上面的圖片</b>，選「分享」或「儲存到照片／下載圖片」</p>
              <p>② 按下面的按鈕打開吱吱的 LINE，從相簿把這張圖傳出去</p>
            </div>
            <a class="btn" href="https://line.me/R/oaMessage/${encodeURIComponent(LINE_OA_ID)}/?${encodeURIComponent('我集滿 5 個章了！兌換碼 ' + code)}" target="_blank" rel="noopener">打開吱吱的 LINE</a>
            <button class="btn light" id="savePass" hidden>下載完成卡</button>`;
          const dl = await claudeDownloads();
          if (dl) { $('#savePass').hidden = false; $('#savePass').onclick = async () => { try { await dl.save({ filename: '慢熟小鎮集章完成卡.jpg', data: blob }); } catch (e) {} }; }
        } catch (e) {
          const box = $('#passImg'); if (box) box.innerHTML = `<p class="muted">完成卡做不出來，請直接截圖這個畫面傳到 LINE。</p>${lineLink('傳到 LINE')}`;
        }
      },
    },
  };
}
