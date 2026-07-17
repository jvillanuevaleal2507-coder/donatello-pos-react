import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";

function money(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number(value || 0));
}

function saleDate(sale) {
  return new Date(sale.sale_date || sale.created_at || sale.date || Date.now());
}

function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background: "#fffdf8",
        border: "1px solid #ead6ad",
        borderRadius: 24,
        padding: 22,
        boxShadow: "0 10px 24px rgba(80,45,8,.08)",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub }) {
  return (
    <Card>
      <span style={{ fontSize: "1.05rem", color: "#6d604d", fontWeight: 800 }}>
        {label}
      </span>

      <div
        style={{
          marginTop: 10,
          fontSize: "clamp(2rem, 5vw, 2.8rem)",
          fontWeight: 900,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>

      {sub && (
        <p style={{ marginTop: 8, color: "#6d604d", fontWeight: 700 }}>
          {sub}
        </p>
      )}
    </Card>
  );
}

export default function DashboardPage({ sales = [], products = [] }) {
  const activeSales = sales.filter(
    (sale) => String(sale.status || "completed").toLowerCase() !== "voided"
  );
  const voidedSales = sales.filter(
    (sale) => String(sale.status || "completed").toLowerCase() === "voided"
  );

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const totalSales = activeSales.reduce((acc, sale) => acc + Number(sale.total || 0), 0);
  const totalProfit = activeSales.reduce((acc, sale) => acc + Number(sale.profit || 0), 0);
  const totalOrders = activeSales.length;
  const totalItems = activeSales.reduce((acc, sale) => acc + Number(sale.items_count || 0), 0);
  const averageTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

  const monthSales = activeSales
    .filter((sale) => {
      const date = saleDate(sale);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    })
    .reduce((acc, sale) => acc + Number(sale.total || 0), 0);

  const monthProfit = activeSales
    .filter((sale) => {
      const date = saleDate(sale);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    })
    .reduce((acc, sale) => acc + Number(sale.profit || 0), 0);
  const todayKey = now.toISOString().slice(0, 10);

const todaySales = activeSales.filter((sale) => {
  const date = saleDate(sale);
  return date.toISOString().slice(0, 10) === todayKey;
});

const todayTotal = todaySales.reduce(
  (acc, sale) => acc + Number(sale.total || 0),
  0
);

const todayProfit = todaySales.reduce(
  (acc, sale) => acc + Number(sale.profit || 0),
  0
);

const todayReceived = todaySales.reduce(
  (acc, sale) => acc + Number(sale.received || 0),
  0
);

const todayChange = todaySales.reduce(
  (acc, sale) => acc + Number(sale.change_amount || 0),
  0
);

const todayDiscounts = todaySales.reduce(
  (acc, sale) => acc + Number(sale.discount_amount || 0),
  0
);

const todayItems = todaySales.reduce(
  (acc, sale) => acc + Number(sale.items_count || 0),
  0
);

const expectedCash = todayReceived - todayChange;

  const salesByDay = {};

  activeSales.forEach((sale) => {
    const date = saleDate(sale);
    const key = date.toISOString().slice(0, 10);
    const label = `${date.getDate()}/${date.getMonth() + 1}`;

    if (!salesByDay[key]) {
      salesByDay[key] = {
        day: label,
        total: 0,
        profit: 0,
        orders: 0,
      };
    }

    salesByDay[key].total += Number(sale.total || 0);
    salesByDay[key].profit += Number(sale.profit || 0);
    salesByDay[key].orders += 1;
  });

  const chartData = Object.entries(salesByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);

  const productStats = {};

  activeSales.forEach((sale) => {
    const items = sale.sale_items || [];

    items.forEach((item) => {
      const key = item.code || item.name || "Producto";

      if (!productStats[key]) {
        productStats[key] = {
          code: item.code || "",
          name: item.name || "Producto",
          qty: 0,
          total: 0,
          profit: 0,
        };
      }

      productStats[key].qty += Number(item.qty || 0);
      productStats[key].total += Number(item.subtotal || 0);
      productStats[key].profit += Number(item.profit || 0);
    });
  });

  const topProducts = Object.values(productStats)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const categoryStats = {};

  products.forEach((product) => {
    const category = product.category || "Sin categoría";

    if (!categoryStats[category]) {
      categoryStats[category] = {
        category,
        products: 0,
        inventoryValue: 0,
      };
    }

    categoryStats[category].products += 1;
    categoryStats[category].inventoryValue +=
      Number(product.price || 0) * Number(product.stock || 0);
  });

  const categoryData = Object.values(categoryStats)
    .sort((a, b) => b.inventoryValue - a.inventoryValue)
    .slice(0, 8);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Card
        style={{
          background:
            "linear-gradient(135deg, #3b220f 0%, #9b5d14 45%, #f7b733 100%)",
          color: "white",
        }}
      >
        <h2 style={{ fontSize: "2.2rem", fontWeight: 900 }}>
          Resumen ejecutivo
        </h2>
        <p style={{ marginTop: 6, opacity: 0.92, fontWeight: 600 }}>
          Ventas, utilidad y comportamiento general de Ventas Donatello.
        </p>
      </Card>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 16,
        }}
      >
        <KpiCard label="Ventas acumuladas" value={money(totalSales)} />
        <KpiCard label="Utilidad acumulada" value={money(totalProfit)} />
        <KpiCard label="Ventas realizadas" value={totalOrders} sub={`${totalItems} piezas`} />
        <KpiCard label="Ticket promedio" value={money(averageTicket)} />
        <KpiCard label="Venta del mes" value={money(monthSales)} />
        <KpiCard label="Utilidad del mes" value={money(monthProfit)} />
        <KpiCard label="Productos registrados" value={products.length} />
        <KpiCard
          label="Ventas anuladas"
          value={voidedSales.length}
          sub="Se conservan para auditoría"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
          gap: 18,
        }}
      >
        <Card>
          <h3 style={{ fontSize: "1.5rem", fontWeight: 900, marginBottom: 16 }}>
            Ventas por día
          </h3>

          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(value) => money(value)} />
                <Bar dataKey="total" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 style={{ fontSize: "1.5rem", fontWeight: 900, marginBottom: 16 }}>
            Utilidad por día
          </h3>

          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(value) => money(value)} />
                <Line
                  type="monotone"
                  dataKey="profit"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
          gap: 18,
        }}
      >
        <Card>
          <h3 style={{ fontSize: "1.5rem", fontWeight: 900, marginBottom: 14 }}>
            Top productos vendidos
          </h3>

          {topProducts.length === 0 ? (
            <p style={{ color: "#6d604d", fontWeight: 700 }}>
              Todavía no hay productos vendidos.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {topProducts.map((product, index) => (
                <div
                  key={`${product.code}-${index}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 12,
                    alignItems: "center",
                    background: "#fff7e8",
                    borderRadius: 18,
                    padding: 12,
                  }}
                >
                  <strong style={{ fontSize: "1.2rem" }}>{index + 1}</strong>
                  <div>
                    <strong>{product.name}</strong>
                    <p style={{ color: "#6d604d", marginTop: 3 }}>
                      {product.code} · {product.qty} pzas
                    </p>
                  </div>
                  <strong>{money(product.total)}</strong>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 style={{ fontSize: "1.5rem", fontWeight: 900, marginBottom: 14 }}>
            Inventario por categoría
          </h3>

          {categoryData.length === 0 ? (
            <p style={{ color: "#6d604d", fontWeight: 700 }}>
              Todavía no hay productos registrados.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {categoryData.map((item) => (
                <div
                  key={item.category}
                  style={{
                    background: "#fff7e8",
                    borderRadius: 18,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <strong>{item.category}</strong>
                    <strong>{money(item.inventoryValue)}</strong>
                  </div>
                  <p style={{ color: "#6d604d", marginTop: 4 }}>
                    {item.products} productos registrados
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <Card>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      marginBottom: 20,
      flexWrap: "wrap",
    }}
  >
    <div>
      <h2
        style={{
          fontSize: "2rem",
          fontWeight: 900,
        }}
      >
        Corte del día
      </h2>

      <p
        style={{
          color: "#6d604d",
          marginTop: 4,
          fontWeight: 700,
        }}
      >
        Resumen operativo de caja y ventas del día actual.
      </p>
    </div>
  </div>

  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
      gap: 14,
      marginBottom: 24,
    }}
  >
    <KpiCard
      label="Ventas hoy"
      value={money(todayTotal)}
    />

    <KpiCard
      label="Utilidad hoy"
      value={money(todayProfit)}
    />

    <KpiCard
      label="Efectivo recibido"
      value={money(todayReceived)}
    />

    <KpiCard
      label="Cambio entregado"
      value={money(todayChange)}
    />

    <KpiCard
      label="Caja esperada"
      value={money(expectedCash)}
    />

    <KpiCard
      label="Descuentos"
      value={money(todayDiscounts)}
    />

    <KpiCard
      label="Piezas vendidas"
      value={todayItems}
    />

    <KpiCard
      label="Ventas realizadas"
      value={todaySales.length}
    />
  </div>

  <div style={{ display: "grid", gap: 10 }}>
    {todaySales.length === 0 ? (
      <p
        style={{
          color: "#6d604d",
          fontWeight: 700,
        }}
      >
        No hay ventas registradas hoy.
      </p>
    ) : (
      todaySales.map((sale, index) => (
        <div
          key={sale.id || index}
          style={{
            background: "#fff7e8",
            borderRadius: 18,
            padding: 14,
            display: "grid",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <strong>
              Venta #{index + 1}
            </strong>

            <strong>
              {money(sale.total)}
            </strong>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              color: "#6d604d",
              fontWeight: 700,
            }}
          >
            <span>
              {sale.items_count} piezas
            </span>

            <span>
              Utilidad: {money(sale.profit)}
            </span>
          </div>
        </div>
      ))
    )}
  </div>
</Card>
    </div>
  );
}
