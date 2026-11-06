// ATLAS POS: atomic layaway payments. Uses checkout's shared UUID ledger.
import { newCheckoutOperationId } from "./atomicCheckout.js";
const STORAGE_KEY = "donatello.pos.pendingLayawayPayment.v1";
// Durable only for opaque operation IDs and an account UUID; no PII or tokens.
// localStorage survives mobile tab closure and deliberate logout. Old session-
// storage drafts are migrated opportunistically without losing the original ID.
const safeStorage=(name)=>{try{return globalThis[name]||null;}catch{return null;}};
const unreadablePending=()=>({operationId:null,userId:null,storageUnavailable:true});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positiveId = (v) => Number.isSafeInteger(Number(v)) && Number(v)>0;

export function newLayawayPaymentId(cryptoProvider) {
  return newCheckoutOperationId(cryptoProvider);
}
export function readPendingLayawayPayment(
  storage=safeStorage("localStorage"), legacyStorage=safeStorage("sessionStorage")
) {
  try {
    const durable=storage?.getItem(STORAGE_KEY);
    const legacy=legacyStorage?.getItem(STORAGE_KEY);
    const raw=durable || legacy;
    if (!raw) return null;
    let v;
    try { v=JSON.parse(raw); } catch { return unreadablePending(); }
    if (!v || !UUID.test(String(v.operationId || "")) || !positiveId(v.layawayId)) {
      return unreadablePending();
    }
    const record={operationId:String(v.operationId).toLowerCase(),
      layawayId:Number(v.layawayId),
      userId:UUID.test(String(v.userId || "")) ? String(v.userId).toLowerCase() : null};
    if (!durable && legacy && storage?.setItem) {
      try {
        storage.setItem(STORAGE_KEY,JSON.stringify(record));
        legacyStorage?.removeItem(STORAGE_KEY);
      } catch { /* original pending ID stays in sessionStorage */ }
    }
    return record;
  } catch {
    return unreadablePending();
  }
}
export function storePendingLayawayPayment(
  pending,storage=safeStorage("localStorage"),
  legacyStorage=safeStorage("sessionStorage")
) {
  if (!pending || !UUID.test(String(pending.operationId || "")) ||
      !positiveId(pending.layawayId) || !UUID.test(String(pending.userId || ""))) {
    throw Error("Operacion de abono invalida");
  }
  if (!storage?.setItem || !storage?.getItem) {
    throw Error("No se puede conservar un abono de forma persistente");
  }
  if (readPendingLayawayPayment(storage,legacyStorage)) {
    throw Error("Existe un abono pendiente por comprobar o cancelar");
  }
  // Persist only UUID, layaway ID and authenticated account UUID.
  const record={operationId:String(pending.operationId).toLowerCase(),
    layawayId:Number(pending.layawayId),userId:String(pending.userId).toLowerCase()};
  storage.setItem(STORAGE_KEY,JSON.stringify(record));
  if (storage.getItem(STORAGE_KEY)!==JSON.stringify(record)) {
    throw Error("No se pudo verificar el guardado del abono pendiente");
  }
  try { legacyStorage?.removeItem(STORAGE_KEY); } catch { /* durable is primary */ }
  return record;
}
export function clearPendingLayawayPayment(
  storage=safeStorage("localStorage"),legacyStorage=safeStorage("sessionStorage")
) {
  storage?.removeItem(STORAGE_KEY);
  legacyStorage?.removeItem(STORAGE_KEY);
}
export function buildLayawayPaymentParams({ operationId, layawayId, amount }) {
  const n = Number(amount);
  if (!UUID.test(String(operationId)) || !positiveId(layawayId) ||
      !Number.isFinite(n) || n<=0 || n>1000000000 ||
      Math.abs(n*100-Math.round(n*100))>0.00001) {
    throw Error("Monto o identificador de abono invalido");
  }
  return { p_operation_id:operationId, p_layaway_id:Number(layawayId), p_amount:n };
}
function readReceipt(data, expectedId) {
  if (data?.state==="cancelled") return { state:"cancelled" };
  if (!data || !["payment","liquidation"].includes(data.type) ||
      !positiveId(data.id) || !positiveId(data.payment_id) ||
      (expectedId != null && Number(data.id)!==Number(expectedId)) ||
      !Number.isFinite(Number(data.total)) || Number(data.total)<=0 ||
      !Number.isFinite(Number(data.payment_amount)) ||
      Number(data.payment_amount)<=0 || !Array.isArray(data.items)) {
    throw Error("Recibo incompleto: comprueba el estado antes de volver a cobrar");
  }
  return data;
}
export async function submitLayawayPayment(supabase, params) {
  const {data,error}=await supabase.rpc("donatello_layaway_payment_once",params);
  if (error) throw Error(error.message || "Error registrando abono");
  return readReceipt(data,params.p_layaway_id);
}
export function assertLayawayPaymentOwner(pending,userId) {
  if (!pending || !UUID.test(String(pending.operationId || "")) ||
      !positiveId(pending.layawayId) || !UUID.test(String(userId || "")) ||
      String(pending.userId || "").toLowerCase() !== String(userId || "").toLowerCase()) {
    throw Error("El abono pendiente pertenece a otra cuenta; ingresa con la cuenta original");
  }
}
export async function checkLayawayPayment(supabase,pending,userId) {
  assertLayawayPaymentOwner(pending,userId);
  const {data,error}=await supabase.rpc("donatello_checkout_status",{p_operation_id:pending.operationId});
  if (error) throw Error(error.message || "No se pudo consultar el estado");
  return data===null ? null : readReceipt(data,pending.layawayId);
}
export async function cancelLayawayPayment(supabase,pending,userId) {
  assertLayawayPaymentOwner(pending,userId);
  const {data,error}=await supabase.rpc("donatello_checkout_cancel",{p_operation_id:pending.operationId});
  if (error) throw Error(error.message || "No se pudo cancelar el intento");
  return readReceipt(data,pending.layawayId);
}
