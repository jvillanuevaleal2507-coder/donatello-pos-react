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
  }).format(Number(value || 0));
}

function Card({ children }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 24,
        padding: 22,
        boxShadow: "0 10px 24px rgba(0,0,0,.06)",
      }}
    >
      {children}
    </div>
  );
}

export default function DashboardPage({ sales = [], products = [] }) {
  const today = new Date();

  const totalSales = sales.reduce(
    (acc, sale) => acc + Number(sale.total || 0),
    0
  );

  const totalOrders = sales.length;

  const averageTicket =
    totalOrders > 0 ? totalSales / totalOrders : 0;

  const totalProducts = products.length;

  const salesByDay = {};

  sales.forEach((sale) => {
    const date = new Date(sale.created_at || sale.date);

    const label = `${date.getDate()}/${
      date.getMonth() + 1
    }`;

    salesByDay[label] =
      (salesByDay[label] || 0) + Number(sale.total || 0);
  });

  const chartData = Object.entries(salesByDay).map(
    ([day, total]) => ({
      day,
      total,
    })
  );

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 16,
        }}
      >
        <Card>
          <span
            style={{
              fontSize: "1rem",
              color: "#7b7280",
              fontWeight: 700,
            }}
          >
            Ventas acumuladas
          </span>

          <div
            style={{
              marginTop: 10,
              fontSize: "2.4rem",
              fontWeight: 900,
            }}
          >
            {money(totalSales)}
          </div>
        </Card>

        <Card>
          <span
            style={{
              fontSize: "1rem",
              color: "#7b7280",
              fontWeight: 700,
            }}
          >
            Ventas realizadas
          </span>

          <div
            style={{
              marginTop: 10,
              fontSize: "2.4rem",
              fontWeight: 900,
            }}
          >
            {totalOrders}
          </div>
        </Card>

        <Card>
          <span
            style={{
              fontSize: "1rem",
              color: "#7b7280",
              fontWeight: 700,
            }}
          >
            Ticket promedio
          </span>

          <div
            style={{
              marginTop: 10,
              fontSize: "2.4rem",
              fontWeight: 900,
            }}
          >
            {money(averageTicket)}
          </div>
        </Card>

        <Card>
          <span
            style={{
              fontSize: "1rem",
              color: "#7b7280",
              fontWeight: 700,
            }}
          >
            Productos registrados
          </span>

          <div
            style={{
              marginTop: 10,
              fontSize: "2.4rem",
              fontWeight: 900,
            }}
          >
            {totalProducts}
          </div>
        </Card>
      </div>

      <Card>
        <div
          style={{
            fontSize: "1.4rem",
            fontWeight: 900,
            marginBottom: 16,
          }}
        >
          Ventas por día
        </div>

        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="day" />

              <YAxis />

              <Tooltip
                formatter={(value) => money(value)}
              />

              <Bar
                dataKey="total"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
