import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Link } from "react-router-dom";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function ProductImage({ src, alt = "Producto", priority = false }) {
  const [loaded, setLoaded] = useState(false);

  if (!src) return <div className="inventory-product-image placeholder">Sin foto</div>;

  return (
    <>
      {!loaded && <div className="inventory-image-skeleton" aria-hidden="true" />}
      <img
        src={src}
        alt={alt}
        className={`inventory-product-image ${loaded ? "is-loaded" : "is-loading"}`}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </>
  );
}

function money(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function margin(price, cost) {
  if (!price) return 0;
  return ((Number(price || 0) - Number(cost || 0)) / Number(price || 1)) * 100;
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCategory(value) {
  const raw = cleanText(value);
  const key = normalizeSearchText(raw);
  const categories = {
    decoracion: "Decoración",
    iluminacion: "Iluminación",
    muebles: "Muebles",
    mueble: "Muebles",
    sabanas: "Sábanas",
    cocina: "Cocina",
    vajilla: "Vajilla",
    juguete: "Juguetes",
    juguetes: "Juguetes",
    infantil: "Infantil",
    hogar: "Hogar",
    general: "General",
  };
  return categories[key] || raw || "General";
}

function stockMeta(product) {
  const stock = Number(product.stock || 0);
  if (stock <= 0) return { label: "Agotado", tone: "out" };
  if (stock <= 3) return { label: "Stock bajo", tone: "low" };
  return { label: "Disponible", tone: "ok" };
}

function EditProduct({ product, onSaved }) {
  const [form, setForm] = useState({
    name: product.name || "",
    category: product.category || "",
    cost: product.cost || 0,
    price: product.price || 0,
    stock: product.stock || 0,
    image_url: product.image_url || "",
    image_url_2: product.image_url_2 || "",
    image_url_3: product.image_url_3 || "",
    image_url_4: product.image_url_4 || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

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

  async function saveChanges() {
    setSaving(true);
    const { error } = await supabase
      .from("products")
      .update({
        name: cleanText(form.name),
        category: normalizeCategory(form.category),
        cost: Number(form.cost || 0),
        price: Number(form.price || 0),
        stock: Number(form.stock || 0),
        image_url: form.image_url,
        image_url_2: form.image_url_2,
        image_url_3: form.image_url_3,
        image_url_4: form.image_url_4,
      })
      .eq("id", product.id);

    setSaving(false);
    if (error) {
      alert(`Error actualizando producto: ${error.message}`);
      return;
    }
    await onSaved();
  }

  return (
    <div className="edit-box inventory-edit-box">
      <div className="inventory-edit-title">
        <div>
          <span className="eyebrow">Edición rápida</span>
          <h3>{product.name}</h3>
        </div>
      </div>

      <div className="form-grid">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" />
        <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Categoría" />
        <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Costo" />
        <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Precio" />
        <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="Stock" />

        {["image_url", "image_url_2", "image_url_3", "image_url_4"].map((field, i) => (
          <div key={field}>
            <input
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              placeholder={i === 0 ? "URL imagen principal" : `URL imagen ${i + 1}`}
            />
            <label className="file-upload-box">
              <span>{uploadingImage ? "Subiendo imagen..." : i === 0 ? "Subir imagen principal" : `Subir imagen ${i + 1}`}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleImageFile(field, e)}
                disabled={uploadingImage}
              />
            </label>
          </div>
        ))}
      </div>

      <button className="btn btn-primary" onClick={saveChanges} disabled={saving}>
        {saving ? "Guardando..." : "Guardar cambios"}
      </button>
    </div>
  );
}

export default function InventoryPage({
  allProducts = [],
  searchTerm,
  setSearchTerm,
  categoryFilter,
  setCategoryFilter,
  categories = [],
  loadProducts,
}) {
  const [editingId, setEditingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState("cards");
  const [isMobileInventory, setIsMobileInventory] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 760px)").matches : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsMobileInventory(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  const visibleProducts = useMemo(() => {
    const query = normalizeSearchText(searchTerm);

    return allProducts.filter((product) => {
      const productCategory = cleanText(product.category || "Sin categoría");
      const matchesCategory = categoryFilter === "all" || productCategory === categoryFilter;
      const haystack = normalizeSearchText(
        `${product.name || ""} ${product.code || ""} ${product.category || ""}`
      );
      const matchesSearch = haystack.includes(query);
      const stock = Number(product.stock || 0);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "available" && stock > 3) ||
        (statusFilter === "low" && stock > 0 && stock <= 3) ||
        (statusFilter === "out" && stock <= 0) ||
        (statusFilter === "no-photo" && !product.image_url);

      return matchesCategory && matchesSearch && matchesStatus;
    });
  }, [allProducts, searchTerm, categoryFilter, statusFilter]);

  async function deleteProduct(product) {
    const confirmed = window.confirm(`¿Eliminar "${product.name}" del inventario?`);
    if (!confirmed) return;

    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) {
      alert(`Error eliminando producto: ${error.message}`);
      return;
    }
    await loadProducts();
  }

  function downloadInventory() {
    const headers = ["Código", "Producto", "Categoría", "Costo", "Precio", "Stock", "Margen"];
    const rows = allProducts.map((p) => [
      p.code || "",
      p.name || "",
      p.category || "",
      Number(p.cost || 0),
      Number(p.price || 0),
      Number(p.stock || 0),
      `${margin(p.price, p.cost).toFixed(1)}%`,
    ]);

    const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Inventario_Donatello_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const statusOptions = [
    ["all", "Todos"],
    ["available", "Disponibles"],
    ["low", "Stock bajo"],
    ["out", "Agotados"],
    ["no-photo", "Sin foto"],
  ];

  return (
    <section className="inventory-section inventory-modern">
      <div className="inventory-heading-row">
        <div>
          <span className="eyebrow">Catálogo operativo</span>
          <h2>Inventario</h2>
          <p className="muted">Busca, revisa existencias y edita productos sin salir de esta pantalla.</p>
        </div>

        <div className="inventory-heading-actions">
          <Link to="/agregar" className="btn btn-primary inventory-add-link">+ Nuevo producto</Link>
          <button className="btn btn-secondary" onClick={downloadInventory}>⇩ Descargar Excel</button>
        </div>
      </div>

      <Card className="inventory-toolbar-card">
        <div className="inventory-search-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            className="inventory-search-input"
            type="search"
            placeholder="Buscar por nombre, modelo, código o categoría..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="inventory-filter-row">
          <div className="inventory-status-pills">
            {statusOptions.map(([value, label]) => (
              <button
                key={value}
                className={`category-pill ${statusFilter === value ? "active" : ""}`}
                onClick={() => setStatusFilter(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="inventory-view-toggle" aria-label="Tipo de vista">
            <button className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")} type="button">▦ Tarjetas</button>
            <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} type="button">☷ Lista</button>
          </div>
        </div>

        <div className="inventory-category-row">
          <span className="inventory-filter-label">Categoría</span>
          <div className="category-pills">
            {categories.map((category) => (
              <button
                key={category}
                className={`category-pill category-secondary ${categoryFilter === category ? "active" : ""}`}
                onClick={() => setCategoryFilter(category)}
                type="button"
              >
                {category === "all" ? "Todas" : category}
              </button>
            ))}
          </div>
        </div>

        <p className="catalog-counter">
          {visibleProducts.length} de {allProducts.length} productos
        </p>
      </Card>

      {visibleProducts.length === 0 ? (
        <Card className="inventory-empty">
          <strong>No encontramos productos con esos filtros.</strong>
          <span>Prueba otra búsqueda o vuelve a “Todos”.</span>
        </Card>
      ) : (
        <div className={`products-grid inventory-products-grid ${viewMode === "list" ? "list-mode" : ""}`}>
          {visibleProducts.map((p, index) => {
            const status = stockMeta(p);
            const extraPhotos = [p.image_url_2, p.image_url_3, p.image_url_4].filter(Boolean).length;

            if (isMobileInventory) {
              return (
                <article key={p.id} className="inventory-mobile-card-v4">
                  <div className="inventory-mobile-media-v4">
                    <ProductImage src={p.image_url} alt={p.name} priority={index < 8} />
                    {extraPhotos > 0 && <span className="inventory-mobile-photo-count-v4">+{extraPhotos} fotos</span>}
                  </div>

                  <div className="inventory-mobile-body-v4">
                    <div className="inventory-mobile-title-row-v4">
                      <div className="inventory-mobile-title-copy-v4">
                        <h3>{p.name}</h3>
                        <p>{p.code || "Sin código"} · {p.category || "Sin categoría"}</p>
                      </div>
                      <span className={`inventory-mobile-status-v4 ${status.tone}`}>{status.label}</span>
                    </div>

                    <div className="inventory-mobile-metrics-v4">
                      <div>
                        <span>Precio</span>
                        <strong>{money(p.price)}</strong>
                      </div>
                      <div>
                        <span>Stock</span>
                        <strong>{Number(p.stock || 0)}</strong>
                      </div>
                      <div>
                        <span>Costo</span>
                        <strong>{money(p.cost)}</strong>
                      </div>
                      <div>
                        <span>Margen</span>
                        <strong>{margin(p.price, p.cost).toFixed(1)}%</strong>
                      </div>
                    </div>

                    <div className="inventory-mobile-actions-v4">
                      <button
                        className="btn btn-secondary"
                        onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                        type="button"
                      >
                        {editingId === p.id ? "Cerrar edición" : "✎ Editar"}
                      </button>
                      <button className="inventory-danger-link" onClick={() => deleteProduct(p)} type="button">
                        Eliminar
                      </button>
                    </div>
                  </div>

                  {editingId === p.id && (
                    <EditProduct
                      product={p}
                      onSaved={async () => {
                        setEditingId(null);
                        await loadProducts();
                      }}
                    />
                  )}
                </article>
              );
            }

            return (
              <Card key={p.id} className="inventory-product-card">
                <div className="inventory-product-card-main">
                  <div className="inventory-image-wrap">
                    <ProductImage src={p.image_url} alt={p.name} priority={index < 8} />
                    {extraPhotos > 0 && <span className="inventory-photo-count">+{extraPhotos} fotos</span>}
                  </div>

                  <div className="inventory-product-content">
                    <div className="inventory-product-topline">
                      <div>
                        <h3>{p.name}</h3>
                        <p>{p.code || "Sin código"} · {p.category || "Sin categoría"}</p>
                      </div>
                      <span className={`stock-status ${status.tone}`}>{status.label}</span>
                    </div>

                    <div className="inventory-price-row">
                      <div>
                        <span>Precio</span>
                        <strong>{money(p.price)}</strong>
                      </div>
                      <div>
                        <span>Stock</span>
                        <strong>{Number(p.stock || 0)}</strong>
                      </div>
                    </div>

                    <div className="inventory-detail-strip">
                      <span>Costo <b>{money(p.cost)}</b></span>
                      <span>Margen <b>{margin(p.price, p.cost).toFixed(1)}%</b></span>
                    </div>

                    <div className="inventory-card-actions">
                      <button
                        className="btn btn-secondary"
                        onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                        type="button"
                      >
                        {editingId === p.id ? "Cerrar edición" : "✎ Editar"}
                      </button>
                      <button className="inventory-danger-link" onClick={() => deleteProduct(p)} type="button">
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>

                {editingId === p.id && (
                  <EditProduct
                    product={p}
                    onSaved={async () => {
                      setEditingId(null);
                      await loadProducts();
                    }}
                  />
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

async function uploadProductImage(file) {
  if (!file) return "";
  const fileExt = file.name.split(".").pop() || "jpg";
  const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
  const filePath = `products/${safeName}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(filePath, file, { cacheControl: "31536000", upsert: false });

  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("product-images").getPublicUrl(filePath);
  return data.publicUrl;
}
