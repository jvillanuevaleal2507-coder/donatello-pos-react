// Minimal account-bound POS draft. Never stores customer PII, password, cost,
// profits, Supabase session material or any payment-operation identifier.
// This is display-only state: all writes still require authoritative server RPCs.
const KEY = "donatello.pos.cashierDraft.v1";
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_ROWS = 100;
const MAX_QTY = 1000;

function currentStorage(storage) {
  if (storage !== undefined) return storage;
  try { return typeof window === "undefined" ? null : window.sessionStorage; }
  catch { return null; }
}

function moneyInput(value) {
  const text = String(value ?? "").trim();
  return !text || /^\d{1,9}(?:\.\d{1,2})?$/.test(text) ? text : "";
}

function draftItems(cart) {
  if (!Array.isArray(cart) || cart.length < 1 || cart.length > MAX_ROWS) return null;
  const ids = new Set();
  const items = [];
  for (const item of cart) {
    const id = Number(item?.id);
    const qty = Number(item?.qty);
    if (!Number.isSafeInteger(id) || id <= 0 ||
        !Number.isSafeInteger(qty) || qty < 1 || qty > MAX_QTY || ids.has(id)) {
      return null;
    }
    ids.add(id);
    items.push({id, qty});
  }
  return items;
}

export function forgetCashierDraft(storage) {
  try { currentStorage(storage)?.removeItem(KEY); return true; }
  catch { return false; }
}

export function saveCashierDraft({userId, cart, received, discountPercent, saleMode, depositAmount},
    storage, now = Date.now()) {
  const items = draftItems(cart);
  if (!userId || typeof userId !== "string" || !items) return false;
  const discount = Number(discountPercent || 0);
  const validDiscount = Number.isFinite(discount) && discount >= 0 && discount < 100;
  const draft = {
    version: 1,
    userId,
    savedAt: now,
    items,
    mode: saleMode === "layaway" ? "layaway" : "sale",
    received: moneyInput(received),
    discountPercent: validDiscount ? discount : 0,
    depositAmount: moneyInput(depositAmount)
  };
  try { currentStorage(storage)?.setItem(KEY, JSON.stringify(draft)); return true; }
  catch { return false; }
}

export function readCashierDraft(userId, products, storage, now = Date.now()) {
  const store = currentStorage(storage);
  if (!store || !userId || !Array.isArray(products) || !products.length) return null;
  let draft;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    draft = JSON.parse(raw);
  } catch { forgetCashierDraft(storage); return null; }
  if (draft?.version !== 1 || draft.userId !== userId ||
      !Number.isFinite(draft.savedAt) || draft.savedAt > now ||
      now - draft.savedAt > MAX_AGE_MS || !draftItems(draft.items)) {
    forgetCashierDraft(storage);
    return null;
  }
  // Ignore saved price/cost even if storage was manipulated; use fresh
  // authorized inventory data. Checkout still verifies price and stock on DB.
  const byId = new Map(products.map(p => [Number(p.id), p]));
  const cart = draft.items.map(({id, qty}) => {
    const product = byId.get(id);
    return product ? {...product, qty} : null;
  }).filter(Boolean);
  if (cart.length !== draft.items.length || !cart.length) {
    forgetCashierDraft(storage);
    return null;
  }
  return {
    cart,
    received: moneyInput(draft.received),
    discountPercent: Number.isFinite(draft.discountPercent) &&
      draft.discountPercent >= 0 && draft.discountPercent < 100
      ? draft.discountPercent : 0,
    saleMode: draft.mode === "layaway" ? "layaway" : "sale",
    depositAmount: moneyInput(draft.depositAmount)
  };
}
