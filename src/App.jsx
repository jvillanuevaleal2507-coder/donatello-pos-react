import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
// Scanner QR nativo del navegador: getUserMedia + BarcodeDetector

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const initialProducts = [];

function money(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number(value || 0));
}

function margin(price, cost) {
  if (!price) return 0;
  return ((price - cost) / price) * 100;
}

function parseCSV(text) {
  const rows = [];
  let current = "";
  let row = [];
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    const code = char.charCodeAt(0);
    const nextCode = next ? next.charCodeAt(0) : null;

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((code === 10 || code === 13) && !insideQuotes) {
      if (current || row.length) {
        row.push(current.trim());
        rows.push(row);
        row = [];
        current = "";
      }
      if (code === 13 && nextCode === 10) i++;
    } else {
      current += char;
    }
  }

  if (current || row.length) {
    row.push(current.trim());
    rows.push(row);
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((values) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] ?? "";
    });
    return obj;
  });
}

function numberFromCSV(value, fallback = 0) {
  const clean = String(value ?? "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function Button({ children, variant = "primary", disabled = false, onClick, type = "button" }) {
  return (
    <button
      type={type}
      className={`btn ${variant === "secondary" ? "btn-secondary" : "btn-primary"}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export default function VentasDonatelloPOS() {
  const [products, setProducts] = useState(initialProducts);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cart, setCart] = useState([]);
  const [tab, setTab] = useState("sale");
  const [query, setQuery] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [received, setReceived] = useState("");
  const [scanStatus, setScanStatus] = useState("Scanner apagado");
  const [scannerOn, setScannerOn] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoadingProducts(true);
    const { data, error } = await supabase
      .from("products")
      .select("id, code, name, category, cost, price, stock")
      .order("id", { ascending: false });

    if (error) {
      setScanStatus(`Error cargando inventario: ${error.message}`);
      setProducts([]);
    } else {
      setProducts(data || []);
    }
    setLoadingProducts(false);
  }

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart]);
  const profit = useMemo(() => cart.reduce((sum, item) => sum + (item.price - item.cost) * item.qty, 0), [cart]);
  const itemsCount = useMemo(() => cart.reduce((sum, item) => sum + item.qty, 0), [cart]);
  const change = Number(received || 0) - subtotal;

  const filteredProducts = products.filter((p) => {
    const text = `${p.code} ${p.name} ${p.category}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  function addToCartByCode(code) {
    const cleanCode = String(code || "").trim().toUpperCase();
    if (!cleanCode) return;

    const product = products.find((p) => p.code.toUpperCase() === cleanCode);
    if (!product) {
      setScanStatus(`No encontré producto: ${cleanCode}`);
      return;
    }
    addToCart(product);
  }

  function addToCart(product) {
    if (product.stock <= 0) {
      setScanStatus("Producto sin stock disponible");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      const qtyInCart = existing ? existing.qty : 0;

      if (qtyInCart + 1 > product.stock) {
        setScanStatus("No puedes agregar más piezas que el stock disponible");
        return prev;
      }

      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });

    setScanStatus(`Agregado: ${product.name}`);
  }

  function removeFromCart(id) {
    setCart((prev) => prev.filter((item) => item.id !== id));
  }

  function clearCart() {
    setCart([]);
    setReceived("");
    setScanStatus("Carrito vacío");
  }

  async function checkout() {
    if (Number(received || 0) < subtotal) return;

    for (const item of cart) {
      const current = products.find((p) => p.id === item.id);
      if (!current || Number(current.stock || 0) < Number(item.qty || 0)) {
        setScanStatus(`Stock insuficiente para ${item.name}`);
        return;
      }
    }

    for (const item of cart) {
      const current = products.find((p) => p.id === item.id);
      const newStock = Number(current.stock || 0) - Number(item.qty || 0);
      const { error } = await supabase
        .from("products")
        .update({ stock: newStock })
        .eq("id", item.id);

      if (error) {
        setScanStatus(`Error actualizando stock: ${error.message}`);
        return;
      }
    }

    setScanStatus(`Venta cobrada: ${money(subtotal)} | Cambio: ${money(change)}`);
    clearCart();
    await loadProducts();
  }

  async function startScanner() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setScanStatus("Este navegador no permite acceso directo a cámara.");
        return;
      }

      if (!("BarcodeDetector" in window)) {
        setScanStatus("Tu navegador no soporta lectura QR nativa. Usa el campo manual o un lector Bluetooth.");
        return;
      }

      setScannerOn(true);
      setScanStatus("Abriendo cámara trasera...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
      }

      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      setScanStatus("Cámara activa. Apunta al QR del producto.");

      scanTimerRef.current = window.setInterval(async () => {
        try {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || video.readyState < 2) return;

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const codes = await detector.detect(canvas);
          if (codes && codes.length > 0) {
            const value = codes[0].rawValue;
            if (value) {
              addToCartByCode(value);
              setScanStatus(`QR detectado: ${value}`);
            }
          }
        } catch (err) {
          console.error(err);
        }
      }, 700);
    } catch (error) {
      setScannerOn(false);
      setScanStatus("No pude abrir la cámara. Revisa permisos o prueba en Chrome actualizado.");
      console.error(error);
    }
  }

  async function stopScanner() {
    try {
      if (scanTimerRef.current) {
        window.clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } catch (error) {
      console.error(error);
    }
    setScannerOn(false);
    setScanStatus("Scanner apagado");
  }

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="app">
      <style>{styles}</style>

      <main className="shell">
        <header className="brand-header">
          <div className="brand-logo">🛒</div>
          <div>
            <h1>Ventas Donatello POS</h1>
            <p>Venta rápida, QR, inventario y utilidad</p>
          </div>
        </header>

        <nav className="nav-grid">
          <button className={`nav-btn ${tab === "sale" ? "active" : ""}`} onClick={() => setTab("sale")}>🛒 Venta</button>
          <button className={`nav-btn ${tab === "inventory" ? "active" : ""}`} onClick={() => setTab("inventory")}>📦 Inventario</button>
          <button className={`nav-btn ${tab === "add" ? "active" : ""}`} onClick={() => setTab("add")}>➕ Agregar</button>
          <button className={`nav-btn ${tab === "import" ? "active" : ""}`} onClick={() => setTab("import")}>⬆️ Importar CSV</button>
          <button className="nav-btn" onClick={clearCart}>🔄 Limpiar</button>
          <button className="nav-btn" onClick={loadProducts}>🔃 Actualizar</button>
        </nav>

        {loadingProducts && <Card><p className="muted">Cargando inventario desde Supabase...</p></Card>}

        {tab === "sale" && (
          <section className="sale-layout">
            <div className="left-panel">
              <div className="metrics-grid">
                <Card>
                  <span className="metric-label">Total</span>
                  <strong className="metric-value">{money(subtotal)}</strong>
                </Card>
                <Card>
                  <span className="metric-label">Piezas</span>
                  <strong className="metric-value">{itemsCount}</strong>
                </Card>
                <Card>
                  <span className="metric-label">Utilidad</span>
                  <strong className="metric-value">{money(profit)}</strong>
                </Card>
              </div>

              <Card className="scanner-card">
                <div className="section-title-row">
                  <div>
                    <h2>Escanear QR</h2>
                    <p>Usa cámara trasera o lector Bluetooth.</p>
                  </div>
                  <span className="big-icon">📷</span>
                </div>

                <div className="scanner-box">
                  {!scannerOn && <span>Scanner apagado</span>}
                  <video ref={videoRef} className="scanner-video" muted playsInline />
                  <canvas ref={canvasRef} style={{ display: "none" }} />
                </div>

                <div className="scanner-actions">
                  {!scannerOn ? (
                    <Button onClick={startScanner}>Abrir cámara trasera</Button>
                  ) : (
                    <Button variant="secondary" onClick={stopScanner}>Cerrar cámara</Button>
                  )}
                  <div className="status-box">{scanStatus}</div>
                </div>

                <div className="manual-row">
                  <input
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="DON-000001"
                  />
                  <Button onClick={() => { addToCartByCode(manualCode); setManualCode(""); }}>
                    Agregar
                  </Button>
                </div>
              </Card>
            </div>

            <div className="right-panel">
              <Card>
                <h2>Carrito</h2>
                {cart.length === 0 ? (
                  <p className="muted">Carrito vacío.</p>
                ) : (
                  <div className="cart-list">
                    {cart.map((item) => (
                      <div className="cart-item" key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.code} · x{item.qty}</span>
                        </div>
                        <div className="cart-price">
                          <strong>{money(item.price * item.qty)}</strong>
                          <button onClick={() => removeFromCart(item.id)}>🗑️ Quitar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <h2>Cobro</h2>
                <input
                  type="number"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  placeholder="Monto recibido"
                />

                <div className="pay-grid">
                  <div>
                    <span>Cambio</span>
                    <strong>{change >= 0 ? money(change) : money(0)}</strong>
                  </div>
                  <div>
                    <span>Falta</span>
                    <strong>{change < 0 ? money(Math.abs(change)) : money(0)}</strong>
                  </div>
                </div>

                <Button disabled={cart.length === 0 || Number(received || 0) < subtotal} onClick={checkout}>
                  💳 Cobrar venta
                </Button>
              </Card>
            </div>
          </section>
        )}

        {tab === "inventory" && (
          <section className="inventory-section">
            <div className="search-box">
              <span>🔎</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto" />
            </div>

            <div className="products-grid">
              {filteredProducts.map((p) => (
                <Card key={p.id}>
                  <div className="product-card">
                    <div>
                      <h3>{p.name}</h3>
                      <p>{p.code} · {p.category}</p>
                      <p>Precio: <b>{money(p.price)}</b> · Costo: <b>{money(p.cost)}</b></p>
                      <p>Margen: <b>{margin(p.price, p.cost).toFixed(1)}%</b></p>
                    </div>
                    <div className="stock-pill">
                      <span>Stock</span>
                      <strong>{p.stock}</strong>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {tab === "add" && <AddProduct products={products} setProducts={setProducts} loadProducts={loadProducts} />}

        {tab === "import" && <ImportCSV products={products} setProducts={setProducts} loadProducts={loadProducts} />}
      </main>
    </div>
  );
}

function ImportCSV({ products, setProducts, loadProducts }) {
  const [message, setMessage] = useState("Sube tu archivo productos_exportados.csv para cargar inventario de prueba.");
  const [preview, setPreview] = useState([]);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = String(e.target?.result || "");
      const rows = parseCSV(text);

      if (!rows.length) {
        setMessage("No pude leer productos del CSV.");
        setPreview([]);
        return;
      }

      const existingCodes = new Set(products.map((p) => String(p.code).toUpperCase()));
      const imported = [];
      let skipped = 0;

      rows.forEach((row, index) => {
        const code = String(row.codigo || row.code || "").trim().toUpperCase();
        const name = String(row.nombre || row.name || "").trim();

        if (!code || !name || existingCodes.has(code)) {
          skipped += 1;
          return;
        }

        const cost = numberFromCSV(row.costo_real || row.cost || row.costo_base, 0);
        const price = numberFromCSV(row.precio_venta || row.price || row.precio, 0);
        const stock = numberFromCSV(row.stock, 0);

        imported.push({
          id: Date.now() + index,
          code,
          name,
          category: String(row.categoria || row.category || "General").trim() || "General",
          cost,
          price,
          stock,
        });
        existingCodes.add(code);
      });

      if (!imported.length) {
        setMessage(`No se importaron productos. Omitidos: ${skipped}. Puede que ya existan o falten código/nombre.`);
        setPreview([]);
        return;
      }

      const rowsToInsert = imported.map((p) => ({
        code: p.code,
        name: p.name,
        category: p.category,
        cost: p.cost,
        price: p.price,
        stock: p.stock,
      }));

      const { error } = await supabase.from("products").insert(rowsToInsert);

      if (error) {
        setMessage(`Error importando a Supabase: ${error.message}`);
        setPreview([]);
        return;
      }

      setPreview(imported.slice(0, 10));
      setMessage(`Importación lista. Productos importados: ${imported.length}. Omitidos: ${skipped}.`);
      await loadProducts();
    };
    reader.readAsText(file, "UTF-8");
  }

  return (
    <Card>
      <h2>Importar productos CSV</h2>
      <p className="muted" style={{ marginTop: 6 }}>
        Usa el CSV exportado del sistema anterior. Se cargarán código, nombre, categoría, costo real, precio y stock.
      </p>

      <div className="import-box">
        <input type="file" accept=".csv" onChange={handleFile} />
        <p>{message}</p>
      </div>

      {preview.length > 0 && (
        <div className="products-grid" style={{ marginTop: 14 }}>
          {preview.map((p) => (
            <Card key={p.id}>
              <div className="product-card">
                <div>
                  <h3>{p.name}</h3>
                  <p>{p.code} · {p.category}</p>
                  <p>Precio: <b>{money(p.price)}</b> · Costo: <b>{money(p.cost)}</b></p>
                </div>
                <div className="stock-pill">
                  <span>Stock</span>
                  <strong>{p.stock}</strong>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}

function AddProduct({ products, setProducts, loadProducts }) {
  const [form, setForm] = useState({
    name: "",
    category: "",
    cost: "",
    price: "",
    stock: "",
  });

  async function saveProduct() {
    if (!form.name.trim()) return;
    const nextId = products.length ? Math.max(...products.map((p) => Number(p.id))) + 1 : 1;
    const code = `DON-${String(nextId).padStart(6, "0")}`;

    const newProduct = {
      code,
      name: form.name,
      category: form.category || "General",
      cost: Number(form.cost || 0),
      price: Number(form.price || 0),
      stock: Number(form.stock || 0),
    };

    const { error } = await supabase.from("products").insert([newProduct]);

    if (error) {
      alert(`Error guardando producto: ${error.message}`);
      return;
    }

    setForm({ name: "", category: "", cost: "", price: "", stock: "" });
    await loadProducts();
  }

  return (
    <Card>
      <h2>Agregar producto</h2>
      <div className="form-grid">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" />
        <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Categoría" />
        <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Costo" />
        <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Precio" />
        <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="Stock" />
      </div>
      <Button onClick={saveProduct}>Guardar producto</Button>
    </Card>
  );
}

const styles = `
  :root {
    --orange: #fc4a1a;
    --gold: #f7b733;
    --dark: #24180d;
    --brown: #4b2f14;
    --cream: #fff7e8;
    --card: #fffdf8;
    --border: #ead6ad;
    --muted: #6d604d;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--cream);
    color: var(--dark);
  }

  .app {
    min-height: 100vh;
    padding: 14px;
    background: radial-gradient(circle at top right, #ffe0a6 0, transparent 30%), var(--cream);
  }

  .shell {
    width: min(1160px, 100%);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .brand-header {
    background: linear-gradient(135deg, #251f17 0%, #5a3a16 52%, #f7b733 100%);
    color: white;
    border-radius: 26px;
    padding: 18px;
    display: flex;
    align-items: center;
    gap: 14px;
    box-shadow: 0 14px 30px rgba(80, 45, 8, 0.18);
  }

  .brand-logo {
    width: 62px;
    height: 62px;
    border-radius: 20px;
    background: rgba(255,255,255,0.16);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
  }

  h1, h2, h3, p { margin: 0; }

  h1 {
    font-size: clamp(1.4rem, 4vw, 2.4rem);
    font-weight: 900;
    letter-spacing: -0.04em;
  }

  .brand-header p {
    opacity: 0.92;
    margin-top: 4px;
    font-size: 0.9rem;
  }

  .nav-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .nav-btn, .btn {
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 12px 14px;
    font-weight: 800;
    cursor: pointer;
    background: var(--card);
    color: var(--dark);
    box-shadow: 0 4px 12px rgba(80, 45, 8, 0.08);
    transition: 0.18s ease;
  }

  .nav-btn:hover, .btn:hover {
    transform: translateY(-1px);
    border-color: var(--orange);
  }

  .nav-btn.active, .btn-primary {
    background: linear-gradient(135deg, var(--gold) 0%, var(--orange) 100%);
    color: white;
    border: none;
  }

  .btn-secondary {
    background: white;
    color: var(--dark);
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
  }

  .sale-layout {
    display: grid;
    grid-template-columns: 3fr 2fr;
    gap: 16px;
  }

  .left-panel, .right-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 16px;
    box-shadow: 0 6px 18px rgba(80, 45, 8, 0.08);
  }

  .metric-label {
    font-size: 0.8rem;
    color: var(--muted);
    display: block;
  }

  .metric-value {
    font-size: clamp(1.35rem, 4vw, 2rem);
    display: block;
    margin-top: 4px;
  }

  .scanner-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .section-title-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  .section-title-row h2,
  .card h2 {
    font-size: 1.25rem;
    font-weight: 900;
  }

  .section-title-row p, .muted {
    color: var(--muted);
    margin-top: 4px;
    font-size: 0.9rem;
  }

  .big-icon { font-size: 30px; }

  .scanner-box {
    min-height: 290px;
    border-radius: 22px;
    background: #111;
    overflow: hidden;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
  }

  .scanner-video {
    width: 100%;
    height: 100%;
    min-height: 290px;
    object-fit: cover;
    border-radius: 22px;
    display: block;
  }

  .scanner-box span + .scanner-video {
    display: none;
  }

  .scanner-actions {
    display: grid;
    grid-template-columns: 1fr 1.5fr;
    gap: 10px;
  }

  .status-box {
    background: white;
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 10px 12px;
    color: var(--muted);
    font-size: 0.85rem;
    display: flex;
    align-items: center;
  }

  .manual-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 10px;
  }

  input {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 12px 14px;
    font: inherit;
    background: white;
    color: var(--dark);
    outline: none;
  }

  input:focus {
    border-color: var(--orange);
    box-shadow: 0 0 0 3px rgba(252, 74, 26, 0.12);
  }

  .cart-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }

  .cart-item {
    background: var(--cream);
    border-radius: 18px;
    padding: 12px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .cart-item span {
    display: block;
    color: var(--muted);
    font-size: 0.78rem;
    margin-top: 3px;
  }

  .cart-price {
    text-align: right;
  }

  .cart-price button {
    margin-top: 5px;
    border: 0;
    background: transparent;
    color: #c0392b;
    cursor: pointer;
    font-weight: 700;
    font-size: 0.78rem;
  }

  .pay-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 12px 0;
  }

  .pay-grid div {
    background: var(--cream);
    border-radius: 18px;
    padding: 12px;
  }

  .pay-grid span {
    display: block;
    font-size: 0.78rem;
    color: var(--muted);
  }

  .pay-grid strong {
    font-size: 1.25rem;
    display: block;
    margin-top: 4px;
  }

  .inventory-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .search-box {
    position: relative;
  }

  .search-box span {
    position: absolute;
    left: 14px;
    top: 13px;
  }

  .search-box input {
    padding-left: 42px;
  }

  .products-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .product-card {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .product-card h3 {
    font-weight: 900;
    margin-bottom: 4px;
  }

  .product-card p {
    color: var(--muted);
    font-size: 0.88rem;
    margin-top: 4px;
  }

  .stock-pill {
    min-width: 70px;
    background: var(--cream);
    border-radius: 18px;
    padding: 10px;
    text-align: center;
    align-self: start;
  }

  .stock-pill span {
    font-size: 0.76rem;
    color: var(--muted);
  }

  .stock-pill strong {
    display: block;
    font-size: 1.8rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin: 14px 0;
  }

  .import-box {
    margin-top: 14px;
    border: 1px dashed var(--border);
    background: var(--cream);
    border-radius: 20px;
    padding: 16px;
  }

  .import-box p {
    margin-top: 10px;
    color: var(--muted);
    font-size: 0.92rem;
  }

  @media (max-width: 820px) {
    .app { padding: 10px; }
    .brand-header {
      padding: 12px;
      border-radius: 20px;
    }
    .brand-logo {
      width: 48px;
      height: 48px;
      border-radius: 15px;
      font-size: 24px;
    }
    .brand-header p { font-size: 0.72rem; }
    .nav-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sale-layout { grid-template-columns: 1fr; }
    .metrics-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .card { padding: 12px; border-radius: 20px; }
    .scanner-box { min-height: 260px; }
    .scanner-actions { grid-template-columns: 1fr; }
    .manual-row { grid-template-columns: 1fr; }
    .products-grid { grid-template-columns: 1fr; }
    .form-grid { grid-template-columns: 1fr; }
  }
`;
