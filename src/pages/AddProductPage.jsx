import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function Button({ children, variant = "primary", disabled = false, onClick, type = "button" }) {
  return (
    <button
      type={type}
      className={`btn ${variant === "secondary" ? "btn-secondary" : variant === "danger" ? "btn-danger" : "btn-primary"}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function money(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number(value || 0));
}

async function uploadProductImage(file) {
  if (!file) return "";

  const fileExt = file.name.split(".").pop() || "jpg";
  const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
  const filePath = `products/${safeName}`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage
    .from("product-images")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

export default function AddProductPage({ products, loadProducts }) {
  const [form, setForm] = useState({
    name: "",
    category: "",
    costUsd: "",
    exchangeRate: "17.00",
    commissionPercent: "0",
    taxPercent: "8.25",
    extraCostMxn: "0",
    price: "",
    stock: "1",
    image_url: "",
  });

  const [uploadingImage, setUploadingImage] = useState(false);

  const costUsd = Number(form.costUsd || 0);
  const exchangeRate = Number(form.exchangeRate || 0);
  const commissionPercent = Number(form.commissionPercent || 0);
  const taxPercent = Number(form.taxPercent || 0);
  const extraCostMxn = Number(form.extraCostMxn || 0);
  const price = Number(form.price || 0);

  const baseCostMxn = costUsd * exchangeRate;
  const commissionMxn = baseCostMxn * (commissionPercent / 100);
  const taxMxn = baseCostMxn * (taxPercent / 100);
  const totalCostMxn = baseCostMxn + commissionMxn + taxMxn + extraCostMxn;
  const profit = price - totalCostMxn;
  const margin = price > 0 ? (profit / price) * 100 : 0;

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleImageFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const publicUrl = await uploadProductImage(file);
      setForm((prev) => ({ ...prev, image_url: publicUrl }));
    } catch (error) {
      alert(`Error subiendo imagen: ${error.message}`);
    } finally {
      setUploadingImage(false);
    }
  }

  async function saveProduct() {
    if (!form.name.trim()) {
      alert("Agrega el nombre del producto.");
      return;
    }

    const nextId = products.length ? Math.max(...products.map((p) => Number(p.id))) + 1 : 1;
    const code = `DON-${String(nextId).padStart(6, "0")}`;

    const newProduct = {
      code,
      name: form.name,
      category: form.category || "General",
      cost: Number(totalCostMxn.toFixed(2)),
      price: Number(form.price || 0),
      stock: Number(form.stock || 0),
      image_url: form.image_url,
    };

    const { error } = await supabase.from("products").insert([newProduct]);

    if (error) {
      alert(`Error guardando producto: ${error.message}`);
      return;
    }

    setForm({
      name: "",
      category: "",
      costUsd: "",
      exchangeRate: "17.00",
      commissionPercent: "0",
      taxPercent: "8.25",
      extraCostMxn: "0",
      price: "",
      stock: "1",
      image_url: "",
    });

    await loadProducts();
    alert("Producto guardado correctamente.");
  }

  return (
  <Card>
    <h2>Agregar producto</h2>

    <div className="form-grid">
      <label>
        Nombre producto
        <input
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="Ej. Stand con 6 repisas"
        />
      </label>

      <label>
        Categoría
        <input
          value={form.category}
          onChange={(e) => updateField("category", e.target.value)}
          placeholder="Ej. Muebles"
        />
      </label>

      <label>
        Costo USD
        <input
          type="number"
          value={form.costUsd}
          onChange={(e) => updateField("costUsd", e.target.value)}
          placeholder="Costo en dólares"
        />
      </label>

      <label>
        Tipo de cambio
        <input
          type="number"
          value={form.exchangeRate}
          onChange={(e) => updateField("exchangeRate", e.target.value)}
          placeholder="Ej. 18.50"
        />
      </label>

      <label>
        Comisión proveedor %
        <input
          type="number"
          value={form.commissionPercent}
          onChange={(e) => updateField("commissionPercent", e.target.value)}
          placeholder="Ej. 3"
        />
      </label>

      <label>
        Taxes %
        <input
          type="number"
          value={form.taxPercent}
          onChange={(e) => updateField("taxPercent", e.target.value)}
          placeholder="Ej. 8.25"
        />
      </label>

      <label>
        Costo extra MXN
        <input
          type="number"
          value={form.extraCostMxn}
          onChange={(e) => updateField("extraCostMxn", e.target.value)}
          placeholder="Flete, cruce, envío, etc."
        />
      </label>

      <label>
        Precio venta MXN
        <input
          type="number"
          value={form.price}
          onChange={(e) => updateField("price", e.target.value)}
          placeholder="Precio final de venta"
        />
      </label>

      <label>
        Stock
        <input
          type="number"
          value={form.stock}
          onChange={(e) => updateField("stock", e.target.value)}
          placeholder="Cantidad"
        />
      </label>

      <label>
        URL de imagen opcional
        <input
          value={form.image_url}
          onChange={(e) => updateField("image_url", e.target.value)}
          placeholder="Pega URL si ya tienes una"
        />
      </label>
    </div>

    <div style={{ marginTop: 12 }}>
      <label className="upload-btn">
        {uploadingImage ? "Subiendo imagen..." : "📷 Subir imagen del producto"}
        <input
          type="file"
          accept="image/*"
          onChange={handleImageFile}
          hidden
        />
      </label>
    </div>

    {form.image_url && (
      <div className="product-card with-image" style={{ marginTop: 12 }}>
        <img src={form.image_url} alt="Vista previa" className="product-img" />
        <div>
          <strong>Imagen cargada</strong>
          <p className="muted">Se guardará junto con el producto.</p>
        </div>
      </div>
    )}

    <div className="metrics-grid" style={{ marginTop: 16 }}>
      <Card>
        <span className="metric-label">Costo base MXN</span>
        <strong className="metric-value">{money(baseCostMxn)}</strong>
      </Card>

      <Card>
        <span className="metric-label">Comisión</span>
        <strong className="metric-value">{money(commissionMxn)}</strong>
      </Card>

      <Card>
        <span className="metric-label">Taxes</span>
        <strong className="metric-value">{money(taxMxn)}</strong>
      </Card>

      <Card>
        <span className="metric-label">Costo total</span>
        <strong className="metric-value">{money(totalCostMxn)}</strong>
      </Card>

      <Card>
        <span className="metric-label">Utilidad estimada</span>
        <strong className="metric-value">{money(profit)}</strong>
      </Card>

      <Card>
        <span className="metric-label">Margen</span>
        <strong className="metric-value">{margin.toFixed(1)}%</strong>
      </Card>
    </div>

    <div style={{ marginTop: 16 }}>
      <Button onClick={saveProduct}>Guardar producto</Button>
    </div>
  </Card>
);
