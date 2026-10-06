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

  const priorMonthRows = activeSales.filter((sale) => {
    const date = saleDate(sale);
    const prior = new Date(thisYear, thisMonth - 1, 1);
    return date.getMonth() === prior.getMonth() && date.getFullYear() === prior.getFullYear();
  });

  const priorMonthSales = priorMonthRows.reduce(
    (sum, sale) => sum + Number(sale.total || 0),
    0
  );

  const monthChange = priorMonthSales
    ? ((monthSales - priorMonthSales) / priorMonthSales) * 100
    : null;

  const criticalStock = products.filter((product) => Number(product.stock || 0) <= 1);
  const healthyStock = products.filter((product) => Number(product.stock || 0) > 3);
  const inventoryHealth = products.length
    ? Math.round((healthyStock.length / products.length) * 100)
    : 100;

  const attentionCount = criticalStock.length + (todaySalesRows.length === 0 ? 1 : 0);

  return (
    <section className="dashboard-v3">
      <div className="dashboard-v3-topbar">
        <div>
          <span className="dashboard-v3-kicker">DONATELLO · COMMAND CENTER</span>
          <h2>Panel operativo</h2>
          <p>Ventas, inventario y alertas en una vista de decisión.</p>
        </div>

        <div className="dashboard-v3-live">
          <span>HOY</span>
          <strong>{money(todaySales)}</strong>
          <small>{todaySalesRows.length} ventas · {todayItems} piezas</small>
        </div>
      </div>

      <div className="dashboard-v3-bento">
        <article className="dashboard-v3-tile dashboard-v3-primary">
          <div className="dashboard-v3-tile-head">
            <span>VENTAS DEL MES</span>
            <span className="dashboard-v3-chip">
              {monthChange === null ? "Sin comparativo" : `${monthChange >= 0 ? "+" : ""}${monthChange.toFixed(1)}%`}
            </span>
          </div>
          <strong className="dashboard-v3-big-number">{money(monthSales)}</strong>
          <small>{monthOrders} ventas registradas</small>
          <div className="dashboard-v3-inline-metrics">
            <div>
              <span>Utilidad</span>
              <b>{money(monthProfit)}</b>
            </div>
            <div>
              <span>Ticket</span>
              <b>{money(averageTicket)}</b>
            </div>
          </div>
        </article>

        <article className="dashboard-v3-tile dashboard-v3-attention">
          <div className="dashboard-v3-tile-head">
            <span>ATENCIÓN HOY</span>
            <span className="dashboard-v3-alert-dot">{attentionCount}</span>
          </div>
          <strong>{attentionCount === 0 ? "Todo en orden" : "Requiere revisión"}</strong>
          <div className="dashboard-v3-attention-list">
            <div>
              <span>Stock crítico</span>
              <b>{criticalStock.length}</b>
            </div>
            <div>
              <span>Ventas hoy</span>
              <b>{todaySalesRows.length}</b>
            </div>
            <div>
              <span>Inventario sano</span>
              <b>{inventoryHealth}%</b>
            </div>
          </div>
        </article>

        <article className="dashboard-v3-tile dashboard-v3-inventory">
          <div className="dashboard-v3-tile-head">
            <span>INVENTARIO</span>
            <span>{products.length} SKUs</span>
          </div>
          <strong className="dashboard-v3-big-number">{stockUnits}</strong>
          <small>piezas disponibles</small>
          <div className="dashboard-v3-progress">
            <span style={{ width: `${inventoryHealth}%` }} />
          </div>
          <div className="dashboard-v3-money-row">
            <div><span>Costo</span><b>{money(inventoryCost)}</b></div>
            <div><span>Venta potencial</span><b>{money(inventoryRetail)}</b></div>
          </div>
        </article>

        <article className="dashboard-v3-tile dashboard-v3-today">
          <div className="dashboard-v3-tile-head">
            <span>RESULTADO DE HOY</span>
            <span>EN VIVO</span>
          </div>
          <div className="dashboard-v3-today-grid">
            <div><span>Venta</span><strong>{money(todaySales)}</strong></div>
            <div><span>Utilidad</span><strong>{money(todayProfit)}</strong></div>
            <div><span>Operaciones</span><strong>{todaySalesRows.length}</strong></div>
            <div><span>Piezas</span><strong>{todayItems}</strong></div>
          </div>
        </article>

        <article className="dashboard-v3-tile dashboard-v3-chart-tile">
          <div className="dashboard-v3-tile-head">
            <div>
              <span>TENDENCIA · 14 DÍAS</span>
              <strong>Movimiento comercial</strong>
            </div>
            <div className="dashboard-chart-legend">
              <span><i className="sale-dot" /> Venta</span>
              <span><i className="profit-dot" /> Utilidad</span>
            </div>
          </div>
          <div className="dashboard-v3-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#34312f" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9f9891" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9f9891" }} axisLine={false} tickLine={false} width={52} />
                <Tooltip formatter={(value) => money(value)} contentStyle={{ background:"#211f1d", border:"1px solid #49433f", borderRadius:8 }} labelStyle={{ color:"#fff" }} />
                <Bar dataKey="total" fill="#d26f47" radius={[4,4,0,0]} />
                <Bar dataKey="profit" fill="#909a67" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="dashboard-v3-tile dashboard-v3-critical">
          <div className="dashboard-v3-tile-head">
            <div>
              <span>ALERTAS DE STOCK</span>
              <strong>Qué necesita atención</strong>
            </div>
            <span className="dashboard-v3-alert-dot">{lowStock.length}</span>
          </div>
          {lowStock.length === 0 ? (
            <div className="dashboard-empty">No hay productos con stock crítico.</div>
          ) : (
            <div className="dashboard-v3-critical-list">
              {lowStock.slice(0, 5).map((product) => (
                <div key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <span>{product.code || "Sin código"}</span>
                  </div>
                  <b className={Number(product.stock || 0) === 0 ? "out" : "low"}>
                    {Number(product.stock || 0) === 0 ? "Agotado" : product.stock}
                  </b>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="dashboard-v3-tile dashboard-v3-ranking">
          <div className="dashboard-v3-tile-head">
            <div>
              <span>TOP PRODUCTOS</span>
              <strong>Los que más venden</strong>
            </div>
          </div>
          {topProducts.length === 0 ? (
            <div className="dashboard-empty">Aún no hay suficiente historial.</div>
          ) : (
            <div className="dashboard-v3-ranking-list">
              {topProducts.map((product, index) => {
                const max = Number(topProducts[0]?.total || 1);
                const pct = Math.max(8, Math.round((Number(product.total || 0) / max) * 100));
                return (
                  <div key={`${product.code}-${index}`}>
                    <span className="rank-number">{index + 1}</span>
                    <div className="dashboard-v3-rank-main">
                      <div>
                        <strong>{product.name}</strong>
                        <span>{product.qty} pzas · {money(product.total)}</span>
                      </div>
                      <div className="dashboard-v3-rank-bar"><span style={{ width: `${pct}%` }} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="dashboard-v3-tile dashboard-v3-activity">
          <div className="dashboard-v3-tile-head">
            <div>
              <span>ACTIVIDAD</span>
              <strong>Ventas recientes</strong>
            </div>
          </div>
          {recentSales.length === 0 ? (
            <div className="dashboard-empty">Todavía no hay ventas registradas.</div>
          ) : (
            <div className="dashboard-v3-timeline">
              {recentSales.map((sale) => (
                <div key={sale.id}>
                  <span className="dashboard-v3-time-dot" />
                  <div>
                    <strong>Venta #{sale.id}</strong>
                    <span>{saleDate(sale).toLocaleString("es-MX")}</span>
                  </div>
                  <b>{money(sale.total)}</b>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
