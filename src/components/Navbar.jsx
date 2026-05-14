import { Link, useLocation } from "react-router-dom";

export default function Navbar({ clearCart, loadProducts }) {
  const location = useLocation();

  const items = [
    { to: "/", icon: "🛒", label: "Venta" },
    { to: "/inventario", icon: "📦", label: "Inventario" },
    { to: "/agregar", icon: "➕", label: "Agregar" },
    { to: "/qr", icon: "🏷️", label: "QR" },
    { to: "/historial", icon: "📋", label: "Ventas" },
    { to: "/csv", icon: "📤", label: "CSV" },
  ];

  const navStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
    margin: "14px 0 18px",
  };

  const btnStyle = {
    border: "none",
    background: "#fff",
    borderRadius: "16px",
    minHeight: "76px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "5px",
    fontWeight: 800,
    color: "#3a2a12",
    textDecoration: "none",
    boxShadow: "0 8px 18px rgba(0,0,0,.07)",
    fontSize: "14px",
  };

  const activeStyle = {
    background: "linear-gradient(135deg, #ff8a00, #ff5e00)",
    color: "#fff",
    boxShadow: "0 10px 24px rgba(255,122,0,.35)",
  };

  return (
    <nav style={navStyle}>
      {items.map((item) => {
        const active = location.pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            style={{ ...btnStyle, ...(active ? activeStyle : {}) }}
          >
            <span style={{ fontSize: 45 }}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}

      <button style={btnStyle} onClick={clearCart}>
        <span style={{ fontSize: 45 }}>🧹</span>
        <span>Limpiar</span>
      </button>

      <button style={btnStyle} onClick={loadProducts}>
        <span style={{ fontSize: 45 }}>🔄</span>
        <span>Actualizar</span>
      </button>
    </nav>
  );
}
