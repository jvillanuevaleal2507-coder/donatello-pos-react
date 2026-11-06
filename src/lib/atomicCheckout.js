// Contrato mínimo del RPC: no acepta costo, utilidad o stock desde el navegador.
function positiveInteger(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
export function buildAtomicCheckoutParams({
  cart, saleMode, discountPercent, received,
  customerName = "", customerPhone = "", depositAmount = 0, dueDate = null,
}) {
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
    p_mode: saleMode, p_items: items, p_discount_percent: discount, p_received: amount,
    p_customer_name: saleMode === "layaway" ? String(customerName).trim() : null,
    p_customer_phone: saleMode === "layaway" ? String(customerPhone).trim() : null,
    p_deposit: deposit, p_due_date: saleMode === "layaway" ? dueDate || null : null,
  };
}
export async function submitAtomicCheckout(supabase, params) {
  const { data, error } = await supabase.rpc("donatello_checkout", params);
  if (error) throw Error(error.message || "Error del servidor");
  if (!data || data.type !== params.p_mode || !positiveInteger(data.id) ||
      !Number.isFinite(Number(data.total)) || Number(data.total) <= 0 ||
      !Array.isArray(data.sale_items)) {
    throw Error("Comprobante incompleto, comprueba el historial");
  }
  return data;
}
