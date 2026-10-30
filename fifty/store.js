// Fifty web store: everything lives on this device (localStorage) in this first version.
// Balances are DERIVED from trades, never stored, so taking a market down refunds everyone automatically.
import { B, START, SLIP, prob, isResolved, isClosed, position, buy, sell, resolve, quote, makeId, contentProblem, Close, CODE_ALPHA, Fmt } from './engine.js';

const KEY = 'fifty-web-v1';
const BOTS = ['Jake', 'Boosh', 'Nate', 'Justin', 'Ben', 'Liam', 'Josh'];
export const LIMITS = { name: 24, group: 40, question: 140, openMarkets: 3, ownedGroups: 2, groupSize: 10 };

export let S = load();
const listeners = new Set();
export const onChange = (f) => listeners.add(f);
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} listeners.forEach((f) => f()); }
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return s; } catch (e) {} return fresh(); }
function fresh() { return { v: 1, me: null, members: {}, groups: {}, markets: {}, inboxSeen: 0, bots: true, installSeen: false, blocked: [] }; }
export function reset() { S = fresh(); save(); }

// ---------- lookups ----------
export const me = () => S.me && S.members[S.me];
export const member = (id) => S.members[id];
export const group = (id) => S.groups[id];
export const market = (id) => S.markets[id];
export const myGroups = () => Object.values(S.groups).filter((g) => g.memberIds.includes(S.me)).sort((a, b) => (a.isDemo - b.isDemo) || b.createdAt - a.createdAt);
export const canSee = (m) => !S.blocked.includes(m.creatorId);
export function marketsIn(gid) {
  return Object.values(S.markets).filter((m) => m.groupId === gid && canSee(m))
    .sort((a, b) => (isResolved(a) - isResolved(b)) || b.createdAt - a.createdAt);
}
export const trending = () => Object.values(S.markets).filter((m) => !isClosed(m) && canSee(m) && group(m.groupId)?.memberIds.includes(S.me))
  .sort((a, b) => vol(b) - vol(a)).slice(0, 5);
const vol = (m) => m.trades.reduce((t, x) => t + Math.abs(x.cash), 0);
export const aboutMe = () => Object.values(S.markets).filter((m) => m.subjectId === S.me && !isResolved(m) && canSee(m));
export const canPick = (m) => !isClosed(m) && m.subjectId !== S.me;

export function balance(who, gid) {
  let b = group(gid)?.startingBankroll ?? START;
  for (const m of Object.values(S.markets)) if (m.groupId === gid) {
    const p = position(m, who); b -= p.spent;
    if (isResolved(m)) b += p[m.resolution];
  }
  return b;
}
export function netWorth(who, gid) {
  let v = balance(who, gid);
  for (const m of Object.values(S.markets)) if (m.groupId === gid && !isResolved(m)) {
    const p = position(m, who), q = prob(m); v += p.yes * q + p.no * (1 - q);
  }
  return v;
}
export function leaderboard(gid) {
  return group(gid).memberIds.map((id) => ({ id, worth: netWorth(id, gid) })).sort((a, b) => b.worth - a.worth);
}
export function bestCall(who, gid) {
  let best = null;
  for (const m of Object.values(S.markets)) if (m.groupId === gid && isResolved(m))
    for (const t of m.trades) if (t.memberId === who && t.shares > 0 && t.side === m.resolution) {
      const avg = t.cash / t.shares; if (!best || avg < best.avg) best = { avg, m };
    }
  return best;
}

// ---------- actions ----------
const err = (msg) => { throw new Error(msg); };
export function onboard(raw) {
  const name = raw.trim().slice(0, LIMITS.name);
  if (!name) err('Enter your first name.');
  const p = contentProblem(name); if (p) err(p);
  const id = makeId(16);
  S.members[id] = { id, name, colorIndex: Math.floor(Math.random() * 8) };
  S.me = id; seedDemo(); save();
}
export function rename(raw) {
  const name = raw.trim().slice(0, LIMITS.name); if (!name) err('Enter a name.');
  const p = contentProblem(name); if (p) err(p);
  me().name = name; save();
}
export function placePick(mid, side, amount, quotedProb) {
  const m = market(mid); if (!m) err('Market not found.');
  const bal = balance(S.me, m.groupId);
  if (amount > bal + 0.001) err(`You only have ${Fmt.pts(bal)} to play.`);
  if (quotedProb != null && Math.abs(prob(m) - quotedProb) > SLIP) err(`The chance just moved to ${Fmt.pct(prob(m))}. Check the new price.`);
  const t = buy(m, S.me, side, amount); save(); return t;
}
export function sellAll(mid, side) { const m = market(mid); const t = sell(m, S.me, side, position(m, S.me)[side]); save(); return t; }
export function settle(mid, outcome) {
  const m = market(mid); if (m.creatorId !== S.me) err('Only the person who opened this market can settle it.');
  resolve(m, outcome); save();
}
export function takeDown(mid) {
  const m = market(mid); if (isResolved(m)) err('Settled markets stay.');
  if (m.subjectId !== S.me && m.creatorId !== S.me) err('Only the person it\'s about, or who opened it, can take it down.');
  delete S.markets[mid]; save();          // trades vanish with it, so every balance is refunded
}
export function newMarket(gid, question, subjectId, closesAt) {
  const q = question.trim().replace(/\s+/g, ' ');
  if (q.length < 8) err('Ask a full question.');
  if (q.length > LIMITS.question) err(`Keep it under ${LIMITS.question} characters.`);
  const p = contentProblem(q); if (p) err(p);
  const g = group(gid);
  if (!g.isDemo) {
    const open = Object.values(S.markets).filter((m) => m.creatorId === S.me && !isResolved(m) && !group(m.groupId)?.isDemo).length;
    if (open >= LIMITS.openMarkets) err('You can have 3 open markets at a time. Settle one to open another.');
  }
  if (closesAt > Date.now() + 8 * 86400e3) err('Markets can run up to about a week for now.');
  const id = makeId(12);
  S.markets[id] = { id, groupId: gid, question: q.endsWith('?') ? q : q + '?', subjectId: subjectId || null, creatorId: S.me,
    createdAt: Date.now(), closesAt, b: B, qYes: 0, qNo: 0, trades: [], resolution: null, resolvedAt: null,
    botLean: g.isDemo ? 0.25 + Math.random() * 0.5 : 0.5 };
  save(); return id;
}
export function newGroup(raw, emoji) {
  const name = raw.trim().slice(0, LIMITS.group); if (!name) err('Name your group.');
  const p = contentProblem(name); if (p) err(p);
  const owned = Object.values(S.groups).filter((g) => g.ownerId === S.me && !g.isDemo).length;
  if (owned >= LIMITS.ownedGroups) err('You can start 2 groups for now.');
  const id = makeId(12), code = makeId(4, CODE_ALPHA);
  S.groups[id] = { id, name, emoji: emoji || '🎮', memberIds: [S.me], startingBankroll: START, createdAt: Date.now(), ownerId: S.me, isDemo: false, code };
  save(); return id;
}
export function leave(gid) { const g = group(gid); g.memberIds = g.memberIds.filter((x) => x !== S.me); save(); }
export function block(id) { if (!S.blocked.includes(id)) S.blocked.push(id); save(); }
export function setBots(on) { S.bots = on; save(); }
export function markInbox() { S.inboxSeen = Date.now(); save(); }
export function markInstallSeen() { S.installSeen = true; save(); }

// ---------- inbox ----------
export function inbox(now = Date.now()) {
  const out = [];
  for (const m of Object.values(S.markets)) {
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

// ---------- demo groups and simulated friends (local only) ----------
function seedDemo() {
  const now = Date.now();
  BOTS.forEach((n, i) => { const id = 'bot-' + n.toLowerCase(); S.members[id] = { id, name: n, colorIndex: i + 1, isBot: true }; });
  const bot = (n) => 'bot-' + n.toLowerCase();
  const boys = 'demo-boys', cabo = 'demo-cabo';
  S.groups[boys] = { id: boys, name: 'The Boys', emoji: '🏠', memberIds: [S.me, ...['Jake', 'Boosh', 'Nate', 'Justin', 'Ben'].map(bot)], startingBankroll: START, createdAt: now - 9 * 86400e3, ownerId: null, isDemo: true, code: 'BOYS' };
  S.groups[cabo] = { id: cabo, name: "Cabo '26", emoji: '🌴', memberIds: [S.me, ...['Jake', 'Nate', 'Liam', 'Josh'].map(bot)], startingBankroll: START, createdAt: now - 3 * 86400e3, ownerId: null, isDemo: true, code: 'CABO' };
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
    if (mine && mine[0] < 0) {
      const prices = build(null).map((p) => mine[1] === 'yes' ? p : 1 - p);
      build(prices.indexOf(Math.min(...prices)));
    } else build(mine ? mine[0] : null);
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

// Simulated friends pick in the demo groups every few seconds (local only, never in your real groups).
export function botTick() {
  if (!S.bots || !S.me || document.hidden || Math.random() > 0.75) return;
  const open = Object.values(S.markets).filter((m) => group(m.groupId)?.isDemo && !isClosed(m));
  if (!open.length) return;
  const m = open[Math.floor(Math.random() * open.length)];
  const bots = group(m.groupId).memberIds.filter((x) => x.startsWith('bot-') && x !== m.subjectId);
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
export { quote, prob, position, isResolved, isClosed };
