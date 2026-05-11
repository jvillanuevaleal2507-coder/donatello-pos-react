import { Link } from "react-router-dom";

export default function Navbar({ clearCart, loadProducts }) {
  return (
    <nav className="nav-grid">
      <Link to="/" className="nav-btn">🛒 Venta</Link>
      <Link to="/inventario" className="nav-btn">📦 Inventario</Link>
      <Link to="/agregar" className="nav-btn">➕ Agregar</Link>
      <Link to="/qr" className="nav-btn">🏷️ QR</Link>
      <Link to="/historial" className="nav-btn">📜 Ventas</Link>
      <Link to="/csv" className="nav-btn">⬆️ CSV</Link>

      <button className="nav-btn" onClick={clearCart}>🧹 Limpiar</button>
      <button className="nav-btn" onClick={loadProducts}>🔄 Actualizar</button>
    </nav>
  );
}
