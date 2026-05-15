import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import InventoryPage from "./pages/InventoryPage";
import AddProductPage from "./pages/AddProductPage";
import logoDonatello from "./assets/logo-donatello.png";
import JSZip from "jszip";
import jsPDF from "jspdf";
import DashboardPage from "./pages/DashboardPage";
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
  return ((Number(price || 0) - Number(cost || 0)) / Number(price || 1)) * 100;
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

async function uploadProductImage(file) {
  if (!file) return "";

  const fileExt = file.name.split(".").pop() || "jpg";
  const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
  const filePath = `products/${safeName}`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage
    .from("product-images")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

function Button({ children, variant = "primary", disabled = false, onClick, type = "button", style }) {
  return (
    <button
      type={type}
      className={`btn ${variant === "secondary" ? "btn-secondary" : variant === "danger" ? "btn-danger" : "btn-primary"}`}
      disabled={disabled}
      onClick={onClick}
      style={style}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function ProductImage({ src, alt = "Producto", small = false }) {
  if (!src) {
    return <div className={small ? "product-img small placeholder" : "product-img placeholder"}>📦</div>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={small ? "product-img small" : "product-img"}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}

function VentasDonatelloPOSApp() {
  const [products, setProducts] = useState(initialProducts);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cart, setCart] = useState([]);
  const [tab, setTab] = useState("sale");
  const [manualCode, setManualCode] = useState("");
  const [received, setReceived] = useState("");
  const [scanStatus, setScanStatus] = useState("Scanner apagado");
  const [scannerOn, setScannerOn] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sales, setSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const [quickSearch, setQuickSearch] = useState("");
  const lastScannedRef = useRef({ value: "", time: 0 });

  useEffect(() => {
    loadProducts();
    loadSales();
  }, []);

  async function loadProducts() {
    setLoadingProducts(true);
    const { data, error } = await supabase
      .from("products")
      .select("id, code, name, category, cost, price, stock, image_url")
      .order("id", { ascending: false });

    if (error) {
      setScanStatus(`Error cargando inventario: ${error.message}`);
      setProducts([]);
    } else {
      setProducts(data || []);
    }
    setLoadingProducts(false);
  }

  async function loadSales() {
    setLoadingSales(true);
    const { data, error } = await supabase
      .from("sales")
      .select("id, sale_date, total, profit, received, change_amount, items_count, sale_items(code, name, qty, price, subtotal, profit)")
      .order("sale_date", { ascending: false })
      .limit(50);

    if (error) {
      setScanStatus(`Error cargando ventas: ${error.message}`);
      setSales([]);
    } else {
      setSales(data || []);
    }
    setLoadingSales(false);
  }

  const categories = [
    "all",
    ...new Set(products.map((p) => (p.category || "Sin categoría").trim()))
  ];

  const filteredProducts = products.filter((product) => {
    const text = `${product.name || ""} ${product.code || ""} ${product.category || ""}`.toLowerCase();
    const matchesSearch = text.includes(searchTerm.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" ||
      (product.category || "Sin categoría") === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price || 0) * item.qty, 0), [cart]);
  const profit = useMemo(() => cart.reduce((sum, item) => sum + (Number(item.price || 0) - Number(item.cost || 0)) * item.qty, 0), [cart]);
  const itemsCount = useMemo(() => cart.reduce((sum, item) => sum + item.qty, 0), [cart]);
  const change = Number(received || 0) - subtotal;

   
  function addToCartByCode(code) {
    const cleanCode = String(code || "").trim().toUpperCase();
    if (!cleanCode) return;

    const product = products.find((p) => String(p.code || "").toUpperCase() === cleanCode);
    if (!product) {
      setScanStatus(`No encontré producto: ${cleanCode}`);
      return;
    }
    addToCart(product);
  }

  function addToCart(product) {
    if (Number(product.stock || 0) <= 0) {
      setScanStatus("Producto sin stock disponible");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      const qtyInCart = existing ? existing.qty : 0;

      if (qtyInCart + 1 > Number(product.stock || 0)) {
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

    const salePayload = {
      total: subtotal,
      profit,
      received: Number(received || 0),
      change_amount: change,
      items_count: itemsCount,
    };

    const { data: saleData, error: saleError } = await supabase
      .from("sales")
      .insert([salePayload])
      .select("id")
      .single();

    if (saleError) {
      setScanStatus(`Error guardando venta: ${saleError.message}`);
      return;
    }

    const saleItems = cart.map((item) => ({
      sale_id: saleData.id,
      product_id: item.id,
      code: item.code,
      name: item.name,
      qty: item.qty,
      cost: Number(item.cost || 0),
      price: Number(item.price || 0),
      subtotal: Number(item.price || 0) * item.qty,
      profit: (Number(item.price || 0) - Number(item.cost || 0)) * item.qty,
    }));

    const { error: itemsError } = await supabase.from("sale_items").insert(saleItems);

    if (itemsError) {
      setScanStatus(`Venta creada, pero falló el detalle: ${itemsError.message}`);
      return;
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

    const receipt = {
      id: saleData.id,
      sale_date: new Date().toISOString(),
      total: subtotal,
      profit,
      received: Number(received || 0),
      change_amount: change,
      items_count: itemsCount,
      sale_items: saleItems,
    };

    setLastReceipt(receipt);
    setScanStatus(`Venta cobrada: ${money(subtotal)} | Cambio: ${money(change)}`);
    clearCart();
    await loadProducts();
    await loadSales();
  }

  async function startScanner() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setScanStatus("Este navegador no permite acceso directo a cámara.");
        return;
      }

      if (!("BarcodeDetector" in window)) {
        setScanStatus("Tu navegador no soporta lectura QR nativa. Usa Chrome en Android, el campo manual o un lector Bluetooth.");
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
            const value = String(codes[0].rawValue || "").trim();
            if (value) {
              const now = Date.now();
              const isSameRecent = lastScannedRef.current.value === value && now - lastScannedRef.current.time < 1800;
              if (!isSameRecent) {
                lastScannedRef.current = { value, time: now };
                addToCartByCode(value);
                setScanStatus(`QR detectado: ${value}`);
              }
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
     <header
  style={{
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 24,
    borderRadius: 22,
    background: "linear-gradient(135deg, #3b220f 0%, #9b5d14 45%, #f7b733 100%)",
    color: "white",
    boxShadow: "0 12px 30px rgba(0,0,0,.18)",
    marginBottom: 16,
    overflow: "hidden",
  }}
>
  <div
    style={{
      width: 120,
      minWidth: 120,
      height: 120,
      borderRadius: 16,
      background: "rgba(255,255,255,.14)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      padding: 4,
    }}
  >
    <img
      src={logoDonatello}
      alt="Ventas Donatello"
      style={{
        width: "140%",
        height: "140%",
        objectFit: "contain",
        display: "block",
      }}
    />
  </div>

  <div
  style={{
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  }}
>
  <h1
    style={{
      margin: 0,
      fontSize: 40,
      lineHeight: 1,
      fontWeight: 900,
    }}
  >
    Ventas Donatello
  </h1>
    <p
      style={{
        margin: "6px 0 0",
        fontSize: 25,
        opacity: 0.92,
        fontWeight: 500,
      }}
    >
      Diseño, orden y estilo para cada espacio.
    </p>
  </div>
</header>

  

      <Navbar clearCart={clearCart} loadProducts={loadProducts} />

      {loadingProducts && (
        <Card>
          <p className="muted">Cargando inventario desde Supabase...</p>
        </Card>
      )}

      <Routes>
        <Route
          path="/"
          element={
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
                <Card>
  <h2>Agregar producto rápido</h2>

  <input
    value={quickSearch}
    onChange={(e) => setQuickSearch(e.target.value)}
    placeholder="Buscar por nombre, código o categoría..."
    style={{
      minHeight: "64px",
      fontSize: "1.4rem",
      fontWeight: 700,
    }}
  />

  {quickSearch.trim() && (
    <div className="quick-results">
      {products
        .filter((p) => {
          const text = `${p.name || ""} ${p.code || ""} ${p.category || ""}`.toLowerCase();
          return text.includes(quickSearch.toLowerCase());
        })
        .slice(0, 6)
        .map((p) => (
          <button
            key={p.id}
            className="quick-result-btn"
            onClick={() => {
              addToCart(p);
              setQuickSearch("");
            }}
          >
            <ProductImage src={p.image_url} alt={p.name} small />
            <div>
              <strong>{p.name}</strong>
              <span>{p.code} · {money(p.price)} · Stock {p.stock}</span>
            </div>
          </button>
        ))}
    </div>
  )}
</Card>

                <Card className="scanner-card">
                  <div className="section-title-row">
                    <div>
                      <h2>Escanear QR</h2>
                      <p>Usa Chrome en Android para escanear con cámara trasera.</p>
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
                      <Button
                        onClick={startScanner}
                        style={{ fontSize: "2rem", fontWeight: 900 }}
                      >
                        Abrir cámara trasera
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={stopScanner}
                        style={{ fontSize: "2rem", fontWeight: 900 }}
                      >
                        Cerrar cámara
                      </Button>
                    )}

                    <div className="status-box">{scanStatus}</div>
                  </div>

                  <div className="manual-row">
                    <input
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="DON-000001"
                    />

                    <Button
                      onClick={() => {
                        addToCartByCode(manualCode);
                        setManualCode("");
                      }}
                      style={{ fontSize: "2rem", fontWeight: 900 }}
                    >
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
                          <ProductImage src={item.image_url} alt={item.name} small />
                          <div className="cart-info">
                            <strong>{item.name}</strong>
                            <span>{item.code} · x{item.qty}</span>
                          </div>
                          <div className="cart-price">
                            <strong>{money(Number(item.price || 0) * item.qty)}</strong>
                            <button onClick={() => removeFromCart(item.id)}>🗑️ Quitar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card>
                  <span style={{ fontSize: "2.2rem", fontWeight: 800 }}>Cobro</span>
                  <input
                    type="number"
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                    placeholder="Monto recibido"
                  />

                  <div className="pay-grid">
                    <div>
                      <span style={{ fontSize: "2.2rem", fontWeight: 800 }}>Cambio</span>
                      <strong style={{ fontSize: "2.4rem", fontWeight: 900 }}>
                        {change >= 0 ? money(change) : money(0)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: "2.2rem", fontWeight: 800 }}>Falta</span>
                      <strong style={{ fontSize: "2.2rem", fontWeight: 900 }}>
                        {change < 0 ? money(Math.abs(change)) : money(0)}
                      </strong>
                    </div>
                  </div>

                  <Button
                    disabled={cart.length === 0 || Number(received || 0) < subtotal}
                    onClick={checkout}
                    style={{ fontSize: "2rem", fontWeight: 900 }}
                  >
                    💳 Cobrar venta
                  </Button>
                </Card>
              </div>
            </section>
          }
        />

        <Route
          path="/inventario"
          element={
            <InventoryPage
              products={filteredProducts}
              allProducts={products}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              categories={categories}
              loadProducts={loadProducts}
            />
          }
        />

        <Route
          path="/agregar"
          element={<AddProductPage products={products} loadProducts={loadProducts} />}
        />

        <Route path="/qr" element={<QRSection products={products} />} />

        <Route
          path="/historial"
          element={<SalesSection sales={sales} loadingSales={loadingSales} loadSales={loadSales} />}
        />
        <Route
  path="/dashboard"
  element={
    <DashboardPage
      sales={sales}
      products={products}
    />
  }
/>

        <Route
          path="/csv"
          element={<ImportCSV products={products} loadProducts={loadProducts} />}
        />
      </Routes>

      {lastReceipt && (
        <ReceiptModal
          sale={lastReceipt}
          onClose={() => setLastReceipt(null)}
        />
      )}
    </main>
  </div>
);
}



function EditProduct({ product, onSaved }) {
  const [form, setForm] = useState({
    name: product.name || "",
    category: product.category || "",
    cost: product.cost || 0,
    price: product.price || 0,
    stock: product.stock || 0,
    image_url: product.image_url || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  async function handleImageFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const publicUrl = await uploadProductImage(file);
      setForm((prev) => ({ ...prev, image_url: publicUrl }));
    } catch (error) {
      alert(`Error subiendo imagen: ${error.message}`);
    } finally {
      setUploadingImage(false);
    }
  }

  async function saveChanges() {
    setSaving(true);
    const { error } = await supabase
      .from("products")
      .update({
        name: form.name,
        category: form.category,
        cost: Number(form.cost || 0),
        price: Number(form.price || 0),
        stock: Number(form.stock || 0),
        image_url: form.image_url,
      })
      .eq("id", product.id);

    setSaving(false);

    if (error) {
      alert(`Error actualizando producto: ${error.message}`);
      return;
    }

    await onSaved();
  }

  return (
    <div className="edit-box">
      <h3>Editar producto</h3>
      <div className="form-grid">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" />
        <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Categoría" />
        <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Costo" />
        <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Precio" />
        <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="Stock" />
        <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="URL de imagen" />
        <label className="file-upload-box">
          <span>{uploadingImage ? "Subiendo imagen..." : "Subir imagen del producto"}</span>
          <input type="file" accept="image/*" onChange={handleImageFile} disabled={uploadingImage} />
        </label>
        <label className="file-upload-box">
          <span>{uploadingImage ? "Subiendo imagen..." : "Subir imagen del producto"}</span>
          <input type="file" accept="image/*" onChange={handleImageFile} disabled={uploadingImage} />
        </label>
      </div>
      <Button onClick={saveChanges} disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</Button>
    </div>
  );
}

function QRSection({ products }) {
  const [selectedId, setSelectedId] = useState(products[0]?.id || "");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const selectedProduct =
    products.find((p) => String(p.id) === String(selectedId)) || products[0];

  function safeFileName(text) {
    return String(text || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 80);
  }

  function shortName(text, max = 34) {
    const value = String(text || "");
    return value.length > max ? `${value.slice(0, max)}...` : value;
  }

  useEffect(() => {
    async function generateQR() {
      if (!selectedProduct?.code) {
        setQrDataUrl("");
        return;
      }

      const dataUrl = await QRCode.toDataURL(selectedProduct.code, {
        width: 520,
        margin: 2,
        errorCorrectionLevel: "M",
      });

      setQrDataUrl(dataUrl);
    }

    generateQR();
  }, [selectedProduct?.code]);

  async function downloadAllQRCodes() {
    if (!products.length) {
      alert("No hay productos para generar QR.");
      return;
    }

    try {
      setDownloadingAll(true);

      const zip = new JSZip();
      const folder = zip.folder("QR_Ventas_Donatello");

      for (const product of products) {
        if (!product.code) continue;

        const dataUrl = await QRCode.toDataURL(product.code, {
          width: 520,
          margin: 2,
          errorCorrectionLevel: "M",
        });

        const base64 = dataUrl.split(",")[1];
        const fileName = `${safeFileName(product.code)}_${safeFileName(product.name)}.png`;

        folder.file(fileName, base64, { base64: true });
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);

      const link = document.createElement("a");
      link.href = url;
      link.download = "QR_Ventas_Donatello.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    } catch (error) {
      alert(`Error generando ZIP de QR: ${error.message}`);
    } finally {
      setDownloadingAll(false);
    }
  }

  async function generateLabelsPDF() {
    if (!products.length) {
      alert("No hay productos para generar etiquetas.");
      return;
    }

    try {
      setGeneratingPdf(true);

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "letter",
      });

      const pageWidth = 215.9;
      const pageHeight = 279.4;

      const marginX = 8;
      const marginY = 7;
      const gapX = 6;
      const gapY = 3.5;

      const cols = 2;
      const rows = 5;
      const labelWidth = (pageWidth - marginX * 2 - gapX) / cols;
      const labelHeight = 45;

      for (let index = 0; index < products.length; index++) {
        const product = products[index];

        if (index > 0 && index % 10 === 0) {
          doc.addPage();
        }

        const position = index % 10;
        const col = position % cols;
        const row = Math.floor(position / cols);

        const x = marginX + col * (labelWidth + gapX);
        const y = marginY + row * (labelHeight + gapY);

        const qrData = await QRCode.toDataURL(product.code, {
          width: 420,
          margin: 1,
          errorCorrectionLevel: "M",
        });

        doc.setDrawColor(230, 210, 170);
        doc.setLineWidth(0.4);
        doc.roundedRect(x, y, labelWidth, labelHeight, 2, 5);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Ventas Donatello", x + labelWidth / 2, y + 5, {
          align: "center",
        });

        const qrSize = 23;
        doc.addImage(
          qrData,
          "PNG",
          x + (labelWidth - qrSize) / 2,
          y + 7,
          qrSize,
          qrSize
        );

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(String(product.code || ""), x + labelWidth / 2, y + 34, {
          align: "center",
        });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.text(shortName(product.name, 30), x + labelWidth / 2, y + 39, {
          align: "center",
        });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.text(money(product.price), x + labelWidth / 2, y + 44, {
          align: "center",
        });
      }

      doc.save("Etiquetas_QR_Ventas_Donatello.pdf");
    } catch (error) {
      alert(`Error generando PDF: ${error.message}`);
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <Card>
      <h2>Etiquetas QR</h2>
      <p className="muted" style={{ marginTop: 6 }}>
        Selecciona un producto, descarga QR individuales o genera etiquetas imprimibles.
      </p>

      {products.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>No hay productos cargados.</p>
      ) : (
        <div className="qr-layout">
          <div className="qr-controls">
            <label>Producto</label>
            <select
              value={selectedProduct?.id || ""}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>

            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              <Button onClick={downloadAllQRCodes} disabled={downloadingAll}>
                {downloadingAll ? "Generando ZIP..." : "Descargar QR"}
              </Button>

              <Button onClick={generateLabelsPDF} disabled={generatingPdf}>
                {generatingPdf ? "Generando PDF..." : "Descargar PDF"}
              </Button>
            </div>

            {selectedProduct && (
              <div className="qr-product-box">
                <ProductImage src={selectedProduct.image_url} alt={selectedProduct.name} />
                <h3>{selectedProduct.name}</h3>
                <p>{selectedProduct.code}</p>
                <p>Precio: <b>{money(selectedProduct.price)}</b></p>
                <p>Stock: <b>{selectedProduct.stock}</b></p>
              </div>
            )}
          </div>

          <div className="qr-preview">
            {qrDataUrl ? (
              <>
                <img src={qrDataUrl} alt={`QR ${selectedProduct?.code}`} />
                <a
                  className="download-btn"
                  href={qrDataUrl}
                  download={`QR_${selectedProduct?.code}.png`}
                >
                  Descargar QR individual
                </a>
              </>
            ) : (
              <p className="muted">Generando QR...</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
function ReceiptModal({ sale, onClose }) {
  function printReceipt() {
    window.print();
  }

  return (
    <div className="receipt-overlay">
      <div className="receipt-panel">
        <div className="receipt-actions no-print">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <Button onClick={printReceipt}>Imprimir / Guardar PDF</Button>
        </div>

        <div className="ticket-print-area">
          <div className="ticket-header">
            <div className="ticket-logo">🛒</div>
            <h2>Ventas Donatello</h2>
            <p>Ticket de venta</p>
          </div>

          <div className="ticket-meta">
            <p><b>Venta:</b> #{sale.id}</p>
            <p><b>Fecha:</b> {new Date(sale.sale_date).toLocaleString("es-MX")}</p>
          </div>

          <div className="ticket-items">
            {sale.sale_items?.map((item, index) => (
              <div className="ticket-item" key={`${item.code}-${index}`}>
                <div>
                  <b>{item.name}</b>
                  <span>{item.code} · x{item.qty}</span>
                </div>
                <strong>{money(item.subtotal)}</strong>
              </div>
            ))}
          </div>

          <div className="ticket-totals">
            <div><span>Piezas</span><b>{sale.items_count}</b></div>
            <div><span>Total</span><b>{money(sale.total)}</b></div>
            <div><span>Recibido</span><b>{money(sale.received)}</b></div>
            <div><span>Cambio</span><b>{money(sale.change_amount)}</b></div>
          </div>

          <p className="ticket-footer">Gracias por tu compra.</p>
        </div>
      </div>
    </div>
  );
}

function SalesSection({ sales, loadingSales, loadSales }) {
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const totalSold = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const totalProfit = sales.reduce((sum, sale) => sum + Number(sale.profit || 0), 0);
  const totalItems = sales.reduce((sum, sale) => sum + Number(sale.items_count || 0), 0);

  return (
    <section className="inventory-section">
      <div className="sales-header">
        <div>
          <h2>Historial de ventas</h2>
          <p className="muted">Últimas 50 ventas registradas.</p>
        </div>
        <Button onClick={loadSales}>Actualizar ventas</Button>
      </div>

      <div className="metrics-grid">
        <Card>
          <span className="metric-label">Total vendido</span>
          <strong className="metric-value">{money(totalSold)}</strong>
        </Card>
        <Card>
          <span className="metric-label">Utilidad estimada</span>
          <strong className="metric-value">{money(totalProfit)}</strong>
        </Card>
        <Card>
          <span className="metric-label">Piezas vendidas</span>
          <strong className="metric-value">{totalItems}</strong>
        </Card>
      </div>

      {loadingSales ? (
        <Card><p className="muted">Cargando ventas...</p></Card>
      ) : sales.length === 0 ? (
        <Card><p className="muted">Todavía no hay ventas registradas.</p></Card>
      ) : (
        <div className="sales-list">
          {sales.map((sale) => (
            <Card key={sale.id}>
              <div className="sale-card-header">
                <div>
                  <h3>Venta #{sale.id}</h3>
                  <p>{new Date(sale.sale_date).toLocaleString("es-MX")}</p>
                </div>
                <div className="sale-total-box">
                  <span>Total</span>
                  <strong>{money(sale.total)}</strong>
                  <button className="text-btn" onClick={() => setSelectedReceipt(sale)}>Ticket</button>
                </div>
              </div>

              <div className="sale-summary-grid">
                <div><span>Utilidad</span><b>{money(sale.profit)}</b></div>
                <div><span>Recibido</span><b>{money(sale.received)}</b></div>
                <div><span>Cambio</span><b>{money(sale.change_amount)}</b></div>
                <div><span>Piezas</span><b>{sale.items_count}</b></div>
              </div>

              {sale.sale_items?.length > 0 && (
                <div className="sale-items-list">
                  {sale.sale_items.map((item, index) => (
                    <div className="sale-item-row" key={`${sale.id}-${item.code}-${index}`}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.code} · x{item.qty}</span>
                      </div>
                      <b>{money(item.subtotal)}</b>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {selectedReceipt && <ReceiptModal sale={selectedReceipt} onClose={() => setSelectedReceipt(null)} />}
    </section>
  );
}

function ImportCSV({ products, loadProducts }) {
  const [message, setMessage] = useState("Sube tu archivo productos_exportados.csv para cargar inventario.");
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

      rows.forEach((row) => {
        const code = String(row.codigo || row.code || "").trim().toUpperCase();
        const name = String(row.nombre || row.name || "").trim();

        if (!code || !name || existingCodes.has(code)) {
          skipped += 1;
          return;
        }

        const cost = numberFromCSV(row.costo_real || row.cost || row.costo_base, 0);
        const price = numberFromCSV(row.precio_venta || row.price || row.precio, 0);
        const stock = numberFromCSV(row.stock, 0);
        const imageUrl = String(row.image_url || row.imagen_url || row.imagen || "").trim();

        imported.push({
          code,
          name,
          category: String(row.categoria || row.category || "General").trim() || "General",
          cost,
          price,
          stock,
          image_url: imageUrl,
        });
        existingCodes.add(code);
      });

      if (!imported.length) {
        setMessage(`No se importaron productos. Omitidos: ${skipped}. Puede que ya existan o falten código/nombre.`);
        setPreview([]);
        return;
      }

      const { error } = await supabase.from("products").insert(imported);

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
        Usa el CSV exportado del sistema anterior. Se cargarán código, nombre, categoría, costo real, precio, stock e imagen URL.
      </p>

      <div className="import-box">
        <input type="file" accept=".csv" onChange={handleFile} />
        <p>{message}</p>
      </div>

      {preview.length > 0 && (
        <div className="products-grid" style={{ marginTop: 14 }}>
          {preview.map((p) => (
            <Card key={p.code}>
              <div className="product-card with-image">
                <ProductImage src={p.image_url} alt={p.name} />
                <div className="product-main">
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

function AddProduct({ products, loadProducts }) {
  const [form, setForm] = useState({
    name: "",
    category: "",
    cost: "",
    price: "",
    stock: "",
    image_url: "",
  });
  const [uploadingImage, setUploadingImage] = useState(false);

  async function handleImageFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const publicUrl = await uploadProductImage(file);
      setForm((prev) => ({ ...prev, image_url: publicUrl }));
    } catch (error) {
      alert(`Error subiendo imagen: ${error.message}`);
    } finally {
      setUploadingImage(false);
    }
  }

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
      image_url: form.image_url,
    };

    const { error } = await supabase.from("products").insert([newProduct]);

    if (error) {
      alert(`Error guardando producto: ${error.message}`);
      return;
    }

    setForm({ name: "", category: "", cost: "", price: "", stock: "", image_url: "" });
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
        <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="URL de imagen" />
      </div>
     <Button
  onClick={saveProduct}
  style={{
    fontSize: "2rem",
    fontWeight: 900,
    minHeight: "72px",
  }}
>
  Guardar producto
</Button>
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
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border-radius: 24px;
  background: linear-gradient(135deg, #3b220f 0%, #9b5d14 45%, #f7b733 100%);
  color: white;
  box-shadow: 0 12px 30px rgba(0,0,0,.18);
  margin-bottom: 18px;
  overflow: hidden;
}
.brand-logo {
  width: 72px;
  min-width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
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

  .btn-danger {
    background: #c0392b;
    color: white;
    border: none;
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
    grid-template-columns: repeat(3, minmax(115px, 1fr));
    gap: 12px;
  }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 16px;
    box-shadow: 0 6px 18px rgba(80, 45, 8, 0.08);
    overflow: hidden;
  }

  .metric-label {
  font-size: 1.45rem;
  font-weight: 800;
  color: var(--muted);
  display: block;
  letter-spacing: .3px;
}
 .metric-value {
  font-size: clamp(1.8rem, 4.5vw, 2.6rem);
  font-weight: 900;
  display: block;
  margin-top: 6px;
  line-height: 1;
  white-space: nowrap;
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
  .quick-results {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.quick-result-btn {
  border: 1px solid var(--border);
  background: var(--cream);
  border-radius: 18px;
  padding: 12px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  text-align: left;
  align-items: center;
  cursor: pointer;
}

.quick-result-btn strong {
  display: block;
  font-size: 1.1rem;
  font-weight: 900;
}

.quick-result-btn span {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: .9rem;
  font-weight: 700;
}

  .section-title-row h2,
.card h2 {
  font-size: 2rem;
  font-weight: 900;
  line-height: 1.1;
}

.cart-card h2,
.checkout-card h2 {
  font-size: 2.2rem;
  font-weight: 900;
  line-height: 1.1;
}

.checkout-card input {
  min-height: 58px;
  font-size: 1.3rem;
}

.change-box span {
  font-size: 1.25rem;
  font-weight: 700;
}

.change-box strong {
  font-size: 2.2rem;
  font-weight: 900;
  line-height: 1;
}
  
  .section-title-row p, .muted {
    color: var(--muted);
    margin-top: 4px;
    font-size: 1.05rem;
  }

  .big-icon { font-size: 30px; }

  .scanner-box {
  min-height: 380px;
  border-radius: 28px;
  background: #0b0b0b;
  overflow: hidden;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  position: relative;
  box-shadow: inset 0 0 0 3px rgba(255, 122, 0, .35);
}

.scanner-box::after {
  content: "";
  position: absolute;
  inset: 18px;
  border-radius: 22px;
  border: 2px dashed rgba(255, 255, 255, .22);
  pointer-events: none;
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
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 18px;
}

 .status-box {
  min-height: 64px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,.75);
  font-size: 1.15rem;
  font-weight: 700;
  padding: 12px;
}

  .manual-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 10px;
  }

  input, select {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 12px 14px;
    font: inherit;
    background: white;
    color: var(--dark);
    outline: none;
  }

  input:focus, select:focus {
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
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
  }

  .cart-info span {
    display: block;
    color: var(--muted);
    font-size: 0.78rem;
    margin-top: 3px;
  }

  .cart-price {
    text-align: right;
  }

  .cart-price button, .text-btn {
    margin-top: 5px;
    border: 0;
    background: transparent;
    color: #c0392b;
    cursor: pointer;
    font-weight: 800;
    font-size: 0.82rem;
  }

  .text-btn {
    color: var(--orange);
    padding: 0;
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

  .product-card.with-image {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: start;
  }

  .product-main h3,
  .product-card h3 {
    font-weight: 900;
    margin-bottom: 4px;
  }

  .product-main p,
  .product-card p {
    color: var(--muted);
    font-size: 0.88rem;
    margin-top: 4px;
  }

  .product-img {
    width: 88px;
    height: 88px;
    object-fit: cover;
    border-radius: 18px;
    background: var(--cream);
    border: 1px solid var(--border);
  }

  .product-img.small {
    width: 52px;
    height: 52px;
    border-radius: 14px;
  }

  .product-img.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
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

  .import-box, .edit-box {
    margin-top: 14px;
    border: 1px dashed var(--border);
    background: var(--cream);
    border-radius: 20px;
    padding: 16px;
  }

  .file-upload-box {
    width: 100%;
    border: 1px dashed var(--orange);
    border-radius: 18px;
    padding: 12px 14px;
    background: #fff4df;
    color: var(--dark);
    font-weight: 900;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .file-upload-box input {
    display: none;
  }

  .import-box p {
    margin-top: 10px;
    color: var(--muted);
    font-size: 0.92rem;
  }

  .catalog-toolbar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 18px;
  }

  .search-input {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 14px 16px;
    background: white;
    font-size: 0.96rem;
    font-weight: 700;
    color: var(--dark);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--orange);
    box-shadow: 0 0 0 4px rgba(247, 183, 51, 0.18);
  }

  .category-pills {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .category-pill {
    border: none;
    background: #f3ede3;
    color: var(--dark);
    border-radius: 999px;
    padding: 10px 14px;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
    transition: 0.2s ease;
  }

  .category-pill.active {
    background: linear-gradient(135deg, #f59e0b, #f97316);
    color: white;
    box-shadow: 0 10px 20px rgba(249, 115, 22, 0.25);
  }

  .catalog-counter {
    color: var(--muted);
    font-size: 0.86rem;
    font-weight: 700;
  }

  .sales-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .sales-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sale-card-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: start;
  }

  .sale-card-header p {
    color: var(--muted);
    font-size: 0.86rem;
    margin-top: 4px;
  }

  .sale-total-box {
    background: var(--cream);
    border-radius: 18px;
    padding: 10px 12px;
    min-width: 120px;
    text-align: right;
  }

  .sale-total-box span,
  .sale-summary-grid span {
    color: var(--muted);
    font-size: 0.78rem;
    display: block;
  }

  .sale-total-box strong {
    display: block;
    font-size: 1.2rem;
    margin-top: 4px;
  }

  .sale-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;
  }

  .sale-summary-grid div {
    background: var(--cream);
    border-radius: 16px;
    padding: 10px;
  }

  .sale-items-list {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sale-item-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }

  .sale-item-row span {
    display: block;
    color: var(--muted);
    font-size: 0.78rem;
    margin-top: 3px;
  }

  .receipt-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .receipt-panel {
    width: min(440px, 100%);
    background: white;
    border-radius: 24px;
    padding: 16px;
    box-shadow: 0 18px 60px rgba(0,0,0,0.25);
  }

  .receipt-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }

  .ticket-print-area {
    background: white;
    color: #111;
    border: 1px solid #eee;
    border-radius: 18px;
    padding: 16px;
    font-family: Arial, sans-serif;
  }

  .ticket-header {
    text-align: center;
    border-bottom: 1px dashed #aaa;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }

  .ticket-logo {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: #fff4df;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    margin-bottom: 6px;
  }

  .ticket-header h2 {
    font-size: 1.3rem;
    margin: 0;
  }

  .ticket-header p,
  .ticket-meta p,
  .ticket-footer {
    font-size: 0.86rem;
    color: #444;
    margin-top: 4px;
  }

  .ticket-meta {
    border-bottom: 1px dashed #aaa;
    padding-bottom: 8px;
    margin-bottom: 8px;
  }

  .ticket-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-bottom: 1px dashed #aaa;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }

  .ticket-item {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .ticket-item span {
    display: block;
    font-size: 0.78rem;
    color: #666;
    margin-top: 2px;
  }

  .ticket-totals {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .ticket-totals div {
    background: #f7f7f7;
    border-radius: 10px;
    padding: 8px;
  }

  .ticket-totals span {
    display: block;
    font-size: 0.75rem;
    color: #666;
  }

  .ticket-totals b {
    display: block;
    margin-top: 2px;
  }

  .ticket-footer {
    text-align: center;
    border-top: 1px dashed #aaa;
    padding-top: 10px;
    margin-top: 10px;
  }

  @media print {
    body * { visibility: hidden !important; }
    .ticket-print-area, .ticket-print-area * { visibility: visible !important; }
    .ticket-print-area {
      position: fixed;
      left: 0;
      top: 0;
      width: 100%;
      border: none;
      border-radius: 0;
      padding: 12px;
    }
    .no-print { display: none !important; }
  }

  .qr-layout {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 18px;
    margin-top: 16px;
  }

  .qr-controls label {
    display: block;
    font-weight: 900;
    margin-bottom: 6px;
  }

  .qr-product-box {
    margin-top: 14px;
    background: var(--cream);
    border-radius: 20px;
    padding: 14px;
  }

  .qr-product-box h3 {
    margin-top: 10px;
  }

  .qr-product-box p {
    color: var(--muted);
    margin-top: 4px;
  }

  .qr-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--cream);
    border-radius: 22px;
    padding: 18px;
  }

  .qr-preview img {
    width: min(320px, 100%);
    border-radius: 18px;
    background: white;
    padding: 10px;
  }

  .download-btn {
    display: inline-block;
    margin-top: 12px;
    text-decoration: none;
    background: linear-gradient(135deg, var(--gold) 0%, var(--orange) 100%);
    color: white;
    font-weight: 900;
    padding: 12px 16px;
    border-radius: 16px;
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
    .product-card.with-image { grid-template-columns: auto 1fr; }
    .stock-pill { grid-column: 1 / -1; }
    .qr-layout { grid-template-columns: 1fr; }
    .sales-header { flex-direction: column; align-items: stretch; }
    .sale-card-header { flex-direction: column; }
    .sale-total-box { width: 100%; text-align: left; }
    .sale-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  .premium-nav {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin: 14px 0 18px;
  }

  .premium-nav-btn {
    border: none;
    background: #fff;
    border-radius: 18px;
    min-height: 68px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    color: #3a2a12;
    text-decoration: none;
    box-shadow: 0 8px 18px rgba(0,0,0,.06);
    transition: .2s ease;
    font-size: 13px;
  }

  .premium-nav-btn span {
    font-size: 11px;
  }

  .premium-nav-btn:active {
    transform: scale(.97);
  }

  .premium-active {
    background: linear-gradient(135deg, #ff8a00, #ff5e00);
    color: white;
    box-shadow: 0 10px 24px rgba(255,122,0,.35);
  }

  @media (max-width: 900px) {
    .shell {
      width: 100%;
      padding: 12px;
    }

    .sale-layout {
      grid-template-columns: 1fr;
      gap: 14px;
    }

    .metrics-grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }

    .scanner-box {
      min-height: 300px;
    }
  }

  @media (max-width: 640px) {
    body {
      font-size: 16px;
    }

    .shell {
      padding: 14px;
      max-width: 100%;
    }

    .metrics-grid {
      grid-template-columns: 1fr;
    }

    .card {
      padding: 18px;
      margin-bottom: 14px;
    }

    .metric-value {
      font-size: 32px;
    }

    .metric-label {
      font-size: 18px;
    }

    .scanner-box {
      min-height: 360px;
    }

    .scanner-actions {
      grid-template-columns: 1fr;
    }

    .manual-row {
      grid-template-columns: 1fr;
    }

    .btn {
      min-height: 64px;
      font-size: 1.6rem;
      font-weight: 800;
    }

    input {
      min-height: 54px;
      font-size: 1.2rem;
    }

    .status-box {
      font-size: 1.2rem;
    }
  }
`;
  export default function VentasDonatelloPOS() {
  return (
    <BrowserRouter>
      <VentasDonatelloPOSApp />
    </BrowserRouter>
  );
}
