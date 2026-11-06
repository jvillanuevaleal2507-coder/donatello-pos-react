// ATLAS POS: idempotent checkout contract; never trust client totals or costs.
const STORAGE_KEY = "donatello.pos.pendingCheckout.v1";
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
export function readPendingCheckoutId(storage = globalThis.sessionStorage) {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return value && UUID_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}
export function storePendingCheckoutId(operationId, storage = globalThis.sessionStorage) {
  const id = requireUuid(operationId);
  if (!storage?.setItem) throw Error("No se puede conservar la operación pendiente");
  storage.setItem(STORAGE_KEY, id);
  return id;
}
export function clearPendingCheckoutId(storage = globalThis.sessionStorage) {
  storage?.removeItem(STORAGE_KEY);
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
