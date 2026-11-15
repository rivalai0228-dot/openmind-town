/* 狗狗安定站：安定訊號配對小遊戲（點選或拉線配對） */
import { CALM_PAIRS } from './config.js';
import { $, $$, esc } from './store.js';

const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const LINE_COLORS = ['#B4704E', '#6E8063', '#D99A3E', '#7C8FB0', '#B0607C', '#5E9C95', '#8A6A55'];
const energyTxt = e => (e === 'charge' ? '⚡ 重新充電' : `能量 ${e}%`);
const battery = e => {
  const pct = e === 'charge' ? 100 : e;
  const col = e === 'charge' ? '#5DBB63' : e >= 70 ? '#B8CF3A' : e >= 50 ? '#E8C547' : e >= 30 ? '#E89A3E' : '#D9534F';
  return `<span class="batt" aria-hidden="true"><i style="height:${pct}%;background:${col}"></i>${e === 'charge' ? '<b>⚡</b>' : ''}</span>`;
};

const card = (p, side) => `
  <button type="button" class="cm-card cm-${side}" data-id="${p.id}" data-side="${side}" aria-pressed="false">
    <img src="img/calm/${side === 'dog' ? 'd' : 'h'}${p.id}.jpg" alt="" loading="lazy" width="400" height="390">
    <span class="cm-t">${esc(side === 'dog' ? p.dog : p.human)}</span>
    <span class="cm-dot" aria-hidden="true"></span>
  </button>`;

export const calmPanel = {
  title: '狗狗安定站',
  html: () => {
    const dogs = shuffle(CALM_PAIRS), humans = shuffle(CALM_PAIRS);
    return `
      <div class="guide"><img src="img/zz_happy.png" alt=""><p>狗狗緊張的時候，會用一些小動作安撫自己，這叫做<b>安定訊號</b>。其實人也會！幫每隻柴柴找到做一樣事情的人吧。</p></div>
      <p class="muted cm-how">玩法：先點左邊的柴柴、再點右邊的人；或從圓點拉一條線過去。</p>
      <div class="cm-board" id="cmBoard">
        <svg class="cm-lines" id="cmLines" aria-hidden="true"></svg>
        <div class="cm-col" aria-label="狗狗的安定訊號">${dogs.map(p => card(p, 'dog')).join('')}</div>
        <div class="cm-col" aria-label="人的行為">${humans.map(p => card(p, 'human')).join('')}</div>
      </div>
      <p class="cm-score" aria-live="polite"><span id="cmN">0</span> / ${CALM_PAIRS.length} 對</p>
      <div id="cmMsg" aria-live="polite"></div>
      <div id="cmDone"></div>
      <p class="muted cm-credit">圖卡：賴芝瑩社工師／吱吱老師 製</p>`;
  },
  bind() {
    const board = $('#cmBoard'), svg = $('#cmLines');
    const done = new Map(); // id -> color
    let sel = null, drag = null;
    const cardOf = (side, id) => board.querySelector(`.cm-card[data-side="${side}"][data-id="${id}"]`);
    const anchor = el => {
      const b = board.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { x: (el.dataset.side === 'dog' ? r.right : r.left) - b.left, y: r.top + r.height / 2 - b.top };
    };
    const draw = () => {
      const b = board.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`);
      let s = '';
      done.forEach((c, id) => {
        const a = anchor(cardOf('dog', id)), z = anchor(cardOf('human', id));
        s += `<path d="M${a.x} ${a.y} C${a.x + 30} ${a.y},${z.x - 30} ${z.y},${z.x} ${z.y}" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
      });
      if (drag?.to) {
        const a = anchor(drag.el);
        s += `<line x1="${a.x}" y1="${a.y}" x2="${drag.to.x}" y2="${drag.to.y}" stroke="#3F322A" stroke-width="3" stroke-dasharray="6 6" stroke-linecap="round"/>`;
      }
      svg.innerHTML = s;
    };
    const setSel = el => {
      $$('.cm-card.sel').forEach(x => { x.classList.remove('sel'); x.setAttribute('aria-pressed', 'false'); });
      sel = el;
      if (el) { el.classList.add('sel'); el.setAttribute('aria-pressed', 'true'); $('#cmMsg').innerHTML = ''; }
    };
    const showPair = p => {
      $('#cmMsg').innerHTML = `<div class="rec flip cm-reveal"><button type="button" class="cm-x" aria-label="關閉說明">×</button>
        <p class="cm-energy">${battery(p.energy)}<span>${energyTxt(p.energy)}</span></p>
        <p><b>柴柴・${esc(p.dog)}</b><br>「${esc(p.dogSay)}」</p>
        <p><b>人・${esc(p.human)}</b><br>「${esc(p.humanSay)}」</p>
        <p class="wk cm-same">${p.energy === 'charge' ? '緊張過去了，甩一甩、伸展一下，身體在說：沒事了。' : '不是壞習慣，是身體在說：我有點壓力，正在安撫自己。'}</p>
      </div>`;
    };
    $('#cmMsg').addEventListener('click', e => { if (e.target.closest('.cm-x')) $('#cmMsg').innerHTML = ''; });
    const finish = () => {
      $('#cmMsg').innerHTML = '';
      const list = [...CALM_PAIRS].sort((a, b) => (a.energy === 'charge') - (b.energy === 'charge') || b.energy - a.energy);
      $('#cmDone').innerHTML = `<section class="bag cm-final">
        <h3 class="wk">全部配對完成！</h3>
        <p>柴柴和人，緊張時的樣子其實很像。這些小動作都在透露：<b>我有壓力了</b>，也在<b>努力安撫自己</b>。</p>
        <ol class="cm-ladder">${list.map(p => `<li>${battery(p.energy)}<span><b>${esc(p.dog)}</b>／${esc(p.human)}</span><small>${p.energy === 'charge' ? '充電' : p.energy + '%'}</small></li>`).join('')}</ol>
        <p class="muted">能量電池越低，代表壓力越大。看到這些訊號時，先別急著糾正，給一點空間和時間，讓對方慢慢安定下來。</p>
        <button type="button" class="btn light" id="cmAgain">再玩一次</button>
      </section>`;
      $('#cmAgain').onclick = () => { $('#sheetBody').innerHTML = calmPanel.html(); calmPanel.bind(); $('#sheetBody').scrollTop = 0; };
      $('#cmDone').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const tryPair = (a, b) => {
      if (!a || !b || a.dataset.side === b.dataset.side) return false;
      const d = a.dataset.side === 'dog' ? a : b, h = d === a ? b : a;
      if (d.dataset.id === h.dataset.id) {
        const p = CALM_PAIRS.find(x => String(x.id) === d.dataset.id);
        done.set(d.dataset.id, LINE_COLORS[done.size % LINE_COLORS.length]);
        [d, h].forEach(x => { x.classList.add('ok'); x.disabled = true; x.style.setProperty('--c', done.get(d.dataset.id)); });
        setSel(null); draw(); showPair(p);
        $('#cmN').textContent = done.size;
        if (done.size === CALM_PAIRS.length) setTimeout(finish, 600);
      } else {
        [d, h].forEach(x => { x.classList.remove('no'); void x.offsetWidth; x.classList.add('no'); });
        const p = CALM_PAIRS.find(x => String(x.id) === d.dataset.id);
        $('#cmMsg').innerHTML = `<div class="rec cm-hint"><button type="button" class="cm-x" aria-label="關閉提示">×</button><p>好像不太一樣喔。聽聽柴柴怎麼說：</p><p>「${esc(p.dogSay)}」</p></div>`;
        setSel(null);
      }
      return true;
    };
    $$('.cm-card').forEach(el => {
      el.onclick = () => {
        if (el.disabled) return;
        if (sel && sel !== el && sel.dataset.side !== el.dataset.side) { tryPair(sel, el); return; }
        setSel(sel === el ? null : el);
      };
      const dot = el.querySelector('.cm-dot');
      dot.addEventListener('pointerdown', e => {
        if (el.disabled) return;
        e.preventDefault(); e.stopPropagation();
        drag = { el, to: null }; $('#cmMsg').innerHTML = '';
        dot.setPointerCapture(e.pointerId);
      });
      dot.addEventListener('pointermove', e => {
        if (!drag) return;
        const b = board.getBoundingClientRect();
        drag.to = { x: e.clientX - b.left, y: e.clientY - b.top }; draw();
      });
      const end = e => {
        if (!drag) return;
        const from = drag.el; drag = null;
        const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cm-card');
        draw();
        if (t && !t.disabled && t !== from) tryPair(from, t);
        else if (t === from) from.onclick();
      };
      dot.addEventListener('pointerup', end);
      dot.addEventListener('pointercancel', () => { drag = null; draw(); });
      dot.addEventListener('click', e => e.stopPropagation());
    });
    const ro = new ResizeObserver(draw); ro.observe(board);
    $$('.cm-card img').forEach(i => i.addEventListener('load', draw));
  },
};
