import { Link, useLocation } from "react-router-dom";

const items = [
  { to: "/", icon: "⌂", label: "Venta" },
  { to: "/inventario", icon: "▦", label: "Inventario" },
  { to: "/agregar", icon: "+", label: "Agregar" },
  { to: "/qr", icon: "⌁", label: "QR" },
  { to: "/historial", icon: "▤", label: "Ventas" },
  { to: "/apartados", icon: "◫", label: "Apartados" },
  { to: "/csv", icon: "⇧", label: "Importar" },
  { to: "/dashboard", icon: "▥", label: "Resumen" },
];

export default function Navbar({ clearCart, loadProducts }) {
  const location = useLocation();

  return (
    <nav className="donatello-nav" aria-label="Navegación principal">
      <div className="nav-section-label">Operación</div>

      {items.map((item) => {
        const active = location.pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`donatello-nav-link ${active ? "active" : ""}`}
          >
            <span className="donatello-nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}

      <div className="nav-section-label nav-tools-label">Herramientas</div>

      <button className="donatello-nav-link nav-action" onClick={clearCart} type="button">
        <span className="donatello-nav-icon" aria-hidden="true">×</span>
        <span>Limpiar venta</span>
      </button>

      <button className="donatello-nav-link nav-action" onClick={loadProducts} type="button">
        <span className="donatello-nav-icon" aria-hidden="true">↻</span>
        <span>Actualizar</span>
      </button>
    </nav>
  );
}
