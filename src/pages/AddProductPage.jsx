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

export default function AddProductPage({
  products,
  loadProducts,
}) {
  const [form, setForm] = useState({
    name: "",
    category: "",
    cost: "",
    price: "",
    stock: "",
    image_url: "",
  });
  const [uploadingImage, setUploadingImage] = useState(false);

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
    if (!form.name.trim()) return;
    const nextId = products.length ? Math.max(...products.map((p) => Number(p.id))) + 1 : 1;
    const code = `DON-${String(nextId).padStart(6, "0")}`;

    const newProduct = {
      code,
      name: form.name,
      category: form.category || "General",
      cost: Number(form.cost || 0),
      price: Number(form.price || 0),
      stock: Number(form.stock || 0),
      image_url: form.image_url,
    };

    const { error } = await supabase.from("products").insert([newProduct]);

    if (error) {
      alert(`Error guardando producto: ${error.message}`);
      return;
    }

    setForm({ name: "", category: "", cost: "", price: "", stock: "", image_url: "" });
    await loadProducts();
  }

  return (
    <Card>
      <h2>Agregar producto</h2>
      <div className="form-grid">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" />
        <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Categoría" />
        <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Costo" />
        <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Precio" />
        <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="Stock" />
        <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="URL de imagen" />
      </div>
      <Button onClick={saveProduct}>Guardar producto</Button>
    </Card>
  );
}
