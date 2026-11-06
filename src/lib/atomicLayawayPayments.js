// ATLAS POS: atomic layaway payments. Uses checkout's shared UUID ledger.
import { newCheckoutOperationId } from "./atomicCheckout.js";
const STORAGE_KEY = "donatello.pos.pendingLayawayPayment.v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positiveId = (v) => Number.isSafeInteger(Number(v)) && Number(v)>0;

export function newLayawayPaymentId(cryptoProvider) {
  return newCheckoutOperationId(cryptoProvider);
}
export function readPendingLayawayPayment(storage = globalThis.sessionStorage) {
  try {
    const v = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    return v && UUID.test(v.operationId) && positiveId(v.layawayId)
      ? { operationId: v.operationId, layawayId: Number(v.layawayId) }
      : null;
  } catch { return null; }
}
export function storePendingLayawayPayment(pending, storage = globalThis.sessionStorage) {
  if (!pending || !UUID.test(pending.operationId) || !positiveId(pending.layawayId)) {
    throw Error("Operacion de abono invalida");
  }
  if (!storage?.setItem) throw Error("No se puede conservar el abono pendiente");
  // Only UUID and layaway ID, never name, phone, amount or customer data.
  const record = { operationId: pending.operationId, layawayId: Number(pending.layawayId) };
  storage.setItem(STORAGE_KEY, JSON.stringify(record));
  return record;
}
export function clearPendingLayawayPayment(storage = globalThis.sessionStorage) {
  storage?.removeItem(STORAGE_KEY);
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
export async function checkLayawayPayment(supabase,pending) {
  if (!pending || !UUID.test(pending.operationId) || !positiveId(pending.layawayId)) throw Error("UUID invalido");
  const {data,error}=await supabase.rpc("donatello_checkout_status",{p_operation_id:pending.operationId});
  if (error) throw Error(error.message || "No se pudo consultar el estado");
  return data===null ? null : readReceipt(data,pending.layawayId);
}
export async function cancelLayawayPayment(supabase,pending) {
  if (!pending || !UUID.test(pending.operationId) || !positiveId(pending.layawayId)) throw Error("UUID invalido");
  const {data,error}=await supabase.rpc("donatello_checkout_cancel",{p_operation_id:pending.operationId});
  if (error) throw Error(error.message || "No se pudo cancelar el intento");
  return readReceipt(data,pending.layawayId);
}
