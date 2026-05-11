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
    ...
  </section>
      );
}
