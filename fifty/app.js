import * as St from './store.js';
import { Fmt, prob, isResolved, isClosed, position, quote, history, change, volume, players, LMSR, Close } from './engine.js';
import { CATS, suggestions } from './prompts.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const AV = ['#5C66FA', '#FF8C33', '#1AADDB', '#DB4DBD', '#EDB314', '#8C66F2', '#F26673', '#339E8C'];

// Lucide icons (ISC license), inlined.
const I = {
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  check: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  new: '<path d="M12 5v14"/><path d="M5 12h14"/>', clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  win: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>', loss: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  shuffle: '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.97a4 4 0 0 0 3.3-1.7l5.45-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.97a4 4 0 0 1 3.3 1.7l.4.6"/><path d="M22 18h-6.04a4 4 0 0 1-3.3-1.8l-.4-.6"/>',
  sqplus: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/>',
};
const icon = (k, s = 22) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;

// The FiftyMark: a coin split by a tilted seam. The green wedge is the Yes chance.
function mark(p = 0.5, size = 28, rest = 'var(--rest)') {
  const t0 = 110 * Math.PI / 180, t1 = t0 + 2 * Math.PI * Math.min(1, Math.max(0, p));
  const pt = (t) => `${(50 + 50 * Math.cos(t)).toFixed(3)} ${(50 + 50 * Math.sin(t)).toFixed(3)}`;
  const wedge = p >= 1 ? '<circle cx="50" cy="50" r="50" fill="var(--yes)"/>' : p <= 0 ? '' : `<path d="M50 50 L ${pt(t0)} A50 50 0 ${p > 0.5 ? 1 : 0} 1 ${pt(t1)} Z" fill="var(--yes)"/>`;
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="${rest}"/>${wedge}</svg>`;
}
const wordmark = (s = 28) => `<span class="wordmark" style="font-size:${s}px">${mark(0.5, s * 0.9)}<b>fifty</b></span>`;
function avatar(id, s = 32) {
  const m = St.member(id); if (!m) return '';
  return `<span class="av" style="width:${s}px;height:${s}px;background:${AV[((m.colorIndex % 8) + 8) % 8]};font-size:${Math.round(s * 0.44)}px">${esc([...m.name][0].toUpperCase())}</span>`;
}
const stack = (ids, s = 22, max = 5) => `<span class="stack">${ids.slice(0, max).map((id) => avatar(id, s)).join('')}${ids.length > max ? `<span class="av more" style="width:${s}px;height:${s}px">+${ids.length - max}</span>` : ''}</span>`;
const nameOf = (id) => (id === St.S.me ? 'You' : St.member(id)?.name || 'Someone');

// ---------- UI state ----------
let sheet = null;                 // { kind, ... }
let slip = { mid: null, side: 'yes', amount: '10' };
let tab = 'markets', toastT = 0, deferredInstall = null;
let create = { subject: null, q: '', close: 'tonight', cat: 'Tonight', seed: 0, error: '' };

function toast(msg, ok = true) {
  const el = $('#toast'); el.innerHTML = `${icon(ok ? 'check' : 'x', 18)}<span>${esc(msg)}</span>`; el.className = 'toast on ' + (ok ? 'ok' : 'bad');
  clearTimeout(toastT); toastT = setTimeout(() => (el.className = 'toast'), 2200);
}
const go = (h) => { location.hash = h; };
function route() { const p = location.hash.replace(/^#\/?/, '').split('/'); return { name: p[0] || 'home', a: p[1], b: p[2] }; }

// ---------- views ----------
function landing() {
  return `<main class="landing">
    <div class="hero-mark">${mark(0.62, 88)}</div>
    <h1 class="logo">fifty</h1>
    <h2>Predict your friends.</h2>
    <p class="sub">Every market starts at 50/50. Your picks move it.</p>
    <div class="badge-pm"><b>Play money only</b><span>Points can't be bought, cashed out, or won as prizes.</span></div>
    <form id="onboard" class="stack-form" autocomplete="off">
      <input id="name" class="field" maxlength="24" placeholder="Your first name" autocomplete="given-name" enterkeyhint="go">
      <label class="check"><input type="checkbox" id="age"> <span>I'm 18+ and get that this is play money.</span></label>
      <button class="btn primary" type="submit">Start</button>
    </form>
  </main>`;
}

function home() {
  const groups = St.myGroups(), about = St.aboutMe(), n = St.unread();
  return `<header class="bar">${wordmark(28)}<span class="grow"></span>
      <button class="iconbtn" data-act="inbox" aria-label="Inbox">${icon('bell')}${n ? `<i class="dot">${Math.min(n, 9)}</i>` : ''}</button>
      <button class="iconbtn" data-act="settings" aria-label="Settings">${icon('gear')}</button></header>
    <main>
      ${about.length ? `<button class="banner" data-go="#/m/${about[0].id}">${icon('eye', 20)}<span><b>Your friends made a market on you</b><small>${esc(about[0].question)}</small></span></button>` : ''}
      <div class="sec-h"><h3>Groups</h3><span class="grow"></span><button class="link" data-act="join">Join</button><button class="link" data-act="newGroup">New</button></div>
      <div class="list">${groups.map((g) => `<button class="row card" data-go="#/g/${g.id}">
          <span class="emoji">${esc(g.emoji)}</span><span class="grow"><b>${esc(g.name)}</b><small>${g.memberIds.length} people${g.isDemo ? ' · demo' : ''}</small></span>
          <span class="right"><b class="tab">${Fmt.pts(St.balance(St.S.me, g.id))}</b><small>${stack(g.memberIds, 18, 4)}</small></span></button>`).join('')}</div>
      <div class="sec-h"><h3>Moving now</h3></div>
      <div class="list">${St.trending().map(marketCard).join('') || '<p class="muted">No open markets yet.</p>'}</div>
    </main>`;
}

function marketCard(m) {
  const p = prob(m), done = isResolved(m), g = St.group(m.groupId);
  return `<div class="mcard card" data-go="#/m/${m.id}">
    <div class="mtop">${m.subjectId ? avatar(m.subjectId, 36) : `<span class="av any">${icon('users', 18)}</span>`}
      <span class="grow"><small class="muted">${esc(g.emoji)} ${esc(g.name)}</small><b class="q">${esc(m.question)}</b></span>
      <span class="gauge">${mark(done ? (m.resolution === 'yes' ? 1 : 0) : p, 40, 'var(--rest-soft)')}<b>${done ? m.resolution.toUpperCase() : Fmt.pct(p)}</b></span></div>
    ${done ? `<div class="mfoot muted">Settled · ${Fmt.compact(volume(m))} pts vol</div>` :
      `<div class="mfoot">${St.canPick(m) ? `<button class="pbtn yes" data-pick="yes" data-mid="${m.id}">Yes ${Fmt.price(p)}</button><button class="pbtn no" data-pick="no" data-mid="${m.id}">No ${Fmt.price(1 - p)}</button>` : `<span class="muted">${m.subjectId === St.S.me ? "It's about you" : 'Closed'}</span>`}
        <span class="grow"></span><small class="muted">${Fmt.compact(volume(m))} vol · ${Fmt.timeLeft(m.closesAt)}</small></div>`}
  </div>`;
}

function groupView(gid) {
  const g = St.group(gid); if (!g) return notFound();
  const bal = St.balance(St.S.me, gid), ms = St.marketsIn(gid);
  const body = tab === 'board' ? leaderboardView(gid) : tab === 'activity' ? activityView(gid) : (ms.map(marketCard).join('') || '<p class="muted center">No markets yet. Open the first one.</p>');
  return `<header class="bar"><button class="iconbtn" data-go="#/">${icon('back')}</button><span class="title">${esc(g.emoji)} ${esc(g.name)}</span><span class="grow"></span>
      <button class="iconbtn" data-act="invite" data-gid="${gid}" aria-label="Invite">${icon('share')}</button></header>
    <main>
      <div class="bank card"><small class="muted">Your play points</small><b class="big tab">${Fmt.pts(bal)}</b>
        <span class="row2">${stack(g.memberIds, 24, 8)}<span class="grow"></span>${g.isDemo ? '<span class="tag">Demo</span>' : `<span class="tag mono">Code ${esc(g.code)}</span>`}</span></div>
      <button class="btn primary" data-act="newMarket" data-gid="${gid}">${icon('plus', 20)} New market</button>
      <nav class="tabs">${[['markets', 'Markets'], ['board', 'Leaderboard'], ['activity', 'Activity']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</nav>
      <div class="list">${body}</div>
    </main>`;
}

function leaderboardView(gid) {
  return St.leaderboard(gid).map((r, i) => {
    const pl = r.worth - St.group(gid).startingBankroll, best = St.bestCall(r.id, gid);
    return `<div class="row card lb"><b class="rank">${i + 1}</b>${avatar(r.id, 34)}<span class="grow"><b>${esc(nameOf(r.id))}</b>
      ${best ? `<small class="muted">Called it at ${Fmt.pct(best.avg)}</small>` : ''}</span>
      <span class="right"><b class="tab">${Fmt.pts(r.worth)}</b><small class="${pl >= 0 ? 'yes-t' : 'no-t'} tab">${Fmt.signed(pl)}</small></span></div>`;
  }).join('');
}
function activityView(gid) {
  const all = [];
  for (const m of St.marketsIn(gid)) for (const t of m.trades) all.push({ t, m });
  all.sort((a, b) => b.t.at - a.t.at);
  return all.slice(0, 40).map(({ t, m }) => tradeRow(t, m, true)).join('') || '<p class="muted center">Nothing yet.</p>';
}
function tradeRow(t, m, withQ) {
  const sold = t.shares < 0;
  return `<div class="trow">${avatar(t.memberId, 26)}<span class="grow"><span><b>${esc(nameOf(t.memberId))}</b> ${sold ? 'sold' : 'picked'} <b class="${t.side}-t">${t.side === 'yes' ? 'Yes' : 'No'}</b> · ${Fmt.pts(Math.abs(t.cash))}</span>
    ${withQ ? `<small class="muted clip">${esc(m.question)}</small>` : `<small class="muted">at ${Fmt.price(Math.abs(t.cash / t.shares))} · moved to ${Fmt.pct(t.probAfter)}</small>`}</span><small class="muted">${Fmt.ago(t.at)}</small></div>`;
}

function chart(m) {
  const W = 340, H = 170, pts = history(m); if (!isResolved(m)) pts.push({ at: Date.now(), p: prob(m) });
  const t0 = pts[0].at, t1 = Math.max(pts[pts.length - 1].at, t0 + 1);
  const x = (t) => 4 + (W - 40) * (t - t0) / (t1 - t0), y = (p) => 8 + (H - 16) * (1 - p);
  let d = `M${x(pts[0].at).toFixed(1)} ${y(pts[0].p).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].at).toFixed(1)} V${y(pts[i].p).toFixed(1)}`;
  const area = d + ` V${y(0)} H${x(pts[0].at).toFixed(1)} Z`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Chance over time">
    <line x1="4" x2="${W - 36}" y1="${y(0.5)}" y2="${y(0.5)}" class="mid"/>
    <path d="${area}" class="area"/><path d="${d}" class="line"/>
    ${['100%', '50%', '0%'].map((l, i) => `<text x="${W - 2}" y="${y(1 - i / 2) + 4}" text-anchor="end">${l}</text>`).join('')}</svg>`;
}

function marketView(mid) {
  const m = St.market(mid);
  if (!m) return `<header class="bar"><button class="iconbtn" data-go="#/">${icon('back')}</button></header><main class="center"><h3>This market was taken down</h3><p class="muted">Everyone who made a pick got their play points back.</p></main>`;
  const g = St.group(m.groupId), p = prob(m), done = isResolved(m), closed = isClosed(m), mine = position(m, St.S.me);
  const ch = change(m), creator = nameOf(m.creatorId);
  if (slip.mid !== mid) slip = { mid, side: slip.mid === mid ? slip.side : (slip.next || 'yes'), amount: '10' };
  const bal = St.balance(St.S.me, m.groupId);
  const canTake = !done && (m.subjectId === St.S.me || m.creatorId === St.S.me);
  return `<header class="bar"><button class="iconbtn" data-go="#/g/${g.id}">${icon('back')}</button><span class="title">${esc(g.emoji)} ${esc(g.name)}</span><span class="grow"></span>
      <button class="iconbtn" data-act="shareMarket" data-mid="${mid}" aria-label="Share">${icon('share')}</button></header>
    <main>
      <div class="mhead">${m.subjectId ? avatar(m.subjectId, 44) : `<span class="av any" style="width:44px;height:44px">${icon('users', 22)}</span>`}<h1 class="qbig">${esc(m.question)}</h1></div>
      ${done ? `<div class="settled card"><span class="muted">Settled</span><b class="rtag ${m.resolution}">${m.resolution.toUpperCase()}</b></div>` :
        `<div class="pctline"><b class="pct">${Fmt.pct(p)}</b><span>chance</span>${Math.abs(ch) >= 0.005 ? `<span class="${ch > 0 ? 'yes-t' : 'no-t'} delta">${icon(ch > 0 ? 'up' : 'down', 16)}${Fmt.pct(Math.abs(ch))} 1h</span>` : ''}</div>`}
      <div class="card chartwrap">${chart(m)}</div>
      <div class="stats"><span><small>Volume</small><b>${Fmt.compact(volume(m))} pts</b></span><span><small>Players</small><b>${players(m)}</b></span>
        <span><small>${closed ? 'Closed' : 'Closes'}</small><b>${closed ? Fmt.date(m.closesAt) : Fmt.timeLeft(m.closesAt).replace(' left', '')}</b></span></div>
      ${done ? resolvedBlock(m, mine) : ''}
      ${positionBlock(m, mine, closed)}
      ${St.canPick(m) ? pickSlip(m, bal) : m.subjectId === St.S.me && !done ? `<div class="note card"><b>This one's about you</b><span class="muted">You can't pick on it. You control the outcome.</span></div>` : ''}
      ${!done && m.creatorId === St.S.me ? `<div class="card settle"><b>${closed ? 'Did it happen?' : 'Know the answer?'}</b><span class="muted">${closed ? 'Settle it and points go out.' : 'You opened it, so you can settle early.'}</span>
          <div class="two"><button class="btn yesbtn" data-act="settle" data-side="yes" data-mid="${mid}">It happened</button><button class="btn nobtn" data-act="settle" data-side="no" data-mid="${mid}">Didn't happen</button></div></div>` :
        !done && closed ? `<div class="note card"><b>Waiting on ${esc(creator)} to settle</b><span class="muted">Only the person who opened it settles.</span></div>` : ''}
      <div class="sec-h"><h3>Activity</h3></div>
      <div class="list">${m.trades.slice(-25).reverse().map((t) => tradeRow(t, m, false)).join('')}
        <div class="trow">${avatar(m.creatorId, 26)}<span class="grow">${esc(creator)} opened this at 50/50</span><small class="muted">${Fmt.ago(m.createdAt)}</small></div></div>
      ${canTake ? `<button class="link danger center-block" data-act="takeDown" data-mid="${mid}">${m.subjectId === St.S.me ? 'This is about me. Take it down.' : 'Cancel and refund everyone'}</button>` : ''}
      ${m.creatorId !== St.S.me && !St.member(m.creatorId)?.isBot ? `<button class="link center-block muted" data-act="block" data-id="${m.creatorId}">Block ${esc(creator)}</button>` : ''}
    </main>`;
}

function resolvedBlock(m, mine) {
  if (mine.spent === 0 && mine.empty) return `<p class="muted center">You sat this one out.</p>`;
  const net = mine[m.resolution] - mine.spent;
  return `<div class="card result"><span class="muted">${net >= 0 ? 'You won' : 'You lost'}</span><b class="${net >= 0 ? 'yes-t' : 'no-t'} huge tab">${Fmt.signed(net)}</b></div>`;
}
function positionBlock(m, mine, closed) {
  const rows = ['yes', 'no'].filter((s) => mine[s] > 0.01);
  if (!rows.length) return '';
  return `<div class="sec-h"><h3>Your position</h3></div><div class="card pos">${rows.map((s) => {
    const putIn = s === 'yes' ? mine.spentYes : mine.spentNo, win = Math.max(0, mine[s] - putIn);
    const sellFor = LMSR.proceeds(mine[s], s, m.qYes, m.qNo, m.b);
    return `<div class="posrow"><span class="grow"><b class="${s}-t">${s === 'yes' ? 'Yes' : 'No'}</b> · wins ${Fmt.pts(win)} if ${s === 'yes' ? 'Yes' : 'No'}<small class="muted">${mine[s].toFixed(1)} shares</small></span>
      ${!closed ? `<button class="btn small ghost" data-act="sell" data-side="${s}" data-mid="${m.id}">Sell for ${Fmt.pts(sellFor)}</button>` : ''}</div>`;
  }).join('')}</div>`;
}
function pickSlip(m, bal) {
  if (bal < 0.01) return `<div class="note card"><b>Out of play points here</b><span class="muted">They come back when markets settle your way.</span></div>`;
  const side = slip.side, p = prob(m);
  const raw = parseFloat(slip.amount) || 0, amount = Math.min(raw, bal);
  const q = quote(m, side, amount);
  return `<div class="card slip" id="slip">
    <div class="two"><button class="pbig yes ${side === 'yes' ? 'on' : ''}" data-side="yes">Yes ${Fmt.price(p)}</button><button class="pbig no ${side === 'no' ? 'on' : ''}" data-side="no">No ${Fmt.price(1 - p)}</button></div>
    <div class="amt"><label for="amt">Amount</label><small class="muted">${Fmt.pts(bal)} available</small></div>
    <div class="amtbox"><input id="amt" class="field" inputmode="decimal" value="${esc(slip.amount)}" aria-label="Amount"><span>pts</span></div>
    ${raw > bal ? `<small class="no-t">Max is ${Fmt.pts(bal)}</small>` : ''}
    <div class="chips">${[5, 10, 25, 50].map((c) => `<button class="chip" data-add="${c}">+${c}</button>`).join('')}<button class="chip" data-add="max">Max</button></div>
    <div class="quote"><span class="muted">Win if ${side === 'yes' ? 'Yes' : 'No'}</span><b class="yes-t win tab">${Fmt.pts(Math.max(0, q.shares - amount))}</b>
      <small class="muted">You get in at ${Fmt.price(amount > 0 ? q.avgPrice : (side === 'yes' ? p : 1 - p))} · moves it to ${Fmt.pct(q.newProb)} Yes</small></div>
    <button class="btn ${side}btn" data-act="pick" data-mid="${m.id}" ${amount < 0.01 ? 'disabled' : ''}>${amount < 0.01 ? 'Enter an amount' : `Pick ${side === 'yes' ? 'Yes' : 'No'} · ${Fmt.pts(amount)}`}</button>
    <small class="muted center">Play money only. No cash value.</small></div>`;
}
const notFound = () => `<header class="bar"><button class="iconbtn" data-go="#/">${icon('back')}</button></header><main class="center"><h3>Not found</h3></main>`;

// ---------- sheets ----------
function sheetView() {
  if (!sheet) return '';
  const k = sheet.kind;
  const body = k === 'ticket' ? ticketSheet() : k === 'newMarket' ? newMarketSheet() : k === 'newGroup' ? newGroupSheet() : k === 'join' ? joinSheet()
    : k === 'inbox' ? inboxSheet() : k === 'settings' ? settingsSheet() : k === 'install' ? installSheet() : k === 'confirm' ? confirmSheet() : k === 'invite' ? inviteSheet() : '';
  return `<div class="scrim" data-act="close"></div><section class="sheet ${k === 'ticket' ? 'ticketsheet' : ''}" role="dialog" aria-modal="true">${body}</section>`;
}
const sheetHead = (title, right = '') => `<div class="sheet-h"><button class="link" data-act="close">Close</button><b>${title}</b><span>${right}</span></div>`;

function ticketSheet() {
  const { t, mid } = sheet, m = St.market(mid), g = St.group(m.groupId);
  return `<div class="ticket ${t.side}">
    <div class="tband">${icon('check', 18)}<b>PICK LOCKED IN</b><span class="grow"></span><span class="mono">#${t.id.slice(0, 6).toUpperCase()}</span></div>
    <div class="tbody"><b class="tq">${esc(m.question)}</b>
      <div class="tside"><span class="rtag ${t.side}">${t.side.toUpperCase()}</span><b class="tamt tab">${Fmt.pts(t.cash)}</b></div>
      <div class="trows"><span>In at</span><b>${Fmt.price(t.cash / t.shares)}</b></div>
      <div class="trows"><span>Win if ${t.side === 'yes' ? 'Yes' : 'No'}</span><b class="yes-t">${Fmt.pts(t.shares - t.cash)}</b></div></div>
    <div class="perf"></div>
    <div class="tstub"><span>${esc(g.emoji)} ${esc(g.name)}</span><span class="muted">${Fmt.stamp(t.at)}</span>
      <span class="pm">${mark(0.5, 14)} PLAY MONEY · NOT REAL MONEY</span>
      <small>No cash value. Points can't be bought, cashed out, traded, or exchanged for prizes. Fifty is not gambling.</small></div></div>
    <div class="two"><button class="btn ghost" data-act="shareTicket">Share</button><button class="btn primary" data-act="close">Done</button></div>`;
}

function newMarketSheet() {
  const g = St.group(sheet.gid), c = create;
  const subjName = c.subject ? (c.subject === St.S.me ? 'me' : St.member(c.subject).name) : null;
  const sugg = suggestions(c.cat, subjName === 'me' ? St.me().name : subjName, c.subject === St.S.me, 6, c.seed);
  return `${sheetHead('New market')}
    <div class="sheet-b">
      <small class="lab">WHO'S IT ABOUT?</small>
      <div class="subjects">${['', ...g.memberIds].map((id) => `<button class="subj ${(c.subject || '') === id ? 'on' : ''}" data-subj="${id}">${id ? avatar(id, 46) : `<span class="av any" style="width:46px;height:46px">${icon('users', 20)}</span>`}<small>${id ? (id === St.S.me ? 'Me' : esc(St.member(id).name)) : 'Anyone'}</small></button>`).join('')}</div>
      <small class="lab">THE QUESTION</small>
      <textarea id="q" class="field qfield" maxlength="140" rows="2" placeholder="Will…">${esc(c.q)}</textarea>
      ${c.q.length > 110 ? `<small class="muted right-t">${c.q.length}/140</small>` : ''}
      <div class="cats">${CATS.map((k) => `<button class="chip ${c.cat === k ? 'on' : ''}" data-cat="${esc(k)}">${esc(k)}</button>`).join('')}<button class="chip" data-act="shuffle">${icon('shuffle', 15)}</button></div>
      <div class="sugg">${sugg.map((s) => `<button class="sug" data-sug="${esc(s.q)}" data-close="${s.close}">${esc(s.q)}</button>`).join('') || '<small class="muted">Pick a person for ideas.</small>'}</div>
      <small class="lab">CLOSES</small>
      <div class="seg">${[['tonight', 'Tonight'], ['tomorrow', 'Tomorrow'], ['weekend', 'Weekend'], ['week', '1 week']].map(([k, l]) => `<button class="${c.close === k ? 'on' : ''}" data-close-seg="${k}">${l}</button>`).join('')}</div>
      <div class="info">${mark(0.5, 30)}<span>Opens at <b>50/50</b>. Every pick moves it.</span></div>
      ${c.error ? `<p class="no-t err">${esc(c.error)}</p>` : ''}
      <button class="btn primary" data-act="openMarket" ${c.q.trim().length < 8 ? 'disabled' : ''}>Open market</button>
    </div>`;
}
const EMOJI = ['🎮', '🏠', '🌴', '🏈', '🍻', '🎓', '💼', '🎉', '⛷️', '🏀'];
function newGroupSheet() {
  return `${sheetHead('New group')}<div class="sheet-b">
    <input id="gname" class="field" maxlength="40" placeholder="Group name" value="${esc(sheet.name || '')}">
    <div class="emojis">${EMOJI.map((e) => `<button class="emo ${(sheet.emoji || '🎮') === e ? 'on' : ''}" data-emo="${e}">${e}</button>`).join('')}</div>
    ${sheet.error ? `<p class="no-t err">${esc(sheet.error)}</p>` : ''}
    <button class="btn primary" data-act="makeGroup">Create group</button>
    <small class="muted center">Everyone starts with 500 play points.</small></div>`;
}
function joinSheet() {
  return `${sheetHead('Join a group')}<div class="sheet-b center">
    <input id="code" class="field codefield" maxlength="4" placeholder="CODE" autocapitalize="characters" autocomplete="off">
    <button class="btn primary" data-act="joinCode">Join</button>
    <small class="muted">${esc(sheet.msg || 'Got a link? Just open it.')}</small></div>`;
}
function inviteSheet() {
  const g = St.group(sheet.gid);
  return `${sheetHead('Invite friends')}<div class="sheet-b center">
    <small class="lab">ROOM CODE</small><b class="codebig mono">${esc(g.code)}</b>
    <button class="btn primary" data-act="shareInvite" data-gid="${g.id}">${icon('share', 18)} Send invite</button>
    <small class="muted">Playing with friends goes live soon. Your group and points stay on this phone for now.</small></div>`;
}
function inboxSheet() {
  const items = St.inbox(), seen = sheet.seen;
  return `${sheetHead('Inbox')}<div class="sheet-b list">${items.map((x) => `<button class="row inrow" data-go="#/m/${x.mid}" data-act="close">
      <span class="inic ${x.icon}">${icon(x.icon, 18)}</span><span class="grow"><b>${esc(x.title)}</b><small class="muted clip">${esc(x.detail)}</small></span>
      ${x.at > seen ? '<i class="reddot"></i>' : ''}<small class="muted">${Fmt.ago(x.at)}</small></button>`).join('') || '<p class="muted center">Nothing yet. New markets on you and big swings show up here.</p>'}</div>`;
}
function settingsSheet() {
  return `${sheetHead('Settings')}<div class="sheet-b">
    <small class="lab">YOUR NAME</small><div class="two"><input id="rename" class="field" maxlength="24" value="${esc(St.me().name)}"><button class="btn ghost" data-act="rename">Save</button></div>
    <label class="toggle"><span>Demo friends make picks</span><input type="checkbox" id="bots" ${St.S.bots ? 'checked' : ''}></label>
    <div class="badge-pm"><b>Play money only</b><span>Points are just for fun. They can't be bought, cashed out, traded, or won as prizes. No real-money side bets.</span></div>
    <button class="btn ghost" data-act="install">Add to Home Screen</button>
    <button class="link danger center-block" data-act="reset">Reset this device</button></div>`;
}
function installSheet() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
  return `${sheetHead('Get the app')}<div class="sheet-b center">
    ${mark(0.62, 64)}<h3>Add Fifty to your Home Screen</h3>
    ${deferredInstall ? `<button class="btn primary" data-act="doInstall">Install</button>` : ios ? `<ol class="steps"><li>Tap ${icon('share', 18)} <b>Share</b> below</li><li>Tap ${icon('sqplus', 18)} <b>Add to Home Screen</b></li></ol>` :
      '<p class="muted">Use your browser menu: Install app or Add to Home Screen.</p>'}
    <small class="muted">Opens full screen, like an app. No App Store.</small></div>${ios && !deferredInstall ? '<div class="arrow-down">↓</div>' : ''}`;
}
function confirmSheet() {
  return `<div class="sheet-b center"><h3>${esc(sheet.title)}</h3><p class="muted">${esc(sheet.msg)}</p>
    <div class="two"><button class="btn ghost" data-act="close">${esc(sheet.no || 'Cancel')}</button><button class="btn ${sheet.danger ? 'nobtn' : 'primary'}" data-act="confirm">${esc(sheet.yes)}</button></div></div>`;
}

// ---------- render ----------
const root = $('#app');
function render() {
  const a = document.activeElement, keep = a && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
  const r = route();
  const page = !St.me() ? landing() : r.name === 'g' ? groupView(r.a) : r.name === 'm' ? marketView(r.a) : home();
  root.innerHTML = page + sheetView();
  document.body.classList.toggle('locked', !!sheet);
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
}
St.onChange(() => { if (!document.activeElement || !['amt', 'q', 'gname', 'code', 'rename', 'name'].includes(document.activeElement.id)) render(); });
addEventListener('hashchange', () => { scrollTo(0, 0); render(); });

function open(kind, extra = {}) { sheet = { kind, ...extra }; render(); }
function close() { sheet = null; render(); }
function ask(title, msg, yes, run, danger = true) { open('confirm', { title, msg, yes, run, danger }); }

// ---------- events ----------
root.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'onboard') {
    if (!$('#age').checked) return toast('Check the 18+ box to start.', false);
    try { St.onboard($('#name').value); go('#/'); render(); } catch (x) { toast(x.message, false); }
  }
});
root.addEventListener('input', (e) => {
  const id = e.target.id;
  if (id === 'amt') { slip.amount = e.target.value.replace(/[^0-9.]/g, ''); render(); }
  if (id === 'q') { create.q = e.target.value; create.error = ''; const btn = $('[data-act=openMarket]'); if (btn) btn.disabled = create.q.trim().length < 8; }
  if (id === 'gname') sheet.name = e.target.value;
  if (id === 'code') e.target.value = e.target.value.toUpperCase();
});
root.addEventListener('change', (e) => { if (e.target.id === 'bots') St.setBots(e.target.checked); });
root.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act],[data-go],[data-tab],[data-side],[data-add],[data-pick],[data-subj],[data-cat],[data-sug],[data-close-seg],[data-emo]');
  if (!el) return;
  const d = el.dataset;
  if (d.pick) { e.stopPropagation(); slip = { mid: d.mid, side: d.pick, amount: '10' }; go('#/m/' + d.mid); return; }
  if (d.go && !d.act) { go(d.go); return; }
  if (d.tab) { tab = d.tab; render(); return; }
  if (d.side && !d.act) { slip.side = d.side; render(); return; }
  if (d.add) { const m = St.market(slip.mid), bal = St.balance(St.S.me, m.groupId);
    slip.amount = d.add === 'max' ? String(Math.floor(bal)) : String(Math.min(bal, (parseFloat(slip.amount) || 0) + +d.add)); render(); return; }
  if (d.subj !== undefined) { create.subject = d.subj || null;
    if (!create.q || create.q.startsWith('Will ')) { const nm = create.subject ? (create.subject === St.S.me ? 'I' : St.member(create.subject).name) : ''; create.q = nm ? `Will ${nm} ` : ''; }
    render(); return; }
  if (d.cat) { create.cat = d.cat; create.seed = 0; render(); return; }
  if (d.sug) { create.q = d.sug; create.close = d.close; render(); return; }
  if (d.closeSeg) { create.close = d.closeSeg; render(); return; }
  if (d.emo) { sheet.emoji = d.emo; render(); return; }
  const r = route();
  switch (d.act) {
    case 'close':
      if (sheet?.kind === 'ticket' && pendingInstall) { pendingInstall = false; open('install'); break; }   // offer the Home Screen once, after the first pick
      if (d.go) { sheet = null; go(d.go); } else close(); break;
    case 'inbox': { const seen = St.S.inboxSeen; St.markInbox(); open('inbox', { seen }); break; }
    case 'settings': open('settings'); break;
    case 'newGroup': open('newGroup', { emoji: '🎮' }); break;
    case 'join': open('join'); break;
    case 'invite': open('invite', { gid: d.gid }); break;
    case 'install': open('install'); break;
    case 'newMarket': create = { subject: null, q: '', close: 'tonight', cat: 'Tonight', seed: 0, error: '' }; open('newMarket', { gid: d.gid }); break;
    case 'shuffle': create.seed += 6; render(); break;
    case 'openMarket': {
      const cl = { tonight: Close.tonight(), tomorrow: Close.tomorrow(23), weekend: Close.weekend(), week: Close.week() }[create.close];
      try { const id = St.newMarket(sheet.gid, create.q, create.subject, cl); sheet = null; go('#/m/' + id); toast('Market open'); }
      catch (x) { create.error = x.message; render(); }
      break; }
    case 'makeGroup': try { const id = St.newGroup($('#gname').value, sheet.emoji); sheet = null; go('#/g/' + id); } catch (x) { sheet.error = x.message; render(); } break;
    case 'joinCode': { const code = $('#code').value.trim().toUpperCase(); const g = Object.values(St.S.groups).find((x) => x.code === code);
      if (g && g.memberIds.includes(St.S.me)) { sheet = null; go('#/g/' + g.id); } else open('join', { msg: 'Joining friends\' groups goes live soon.' }); break; }
    case 'pick': {
      const m = St.market(d.mid), bal = St.balance(St.S.me, m.groupId), amount = Math.min(parseFloat(slip.amount) || 0, bal);
      try { const t = St.placePick(d.mid, slip.side, amount, prob(m)); open('ticket', { t, mid: d.mid }); maybeInstallLater(); }
      catch (x) { toast(x.message, false); render(); }
      break; }
    case 'sell': try { const t = St.sellAll(d.mid, d.side); toast(`Sold for ${Fmt.pts(-t.cash)}`); } catch (x) { toast(x.message, false); } break;
    case 'settle': ask(`Settle as ${d.side === 'yes' ? 'Yes' : 'No'}?`, "Points go out to everyone. This can't be undone.", `Settle as ${d.side === 'yes' ? 'Yes' : 'No'}`, () => { St.settle(d.mid, d.side); toast('Settled'); }, false); break;
    case 'takeDown': ask('Take this market down?', 'Everyone gets their play points back.', 'Take it down', () => { const gid = St.market(d.mid).groupId; St.takeDown(d.mid); go('#/g/' + gid); toast('Taken down'); }); break;
    case 'block': ask(`Block ${St.member(d.id)?.name}?`, "You won't see their markets.", 'Block', () => { St.block(d.id); go('#/'); }); break;
    case 'confirm': { const run = sheet.run; sheet = null; try { run(); } catch (x) { toast(x.message, false); } render(); break; }
    case 'rename': try { St.rename($('#rename').value); toast('Saved'); } catch (x) { toast(x.message, false); } break;
    case 'reset': ask('Reset this device?', 'Your groups and points on this phone are deleted.', 'Reset', () => { St.reset(); go('#/'); }); break;
    case 'doInstall': if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; close(); } break;
    case 'shareMarket': { const m = St.market(d.mid); share(`${m.question} The group says ${Fmt.pct(prob(m))}. Think you know better?`, location.href); break; }
    case 'shareTicket': { const m = St.market(sheet.mid); share(`I'm on ${sheet.t.side === 'yes' ? 'Yes' : 'No'} for "${m.question}". Play money on Fifty.`, location.origin + location.pathname); break; }
    case 'shareInvite': { const g = St.group(d.gid); share(`Join "${g.name}" on Fifty. Code ${g.code}. Predict your friends, play money only.`, location.origin + location.pathname); break; }
  }
});
async function share(text, url) {
  try { if (navigator.share) { await navigator.share({ text, url }); return; } } catch (e) { return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Copied'); } catch (e) { toast('Copy failed', false); }
}
function maybeInstallLater() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || St.S.installSeen) return;
  St.markInstallSeen(); pendingInstall = true;
}
let pendingInstall = false;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

setInterval(St.botTick, 3500);
setInterval(() => { if (!document.hidden && !document.activeElement?.matches?.('input,textarea')) render(); }, 30000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
