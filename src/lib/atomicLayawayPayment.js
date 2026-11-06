// ATLAS POS: abonos idempotentes. Nunca confiamos en el saldo o costo del navegador.
const KEY = "donatello.pos.pendingLayawayPayment.v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validUuid = id => {
  if (!UUID.test(String(id || ""))) throw Error("UUID de pago inválido");
  return String(id).toLowerCase();
};
const validId = id => {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) throw Error("Apartado inválido");
  return n;
};
function requireReceipt(data, layawayId = null) {
  if (data?.type !== "payment" && data?.type !== "liquidation") {
    throw Error("El recibo del servidor no es válido; consulta su estado");
  }
  if (!Number.isSafeInteger(Number(data.id)) || !Number.isSafeInteger(Number(data.payment_id)) ||
      Number(data.id) <= 0 || Number(data.payment_id) <= 0 ||
      !Number.isFinite(Number(data.payment_amount)) ||
      !Array.isArray(data.items) ||
      (layawayId !== null && Number(data.id) !== validId(layawayId))) {
    throw Error("El recibo no corresponde al apartado; consulta el historial");
  }
  return data;
}
export function makeLayawayOperationId(provider = globalThis.crypto) {
  if (!provider || typeof provider.randomUUID !== "function") throw Error("No se puede crear UUID seguro");
  return validUuid(provider.randomUUID());
}
export function readPendingLayawayPayment(storage = globalThis.sessionStorage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { operationId: validUuid(data.operationId), layawayId: validId(data.layawayId) };
  } catch { return null; }
}
export function storePendingLayawayPayment(op, storage = globalThis.sessionStorage) {
  const value = { operationId: validUuid(op.operationId), layawayId: validId(op.layawayId) };
  if (!storage?.setItem) throw Error("No se puede conservar el pago pendiente");
  storage.setItem(KEY, JSON.stringify(value));
  return value;
}
export function clearPendingLayawayPayment(storage = globalThis.sessionStorage) {
  storage?.removeItem(KEY);
}
export function buildLayawayPaymentParams({operationId,layawayId,amount}) {
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(cents) || !Number.isFinite(Number(amount)) ||
      cents <= 0 || cents > 10000000000 ||
      Math.abs(cents / 100 - Number(amount)) > 0.000000001) {
    throw Error("El abono requiere un importe válido de hasta dos decimales");
  }
  return {p_operation_id:validUuid(operationId),p_layaway_id:validId(layawayId),p_amount:cents/100};
}
export async function payLayawayOnce(client, params) {
  const {data,error} = await client.rpc("donatello_layaway_pay_once",params);
  if (error) throw Error(error.message || "Error registrando abono");
  return requireReceipt(data,params.p_layaway_id);
}
export async function checkLayawayPaymentStatus(client,pending) {
  const {data,error} = await client.rpc("donatello_layaway_pay_status",{p_operation_id:validUuid(pending.operationId)});
  if (error) throw Error(error.message || "No se pudo comprobar el pago");
  if (data === null) return null; // NULL nunca autoriza repetir con otro UUID.
  if (data?.state === "cancelled") return {state:"cancelled"};
  return requireReceipt(data,pending.layawayId);
}
export async function cancelLayawayPayment(client,pending) {
  const {data,error} = await client.rpc("donatello_layaway_pay_cancel",{p_operation_id:validUuid(pending.operationId)});
  if (error) throw Error(error.message || "No se pudo cancelar el intento");
  if (data?.state === "cancelled") return {state:"cancelled"};
  return requireReceipt(data,pending.layawayId);
}
