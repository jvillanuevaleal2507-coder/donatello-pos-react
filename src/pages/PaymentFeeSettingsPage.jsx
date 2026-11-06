import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { PAYMENT_FEE_DEFAULTS, validatePaymentFeeConfig, cardProcessingFee, commercialPublicPriceIncludingCardFee } from "../utils/paymentFee.js";

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const mxn = (value) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value) || 0);

const inputStyle = { width: "100%", minHeight: 44, marginTop: 6 };
const fieldStyle = { display: "block", minWidth: 0 };
const sectionStyle = { padding: "20px", borderRadius: 16, background: "var(--surface, #fff)", border: "1px solid var(--border, #dce2e8)" };

export default function PaymentFeeSettingsPage() {
  const [form, setForm] = useState(PAYMENT_FEE_DEFAULTS);
  const [target, setTarget] = useState("2400");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    supabase.from("pos_payment_fee_settings")
      .select("enabled,provider,rate_percent,fixed_fee_mxn,vat_percent")
      .eq("id", 1)
      .single()
      .then(({ data, error: fetchError }) => {
        if (!mounted) return;
        if (fetchError || !data) {
          setError("No se pudo consultar la configuración. No se puede habilitar la comisión.");
        } else {
          setForm(data);
        }
      })
      .catch(() => {
        if (mounted) setError("No hay conexión con la configuración de comisiones.");
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  function setField(field, value) {
    setMessage("");
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  const valid = validatePaymentFeeConfig(form) && form.provider.trim().length > 0 && form.provider.trim().length <= 80;
  const price = valid ? commercialPublicPriceIncludingCardFee(target, form) : 0;
  const fee = valid ? cardProcessingFee(price, form) : 0;

  async function save() {
    setMessage("");
    if (!valid) { setError("Revisa la tarifa, IVA y cuota fija antes de guardar."); return; }
    if (loading || saving || error) return;
    if (form.enabled && !window.confirm(
      "¿Confirmas activar la comisión de tarjeta para los PRODUCTOS NUEVOS? No se modificarán precios existentes, ni se agregará un cargo extra al cobrar."
    )) return;

    setSaving(true);
    const { data, error: updateError } = await supabase.from("pos_payment_fee_settings").update({
      enabled: form.enabled === true,
      provider: form.provider.trim(),
      rate_percent: Number(form.rate_percent),
      fixed_fee_mxn: Number(form.fixed_fee_mxn),
      vat_percent: Number(form.vat_percent),
      updated_at: new Date().toISOString(),
    }).eq("id", 1).select("enabled,provider,rate_percent,fixed_fee_mxn,vat_percent").single();
    setSaving(false);
    if (updateError || !data) {
      setError("No se pudieron guardar los ajustes. Verifica tu acceso de administrador.");
      return;
    }
    setForm(data);
    setMessage(data.enabled
      ? "Comisión activada para nuevos productos. Los precios existentes permanecen iguales."
      : "Configuración guardada. La comisión de tarjeta permanece desactivada.");
  }

  return (
    <section className="add-product-modern" style={{ display: "grid", gap: 16 }}>
      <header className="add-product-heading">
        <div>
          <span className="eyebrow">Configuración · Administración</span>
          <h2>Comisión de terminal</h2>
          <p>Prepara la tarifa que incorporaremos al precio público de los productos nuevos.</p>
        </div>
        <div className="add-product-margin-badge">
          <span>Estado</span>
          <strong style={{ color: form.enabled ? "#11663b" : "#99520f" }}>{form.enabled ? "Activa" : "En espera"}</strong>
          <small>{form.enabled ? "Afecta nuevos productos" : "No cambia ningún precio"}</small>
        </div>
      </header>

      <div style={sectionStyle}>
        {loading ? <p>Cargando configuración…</p> : <>
          {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
          {message && <p role="status" style={{ color: "#11663b" }}>{message}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))", gap: 16 }}>
            <label style={fieldStyle}>Proveedor de la terminal
              <input style={inputStyle} value={form.provider} maxLength={80} onChange={(e) => setField("provider", e.target.value)} placeholder="Por definir" disabled={!!error} />
            </label>
            <label style={fieldStyle}>Comisión de venta (%)
              <input style={inputStyle} type="number" min="0" max="20" step="0.001" value={form.rate_percent} onChange={(e) => setField("rate_percent", e.target.value)} disabled={!!error} />
            </label>
            <label style={fieldStyle}>Cuota fija por operación (MXN)
              <input style={inputStyle} type="number" min="0" max="1000" step="0.01" value={form.fixed_fee_mxn} onChange={(e) => setField("fixed_fee_mxn", e.target.value)} disabled={!!error} />
            </label>
            <label style={fieldStyle}>IVA aplicado a la comisión (%)
              <input style={inputStyle} type="number" min="0" max="30" step="0.01" value={form.vat_percent} onChange={(e) => setField("vat_percent", e.target.value)} disabled={!!error} />
            </label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 24, fontWeight: 700 }}>
            <input type="checkbox" checked={form.enabled === true} disabled={!!error} onChange={(e) => setField("enabled", e.target.checked)} style={{ width: 22, height: 22 }} />
            Habilitar comisión para productos nuevos
          </label>
          <p className="muted" style={{ marginTop: 9 }}>
            El módulo queda apagado hasta que lo autoricen. No modifica existencias, ventas pasadas ni precios ya publicados.
          </p>
          <button type="button" className="btn btn-primary" onClick={save} disabled={loading || saving || !!error || !valid} style={{ marginTop: 18 }}>
            {saving ? "Guardando…" : "Guardar configuración"}
          </button>
        </>}
      </div>

      <div style={sectionStyle}>
        <h3>Simulador de precio público redondeado</h3>
        <p className="muted">Puedes probarlo aunque el módulo esté desactivado. Redondeamos hacia arriba a $10, $50 o $100 según el precio, conservando el neto. No modifica productos.</p>
        <label style={{ display: "block", maxWidth: 300, marginTop: 14 }}>Precio neto que deseas conservar (MXN)
          <input style={inputStyle} type="number" min="0" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        {valid && Number(target) > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 15, marginTop: 16 }}>
            <div><span className="muted">Precio público calculado</span><h3>{mxn(price)}</h3></div>
            <div><span className="muted">Comisión + IVA</span><h3>{mxn(fee)}</h3></div>
            <div><span className="muted">Neto conservado</span><h3>{mxn(price - fee)}</h3></div>
          </div>
        ) : <p>Ingresa una tarifa válida y un precio positivo.</p>}
        <p className="muted" style={{ marginTop: 14 }}>El precio público será el mismo para efectivo, transferencia y tarjeta. Cuando esté activo, el costeo de <strong>Nuevo producto</strong> incluirá este importe automáticamente. La utilidad neta real de una venta dependerá del método de cobro.</p>
      </div>
    </section>
  );
}
