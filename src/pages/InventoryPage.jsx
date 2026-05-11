import { useState } from "react";
export default function InventoryPage({
  products,
  allProducts,
  searchTerm,
  setSearchTerm,
  categoryFilter,
  setCategoryFilter,
  categories,
  loadProducts,
}) {
 const [editingId, setEditingId] = useState(null);

  return (
    <section className="inventory-section">
       <div className="catalog-toolbar">
        <input
          className="search-input"
          type="text"
          placeholder="Buscar por nombre, código o categoría..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <div className="category-pills">
          {categories.map((category) => (
            <button
              key={category}
              className={`category-pill ${categoryFilter === category ? "active" : ""}`}
              onClick={() => setCategoryFilter(category)}
            >
              {category === "all" ? "✨ Todos" : category}
            </button>
          ))}
        </div>

        <p className="catalog-counter">
          Mostrando {products.length} de {allProducts.length} productos
        </p>
      </div>
      <div className="search-box">
        <span>🔎</span>
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar producto" />
      </div>

      <div className="products-grid">
        {products.map((p) => (
          <Card key={p.id}>
            <div className="product-card with-image">
              <ProductImage src={p.image_url} alt={p.name} />
              <div className="product-main">
                <h3>{p.name}</h3>
                <p>{p.code} · {p.category}</p>
                <p>Precio: <b>{money(p.price)}</b> · Costo: <b>{money(p.cost)}</b></p>
                <p>Margen: <b>{margin(p.price, p.cost).toFixed(1)}%</b></p>
                <button className="text-btn" onClick={() => setEditingId(editingId === p.id ? null : p.id)}>
                  ✏️ {editingId === p.id ? "Cerrar edición" : "Editar producto"}
                </button>
              </div>
              <div className="stock-pill">
                <span>Stock</span>
                <strong>{p.stock}</strong>
              </div>
            </div>
            {editingId === p.id && <EditProduct product={p} onSaved={async () => { setEditingId(null); await loadProducts(); }} />}
          </Card>
        ))}
      </div>
      </section>
      );
}
