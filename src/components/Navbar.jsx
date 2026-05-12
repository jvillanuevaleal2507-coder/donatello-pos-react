import { Link } from "react-router-dom";

export default function Navbar({ clearCart, loadProducts }) {
  return (
    <nav className="premium-nav">
      <Link to="/" className="premium-nav-btn">
        🛒
        <span>Venta</span>
      </Link>

      <Link to="/inventario" className="premium-nav-btn">
        📦
        <span>Inventario</span>
      </Link>

      <Link to="/agregar" className="premium-nav-btn premium-active">
        ➕
        <span>Agregar</span>
      </Link>

      <Link to="/qr" className="premium-nav-btn">
        🏷️
        <span>QR</span>
      </Link>

      <Link to="/historial" className="premium-nav-btn">
        📋
        <span>Ventas</span>
      </Link>

      <Link to="/csv" className="premium-nav-btn">
        📤
        <span>CSV</span>
      </Link>

      <button className="premium-nav-btn" onClick={clearCart}>
        🧹
        <span>Limpiar</span>
      </button>

      <button className="premium-nav-btn" onClick={loadProducts}>
        🔄
        <span>Actualizar</span>
      </button>
    </nav>
  );
}
