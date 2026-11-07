// ATLAS Donatello: one unresolved POS financial operation per account.
// Server state is authoritative after device reset; never cache PII or JWT.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS=new Set(["checkout","layaway_payment"]);
const requireUuid=(id)=>{
  if(!UUID.test(String(id||""))) throw Error("UUID de operación inválido");
  return String(id).toLowerCase();
};
const read=(data)=>{
  if(data===null) return null;
  if(!data || !KINDS.has(data.kind) || !UUID.test(String(data.operation_id||"")) ||
     !["reserved","completed","cancelled"].includes(data.state) ||
     (data.kind==="layaway_payment" &&
       (!Number.isSafeInteger(Number(data.layaway_id)) || Number(data.layaway_id)<=0)) ||
     (data.kind==="checkout" && data.layaway_id!=null) ||
     (data.state==="completed" && (!data.receipt || typeof data.receipt!=="object")) ||
     (data.state!=="completed" && data.receipt!=null)) {
    throw Error("Estado del servidor no verificable: operaciones bloqueadas");
  }
  return {operationId:requireUuid(data.operation_id),kind:data.kind,
    layawayId:data.layaway_id==null?null:Number(data.layaway_id),
    state:data.state,receipt:data.receipt||null};
};
export async function reservePosOperation(supabase,operationId,kind,layawayId=null) {
  if(!KINDS.has(kind)) throw Error("Tipo financiero inválido");
  const id=requireUuid(operationId);
  if(kind==="layaway_payment" &&
      (!Number.isSafeInteger(Number(layawayId)) || Number(layawayId)<=0)) {
    throw Error("Apartado inválido");
  }
  const {data,error}=await supabase.rpc("donatello_payment_reserve",{
    p_operation_id:id,p_kind:kind,
    p_layaway_id:kind==="layaway_payment"?Number(layawayId):null,
  });
  if(error) throw Error(error.message||"No se pudo reservar cobro");
  if(data?.operation_id!==id || data?.kind!==kind || data?.state!=="reserved") {
    throw Error("Reserva no confirmada: es necesario conciliar");
  }
  return {operationId:id,kind,layawayId:kind==="layaway_payment"?Number(layawayId):null,
    state:"reserved",receipt:null};
}
export async function recoverPosOperation(supabase) {
  const {data,error}=await supabase.rpc("donatello_payment_recover");
  if(error) throw Error(error.message||"No se pudo consultar reserva del servidor");
  return read(data);
}
export async function acknowledgePosOperation(supabase,operationId) {
  const {data,error}=await supabase.rpc("donatello_payment_ack",
    {p_operation_id:requireUuid(operationId)});
  if(error) throw Error(error.message||"No se pudo confirmar el comprobante");
  if(data?.state!=="acknowledged") throw Error("No se liberó la reserva del cobro");
  return true;
}
