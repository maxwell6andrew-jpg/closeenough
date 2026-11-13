// Fifty engine: the LMSR market maker and market rules, ported verbatim from the iOS app
// (MarketMaker.swift, Models.swift). Play points only: nothing here is real money.

export const B = 80;                 // liquidity: a 10-pt pick at 50/50 moves the market ~6 points
export const START = 500;            // play points per group; never bought, refilled or extended
export const MAX_TRADES = 300;       // per market (buys only)
export const SLIP = 0.03;            // reject a buy if the chance moved > 3 points since the quote

export const LMSR = {
  cost(qy, qn, b) { const m = Math.max(qy, qn); return m + b * Math.log(Math.exp((qy - m) / b) + Math.exp((qn - m) / b)); },
  price(side, qy, qn, b) { const pYes = 1 / (1 + Math.exp((qn - qy) / b)); return side === 'yes' ? pYes : 1 - pYes; },
  shares(amount, side, qy, qn, b) {
    if (amount <= 0) return 0;
    const [mine, other] = side === 'yes' ? [qy, qn] : [qn, qy];
    const target = LMSR.cost(qy, qn, b) + amount;
    return Math.max(0, target + b * Math.log(1 - Math.exp((other - target) / b)) - mine);
  },
  proceeds(shares, side, qy, qn, b) {
    const before = LMSR.cost(qy, qn, b);
    const after = side === 'yes' ? LMSR.cost(qy - shares, qn, b) : LMSR.cost(qy, qn - shares, b);
    return Math.max(0, before - after);
  },
};

export function quote(m, side, amount) {
  const x = LMSR.shares(amount, side, m.qYes, m.qNo, m.b);
  const qy = m.qYes + (side === 'yes' ? x : 0), qn = m.qNo + (side === 'no' ? x : 0);
  return { side, amount, shares: x, newProb: LMSR.price('yes', qy, qn, m.b), profit: x - amount, avgPrice: x > 0 ? amount / x : 0 };
}

// ---------- Market helpers ----------
export const prob = (m) => LMSR.price('yes', m.qYes, m.qNo, m.b);
export const isResolved = (m) => m.resolution != null;
export const isClosed = (m, now = Date.now()) => isResolved(m) || now >= m.closesAt;
export const volume = (m) => m.trades.reduce((t, x) => t + Math.abs(x.cash), 0);
export const players = (m) => new Set(m.trades.map((t) => t.memberId)).size;
export function history(m) {
  const h = [{ at: m.createdAt, p: 0.5 }, ...m.trades.map((t) => ({ at: t.at, p: t.probAfter }))];
  if (isResolved(m)) h.push({ at: m.resolvedAt ?? m.closesAt, p: m.resolution === 'yes' ? 1 : 0 });
  return h;
}
export function change(m, now = Date.now()) {
  const h = history(m).filter((x) => x.at <= now - 3600e3);
  return prob(m) - (h.length ? h[h.length - 1].p : 0.5);
}
export function position(m, who) {
  const p = { yes: 0, no: 0, spent: 0, spentYes: 0, spentNo: 0 };
  for (const t of m.trades) if (t.memberId === who) {
    p[t.side] += t.shares; p.spent += t.cash;
    if (t.side === 'yes') p.spentYes += t.cash; else p.spentNo += t.cash;
  }
  p.empty = p.yes < 0.01 && p.no < 0.01;
  return p;
}

export function buy(m, who, side, amount, at = Date.now()) {
  if (m.resolution != null || at >= m.closesAt) throw new Error('Picks are closed on this one.');
  if (m.subjectId === who) throw new Error("You can't make picks on a market about yourself.");
  if (!(amount >= 0.01)) throw new Error('Enter an amount.');
  if (m.trades.length >= MAX_TRADES) throw new Error('This market is maxed out on picks.');
  const x = LMSR.shares(amount, side, m.qYes, m.qNo, m.b);
  if (side === 'yes') m.qYes += x; else m.qNo += x;
  const t = { id: makeId(10), memberId: who, side, cash: amount, shares: x, probAfter: prob(m), at };
  m.trades.push(t);
  return t;
}
export function sell(m, who, side, shares, at = Date.now()) {
  if (isClosed(m, at)) throw new Error('Picks are closed on this one.');
  const held = position(m, who)[side];
  const s = Math.min(shares, held);
  if (s <= 0.0001) throw new Error('Nothing to sell.');
  const cash = LMSR.proceeds(s, side, m.qYes, m.qNo, m.b);
  if (side === 'yes') m.qYes -= s; else m.qNo -= s;
  const t = { id: makeId(10), memberId: who, side, cash: -cash, shares: -s, probAfter: prob(m), at };
  m.trades.push(t);
  return t;
}
export function resolve(m, outcome, at = Date.now()) {
  if (m.resolution != null) throw new Error('Already settled.');
  m.resolution = outcome; m.resolvedAt = at;
}

// ---------- Formatting (points, never dollars) ----------
const grp = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const Fmt = {
  pts(v) { const a = Math.abs(v), s = v < 0 ? '-' : '';
    const body = (a >= 100 || Math.abs(a - Math.round(a)) < 0.005) ? grp.format(Math.round(a)) : a.toFixed(2);
    return s + body + ' pts'; },
  num(v) { const a = Math.abs(v); return (v < 0 ? '-' : '') + ((a >= 100 || Math.abs(a - Math.round(a)) < 0.005) ? grp.format(Math.round(a)) : a.toFixed(2)); },
  signed(v) { return (v >= 0 ? '+' : '−') + Fmt.pts(Math.abs(v)); },
  compact(v) { return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)); },
  pct(p) { const v = p * 100; if (v > 0 && v < 1) return '<1%'; if (v > 99 && v < 100) return '>99%'; return Math.round(v) + '%'; },
  price(p) { return Math.min(99, Math.max(1, Math.round(p * 100))) + '%'; },
  timeLeft(t, now = Date.now()) { const s = (t - now) / 1000; if (s <= 0) return 'Closed';
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm left'; if (s < 86400) return Math.floor(s / 3600) + 'h left'; return Math.floor(s / 86400) + 'd left'; },
  ago(t, now = Date.now()) { const s = (now - t) / 1000; if (s < 45) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; },
  date(t) { const d = new Date(t); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); },
  stamp(t) { const d = new Date(t);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); },
};

// ---------- IDs ----------
const ALPHA = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeId(n, alpha = ALPHA) {
  const lim = 256 - (256 % alpha.length), out = [], buf = new Uint8Array(n * 2);
  while (out.length < n) { crypto.getRandomValues(buf);
    for (const v of buf) { if (v < lim) out.push(alpha[v % alpha.length]); if (out.length === n) break; } }
  return out.join('');
}
export const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ---------- Content filter (Safety.swift) + the no-real-money rule ----------
const PHRASES = ['kill himself', 'kill herself', 'kill themself', 'kill themselves', 'kys', 'kms', 'suicide', 'overdose',
  'self harm', 'self-harm', 'cut himself', 'cut herself', 'rape', 'raped', 'molest', 'shoot up', 'school shooting',
  'get beat up', 'beat her', 'beat him', 'get pregnant', 'nudes', 'naked pic', 'leak her', 'leak his', 'underage'];
const SLURS = ['nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'tranny', 'spic', 'chink', 'kike', 'dyke', 'wetback', 'gook', 'coon', 'beaner', 'raghead'];
// Fifty is play money only. Side bets for real money are against the rules, so these never get through.
const MONEY = ['venmo', 'cash app', 'cashapp', 'paypal', 'zelle', 'loser pays', 'pay up', 'owes me', 'bet you', 'wager', 'for money', 'real money', 'dollars', 'bucks'];
export function contentProblem(text) {
  const raw = text.toLowerCase();
  const t = ' ' + raw.replace(/[^a-z0-9' -]/g, ' ') + ' ';
  const words = new Set(t.split(' ').filter(Boolean));
  for (const s of SLURS) if (words.has(s) || words.has(s + 's')) return "That word isn't allowed on Fifty.";
  for (const p of PHRASES) if (t.includes(` ${p} `) || t.includes(` ${p}s `))
    return 'Keep it fun. Nothing about harm, sex stuff, or getting hurt.';
  if (/\$\s?\d|\d\s?\$/.test(raw) || MONEY.some((p) => t.includes(` ${p} `) || t.includes(` ${p}s `)))
    return 'Play money only. No real-money side bets.';
  return null;
}

// ---------- Close times ----------
export const Close = {
  tonight(now = Date.now()) { const d = new Date(now); d.setHours(3, 0, 0, 0); if (d.getTime() <= now) d.setDate(d.getDate() + 1); return d.getTime(); },
  tomorrow(h = 23, now = Date.now()) { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return d.getTime(); },
  weekend(now = Date.now()) { const d = new Date(now); const add = (7 - d.getDay()) % 7; d.setDate(d.getDate() + add); d.setHours(23, 59, 0, 0); if (d.getTime() <= now) d.setDate(d.getDate() + 7); return d.getTime(); },
  week(now = Date.now()) { return now + 7 * 86400e3; },
};
