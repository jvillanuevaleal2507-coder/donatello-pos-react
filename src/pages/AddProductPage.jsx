import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import DonatelloAtlas from "../components/DonatelloAtlas";
import { saveAtlasIntelligence } from "../atlas/intelligenceService";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function Button({
  children,
  variant = "primary",
  disabled = false,
  onClick,
  type = "button",
  style = {},
}) {
  return (
    <button
      type={type}
      className={`btn ${
        variant === "secondary"
          ? "btn-secondary"
          : variant === "danger"
          ? "btn-danger"
          : "btn-primary"
      }`}
      disabled={disabled}
      onClick={onClick}
      style={style}
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
  const safeName = `${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}.${fileExt}`;
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

const emptyForm = {
  name: "",
  category: "",
  costUsd: "",
  exchangeRate: "20.00",
  commissionPercent: "15.00",
  taxPercent: "8.25",
  extraCostMxn: "0",
  price: "",
  stock: "1",
  image_url: "",
  image_url_2: "",
  image_url_3: "",
  image_url_4: "",
};

export default function AddProductPage({ products, loadProducts }) {
  const [form, setForm] = useState(emptyForm);
  const [atlasDraft, setAtlasDraft] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  const labelStyle = {
    fontSize: "1.25rem",
    fontWeight: 800,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  };

  const inputStyle = {
    minHeight: "64px",
    fontSize: "1.25rem",
    padding: "16px 18px",
    borderRadius: "18px",
  };

  const costUsd = Number(form.costUsd || 0);
  const exchangeRate = Number(form.exchangeRate || 0);
  const commissionPercent = Number(form.commissionPercent || 0);
  const taxPercent = Number(form.taxPercent || 0);
  const extraCostMxn = Number(form.extraCostMxn || 0);
  const price = Number(form.price || 0);

  const baseCostMxn = costUsd * exchangeRate;
  const commissionMxn = baseCostMxn * (commissionPercent / 100);
  const taxMxn = baseCostMxn * (taxPercent / 100);
  const totalCostMxn =
    baseCostMxn + commissionMxn + taxMxn + extraCostMxn;
  const profit = price - totalCostMxn;
  const margin = price > 0 ? (profit / price) * 100 : 0;

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function applyAtlasResult(product) {
    setAtlasDraft(product);

    setForm((prev) => ({
      ...prev,
      name: product.name || prev.name,
      category: product.category || prev.category,
      costUsd: product.costUsd ?? prev.costUsd,
      stock: product.stock ?? prev.stock,
      price: product.suggestedPrice || prev.price,
      image_url: product.image_url || prev.image_url,
      image_url_2: product.image_url_2 || prev.image_url_2,
      image_url_3: product.image_url_3 || prev.image_url_3,
      image_url_4: product.image_url_4 || prev.image_url_4,
    }));
  }

  async function handleImageFile(field, event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const publicUrl = await uploadProductImage(file);
      setForm((prev) => ({ ...prev, [field]: publicUrl }));
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

    try {
      setSavingProduct(true);

      const nextId = products.length
        ? Math.max(...products.map((p) => Number(p.id))) + 1
        : 1;

      const code = `DON-${String(nextId).padStart(6, "0")}`;

      const newProduct = {
        code,
        name: form.name.trim(),
        category: form.category || "General",
        cost: Number(totalCostMxn.toFixed(2)),
        price: Number(form.price || 0),
        stock: Number(form.stock || 0),
        image_url: form.image_url,
        image_url_2: form.image_url_2,
        image_url_3: form.image_url_3,
        image_url_4: form.image_url_4,
      };

      const { data: savedProduct, error: productError } = await supabase
        .from("products")
        .insert([newProduct])
        .select()
        .single();

      if (productError) {
        throw new Error(`Error guardando producto: ${productError.message}`);
      }

      let atlasWarning = "";

      if (atlasDraft) {
        try {
          await saveAtlasIntelligence({
            productId: savedProduct.id,
            referenceStore: atlasDraft.source,
            referenceUrl: atlasDraft.sourceUrl,
            referencePrice:
              atlasDraft.rawResult?.price ??
              atlasDraft.referencePrice ??
              null,
            referenceCurrency:
              atlasDraft.rawResult?.currency ||
              atlasDraft.referenceCurrency ||
              "USD",
            atlasConfidence: atlasDraft.confidence,
            atlasBrand:
              atlasDraft.rawResult?.metadata?.brand ||
              atlasDraft.atlasBrand ||
              "",
            atlasModel:
              atlasDraft.rawResult?.metadata?.model ||
              atlasDraft.atlasModel ||
              "",
            atlasCategory: form.category || atlasDraft.category || "General",
            atlasDescription:
              atlasDraft.description ||
              atlasDraft.atlasDescription ||
              "",
            imageMain: form.image_url,
            imageMeasurements: form.image_url_2,
            imageEnvironment: form.image_url_3,
            imageDetail: form.image_url_4,
            suggestedPrice:
              atlasDraft.suggestedPrice || form.price || null,
            approvedPrice: form.price || null,
          });
        } catch (atlasError) {
          console.error(atlasError);
          atlasWarning =
            "\n\nEl producto sí se guardó, pero Atlas no pudo guardar su memoria.";
        }
      }

      setForm({ ...emptyForm });
      setAtlasDraft(null);

      await loadProducts();

      alert(`Producto guardado correctamente.${atlasWarning}`);
    } catch (error) {
      alert(error.message || "No se pudo guardar el producto.");
    } finally {
      setSavingProduct(false);
    }
  }

  return (
    <Card>
      <h2 style={{ fontSize: "2.4rem", fontWeight: 900 }}>
        Agregar producto
      </h2>

      <DonatelloAtlas
        defaultCostUsd={form.costUsd}
        defaultStock={form.stock}
        onCostChange={(value) => updateField("costUsd", value)}
        onStockChange={(value) => updateField("stock", value)}
        onComplete={applyAtlasResult}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "8px 0 18px",
          color: "#756856",
          fontWeight: 800,
        }}
      >
        <span style={{ height: 1, background: "#d9cfb8", flex: 1 }} />
        Registro manual
        <span style={{ height: 1, background: "#d9cfb8", flex: 1 }} />
      </div>

      <div className="form-grid" style={{ gap: "18px", marginTop: 18 }}>
        <label style={labelStyle}>
          Nombre producto
          <input
            style={inputStyle}
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="Ej. Stand con 6 repisas"
          />
        </label>

        <label style={labelStyle}>
          Categoría
          <input
            style={inputStyle}
            value={form.category}
            onChange={(e) => updateField("category", e.target.value)}
            placeholder="Ej. Muebles"
          />
        </label>

        <label style={labelStyle}>
          Costo USD
          <input
            style={inputStyle}
            type="number"
            value={form.costUsd}
            onChange={(e) => updateField("costUsd", e.target.value)}
            placeholder="Costo en dólares"
          />
        </label>

        <label style={labelStyle}>
          Tipo de cambio
          <input
            style={inputStyle}
            type="number"
            value={form.exchangeRate}
            onChange={(e) => updateField("exchangeRate", e.target.value)}
            placeholder="Ej. 18.50"
          />
        </label>

        <label style={labelStyle}>
          Comisión proveedor %
          <input
            style={inputStyle}
            type="number"
            value={form.commissionPercent}
            onChange={(e) =>
              updateField("commissionPercent", e.target.value)
            }
            placeholder="Ej. 3"
          />
        </label>

        <label style={labelStyle}>
          Taxes %
          <input
            style={inputStyle}
            type="number"
            value={form.taxPercent}
            onChange={(e) => updateField("taxPercent", e.target.value)}
            placeholder="Ej. 8.25"
          />
        </label>

        <label style={labelStyle}>
          Costo extra MXN
          <input
            style={inputStyle}
            type="number"
            value={form.extraCostMxn}
            onChange={(e) => updateField("extraCostMxn", e.target.value)}
            placeholder="Flete, cruce, envío, etc."
          />
        </label>

        <label style={labelStyle}>
          Precio venta MXN
          <input
            style={inputStyle}
            type="number"
            value={form.price}
            onChange={(e) => updateField("price", e.target.value)}
            placeholder="Precio final de venta"
          />
        </label>

        <label style={labelStyle}>
          Stock
          <input
            style={inputStyle}
            type="number"
            value={form.stock}
            onChange={(e) => updateField("stock", e.target.value)}
            placeholder="Cantidad"
          />
        </label>

        <label style={labelStyle}>
          URL imagen principal
          <input
            style={inputStyle}
            value={form.image_url}
            onChange={(e) => updateField("image_url", e.target.value)}
            placeholder="Pega URL si ya tienes una"
          />
        </label>

        <label style={labelStyle}>
          URL imagen 2
          <input
            style={inputStyle}
            value={form.image_url_2}
            onChange={(e) => updateField("image_url_2", e.target.value)}
            placeholder="Opcional"
          />
        </label>

        <label style={labelStyle}>
          URL imagen 3
          <input
            style={inputStyle}
            value={form.image_url_3}
            onChange={(e) => updateField("image_url_3", e.target.value)}
            placeholder="Opcional"
          />
        </label>

        <label style={labelStyle}>
          URL imagen 4
          <input
            style={inputStyle}
            value={form.image_url_4}
            onChange={(e) => updateField("image_url_4", e.target.value)}
            placeholder="Opcional"
          />
        </label>
      </div>

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {[
          ["image_url", "Imagen principal"],
          ["image_url_2", "Imagen 2"],
          ["image_url_3", "Imagen 3"],
          ["image_url_4", "Imagen 4"],
        ].map(([field, label]) => (
          <label
            key={field}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: "#ff7a00",
              color: "#fff",
              padding: "18px 20px",
              borderRadius: 20,
              fontWeight: 900,
              fontSize: "1.1rem",
              minHeight: "62px",
              cursor: "pointer",
              boxShadow: "0 8px 20px rgba(255,122,0,.25)",
              textAlign: "center",
            }}
          >
            📷 {uploadingImage ? "Subiendo..." : `Subir ${label}`}

            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageFile(field, e)}
              hidden
              disabled={uploadingImage}
            />
          </label>
        ))}
      </div>

      {[
        form.image_url,
        form.image_url_2,
        form.image_url_3,
        form.image_url_4,
      ].filter(Boolean).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <strong>Vista previa de imágenes</strong>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 10,
              marginTop: 10,
            }}
          >
            {[
              form.image_url,
              form.image_url_2,
              form.image_url_3,
              form.image_url_4,
            ]
              .filter(Boolean)
              .map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className="product-card with-image"
                >
                  <img
                    src={url}
                    alt={`Vista previa ${index + 1}`}
                    className="product-img"
                  />
                </div>
              ))}
          </div>

          <p className="muted" style={{ marginTop: 8 }}>
            Se guardarán junto con el producto.
          </p>
        </div>
      )}

      <div className="metrics-grid" style={{ marginTop: 20 }}>
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

      <div style={{ marginTop: 20 }}>
        <Button
          onClick={saveProduct}
          disabled={savingProduct}
          style={{
            fontSize: "2rem",
            fontWeight: 900,
            minHeight: "72px",
            padding: "18px 28px",
          }}
        >
          {savingProduct ? "Guardando..." : "Guardar producto"}
        </Button>
      </div>
    </Card>
  );
}
