import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function ProductImage({ src, alt = "Producto", small = false }) {
  if (!src) return <div className={small ? "product-img small placeholder" : "product-img placeholder"}>📦</div>;
  return <img src={src} alt={alt} className={small ? "product-img small" : "product-img"} onError={(e) => { e.currentTarget.style.display = "none"; }} />;
}
function money(value) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value || 0)); }
function margin(price, cost) { if (!price) return 0; return ((Number(price || 0) - Number(cost || 0)) / Number(price || 1)) * 100; }
function cleanText(value) { return String(value || "").trim().replace(/\s+/g, " "); }
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
  const categories = { decoracion: "Decoración", iluminacion: "Iluminación", muebles: "Muebles", mueble: "Muebles", sabanas: "Sábanas", cocina: "Cocina", vajilla: "Vajilla", juguete: "Juguetes", juguetes: "Juguetes", infantil: "Infantil", hogar: "Hogar", general: "General" };
  return categories[key] || raw || "General";
}

function EditProduct({ product, onSaved }) {
  const [form, setForm] = useState({ name: product.name || "", category: product.category || "", cost: product.cost || 0, price: product.price || 0, stock: product.stock || 0, image_url: product.image_url || "", image_url_2: product.image_url_2 || "", image_url_3: product.image_url_3 || "", image_url_4: product.image_url_4 || "" });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  async function handleImageFile(field, event) { const file = event.target.files?.[0]; if (!file) return; try { setUploadingImage(true); const publicUrl = await uploadProductImage(file); setForm((prev) => ({ ...prev, [field]: publicUrl })); } catch (error) { alert(`Error subiendo imagen: ${error.message}`); } finally { setUploadingImage(false); } }
  async function saveChanges() {
    setSaving(true);
    const { error } = await supabase.from("products").update({ name: cleanText(form.name), category: normalizeCategory(form.category), cost: Number(form.cost || 0), price: Number(form.price || 0), stock: Number(form.stock || 0), image_url: form.image_url, image_url_2: form.image_url_2, image_url_3: form.image_url_3, image_url_4: form.image_url_4 }).eq("id", product.id);
    setSaving(false); if (error) { alert(`Error actualizando producto: ${error.message}`); return; } await onSaved();
  }
  return <div className="edit-box"><h3>Editar producto</h3><div className="form-grid">
    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" />
    <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Categoría" />
    <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Costo" />
    <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Precio" />
    <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="Stock" />
    {["image_url","image_url_2","image_url_3","image_url_4"].map((field, i) => <div key={field}><input value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} placeholder={i === 0 ? "URL imagen principal" : `URL imagen ${i + 1}`} /><label className="file-upload-box"><span>{uploadingImage ? "Subiendo imagen..." : i === 0 ? "Subir imagen principal" : `Subir imagen ${i + 1}`}</span><input type="file" accept="image/*" onChange={(e) => handleImageFile(field, e)} disabled={uploadingImage} /></label></div>)}
  </div><Button onClick={saveChanges} disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</Button></div>;
}
function Button({ children, variant = "primary", disabled = false, onClick, type = "button" }) { return <button type={type} className={`btn ${variant === "secondary" ? "btn-secondary" : variant === "danger" ? "btn-danger" : "btn-primary"}`} disabled={disabled} onClick={onClick}>{children}</button>; }

export default function InventoryPage({ products, allProducts, searchTerm, setSearchTerm, categoryFilter, setCategoryFilter, categories, loadProducts }) {
  const [editingId, setEditingId] = useState(null);

  const visibleProducts = useMemo(() => {
    const query = normalizeSearchText(searchTerm);
    return (allProducts || []).filter((product) => {
      const productCategory = cleanText(product.category || "Sin categoría");
      const matchesCategory = categoryFilter === "all" || productCategory === categoryFilter;
      const haystack = normalizeSearchText(`${product.name || ""} ${product.code || ""} ${product.category || ""}`);
      return matchesCategory && haystack.includes(query);
    });
  }, [allProducts, searchTerm, categoryFilter]);

  async function deleteProduct(product) { const confirmed = window.confirm(`¿Eliminar "${product.name}" del inventario?`); if (!confirmed) return; const { error } = await supabase.from("products").delete().eq("id", product.id); if (error) { alert(`Error eliminando producto: ${error.message}`); return; } await loadProducts(); }
  return <section className="inventory-section"><div className="catalog-toolbar">
    <input className="search-input" type="text" placeholder="Buscar por nombre, código o categoría..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
    <div className="category-pills">{categories.map((category) => <button key={category} className={`category-pill ${categoryFilter === category ? "active" : ""}`} onClick={() => setCategoryFilter(category)}>{category === "all" ? "✨ Todos" : category}</button>)}</div>
    <p className="catalog-counter">Mostrando {visibleProducts.length} de {allProducts.length} productos</p>
  </div><div className="search-box"><span>🔎</span><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar producto" /></div>
  <div className="products-grid">{visibleProducts.map((p) => <Card key={p.id}><div className="product-card with-image"><div><ProductImage src={p.image_url} alt={p.name} />{[p.image_url_2,p.image_url_3,p.image_url_4].filter(Boolean).length > 0 && <p style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "#6d604d" }}>+{[p.image_url_2,p.image_url_3,p.image_url_4].filter(Boolean).length} fotos</p>}</div><div className="product-main"><h3>{p.name}</h3><p>{p.code} · {p.category}</p><p>Precio: <b>{money(p.price)}</b> · Costo: <b>{money(p.cost)}</b></p><p>Margen: <b>{margin(p.price,p.cost).toFixed(1)}%</b></p><button className="text-btn" onClick={() => setEditingId(editingId === p.id ? null : p.id)}>✏️ {editingId === p.id ? "Cerrar edición" : "Editar producto"}</button><button className="btn btn-danger" onClick={() => deleteProduct(p)}>🗑️ Eliminar</button></div><div className="stock-pill"><span>Stock</span><strong>{p.stock}</strong></div></div>{editingId === p.id && <EditProduct product={p} onSaved={async () => { setEditingId(null); await loadProducts(); }} />}</Card>)}</div></section>;
}
async function uploadProductImage(file) { if (!file) return ""; const fileExt = file.name.split(".").pop() || "jpg"; const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`; const filePath = `products/${safeName}`; const { error } = await supabase.storage.from("product-images").upload(filePath, file, { cacheControl: "3600", upsert: false }); if (error) throw new Error(error.message); const { data } = supabase.storage.from("product-images").getPublicUrl(filePath); return data.publicUrl; }