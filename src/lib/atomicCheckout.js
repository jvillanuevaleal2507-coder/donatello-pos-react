// ATLAS POS: idempotent checkout contract; never trust client totals or costs.
const STORAGE_KEY = "donatello.pos.pendingCheckout.v1";
// Durable only for opaque operation IDs and an account UUID; no PII or tokens.
// localStorage survives mobile tab closure and deliberate logout. Old session-
// storage drafts are migrated opportunistically without losing the original ID.
const safeStorage=(name)=>{try{return globalThis[name]||null;}catch{return null;}};
const unreadablePending=()=>({operationId:null,userId:null,storageUnavailable:true});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function positiveInteger(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
function requireUuid(value) {
  if (!UUID_RE.test(String(value || ""))) throw Error("Identificador de operación inválido");
  return String(value).toLowerCase();
}
export function newCheckoutOperationId(cryptoProvider = globalThis.crypto) {
  if (typeof cryptoProvider?.randomUUID !== "function") {
    throw Error("El navegador no permite generar identificadores seguros");
  }
  return requireUuid(cryptoProvider.randomUUID());
}
export function readPendingCheckoutId(
  storage=safeStorage("localStorage"), legacyStorage=safeStorage("sessionStorage")
) {
  try {
    const durable=storage?.getItem(STORAGE_KEY);
    const legacy=durable ? null : legacyStorage?.getItem(STORAGE_KEY);
    const raw=durable || legacy;
    if (!raw) return null;
    let record;
    if (UUID_RE.test(raw)) {
      record={operationId:requireUuid(raw),userId:null};
    } else {
      let parsed;
      try { parsed=JSON.parse(raw); } catch { return unreadablePending(); }
      if (!UUID_RE.test(String(parsed?.operationId || ""))) return unreadablePending();
      record={
        operationId:requireUuid(parsed.operationId),
        userId:UUID_RE.test(String(parsed?.userId || "")) ? requireUuid(parsed.userId) : null,
      };
    }
    // Migrate the original pending operation, never create a new UUID.
    if (!durable && legacy && storage?.setItem) {
      try {
        storage.setItem(STORAGE_KEY,JSON.stringify(record));
        legacyStorage?.removeItem(STORAGE_KEY);
      } catch {
        // Keep legacy storage intact; operation remains blocked for recovery.
      }
    }
    return record;
  } catch {
    // If localStorage becomes unreadable, NEVER interpret that as no payment.
    return unreadablePending();
  }
}
export function storePendingCheckoutId(
  operationId,userId,storage=safeStorage("localStorage"),
  legacyStorage=safeStorage("sessionStorage")
) {
  const id=requireUuid(operationId),owner=requireUuid(userId);
  if (!storage?.setItem || !storage?.getItem) {
    throw Error("No se puede conservar una operación de forma persistente");
  }
  if (readPendingCheckoutId(storage,legacyStorage)) {
    throw Error("Existe un cobro pendiente por comprobar o cancelar");
  }
  const record={operationId:id,userId:owner};
  storage.setItem(STORAGE_KEY,JSON.stringify(record));
  if (storage.getItem(STORAGE_KEY)!==JSON.stringify(record)) {
    throw Error("No se pudo verificar el guardado del cobro pendiente");
  }
  try { legacyStorage?.removeItem(STORAGE_KEY); } catch { /* durable is primary */ }
  return record;
}
export function assertPendingCheckoutOwner(pending, userId) {
  if (!pending || !UUID_RE.test(String(pending.operationId || "")) ||
      !UUID_RE.test(String(userId || "")) ||
      String(pending.userId || "").toLowerCase() !== String(userId || "").toLowerCase()) {
    throw Error("Este cobro pendiente pertenece a otra cuenta: entra con la cuenta original");
  }
}
export function clearPendingCheckoutId(
  storage=safeStorage("localStorage"), legacyStorage=safeStorage("sessionStorage")
) {
  storage?.removeItem(STORAGE_KEY);
  legacyStorage?.removeItem(STORAGE_KEY);
}
export function buildAtomicCheckoutParams({
  cart, saleMode, discountPercent, received, operationId,
  customerName = "", customerPhone = "", depositAmount = 0, dueDate = null,
}) {
  const operation = requireUuid(operationId);
  if (!["sale", "layaway"].includes(saleMode)) throw Error("Modo inválido");
  if (!Array.isArray(cart) || cart.length < 1 || cart.length > 100) throw Error("Carrito inválido");
  const discount = Number(discountPercent);
  if (!Number.isFinite(discount) || discount < 0 || discount >= 100) throw Error("Descuento inválido");
  const seen = new Set();
  const items = cart.map((item) => {
    const id = positiveInteger(item.id), qty = positiveInteger(item.qty);
    const price = Number(item.price);
    if (!id || !qty || qty > 1000 || !Number.isFinite(price) || price <= 0) throw Error("Producto inválido");
    if (seen.has(id)) throw Error("Producto duplicado");
    seen.add(id);
    return { id, qty, expected_price: price };
  });
  const amount = saleMode === "sale" ? Number(received) : 0;
  const deposit = saleMode === "layaway" ? Number(depositAmount) : 0;
  if (saleMode === "sale" && (!Number.isFinite(amount) || amount <= 0)) throw Error("Monto recibido inválido");
  if (saleMode === "layaway" && (!String(customerName).trim() || !Number.isFinite(deposit) || deposit <= 0)) {
    throw Error("Cliente o anticipo inválido");
  }
  if (saleMode === "layaway" && dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate))) {
    throw Error("Fecha inválida");
  }
  return {
    p_operation_id: operation,
    p_mode: saleMode, p_items: items, p_discount_percent: discount,
    p_received: amount,
    p_customer_name: saleMode === "layaway" ? String(customerName).trim() : null,
    p_customer_phone: saleMode === "layaway" ? String(customerPhone).trim() : null,
    p_deposit: deposit, p_due_date: saleMode === "layaway" ? dueDate || null : null,
  };
}
export async function submitAtomicCheckout(supabase, params) {
  const { data, error } = await supabase.rpc("donatello_checkout_once", params);
  if (error) throw Error(error.message || "Error del servidor");
  return validateCheckoutReceipt(data, params.p_mode);
}
function validateCheckoutReceipt(data, mode) {
  if (!data || data.type !== mode || !positiveInteger(data.id) ||
      !Number.isFinite(Number(data.total)) || Number(data.total) <= 0 ||
      !Array.isArray(data.sale_items)) {
    throw Error("Comprobante incompleto: comprueba el historial antes de reintentar");
  }
  return data;
}
export async function checkAtomicCheckoutStatus(supabase, operationId) {
  const { data, error } = await supabase.rpc("donatello_checkout_status", {
    p_operation_id: requireUuid(operationId),
  });
  if (error) throw Error(error.message || "No se pudo consultar el estado");
  if (data === null) return null;
  if (data?.state === "cancelled") return { state: "cancelled" };
  return validateCheckoutReceipt(data, data.type);
}


// Cancelación terminal: si el cobro ya se realizó, se devuelve su comprobante.
// Si no, una lápida del UUID impide que una petición retrasada cobre después.
export async function cancelAtomicCheckout(supabase, operationId) {
  const { data, error } = await supabase.rpc("donatello_checkout_cancel", {
    p_operation_id: requireUuid(operationId),
  });
  if (error) throw Error(error.message || "No se pudo cancelar el intento");
  if (data?.state === "cancelled") return { state: "cancelled" };
  return validateCheckoutReceipt(data, data?.type);
}
