// Fifty multiplayer: Firebase (Close Enough's project, separate "fifty_*" collections), guest sign-in.
// Picks are APPEND-ONLY order records. Every phone replays them in server-time order through the same LMSR
// math, so everyone sees identical markets and balances. A pick that would overdraw your points, or land
// after close, is ignored by every replay. Take-downs are a timed event (refund at that moment), so removing
// one market never changes another market's history.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, writeBatch, serverTimestamp, increment, arrayUnion, arrayRemove }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { B, START, MAX_TRADES, LMSR, prob, makeId, CODE_ALPHA } from './engine.js';

const app = initializeApp({ apiKey: 'AIzaSyCiHMXBEMBYXuUvGh_FOKO_HIL5VPtU9q8', authDomain: 'closeenough.day', projectId: 'close-enough-4baa8' }, 'fifty');
const auth = getAuth(app), db = getFirestore(app);
export const GROUP_CAP = 10;

// ---------- live state (everything here is rebuilt from the server) ----------
export const C = { uid: null, ready: false, offline: false, error: null, groups: {}, members: {}, markets: {} };
const raw = {};            // gid -> { group, members: {}, markets: {}, orders: [] }
const subs = {};           // gid -> [unsubscribe...]
let onChange = () => {};
export const setOnChange = (f) => { onChange = f; };

export function start() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) { try { await signInAnonymously(auth); } catch (e) { C.error = e.code || e.message; C.offline = true; resolve(null); onChange(); } return; }
      C.uid = u.uid; C.ready = true; resolve(u.uid);
      onSnapshot(doc(db, 'fifty_users', u.uid), (s) => syncGroups(s.exists() ? s.data().groups || [] : []), () => {});
      onChange();
    });
  });
}

function syncGroups(gids) {
  for (const gid of Object.keys(subs)) if (!gids.includes(gid)) { subs[gid].forEach((f) => f()); delete subs[gid]; delete raw[gid]; }
  for (const gid of gids) if (!subs[gid]) watch(gid);
  rebuild();
}
// A listener attached before the server has confirmed our membership (right after create/join) is denied, and
// Firestore ends a denied listener for good. So on any error, drop this group's listeners and attach again shortly.
const tries = {};
function watch(gid) {
  raw[gid] ??= { group: null, members: {}, markets: {}, orders: [] };
  const r = raw[gid], est = { serverTimestamps: 'estimate' };
  const fail = (e) => {
    if (!subs[gid]?.length) return;
    subs[gid].forEach((f) => f()); subs[gid] = [];
    const n = (tries[gid] = (tries[gid] || 0) + 1);
    if (n > 8) { console.warn('fifty: gave up on', gid, e && e.code); return; }
    setTimeout(() => { if (subs[gid] && !subs[gid].length) watch(gid); }, Math.min(400 * n, 4000));
  };
  const ok = () => { tries[gid] = 0; };
  subs[gid] = [
    onSnapshot(doc(db, 'fifty_groups', gid), (s) => { ok(); r.group = s.exists() ? { id: gid, ...s.data(est) } : null; rebuild(); }, fail),
    onSnapshot(collection(db, 'fifty_groups', gid, 'members'), (q) => { r.members = {}; q.forEach((d) => (r.members[d.id] = { id: d.id, ...d.data(est) })); rebuild(); }, fail),
    onSnapshot(collection(db, 'fifty_groups', gid, 'markets'), (q) => { r.markets = {}; q.forEach((d) => (r.markets[d.id] = { id: d.id, ...d.data(est) })); rebuild(); }, fail),
    onSnapshot(collection(db, 'fifty_groups', gid, 'orders'), (q) => { r.orders = []; q.forEach((d) => r.orders.push({ id: d.id, ...d.data(est) })); rebuild(); }, fail),
  ];
}
const ms = (t) => (t && t.toMillis ? t.toMillis() : typeof t === 'number' ? t : Date.now());

// ---------- the replay ----------
function rebuild() {
  C.groups = {}; C.markets = {};
  for (const [gid, r] of Object.entries(raw)) {
    if (!r.group) continue;
    const active = Object.values(r.members).filter((m) => !m.left);
    for (const m of Object.values(r.members)) C.members[m.id] = { id: m.id, name: m.name, colorIndex: m.colorIndex ?? 0 };
    C.groups[gid] = { id: gid, name: r.group.name, emoji: r.group.emoji, code: r.group.code, ownerId: r.group.ownerId, createdAt: ms(r.group.createdAt),
      startingBankroll: START, isDemo: false, cloud: true, memberIds: active.map((m) => m.id) };
    replay(gid, r);
  }
  onChange();
}
function replay(gid, r) {
  const mk = {};
  for (const m of Object.values(r.markets)) mk[m.id] = { id: m.id, groupId: gid, question: m.question, subjectId: m.subjectId || null, creatorId: m.creatorId,
    createdAt: ms(m.createdAt), closesAt: m.closesAt, b: B, qYes: 0, qNo: 0, trades: [], resolution: null, resolvedAt: null,
    _res: m.resolution || null, _resAt: m.resolution ? ms(m.resolvedAt) : null, _gone: m.removedAt ? ms(m.removedAt) : null, botLean: 0.5 };
  const events = [];
  for (const o of r.orders) events.push({ at: ms(o.at), k: 'o', id: o.id, o });
  for (const m of Object.values(mk)) { if (m._res) events.push({ at: m._resAt, k: 'r', id: m.id, m }); if (m._gone) events.push({ at: m._gone, k: 'x', id: m.id, m }); }
  events.sort((a, b) => a.at - b.at || (a.k === 'o' ? 0 : 1) - (b.k === 'o' ? 0 : 1) || (a.id < b.id ? -1 : 1));
  const bal = {}, pos = {};                       // bal[member]; pos[mid][member] = {yes, no, spent}
  const B0 = (who) => (bal[who] ??= START);
  const P = (mid, who) => ((pos[mid] ??= {})[who] ??= { yes: 0, no: 0, spent: 0 });
  for (const e of events) {
    if (e.k === 'r') { const m = e.m; m.resolution = m._res; m.resolvedAt = m._resAt;
      for (const [who, p] of Object.entries(pos[m.id] || {})) bal[who] = B0(who) + p[m.resolution]; continue; }
    if (e.k === 'x') { const m = e.m; m.removed = true;                       // refund what each person had in, at this moment
      for (const [who, p] of Object.entries(pos[m.id] || {})) bal[who] = B0(who) + p.spent; continue; }
    const o = e.o, m = mk[o.mid]; if (!m || m.removed || m.resolution || e.at >= m.closesAt) continue;
    if (o.side !== 'yes' && o.side !== 'no') continue;
    if (o.kind === 'buy') {
      if (m.subjectId === o.by || !(o.amount >= 0.01) || m.trades.length >= MAX_TRADES || o.amount > B0(o.by) + 0.001) continue;
      const x = LMSR.shares(o.amount, o.side, m.qYes, m.qNo, m.b);
      if (o.side === 'yes') m.qYes += x; else m.qNo += x;
      m.trades.push({ id: o.id, memberId: o.by, side: o.side, cash: o.amount, shares: x, probAfter: prob(m), at: e.at });
      bal[o.by] -= o.amount; const p = P(m.id, o.by); p[o.side] += x; p.spent += o.amount;
    } else if (o.kind === 'sell') {
      const p = P(m.id, o.by), s = Math.min(o.amount, p[o.side]); if (s <= 0.0001) continue;
      const cash = LMSR.proceeds(s, o.side, m.qYes, m.qNo, m.b);
      if (o.side === 'yes') m.qYes -= s; else m.qNo -= s;
      m.trades.push({ id: o.id, memberId: o.by, side: o.side, cash: -cash, shares: -s, probAfter: prob(m), at: e.at });
      bal[o.by] = B0(o.by) + cash; p[o.side] -= s; p.spent -= cash;
    }
  }
  for (const m of Object.values(mk)) if (!m.removed) C.markets[m.id] = m;
}

// ---------- writes ----------
const need = () => { if (!C.uid) throw new Error("Can't reach Fifty right now. Check your connection."); };
const userRef = () => doc(db, 'fifty_users', C.uid);

export async function createGroup(name, emoji, me) {
  need();
  const gid = makeId(12);
  for (let tries = 0; tries < 5; tries++) {
    const code = makeId(4, CODE_ALPHA);
    if ((await getDoc(doc(db, 'fifty_codes', code))).exists()) continue;
    const b = writeBatch(db);
    b.set(doc(db, 'fifty_groups', gid), { name, emoji, code, ownerId: C.uid, createdAt: serverTimestamp(), memberCount: 1 });
    b.set(doc(db, 'fifty_groups', gid, 'members', C.uid), { name: me.name, colorIndex: me.colorIndex, joinedAt: serverTimestamp(), left: false });
    b.set(doc(db, 'fifty_codes', code), { gid, name, emoji });
    b.set(userRef(), { groups: arrayUnion(gid) }, { merge: true });
    await b.commit();
    return gid;
  }
  throw new Error('Try again in a second.');
}
export async function lookup(code) {
  need();
  const s = await getDoc(doc(db, 'fifty_codes', code.toUpperCase()));
  if (!s.exists()) throw new Error('No group with that code.');
  return { code: code.toUpperCase(), ...s.data() };
}
export async function join(info, me) {
  need();
  if (C.groups[info.gid]?.memberIds.includes(C.uid)) return info.gid;
  const b = writeBatch(db);
  b.set(doc(db, 'fifty_groups', info.gid, 'members', C.uid), { name: me.name, colorIndex: me.colorIndex, joinedAt: serverTimestamp(), left: false, code: info.code });
  b.update(doc(db, 'fifty_groups', info.gid), { memberCount: increment(1) });
  b.set(userRef(), { groups: arrayUnion(info.gid) }, { merge: true });
  try { await b.commit(); } catch (e) { throw new Error(`${info.name} is full or closed (${GROUP_CAP} people max).`); }
  return info.gid;
}
export async function leave(gid) {
  need();
  const b = writeBatch(db);
  b.update(doc(db, 'fifty_groups', gid, 'members', C.uid), { left: true });
  b.update(doc(db, 'fifty_groups', gid), { memberCount: increment(-1) });
  b.set(userRef(), { groups: arrayRemove(gid) }, { merge: true });
  await b.commit();
}
export async function rename(name) {
  need();
  await Promise.all(Object.keys(raw).map((gid) => updateDoc(doc(db, 'fifty_groups', gid, 'members', C.uid), { name }).catch(() => {})));
}
export async function createMarket(gid, question, subjectId, closesAt) {
  need();
  const mid = makeId(12);
  await setDoc(doc(db, 'fifty_groups', gid, 'markets', mid), { question, subjectId: subjectId || null, creatorId: C.uid, createdAt: serverTimestamp(),
    closesAt, resolution: null, resolvedAt: null, removedAt: null });
  return mid;
}
export function order(gid, mid, kind, side, amount) {
  need();
  const id = makeId(16);
  // Optimistic: Firestore applies the pending write locally right away, so the replay shows it instantly.
  return setDoc(doc(db, 'fifty_groups', gid, 'orders', id), { mid, by: C.uid, kind, side, amount, at: serverTimestamp() }).then(() => id);
}
export const settle = (gid, mid, outcome) => updateDoc(doc(db, 'fifty_groups', gid, 'markets', mid), { resolution: outcome, resolvedAt: serverTimestamp() });
export const takeDown = (gid, mid) => updateDoc(doc(db, 'fifty_groups', gid, 'markets', mid), { removedAt: serverTimestamp() });
export const report = (gid, mid, reason) => setDoc(doc(db, 'fifty_reports', makeId(16)), { gid, mid, reason, by: C.uid, at: serverTimestamp() });
