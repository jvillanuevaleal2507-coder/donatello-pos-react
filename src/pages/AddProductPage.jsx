import { useEffect, useMemo, useState } from "react";
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


function normalizePreviewUrl(value = "") {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/^http:\/\//i, "https://");
}

function buildPreviewCandidates(value = "") {
  const original = normalizePreviewUrl(value);
  if (!original) return [];

  const candidates = [original];

  try {
    const parsed = new URL(original);
    const host = parsed.hostname.toLowerCase();

    if (
      host === "images-na.ssl-images-amazon.com" ||
      host === "images.amazon.com"
    ) {
      const alternative = new URL(original);
      alternative.hostname = "m.media-amazon.com";
      candidates.push(alternative.toString());
    }

    if (host === "m.media-amazon.com") {
      const alternative = new URL(original);
      alternative.hostname = "images-na.ssl-images-amazon.com";
      candidates.push(alternative.toString());
    }
  } catch {
    // La URL se conserva tal como fue recibida.
  }

  return [...new Set(candidates)];
}

function PreviewImage({ url, label }) {
  const candidates = useMemo(
    () => buildPreviewCandidates(url),
    [url]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
  }, [url]);

  const currentUrl = candidates[candidateIndex] || "";

  function handleError() {
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex((value) => value + 1);
      return;
    }

    setFailed(true);
  }

  if (!currentUrl || failed) {
    return (
      <div
        style={{
          width: "100%",
          minHeight: 130,
          borderRadius: 16,
          border: "1px dashed #cfb97a",
          background: "#fffaf0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 12,
          textAlign: "center",
          color: "#6d5d48",
        }}
      >
        <strong>{label}</strong>
        <span style={{ fontSize: ".85rem" }}>
          La URL está guardada, pero esta tienda bloqueó la miniatura.
        </span>
        {normalizePreviewUrl(url) && (
          <a
            href={normalizePreviewUrl(url)}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "#244c3d",
              fontWeight: 900,
              fontSize: ".85rem",
            }}
          >
            Abrir imagen
          </a>
        )}
      </div>
    );
  }

  return (
    <img
      src={currentUrl}
      alt={label}
      className="product-img"
      referrerPolicy="no-referrer"
      loading="eager"
      decoding="async"
      onError={handleError}
      style={{
        display: "block",
        width: "100%",
        height: 150,
        objectFit: "contain",
        borderRadius: 14,
        background: "#fff",
      }}
    />
  );
}

export default function AddProductPage({ products, loadProducts }) {
  const [form, setForm] = useState(emptyForm);
  const [atlasDraft, setAtlasDraft] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

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
    <section className="add-product-modern">
      <div className="add-product-heading">
        <div>
          <span className="eyebrow">Inventario</span>
          <h2>Nuevo producto</h2>
          <p>Registra el producto, valida su costo real y deja listas sus imágenes.</p>
        </div>

        <div className="add-product-margin-badge">
          <span>Margen estimado</span>
          <strong>{margin.toFixed(1)}%</strong>
          <small>{money(profit)} de utilidad</small>
        </div>
      </div>

      <Card className="add-product-atlas-card">
        <DonatelloAtlas
          defaultCostUsd={form.costUsd}
          defaultStock={form.stock}
          onCostChange={(value) => updateField("costUsd", value)}
          onStockChange={(value) => updateField("stock", value)}
          onComplete={applyAtlasResult}
        />
      </Card>

      <div className="add-product-layout">
        <Card className="add-product-form-card">
          <div className="add-product-section-title">
            <div>
              <span className="eyebrow">Datos del producto</span>
              <h3>Información general</h3>
            </div>
            <span className="sale-step">01</span>
          </div>

          <div className="add-product-form-grid">
            <label>
              Nombre del producto
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
              Precio de venta MXN
              <input
                type="number"
                value={form.price}
                onChange={(e) => updateField("price", e.target.value)}
                placeholder="Precio final"
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
          </div>

          <div className="add-product-divider"><span>Costeo</span></div>

          <div className="add-product-form-grid cost-grid">
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
                placeholder="Ej. 15"
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

            <label className="span-2">
              Costo extra MXN
              <input
                type="number"
                value={form.extraCostMxn}
                onChange={(e) => updateField("extraCostMxn", e.target.value)}
                placeholder="Flete, cruce, envío, etc."
              />
            </label>
          </div>
        </Card>

        <div className="add-product-side">
          <Card className="add-product-cost-card">
            <div className="add-product-section-title">
              <div>
                <span className="eyebrow">Costo real</span>
                <h3>Resumen</h3>
              </div>
              <span className="sale-step">02</span>
            </div>

            <div className="add-cost-summary">
              <div><span>Costo base MXN</span><b>{money(baseCostMxn)}</b></div>
              <div><span>Comisión</span><b>{money(commissionMxn)}</b></div>
              <div><span>Taxes</span><b>{money(taxMxn)}</b></div>
              <div className="total"><span>Costo total</span><strong>{money(totalCostMxn)}</strong></div>
              <div className="profit"><span>Utilidad estimada</span><strong>{money(profit)}</strong></div>
            </div>
          </Card>

          <Card className="add-product-save-card">
            <span className="eyebrow">Finalizar</span>
            <h3>Guardar producto</h3>
            <p>El código Donatello se genera automáticamente.</p>
            <Button
              onClick={saveProduct}
              disabled={savingProduct}
              style={{ width: "100%", minHeight: 54, marginTop: 12 }}
            >
              {savingProduct ? "Guardando..." : "Guardar producto"}
            </Button>
          </Card>
        </div>
      </div>

      <Card className="add-product-images-card">
        <div className="add-product-section-title">
          <div>
            <span className="eyebrow">Contenido visual</span>
            <h3>Imágenes del producto</h3>
          </div>
          <span className="sale-step">03</span>
        </div>

        <div className="add-image-url-grid">
          {[
            ["image_url", "Imagen principal"],
            ["image_url_2", "Imagen 2"],
            ["image_url_3", "Imagen 3"],
            ["image_url_4", "Imagen 4"],
          ].map(([field, label]) => (
            <label key={field}>
              {label}
              <input
                value={form[field]}
                onChange={(e) => updateField(field, e.target.value)}
                placeholder="URL opcional"
              />
              <span className="add-image-upload">
                {uploadingImage ? "Subiendo..." : "Subir archivo"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageFile(field, e)}
                  hidden
                  disabled={uploadingImage}
                />
              </span>
            </label>
          ))}
        </div>

        {[
          form.image_url,
          form.image_url_2,
          form.image_url_3,
          form.image_url_4,
        ].filter(Boolean).length > 0 && (
          <div className="add-image-preview">
            {[
              ["Imagen principal", form.image_url],
              ["Imagen 2", form.image_url_2],
              ["Imagen 3", form.image_url_3],
              ["Imagen 4", form.image_url_4],
            ]
              .filter(([, url]) => Boolean(url))
              .map(([label, url]) => (
                <div key={`${label}-${url}`} className="add-image-preview-card">
                  <PreviewImage url={url} label={label} />
                  <span>{label}</span>
                </div>
              ))}
          </div>
        )}
      </Card>
    </section>
  );
}
