// Fifty store. Demo groups (with simulated friends) live on this device; real groups live in the cloud
// (cloud.js) and are rebuilt from the server on every change. Both look the same to the screens.
// Balances are DERIVED from trades, never stored, so a taken-down market refunds everyone automatically.
import { B, START, SLIP, prob, isResolved, isClosed, position, buy, sell, resolve, makeId, contentProblem, Close, Fmt } from './engine.js';
import * as Cloud from './cloud.js';
const { C } = Cloud;

const KEY = 'fifty-web-v1';
const BOTS = ['Jake', 'Boosh', 'Nate', 'Justin', 'Ben', 'Liam', 'Josh'];
export const LIMITS = { name: 24, group: 40, question: 140, openMarkets: 3, ownedGroups: 3, groupSize: Cloud.GROUP_CAP };

export let S = load();
const listeners = new Set();
export const onChange = (f) => listeners.add(f);
const emit = () => listeners.forEach((f) => f());
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} emit(); }
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return s; } catch (e) {} return fresh(); }
function fresh() { return { v: 1, me: null, members: {}, groups: {}, markets: {}, inboxSeen: 0, bots: true, installSeen: false, blocked: [], pendingJoin: null }; }
export function reset() { const pj = S.pendingJoin; S = fresh(); S.pendingJoin = pj; save(); }

// ---------- cloud hookup ----------
Cloud.setOnChange(() => { adoptUid(); emit(); });
export const cloud = C;
export function startCloud() { return Cloud.start().then(() => adoptUid()); }
// The guest account id becomes "me". If this device made a profile before it signed in, re-key it.
function adoptUid() {
  if (!C.uid || !S.me || S.me === C.uid) return;
  const old = S.me, id = C.uid, sw = (x) => (x === old ? id : x);
  S.members[id] = { ...S.members[old], id }; delete S.members[old];
  for (const g of Object.values(S.groups)) { g.memberIds = g.memberIds.map(sw); g.ownerId = sw(g.ownerId); }
  for (const m of Object.values(S.markets)) { m.creatorId = sw(m.creatorId); m.subjectId = sw(m.subjectId); m.trades.forEach((t) => (t.memberId = sw(t.memberId))); }
  S.me = id; save();
}

// ---------- lookups (demo + cloud merged) ----------
const allGroups = () => ({ ...S.groups, ...C.groups });
const allMarkets = () => ({ ...S.markets, ...C.markets });
export const me = () => S.me && member(S.me);
export const member = (id) => (id === S.me ? S.members[id] : C.members[id] || S.members[id]);
export const group = (id) => allGroups()[id];
export const market = (id) => allMarkets()[id];
export const myGroups = () => Object.values(allGroups()).filter((g) => g.memberIds.includes(S.me)).sort((a, b) => (a.isDemo - b.isDemo) || b.createdAt - a.createdAt);
export const canSee = (m) => !S.blocked.includes(m.creatorId);
const marketsList = () => Object.values(allMarkets());
export const marketsIn = (gid) => marketsList().filter((m) => m.groupId === gid && canSee(m)).sort((a, b) => (isResolved(a) - isResolved(b)) || b.createdAt - a.createdAt);
const vol = (m) => m.trades.reduce((t, x) => t + Math.abs(x.cash), 0);
export const trending = () => marketsList().filter((m) => !isClosed(m) && canSee(m) && group(m.groupId)?.memberIds.includes(S.me)).sort((a, b) => vol(b) - vol(a)).slice(0, 5);
export const aboutMe = () => marketsList().filter((m) => m.subjectId === S.me && !isResolved(m) && canSee(m))
  .sort((a, b) => (!!group(a.groupId)?.isDemo - !!group(b.groupId)?.isDemo) || b.createdAt - a.createdAt);
export const canPick = (m) => !isClosed(m) && m.subjectId !== S.me;

export function balance(who, gid) {
  let b = START;
  for (const m of marketsList()) if (m.groupId === gid) { const p = position(m, who); b -= p.spent; if (isResolved(m)) b += p[m.resolution]; }
  return b;
}
export function netWorth(who, gid) {
  let v = balance(who, gid);
  for (const m of marketsList()) if (m.groupId === gid && !isResolved(m)) { const p = position(m, who), q = prob(m); v += p.yes * q + p.no * (1 - q); }
  return v;
}
export const leaderboard = (gid) => group(gid).memberIds.map((id) => ({ id, worth: netWorth(id, gid) })).sort((a, b) => b.worth - a.worth);
export function bestCall(who, gid) {
  let best = null;
  for (const m of marketsList()) if (m.groupId === gid && isResolved(m))
    for (const t of m.trades) if (t.memberId === who && t.shares > 0 && t.side === m.resolution) { const avg = t.cash / t.shares; if (!best || avg < best.avg) best = { avg, m }; }
  return best;
}

// ---------- actions (cloud ones are async) ----------
const err = (msg) => { throw new Error(msg); };
const isCloud = (gid) => !!C.groups[gid];
export function onboard(raw) {
  const name = raw.trim().slice(0, LIMITS.name); if (!name) err('Enter your first name.');
  const p = contentProblem(name); if (p) err(p);
  const id = C.uid || makeId(16);
  S.members[id] = { id, name, colorIndex: Math.floor(Math.random() * 8) };
  S.me = id; seedDemo(); save();
}
export async function rename(raw) {
  const name = raw.trim().slice(0, LIMITS.name); if (!name) err('Enter a name.');
  const p = contentProblem(name); if (p) err(p);
  S.members[S.me].name = name; save();
  await Cloud.rename(name);
}
export async function placePick(mid, side, amount, quotedProb) {
  const m = market(mid); if (!m) err('Market not found.');
  if (!canPick(m)) err(m.subjectId === S.me ? "You can't make picks on a market about yourself." : 'Picks are closed on this one.');
  const bal = balance(S.me, m.groupId);
  if (!(amount >= 0.01)) err('Enter an amount.');
  if (amount > bal + 0.001) err(`You only have ${Fmt.pts(bal)} to play.`);
  if (quotedProb != null && Math.abs(prob(m) - quotedProb) > SLIP) err(`The chance just moved to ${Fmt.pct(prob(m))}. Check the new price.`);
  if (isCloud(m.groupId)) {
    const before = { qYes: m.qYes, qNo: m.qNo, b: m.b };
    const id = await Cloud.order(m.groupId, mid, 'buy', side, Math.round(amount * 100) / 100);
    const t = market(mid)?.trades.find((x) => x.id === id);
    return t || { id, memberId: S.me, side, cash: amount, shares: (await import('./engine.js')).LMSR.shares(amount, side, before.qYes, before.qNo, before.b), at: Date.now() };
  }
  const t = buy(m, S.me, side, amount); save(); return t;
}
export async function sellAll(mid, side) {
  const m = market(mid), held = position(m, S.me)[side];
  if (isCloud(m.groupId)) { if (held <= 0.0001) err('Nothing to sell.'); const cash = (await import('./engine.js')).LMSR.proceeds(held, side, m.qYes, m.qNo, m.b);
    await Cloud.order(m.groupId, mid, 'sell', side, held); return { cash: -cash }; }
  const t = sell(m, S.me, side, held); save(); return t;
}
export async function settle(mid, outcome) {
  const m = market(mid); if (m.creatorId !== S.me) err('Only the person who opened this market can settle it.');
  if (isResolved(m)) err('Already settled.');
  if (isCloud(m.groupId)) return Cloud.settle(m.groupId, mid, outcome);
  resolve(m, outcome); save();
}
export async function takeDown(mid) {
  const m = market(mid); if (isResolved(m)) err('Settled markets stay.');
  if (m.subjectId !== S.me && m.creatorId !== S.me) err("Only the person it's about, or who opened it, can take it down.");
  if (isCloud(m.groupId)) return Cloud.takeDown(m.groupId, mid);
  delete S.markets[mid]; save();
}
export async function newMarket(gid, question, subjectId, closesAt) {
  const q0 = question.trim().replace(/\s+/g, ' ');
  if (q0.length < 8) err('Ask a full question.');
  if (q0.length > LIMITS.question) err(`Keep it under ${LIMITS.question} characters.`);
  const p = contentProblem(q0); if (p) err(p);
  const q = q0.endsWith('?') ? q0 : q0 + '?';
  const g = group(gid);
  if (!g.isDemo) {
    const open = marketsList().filter((m) => m.creatorId === S.me && !isResolved(m) && !group(m.groupId)?.isDemo).length;
    if (open >= LIMITS.openMarkets) err('You can have 3 open markets at a time. Settle one to open another.');
  }
  if (closesAt > Date.now() + 8 * 86400e3) err('Markets can run up to about a week for now.');
  if (isCloud(gid)) return Cloud.createMarket(gid, q, subjectId, closesAt);
  const id = makeId(12);
  S.markets[id] = { id, groupId: gid, question: q, subjectId: subjectId || null, creatorId: S.me, createdAt: Date.now(), closesAt, b: B, qYes: 0, qNo: 0, trades: [],
    resolution: null, resolvedAt: null, botLean: 0.25 + Math.random() * 0.5 };
  save(); return id;
}
export async function newGroup(raw, emoji) {
  const name = raw.trim().slice(0, LIMITS.group); if (!name) err('Name your group.');
  const p = contentProblem(name); if (p) err(p);
  const owned = Object.values(C.groups).filter((g) => g.ownerId === S.me).length;
  if (owned >= LIMITS.ownedGroups) err(`You can start ${LIMITS.ownedGroups} groups for now.`);
  return Cloud.createGroup(name, emoji || '🎮', me());
}
export const lookupCode = (code) => Cloud.lookup(code);
export async function joinGroup(info) {
  if ((info.memberCount ?? 0) >= LIMITS.groupSize) err(`${info.name} is full (${LIMITS.groupSize} people).`);
  return Cloud.join(info, me());
}
export async function leave(gid) { if (isCloud(gid)) return Cloud.leave(gid); const g = S.groups[gid]; g.memberIds = g.memberIds.filter((x) => x !== S.me); save(); }
export const report = (mid, reason) => { const m = market(mid); if (m && isCloud(m.groupId)) return Cloud.report(m.groupId, mid, reason); };
export function block(id) { if (!S.blocked.includes(id)) S.blocked.push(id); save(); }
export function setBots(on) { S.bots = on; save(); }
export function markInbox() { S.inboxSeen = Date.now(); save(); }
export function markInstallSeen() { S.installSeen = true; save(); }
// Silent on purpose: it's called while drawing the screen, so it must not trigger another redraw.
export function setPendingJoin(code) { S.pendingJoin = code; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

// ---------- inbox ----------
export function inbox(now = Date.now()) {
  const out = [];
  for (const m of marketsList()) {
    if (!canSee(m) || !group(m.groupId)?.memberIds.includes(S.me)) continue;
    const who = member(m.creatorId)?.name || 'Someone';
    if (m.subjectId === S.me && m.creatorId !== S.me)
      out.push({ id: 'about-' + m.id, mid: m.id, icon: 'eye', title: `${who} opened a market on you`, detail: `${m.question} · ${isResolved(m) ? 'settled' : Fmt.pct(prob(m))}`, at: m.createdAt });
    else if (m.creatorId !== S.me && m.createdAt > now - 3 * 86400e3)
      out.push({ id: 'new-' + m.id, mid: m.id, icon: 'new', title: `${who} opened a market`, detail: m.question, at: m.createdAt });
    const p = position(m, S.me);
    if (isResolved(m) && (p.spent !== 0 || !p.empty)) {
      const net = p[m.resolution] - p.spent;
      out.push({ id: 'settled-' + m.id, mid: m.id, icon: net >= 0 ? 'win' : 'loss', title: `Settled ${m.resolution.toUpperCase()} · you ${net >= 0 ? 'won' : 'lost'} ${Fmt.pts(Math.abs(net))}`, detail: m.question, at: m.resolvedAt ?? m.closesAt });
    }
    if (m.creatorId === S.me && isClosed(m) && !isResolved(m))
      out.push({ id: 'settle-' + m.id, mid: m.id, icon: 'clock', title: 'Time to settle your market', detail: m.question, at: m.closesAt });
  }
  return out.sort((a, b) => b.at - a.at);
}
export const unread = () => inbox().filter((x) => x.at > S.inboxSeen).length;

// ---------- demo groups and simulated friends (local only, never in real groups) ----------
function seedDemo() {
  const now = Date.now();
  BOTS.forEach((n, i) => { const id = 'bot-' + n.toLowerCase(); S.members[id] = { id, name: n, colorIndex: i + 1, isBot: true }; });
  const bot = (n) => 'bot-' + n.toLowerCase();
  const boys = 'demo-boys', cabo = 'demo-cabo';
  S.groups[boys] = { id: boys, name: 'The Boys', emoji: '🏠', memberIds: [S.me, ...['Jake', 'Boosh', 'Nate', 'Justin', 'Ben'].map(bot)], startingBankroll: START, createdAt: now - 9 * 86400e3, ownerId: null, isDemo: true };
  S.groups[cabo] = { id: cabo, name: "Cabo '26", emoji: '🌴', memberIds: [S.me, ...['Jake', 'Nate', 'Liam', 'Josh'].map(bot)], startingBankroll: START, createdAt: now - 3 * 86400e3, ownerId: null, isDemo: true };
  const add = (q, gid, subject, creator, ageH, closes, lean, n, mine, outcome) => {
    const id = makeId(12), createdAt = now - ageH * 3600e3;
    const m = { id, groupId: gid, question: q, subjectId: subject, creatorId: creator, createdAt, closesAt: closes, b: B, qYes: 0, qNo: 0, trades: [], resolution: null, resolvedAt: null, botLean: lean };
    const bettors = S.groups[gid].memberIds.filter((x) => x.startsWith('bot-') && x !== subject);
    const span = Math.min(ageH * 3600e3, closes - createdAt);
    const draws = Array.from({ length: n }, () => [Math.random(), [5, 5, 10, 10, 10, 15, 20, 25, 40][Math.floor(Math.random() * 9)], bettors[Math.floor(Math.random() * bettors.length)]]);
    const build = (mineAt) => {
      m.qYes = 0; m.qNo = 0; m.trades = []; const prices = [];
      draws.forEach(([r, amt, who], k) => {
        const at = createdAt + span * (k + 1) / (n + 2);
        prices.push(prob(m));
        if (mine && k === mineAt) buy(m, S.me, mine[1], mine[2], at - 60e3);
        buy(m, who, r < 0.5 + (lean - prob(m)) * 2 ? 'yes' : 'no', amt, at);
      });
      return prices;
    };
    if (mine && mine[0] < 0) { const prices = build(null).map((p) => (mine[1] === 'yes' ? p : 1 - p)); build(prices.indexOf(Math.min(...prices))); }
    else build(mine ? mine[0] : null);
    if (outcome) resolve(m, outcome, closes + 3600e3);
    S.markets[id] = m;
  };
  const meName = S.members[S.me].name;
  add('Will Boosh kiss someone tonight?', boys, bot('Boosh'), bot('Jake'), 5, Close.tonight(now), 0.12, 18, [5, 'no', 15]);
  add('Will Jake text his ex before 2am?', boys, bot('Jake'), bot('Nate'), 3, Close.tonight(now), 0.66, 9);
  add('Will Ben actually make it to his 9am?', boys, bot('Ben'), S.me, 7, Close.tomorrow(9, now), 0.27, 8, [-1, 'yes', 20]);
  add('Will Nate run the half marathon under 2 hours?', boys, bot('Nate'), bot('Ben'), 40, now + 4 * 86400e3, 0.58, 12);
  add(`Will ${meName} hit the gym tomorrow?`, boys, S.me, bot('Boosh'), 2, Close.tomorrow(20, now), 0.41, 5);
  add('Will Ben be the first one to leave tonight?', boys, bot('Ben'), bot('Justin'), 1.5, Close.tonight(now), 0.72, 4);
  add('Will Boosh finish the 72oz steak?', boys, bot('Boosh'), bot('Ben'), 50, now - 26 * 3600e3, 0.78, 10, [-1, 'no', 20], 'no');
  add('Will anyone get sunburnt on day 1?', cabo, null, bot('Liam'), 20, now + 6 * 86400e3, 0.8, 8);
  add('Will Josh miss the flight?', cabo, bot('Josh'), bot('Jake'), 30, now + 5 * 86400e3, 0.22, 9);
  add('Will Liam get a Cabo tattoo?', cabo, bot('Liam'), bot('Nate'), 8, now + 7 * 86400e3, 0.15, 5);
}

export function botTick() {
  if (!S.bots || !S.me || document.hidden || Math.random() > 0.75) return;
  const open = Object.values(S.markets).filter((m) => S.groups[m.groupId]?.isDemo && !isClosed(m));
  if (!open.length) return;
  const m = open[Math.floor(Math.random() * open.length)];
  const bots = S.groups[m.groupId].memberIds.filter((x) => x.startsWith('bot-') && x !== m.subjectId);
  const who = bots[Math.floor(Math.random() * bots.length)];
  try {
    const p = position(m, who);
    if (!p.empty && Math.random() < 0.25) { const side = p.yes >= p.no ? 'yes' : 'no'; sell(m, who, side, p[side] / 2); }
    else {
      const side = Math.random() < 0.5 + (m.botLean - prob(m)) * 1.8 ? 'yes' : 'no';
      const size = [5, 5, 10, 10, 10, 15, 20, 25, 25, 40][Math.floor(Math.random() * 10)];
      const amt = Math.min(size, balance(who, m.groupId)); if (amt < 1) return;
      buy(m, who, side, amt);
    }
    save();
  } catch (e) {}
}
