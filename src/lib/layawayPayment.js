// ATLAS: pagos de apartados. Persistir solo UUID, nunca datos de cliente.
const KEY="donatello.pos.pendingLayawayPayment.v1";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function operationId(id) {
  if(!UUID.test(String(id||""))) throw Error("Identificador de abono inválido");
  return String(id).toLowerCase();
}
export function newLayawayPaymentId(cryptoProvider=globalThis.crypto) {
  if(typeof cryptoProvider?.randomUUID!=="function") throw Error("No se puede generar un UUID seguro");
  return operationId(cryptoProvider.randomUUID());
}
export function getPendingLayawayPaymentId(storage=globalThis.sessionStorage) {
  try { const id=storage?.getItem(KEY);return UUID.test(String(id||""))?id:null; }
  catch{return null;}
}
export function keepPendingLayawayPaymentId(id,storage=globalThis.sessionStorage) {
  const uuid=operationId(id);
  if(!storage?.setItem) throw Error("No se puede proteger la operación pendiente");
  storage.setItem(KEY,uuid);
  return uuid;
}
export function clearPendingLayawayPaymentId(storage=globalThis.sessionStorage) {
  try{storage?.removeItem(KEY);}catch{/* Estado React también se limpia. */}
}
export function buildLayawayPaymentParams({operationId:op,layawayId,amount,expectedBalance}) {
  const id=Number(layawayId),value=Number(amount),balance=Number(expectedBalance);
  if(!Number.isSafeInteger(id)||id<=0)throw Error("Apartado inválido");
  if(!Number.isFinite(value)||value<=0||value>100000000||Math.round(value*100)!==value*100)
    throw Error("Abono inválido: usa pesos y centavos");
  if(!Number.isFinite(balance)||balance<=0||balance>100000000||Math.round(balance*100)!==balance*100)
    throw Error("Saldo inválido");
  if(value>balance)throw Error("El abono excede el saldo");
  return {
    p_operation_id:operationId(op),p_layaway_id:id,
    p_amount:value,p_expected_balance:balance,
  };
}
function validateReceipt(data) {
  if(!data||!Number.isSafeInteger(Number(data.payment_id))||
     Number(data.payment_id)<=0||!Number.isSafeInteger(Number(data.id))||
     Number(data.id)<=0||!["payment","liquidation"].includes(data.type)||
     !Number.isFinite(Number(data.payment_amount))||Number(data.payment_amount)<=0||
     !Number.isFinite(Number(data.balance))||Number(data.balance)<0||
     !Number.isFinite(Number(data.total))||Number(data.total)<=0) {
    throw Error("Comprobante incompleto. No vuelvas a cobrar sin revisar el historial");
  }
  return data;
}
export async function submitLayawayPayment(supabase,params) {
  const {data,error}=await supabase.rpc("donatello_layaway_payment_once",params);
  if(error)throw Error(error.message||"Error registrando abono");
  return validateReceipt(data);
}
export async function checkLayawayPayment(supabase,id) {
  const {data,error}=await supabase.rpc("donatello_layaway_payment_status",{
    p_operation_id:operationId(id),
  });
  if(error)throw Error(error.message||"Error consultando el abono");
  if(data===null)return null;
  if(data?.state==="cancelled")return {state:"cancelled"};
  return validateReceipt(data);
}
export async function cancelLayawayPayment(supabase,id) {
  const {data,error}=await supabase.rpc("donatello_layaway_payment_cancel",{
    p_operation_id:operationId(id),
  });
  if(error)throw Error(error.message||"Error cancelando el intento");
  if(data?.state==="cancelled")return {state:"cancelled"};
  return validateReceipt(data);
}
