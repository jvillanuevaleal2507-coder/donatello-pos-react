import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

function money(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function saleDate(sale) {
  return new Date(sale.sale_date || sale.created_at || sale.date || Date.now());
}

function safeDayKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function Card({ children, className = "" }) {
  return <div className={`card dashboard-card ${className}`}>{children}</div>;
}

function Kpi({ label, value, note, tone = "" }) {
  return (
    <Card className={`dashboard-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </Card>
  );
}

export default function DashboardPage({ sales = [], products = [] }) {
  const activeSales = sales.filter(
    (sale) => String(sale.status || "completed").toLowerCase() !== "voided"
  );

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const todayKey = safeDayKey(now);

  const monthSalesRows = activeSales.filter((sale) => {
    const date = saleDate(sale);
    return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
  });

  const monthSales = monthSalesRows.reduce(
    (sum, sale) => sum + Number(sale.total || 0),
    0
  );
  const monthProfit = monthSalesRows.reduce(
    (sum, sale) => sum + Number(sale.profit || 0),
    0
  );
  const monthOrders = monthSalesRows.length;
  const averageTicket = monthOrders ? monthSales / monthOrders : 0;

  const todaySalesRows = activeSales.filter(
    (sale) => safeDayKey(saleDate(sale)) === todayKey
  );
  const todaySales = todaySalesRows.reduce(
    (sum, sale) => sum + Number(sale.total || 0),
    0
  );
  const todayProfit = todaySalesRows.reduce(
    (sum, sale) => sum + Number(sale.profit || 0),
    0
  );
  const todayItems = todaySalesRows.reduce(
    (sum, sale) => sum + Number(sale.items_count || 0),
    0
  );

  const stockUnits = products.reduce(
    (sum, product) => sum + Math.max(Number(product.stock || 0), 0),
    0
  );
  const inventoryCost = products.reduce(
    (sum, product) =>
      sum + Number(product.cost || 0) * Math.max(Number(product.stock || 0), 0),
    0
  );
  const inventoryRetail = products.reduce(
    (sum, product) =>
      sum + Number(product.price || 0) * Math.max(Number(product.stock || 0), 0),
    0
  );
  const lowStock = products
    .filter((product) => {
      const stock = Number(product.stock || 0);
      return stock >= 0 && stock <= 3;
    })
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0))
    .slice(0, 7);

  const last14Days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (13 - index));
    return {
      key: safeDayKey(date),
      label: `${date.getDate()}/${date.getMonth() + 1}`,
      total: 0,
      profit: 0,
    };
  });

  const dayMap = Object.fromEntries(last14Days.map((day) => [day.key, day]));

  activeSales.forEach((sale) => {
    const date = saleDate(sale);
    const key = safeDayKey(date);
    if (!dayMap[key]) return;
    dayMap[key].total += Number(sale.total || 0);
    dayMap[key].profit += Number(sale.profit || 0);
  });

  const chartData = last14Days;

  const productStats = {};
  activeSales.forEach((sale) => {
    (sale.sale_items || []).forEach((item) => {
      const key = item.code || item.name || "Producto";
      if (!productStats[key]) {
        productStats[key] = {
          code: item.code || "",
          name: item.name || "Producto",
          qty: 0,
          total: 0,
        };
      }
      productStats[key].qty += Number(item.qty || 0);
      productStats[key].total += Number(item.subtotal || 0);
    });
  });

  const topProducts = Object.values(productStats)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const recentSales = [...activeSales]
    .sort((a, b) => saleDate(b) - saleDate(a))
    .slice(0, 6);

  const potentialProfit = inventoryRetail - inventoryCost;

  return (
    <section className="dashboard-modern">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Resumen ejecutivo</span>
          <h2>Así va Donatello</h2>
          <p>Ventas, utilidad e inventario sin ruido innecesario.</p>
        </div>

        <div className="dashboard-today-pill">
          <span>Venta de hoy</span>
          <strong>{money(todaySales)}</strong>
          <small>{todaySalesRows.length} ventas · {todayItems} piezas</small>
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        <Kpi
          label="Ventas del mes"
          value={money(monthSales)}
          note={`${monthOrders} ventas registradas`}
        />
        <Kpi
          label="Utilidad del mes"
          value={money(monthProfit)}
          note={monthSales ? `${((monthProfit / monthSales) * 100).toFixed(1)}% sobre venta` : "Sin ventas todavía"}
          tone="olive"
        />
        <Kpi
          label="Ticket promedio"
          value={money(averageTicket)}
          note="Promedio del mes actual"
        />
        <Kpi
          label="Inventario disponible"
          value={stockUnits}
          note={`${products.length} productos registrados`}
        />
      </div>

      <div className="dashboard-main-grid">
        <Card className="dashboard-chart-card">
          <div className="dashboard-section-heading">
            <div>
              <span className="eyebrow">Últimos 14 días</span>
              <h3>Movimiento de ventas</h3>
            </div>
            <div className="dashboard-chart-legend">
              <span><i className="sale-dot" /> Venta</span>
              <span><i className="profit-dot" /> Utilidad</span>
            </div>
          </div>

          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#eee6de" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#837970" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#837970" }} axisLine={false} tickLine={false} width={54} />
                <Tooltip formatter={(value) => money(value)} />
                <Bar dataKey="total" fill="#b75f3d" radius={[5, 5, 0, 0]} />
                <Bar dataKey="profit" fill="#6f7651" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="dashboard-side-stack">
          <Card className="dashboard-today-card">
            <span className="eyebrow">Corte rápido</span>
            <h3>Hoy</h3>

            <div className="dashboard-today-grid">
              <div>
                <span>Venta</span>
                <strong>{money(todaySales)}</strong>
              </div>
              <div>
                <span>Utilidad</span>
                <strong>{money(todayProfit)}</strong>
              </div>
              <div>
                <span>Operaciones</span>
                <strong>{todaySalesRows.length}</strong>
              </div>
              <div>
                <span>Piezas</span>
                <strong>{todayItems}</strong>
              </div>
            </div>
          </Card>

          <Card className="dashboard-inventory-card">
            <span className="eyebrow">Inventario</span>
            <h3>Valor actual</h3>
            <div className="dashboard-inventory-value">{money(inventoryCost)}</div>
            <div className="dashboard-inventory-lines">
              <div><span>Venta potencial</span><b>{money(inventoryRetail)}</b></div>
              <div><span>Utilidad potencial</span><b>{money(potentialProfit)}</b></div>
            </div>
          </Card>
        </div>
      </div>

      <div className="dashboard-lists-grid">
        <Card>
          <div className="dashboard-section-heading compact">
            <div>
              <span className="eyebrow">Productos</span>
              <h3>Los que más venden</h3>
            </div>
          </div>

          {topProducts.length === 0 ? (
            <div className="dashboard-empty">Aún no hay suficiente historial de productos vendidos.</div>
          ) : (
            <div className="dashboard-ranked-list">
              {topProducts.map((product, index) => (
                <div className="dashboard-ranked-row" key={`${product.code}-${index}`}>
                  <span className="rank-number">{index + 1}</span>
                  <div>
                    <strong>{product.name}</strong>
                    <span>{product.code || "Sin código"} · {product.qty} pzas</span>
                  </div>
                  <b>{money(product.total)}</b>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="dashboard-section-heading compact">
            <div>
              <span className="eyebrow">Atención</span>
              <h3>Stock bajo o agotado</h3>
            </div>
            <span className="dashboard-count-badge">{lowStock.length}</span>
          </div>

          {lowStock.length === 0 ? (
            <div className="dashboard-empty">No hay productos con stock crítico.</div>
          ) : (
            <div className="dashboard-low-list">
              {lowStock.map((product) => (
                <div className="dashboard-low-row" key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <span>{product.code || "Sin código"}</span>
                  </div>
                  <b
                    className={
                      Number(product.stock || 0) === 0
                        ? "out"
                        : Number(product.stock || 0) === 1
                          ? "critical"
                          : "warning"
                    }
                  >
                    {Number(product.stock || 0) === 0 ? "Agotado" : `${product.stock} pzas`}
                  </b>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="dashboard-section-heading compact">
          <div>
            <span className="eyebrow">Actividad</span>
            <h3>Ventas recientes</h3>
          </div>
        </div>

        {recentSales.length === 0 ? (
          <div className="dashboard-empty">Todavía no hay ventas registradas.</div>
        ) : (
          <div className="dashboard-recent-list">
            {recentSales.map((sale) => (
              <div className="dashboard-recent-row" key={sale.id}>
                <div className="dashboard-sale-icon">✓</div>
                <div>
                  <strong>Venta #{sale.id}</strong>
                  <span>{saleDate(sale).toLocaleString("es-MX")}</span>
                </div>
                <span>{Number(sale.items_count || 0)} pzas</span>
                <b>{money(sale.total)}</b>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
