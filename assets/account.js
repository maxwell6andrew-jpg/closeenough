// My Close Enough: optional Google sign-in that saves your results to your account,
// so your streak and history follow you to any device. The game works the same without it.
// Stored per player: one document per day played (score and the 5 rounds). Nothing else.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDocs, collection, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Public web config (not a secret: security rules decide who can read or write what).
const app = initializeApp({
  apiKey: "AIzaSyCiHMXBEMBYXuUvGh_FOKO_HIL5VPtU9q8",
  authDomain: "closeenough.day",   // sign-in helper is self-hosted at /__/auth, so the popup never shows firebaseapp.com
  projectId: "close-enough-4baa8",
  appId: "1:134717691513:web:24f6062461acdc3222e6a8",
});
const auth = getAuth(app), db = getFirestore(app);
const CE = window.CE;   // the game's small bridge (local results, redraw hooks)
if (!CE) throw new Error("game bridge missing");

const clean = (e) => ({
  no: e.no, date: e.date || "", theme: String(e.theme || "").slice(0, 80), total: Math.max(0, Math.min(1000, Math.round(e.total || 0))),
  results: (e.results || []).slice(0, 5).map((x) => ({
    lo: +x.lo || 0, hi: +x.hi || 0, pts: +x.pts || 0, base: +x.base || 0, inside: !!x.inside,
    ...(x.skipped ? { skipped: true } : {}), ...(x.t !== undefined ? { t: +x.t, s: +x.s || 1, cat: String(x.cat || "") } : {}),
  })),
});

async function upload(user, entry) {
  if (!entry || !(entry.no > 0)) return;
  await setDoc(doc(db, "users", user.uid, "days", String(entry.no)), { ...clean(entry), at: serverTimestamp() });
}

// On sign-in: push anything played on this device, pull everything from the account.
async function sync(user) {
  CE.setSync("Syncing…");
  try {
    const local = CE.localEntries();
    const snap = await getDocs(collection(db, "users", user.uid, "days"));
    const remote = new Map();
    snap.forEach((d) => remote.set(Number(d.id), d.data()));
    for (const e of local) if (!remote.has(e.no)) await upload(user, e);
    for (const [no, e] of remote) CE.saveEntry(no, e);
    CE.setSync(`Saved to your account · ${new Set([...local.map((e) => e.no), ...remote.keys()]).size} days`);
  } catch (err) {
    CE.setSync("Couldn't sync right now. Your results are still saved on this device.");
  }
  CE.refresh();
}

let current = null;
onAuthStateChanged(auth, (user) => {
  current = user;
  CE.setUser(user ? { name: (user.displayName || "").split(" ")[0] || "you" } : null);
  if (user) sync(user);
});
getRedirectResult(auth).catch(() => {});

// The game tells us when a day is finished.
document.addEventListener("ce:played", (ev) => { if (current) upload(current, ev.detail).catch(() => {}); });

CE.signIn = async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, provider); }
  catch (err) {
    if (err && (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment")) await signInWithRedirect(auth, provider);
    else if (!err || err.code !== "auth/popup-closed-by-user") CE.setSync("Sign-in didn't work. Try again in a moment.");
  }
};
CE.signOut = () => signOut(auth);
CE.ready();
