import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { toPng } from "html-to-image";
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

function Card({ children, className = "", style }) {
  return <div className={`card ${className}`} style={style}>{children}</div>;
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
  const [layaways, setLayaways] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [saleMode, setSaleMode] = useState("sale");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 15);
    return date.toISOString().split("T")[0];
  });
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const [quickSearch, setQuickSearch] = useState("");
  const lastScannedRef = useRef({ value: "", time: 0 });

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(session || null);

      if (session) {
        await loadProducts();
        await loadSales();
        await loadLayaways();
      }

      setAuthLoading(false);
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session || null);
      setAuthLoading(false);

      if (session) {
        await loadProducts();
        await loadSales();
        await loadLayaways();
      } else {
        setProducts([]);
        setSales([]);
        setCart([]);
        setReceived("");
        setDiscountPercent(0);
        setSaleMode("sale");
        setCustomerName("");
        setCustomerPhone("");
        setDepositAmount("");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    let timeoutId;

    function resetTimer() {
      window.clearTimeout(timeoutId);

      timeoutId = window.setTimeout(() => {
        signOut();
      }, 30 * 60 * 1000);
    }

    const events = ["click", "keydown", "touchstart", "mousemove"];

    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      window.clearTimeout(timeoutId);

      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [session]);

  async function loadProducts() {
    setLoadingProducts(true);
    const { data, error } = await supabase
      .from("products")
      .select("id, code, name, category, cost, price, stock, image_url, image_url_2, image_url_3, image_url_4")
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
      .select("id, sale_date, total, profit, received, change_amount, items_count, subtotal_original, discount_percent, discount_amount, status, void_reason, voided_at, updated_at, sale_items(id, product_id, code, name, qty, cost, price, subtotal, profit)")
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


  async function loadLayaways() {
    const { data, error } = await supabase
      .from("layaways")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      console.error("Error cargando apartados:", error);
      setLayaways([]);
    } else {
      const activeLayaways = (data || []).filter(
        (item) => String(item.status || "").trim().toLowerCase() === "active"
      );

      console.log("Apartados recibidos:", data);
      console.log("Apartados activos:", activeLayaways);

      setLayaways(activeLayaways);
    }
  }

  async function signIn() {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      alert("Ingresa correo y contraseña.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      alert(`No se pudo iniciar sesión: ${error.message}`);
    }
  }

  async function signOut() {
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch (error) {
      console.error("Error cerrando sesión:", error);
    } finally {
      Object.keys(window.localStorage || {}).forEach((key) => {
        if (key.startsWith("sb-") || key.includes("supabase")) {
          localStorage.removeItem(key);
        }
      });

      sessionStorage.clear();

      setSession(null);
      setEmail("");
      setPassword("");
      setAuthLoading(false);
      setProducts([]);
      setSales([]);
      setCart([]);
      setReceived("");
      setDiscountPercent(0);
      setSaleMode("sale");
      setCustomerName("");
      setCustomerPhone("");
      setDepositAmount("");

      window.location.href = "/";
    }
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

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price || 0) * item.qty, 0),
    [cart]
  );

  const originalProfit = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + (Number(item.price || 0) - Number(item.cost || 0)) * item.qty,
        0
      ),
    [cart]
  );

  const discountAmount = subtotal * (Number(discountPercent || 0) / 100);
  const totalFinal = subtotal - discountAmount;
  const adjustedProfit = originalProfit - discountAmount;

  const itemsCount = useMemo(() => cart.reduce((sum, item) => sum + item.qty, 0), [cart]);

  const inventoryStats = useMemo(() => {
    return products
      .filter((product) => Number(product.stock || 0) > 0)
      .reduce(
        (totals, product) => {
          const stock = Number(product.stock || 0);
          const price = Number(product.price || 0);
          const cost = Number(product.cost || 0);

          totals.units += stock;
          totals.salesValue += price * stock;
          totals.costValue += cost * stock;
          totals.potentialProfit += (price - cost) * stock;

          return totals;
        },
        {
          units: 0,
          salesValue: 0,
          costValue: 0,
          potentialProfit: 0,
        }
      );
  }, [products]);

  const change = Number(received || 0) - totalFinal;

   
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

  function resetDueDate() {
    const date = new Date();
    date.setDate(date.getDate() + 15);
    setDueDate(date.toISOString().split("T")[0]);
  }

  function clearCart() {
    setCart([]);
    setReceived("");
    setDiscountPercent(0);
    setSaleMode("sale");
    setCustomerName("");
    setCustomerPhone("");
    setDepositAmount("");
    resetDueDate();
    setScanStatus("Carrito vacío");
  }

  async function checkout() {
    if (cart.length === 0) return;

    const cleanDiscount = Number(discountPercent || 0);

    if (!Number.isFinite(cleanDiscount) || cleanDiscount < 0 || cleanDiscount > 100) {
      alert("El descuento debe estar entre 0% y 100%.");
      return;
    }

    if (!Number.isFinite(totalFinal) || totalFinal <= 0) {
      alert("El total final debe ser mayor a $0. Revisa el descuento capturado.");
      return;
    }

    if (saleMode === "sale") {
      const receivedNumber = Number(received || 0);
      const projectedChange = receivedNumber - totalFinal;
      const unusualChangeLimit = Math.max(5000, totalFinal * 2);

      if (projectedChange > unusualChangeLimit) {
        const confirmed = window.confirm(
          `⚠️ Revisa el monto recibido.\n\nTotal: ${money(totalFinal)}\nRecibido: ${money(receivedNumber)}\nCambio: ${money(projectedChange)}\n\n¿Deseas registrar la venta de todas formas?`
        );

        if (!confirmed) return;
      }
    }

    if (saleMode === "sale" && Number(received || 0) < totalFinal) {
      setScanStatus("Monto recibido insuficiente");
      return;
    }

    if (saleMode === "layaway") {
      if (!customerName.trim()) {
        alert("Agrega el nombre del cliente para el apartado.");
        return;
      }

      if (Number(depositAmount || 0) <= 0) {
        alert("Agrega un anticipo válido para el apartado.");
        return;
      }

      if (Number(depositAmount || 0) > totalFinal) {
        alert("El anticipo no puede ser mayor al total.");
        return;
      }
    }

    for (const item of cart) {
      const current = products.find((p) => p.id === item.id);
      if (!current || Number(current.stock || 0) < Number(item.qty || 0)) {
        setScanStatus(`Stock insuficiente para ${item.name}`);
        return;
      }
    }

    const saleItems = cart.map((item) => ({
      product_id: item.id,
      code: item.code,
      name: item.name,
      qty: item.qty,
      cost: Number(item.cost || 0),
      price: Number(item.price || 0),
      subtotal: Number(item.price || 0) * item.qty,
      profit: (Number(item.price || 0) - Number(item.cost || 0)) * item.qty,
    }));

    if (saleMode === "layaway") {
      const deposit = Number(depositAmount || 0);
      const balance = totalFinal - deposit;

      const layawayPayload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        total: totalFinal,
        deposit,
        balance,
        due_date: dueDate,
        status: "active",
        items: saleItems,
        notes:
          "El apartado se mantiene vigente hasta la fecha acordada. Posterior a ese plazo, el anticipo podrá utilizarse como saldo a favor en otra compra.",
      };

      const { data: layawayData, error: layawayError } = await supabase
        .from("layaways")
        .insert([layawayPayload])
        .select("id")
        .single();

      if (layawayError) {
        setScanStatus(`Error guardando apartado: ${layawayError.message}`);
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
        id: layawayData.id,
        type: "layaway",
        sale_date: new Date().toISOString(),
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        subtotal_original: subtotal,
        discount_percent: Number(discountPercent || 0),
        discount_amount: discountAmount,
        total: totalFinal,
        profit: adjustedProfit,
        received: deposit,
        change_amount: 0,
        deposit,
        balance,
        due_date: dueDate,
        items_count: itemsCount,
        sale_items: saleItems,
      };

      setLastReceipt(receipt);
      setScanStatus(`Apartado registrado: ${money(deposit)} | Saldo: ${money(balance)}`);
      clearCart();
      await loadLayaways();
      await loadProducts();
      await loadSales();
      return;
    }

    const salePayload = {
      total: totalFinal,
      profit: adjustedProfit,
      subtotal_original: subtotal,
      discount_percent: Number(discountPercent || 0),
      discount_amount: discountAmount,
      received: Number(received || 0),
const salePayload = {
      total: totalFinal,
      profit: adjustedProfit,
      subtotal_original: subtotal,
      discount_percent: Number(discountPercent || 0),
      discount_amount: discountAmount,
      received: Number(received || 0),
      change_amount: change,
      items_count: itemsCount,
      status: "completed",
      updated_at: new Date().toISOString(),
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

    const saleItemsPayload = saleItems.map((item) => ({
      ...item,
      sale_id: saleData.id,
    }));

    const { error: itemsError } = await supabase.from("sale_items").insert(saleItemsPayload);

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
      type: "sale",
      sale_date: new Date().toISOString(),
      subtotal_original: subtotal,
      discount_percent: Number(discountPercent || 0),
      discount_amount: discountAmount,
      total: totalFinal,
      profit: adjustedProfit,
      received: Number(received || 0),
      change_amount: change,
      items_count: itemsCount,
      sale_items: saleItemsPayload,
    };

    setLastReceipt(receipt);
    setScanStatus(`Venta cobrada: ${money(totalFinal)} | Cambio: ${money(change)}`);
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

  if (authLoading) {
    return (
      <div className="app">
        <style>{styles}</style>
        <main className="shell">
          <Card>
            <h2>Cargando sesión...</h2>
          </Card>
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app">
        <style>{styles}</style>
        <main
          className="shell"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Card
            style={{
              width: "100%",
              maxWidth: 460,
              padding: 28,
            }}
          >
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 88,
                    height: 88,
                    margin: "0 auto 12px",
                    borderRadius: 24,
                    background:
                      "linear-gradient(135deg, #3b220f 0%, #9b5d14 45%, #f7b733 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={logoDonatello}
                    alt="Ventas Donatello"
                    style={{
                      width: "106%",
                      height: "106%",
                      objectFit: "contain",
                    }}
                  />
                </div>

                <h1
                  style={{
                    fontSize: "2.2rem",
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  Ventas Donatello
                </h1>

                <p
                  style={{
                    marginTop: 8,
                    color: "#6d604d",
                    fontWeight: 700,
                  }}
                >
                  Acceso al sistema POS
                </p>
              </div>

              <input
                type="email"
                placeholder="Correo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                style={{
                  minHeight: 60,
                  fontSize: "1.15rem",
                  fontWeight: 700,
                }}
              />

              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") signIn();
                }}
                style={{
                  minHeight: 60,
                  fontSize: "1.15rem",
                  fontWeight: 700,
                }}
              />

              <Button
                onClick={signIn}
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 900,
                  minHeight: 64,
                }}
              >
                Ingresar
              </Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

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
      width: 92,
      minWidth: 92,
      height: 92,
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
        width: "112%",
        height: "112%",
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

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 10,
        }}
      >
        <Button variant="secondary" onClick={signOut}>
          Cerrar sesión
        </Button>
      </div>

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
                    <strong className="metric-value">{money(adjustedProfit)}</strong>
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
        .filter((p) => Number(p.stock || 0) > 0)
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
                            <span>Cantidad: {item.qty}</span>
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

                  <div style={{ marginTop: 16 }}>
                    <span
                      style={{
                        fontSize: "1.2rem",
                        fontWeight: 800,
                        display: "block",
                        marginBottom: 8,
                      }}
                    >
                      Descuento %
                    </span>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4,1fr)",
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      {[0, 5, 10, 15].map((value) => (
                        <button
                          key={value}
                          onClick={() => setDiscountPercent(value)}
                          style={{
                            minHeight: 52,
                            borderRadius: 14,
                            border: "none",
                            fontWeight: 900,
                            cursor: "pointer",
                            background:
                              Number(discountPercent) === value
                                ? "linear-gradient(135deg,#f7b733,#fc4a1a)"
                                : "#fff7e8",
                            color: Number(discountPercent) === value ? "white" : "#24180d",
                          }}
                        >
                          {value}%
                        </button>
                      ))}
                    </div>

                    <input
                      type="number"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      placeholder="Descuento personalizado"
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      margin: "14px 0",
                    }}
                  >
                    <button
                      onClick={() => setSaleMode("sale")}
                      style={{
                        minHeight: 54,
                        borderRadius: 16,
                        border: "none",
                        fontWeight: 900,
                        cursor: "pointer",
                        background:
                          saleMode === "sale"
                            ? "linear-gradient(135deg,#f7b733,#fc4a1a)"
                            : "#fff7e8",
                        color: saleMode === "sale" ? "white" : "#24180d",
                      }}
                    >
                      Venta normal
                    </button>

                    <button
                      onClick={() => setSaleMode("layaway")}
                      style={{
                        minHeight: 54,
                        borderRadius: 16,
                        border: "none",
                        fontWeight: 900,
                        cursor: "pointer",
                        background:
                          saleMode === "layaway"
                            ? "linear-gradient(135deg,#f7b733,#fc4a1a)"
                            : "#fff7e8",
                        color: saleMode === "layaway" ? "white" : "#24180d",
                      }}
                    >
                      Apartado
                    </button>
                  </div>

                  {saleMode === "layaway" && (
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        marginBottom: 14,
                      }}
                    >
                      <input
                        placeholder="Nombre cliente"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                      />

                      <input
                        placeholder="Teléfono"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                      />

                      <input
                        type="number"
                        placeholder="Anticipo"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                      />

                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </div>
                  )}

                  <input
                    type="number"
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                    placeholder="Monto recibido"
                  />

                  <div className="pay-grid">
                    <div>
                      <span style={{ fontSize: "2.2rem", fontWeight: 800 }}>
                        {saleMode === "layaway" ? "Saldo" : "Cambio"}
                      </span>
                      <strong style={{ fontSize: "2.4rem", fontWeight: 900 }}>
                        {saleMode === "layaway"
                          ? money(Math.max(totalFinal - Number(depositAmount || 0), 0))
                          : change >= 0
                          ? money(change)
                          : money(0)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: "2.2rem", fontWeight: 800 }}>Total final</span>
                      <strong style={{ fontSize: "2.2rem", fontWeight: 900 }}>
                        {money(totalFinal)}
                      </strong>
                    </div>
                  </div>

                  <Button
                    disabled={
                      cart.length === 0 ||
                      (saleMode === "sale" && Number(received || 0) < totalFinal) ||
                      (saleMode === "layaway" && Number(depositAmount || 0) <= 0)
                    }
                    onClick={checkout}
                    style={{ fontSize: "2rem", fontWeight: 900 }}
                  >
                    {saleMode === "layaway" ? "🧾 Registrar apartado" : "💳 Cobrar venta"}
                  </Button>
                </Card>
              </div>
            </section>
          }
        />

        <Route
          path="/inventario"
          element={
            <>
              <InventoryTotals stats={inventoryStats} />
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
            </>
          }
        />

        <Route
          path="/agregar"
          element={<AddProductPage products={products} loadProducts={loadProducts} />}
        />

        <Route path="/qr" element={<QRSection products={products} />} />

        <Route
          path="/historial"
          element={
            <SalesSection
              sales={sales}
              loadingSales={loadingSales}
              loadSales={loadSales}
              loadProducts={loadProducts}
            />
          }
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
          path="/apartados"
          element={
            <LayawaysSection
              layaways={layaways}
              loadLayaways={loadLayaways}
              loadSales={loadSales}
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



function InventoryTotals({ stats }) {
  return (
    <section className="inventory-totals-section">
      <div className="inventory-totals-header">
        <div>
          <span className="eyebrow">Resumen de inventario</span>
          <h2>Totales actuales</h2>
          <p>Calculado solo con productos que tienen stock disponible.</p>
        </div>
      </div>

      <div className="inventory-kpis-grid">
        <Card className="inventory-kpi-card">
          <span className="metric-label">Piezas en stock</span>
          <strong className="metric-value">{stats.units}</strong>
          <small>Unidades disponibles para venta</small>
        </Card>

        <Card className="inventory-kpi-card">
          <span className="metric-label">Venta potencial</span>
          <strong className="metric-value">{money(stats.salesValue)}</strong>
          <small>Precio de venta × stock</small>
        </Card>

        <Card className="inventory-kpi-card">
          <span className="metric-label">Valor inventario</span>
          <strong className="metric-value">{money(stats.costValue)}</strong>
          <small>Costo × stock</small>
        </Card>

        <Card className="inventory-kpi-card profit">
          <span className="metric-label">Utilidad potencial</span>
          <strong className="metric-value">{money(stats.potentialProfit)}</strong>
          <small>Venta potencial - valor inventario</small>
        </Card>
      </div>
    </section>
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
  const printLockRef = useRef(false);
  const ticketRef = useRef(null);
  const catalogUrl = "https://catalogo.ventasdonatello.com/";
  const [catalogQr, setCatalogQr] = useState("");

  useEffect(() => {
    let alive = true;

    QRCode.toDataURL(catalogUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: "#12372b",
        light: "#ffffff",
      },
    })
      .then((dataUrl) => {
        if (alive) setCatalogQr(dataUrl);
      })
      .catch(() => {
        if (alive) setCatalogQr("");
      });

    return () => {
      alive = false;
    };
  }, []);

  function printReceipt() {
    if (printLockRef.current) return;
    printLockRef.current = true;

    const ticket = document.querySelector(".ticket-print-area");

    if (!ticket) {
      window.print();
      window.setTimeout(() => {
        printLockRef.current = false;
      }, 1200);
      return;
    }

    const printWindow = window.open("", "_blank", "width=420,height=700");

    if (!printWindow) {
      window.print();
      window.setTimeout(() => {
        printLockRef.current = false;
      }, 1200);
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Ticket Ventas Donatello</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
            }
            .ticket-print-area {
              width: 80mm;
              max-width: 80mm;
              margin: 0 auto;
              padding: 10px;
              background: #ffffff;
              border: none;
              box-shadow: none;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .ticket-header { text-align: center; border-bottom: 1px dashed #aaa; padding-bottom: 10px; margin-bottom: 10px; }
            .ticket-logo { width: 74px; height: 74px; margin: 0 auto 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
            .ticket-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
            .ticket-header h2 { font-size: 1.25rem; letter-spacing: 0.04em; margin: 0; color: #12372b; font-weight: 900; }
            .ticket-brand-line { color: #6b5a35; font-size: 0.72rem; font-weight: 700; margin: 4px 0 0; }
            .ticket-doc-title { color: #8a6a2f; font-weight: 700; margin: 4px 0 0; }
            .ticket-meta { border-bottom: 1px dashed #aaa; padding-bottom: 8px; margin-bottom: 8px; }
            .ticket-header p, .ticket-meta p, .ticket-footer { font-size: 0.8rem; margin: 3px 0; }
            .ticket-items { border-bottom: 1px dashed #aaa; padding-bottom: 8px; margin-bottom: 8px; }
            .ticket-item { display: grid; grid-template-columns: 1fr auto; gap: 8px; font-size: 0.82rem; margin-bottom: 8px; }
            .ticket-item span { color: #555; font-size: 0.74rem; display: block; margin-top: 2px; }
            .ticket-totals { border-bottom: 1px dashed #aaa; padding-bottom: 8px; margin-bottom: 8px; }
            .ticket-totals div { display: flex; justify-content: space-between; gap: 10px; margin: 4px 0; font-size: 0.84rem; }
            .ticket-totals span { color: #555; }
            .ticket-totals b { font-size: 0.95rem; }
            .ticket-total-label { color: #12372b !important; font-weight: 900 !important; text-transform: uppercase; }
            .ticket-catalog-box { text-align: center; border-bottom: 1px dashed #aaa; padding-bottom: 10px; margin-bottom: 8px; }
            .ticket-catalog-box p { margin: 3px 0; font-size: 0.78rem; color: #12372b; font-weight: 800; }
            .ticket-catalog-box img { width: 86px; height: 86px; object-fit: contain; display: block; margin: 5px auto; }
            .ticket-catalog-box span { display: block; font-size: 0.68rem; color: #374151; word-break: break-word; }
            .ticket-footer { text-align: center; padding-top: 4px; margin-top: 8px; font-weight: 700; color: #8a6a2f; }
          </style>
        </head>
        <body>${ticket.outerHTML}</body>
      </html>
    `);
    printWindow.document.close();

    printWindow.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
      printLockRef.current = false;
    }, 500);
  }

  async function downloadReceiptPng() {
    const ticket = ticketRef.current;

    if (!ticket) {
      alert("No se encontró el ticket para descargar.");
      return;
    }

    try {
      const dataUrl = await toPng(ticket, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#ffffff",
        style: {
          margin: "0",
          transform: "none",
        },
      });

      const link = document.createElement("a");
      const ticketType = sale.type === "layaway" ? "apartado" : "venta";
      link.download = `ticket-donatello-${ticketType}-${sale.id}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Error al generar PNG del ticket:", error);
      alert("No se pudo generar la imagen del ticket. Intenta de nuevo o usa Imprimir/PDF.");
    }
  }

  const isLayaway = sale.type === "layaway";

  return (
    <div className="receipt-overlay">
      <div className="receipt-panel">
        <div className="receipt-actions no-print">
          <Button onClick={downloadReceiptPng}>
            Descargar PNG
          </Button>

          <Button onClick={printReceipt}>
            Imprimir / PDF
          </Button>

          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>

        <div className="ticket-print-area" ref={ticketRef}>
          {String(sale.status || "completed").toLowerCase() === "voided" && (
            <div className="ticket-void-banner">
              VENTA ANULADA
              {sale.void_reason ? <span>{sale.void_reason}</span> : null}
            </div>
          )}
          <div className="ticket-header">
            <div className="ticket-logo ticket-logo-img">
              <img src={logoDonatello} alt="Ventas Donatello" />
            </div>
            <h2>VENTAS DONATELLO</h2>
            <p className="ticket-brand-line">Bazar • Hogar • Muebles • Iluminación • Juguetes</p>
            <p className="ticket-doc-title">{isLayaway ? "Comprobante de Apartado" : "Comprobante de Venta"}</p>
          </div>

          <div className="ticket-meta">
            <p>
              <b>{isLayaway ? "Apartado" : "Venta"}:</b> #{sale.id}
            </p>
            <p>
              <b>Fecha:</b> {new Date(sale.sale_date).toLocaleString("es-MX")}
            </p>

            {isLayaway && (
              <>
                <p>
                  <b>Cliente:</b> {sale.customer_name}
                </p>
                {sale.customer_phone && (
                  <p>
                    <b>Teléfono:</b> {sale.customer_phone}
                  </p>
                )}
                <p>
                  <b>Fecha límite:</b>{" "}
                  {new Date(`${sale.due_date}T00:00:00`).toLocaleDateString("es-MX")}
                </p>
              </>
            )}
          </div>

          <div className="ticket-items">
            {sale.sale_items?.map((item, index) => (
              <div className="ticket-item" key={`${item.code}-${index}`}>
                <div>
                  <b>{item.name}</b>
                  <span>Cantidad: {item.qty}</span>
                </div>
                <strong>{money(item.subtotal)}</strong>
              </div>
            ))}
          </div>

          <div
            style={{
              borderTop: "1px dashed #aaa",
              paddingTop: 12,
              marginTop: 12,
              display: "grid",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Subtotal</span>
              <strong>{money(sale.subtotal_original || sale.total)}</strong>
            </div>

            {(Number(sale.discount_percent || 0) > 0 ||
              Number(sale.discount_amount || 0) > 0) && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "#c0392b",
                  fontWeight: 800,
                }}
              >
                <span>Descuento ({sale.discount_percent || 0}%)</span>
                <strong>-{money(sale.discount_amount || 0)}</strong>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "1.2rem",
                fontWeight: 900,
              }}
            >
              <span className="ticket-total-label">Total final</span>
              <strong>{money(sale.total)}</strong>
            </div>
          </div>

          <div className="ticket-totals">
            <div>
              <span>Piezas</span>
              <b>{sale.items_count}</b>
            </div>

            {isLayaway ? (
              <>
                <div>
                  <span>Anticipo</span>
                  <b>{money(sale.deposit)}</b>
                </div>
                <div>
                  <span>Saldo</span>
                  <b>{money(sale.balance)}</b>
                </div>
                <div>
                  <span>Vigencia</span>
                  <b>{new Date(`${sale.due_date}T00:00:00`).toLocaleDateString("es-MX")}</b>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span>Recibido</span>
                  <b>{money(sale.received)}</b>
                </div>
                <div>
                  <span>Cambio</span>
                  <b>{money(sale.change_amount)}</b>
                </div>
              </>
            )}
          </div>

          {isLayaway && (
            <p
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: "1px dashed #aaa",
                color: "#444",
                fontSize: "0.8rem",
                lineHeight: 1.35,
                textAlign: "center",
              }}
            >
              El apartado se mantiene vigente hasta la fecha acordada.
              Posterior a ese plazo, el anticipo podrá utilizarse como saldo a favor en otra compra.
            </p>
          )}

          <div className="ticket-catalog-box">
            <p>Escanea y descubre más productos</p>
            {catalogQr && <img src={catalogQr} alt="Catálogo Ventas Donatello" />}
            <span>catalogo.ventasdonatello.com</span>
          </div>

          <p className="ticket-footer">✨ Gracias por confiar en Ventas Donatello ✨</p>
        </div>
      </div>
    </div>
  );
}


function PaymentReceiptModal({ receipt, onClose }) {
  const printLockRef = useRef(false);
  const ticketRef = useRef(null);
  const isLiquidation = receipt.type === "liquidation";

  function printReceipt() {
    if (printLockRef.current) return;
    printLockRef.current = true;

    const ticket = ticketRef.current;

    if (!ticket) {
      window.print();
      window.setTimeout(() => {
        printLockRef.current = false;
      }, 1200);
      return;
    }

    const printWindow = window.open("", "_blank", "width=420,height=700");

    if (!printWindow) {
      window.print();
      window.setTimeout(() => {
        printLockRef.current = false;
      }, 1200);
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Recibo de Abono Ventas Donatello</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
            }
            .payment-ticket {
              width: 80mm;
              max-width: 80mm;
              margin: 0 auto;
              padding: 10px;
              background: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .payment-ticket-header { text-align: center; border-bottom: 1px dashed #aaa; padding-bottom: 10px; margin-bottom: 10px; }
            .payment-ticket-logo { width: 76px; height: 76px; margin: 0 auto 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
            .payment-ticket-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
            .payment-ticket-header h2 { font-size: 1.25rem; letter-spacing: 0.04em; margin: 0; color: #12372b; font-weight: 900; }
            .payment-ticket-title { color: #8a6a2f; font-weight: 900; margin: 4px 0 0; font-size: .85rem; }
            .payment-ticket-section { border-bottom: 1px dashed #aaa; padding-bottom: 8px; margin-bottom: 8px; }
            .payment-ticket-section p { font-size: 0.82rem; margin: 3px 0; }
            .payment-ticket-row { display: flex; justify-content: space-between; gap: 10px; margin: 5px 0; font-size: 0.84rem; }
            .payment-ticket-row span { color: #555; }
            .payment-ticket-row b { font-size: .95rem; }
            .payment-ticket-row.highlight { background: #fff4df; border: 1px solid #ead6ad; border-radius: 10px; padding: 8px; font-weight: 900; color: #12372b; }
            .payment-ticket-row.highlight b { font-size: 1.12rem; }
            .payment-ticket-items { border-bottom: 1px dashed #aaa; padding-bottom: 8px; margin-bottom: 8px; }
            .payment-ticket-item { display: flex; justify-content: space-between; gap: 8px; margin: 6px 0; font-size: .82rem; }
            .payment-ticket-item span { color: #555; font-size: .74rem; }
            .payment-ticket-note { font-size: .76rem; line-height: 1.35; color: #444; text-align: center; }
            .payment-ticket-footer { text-align: center; padding-top: 8px; margin-top: 8px; font-weight: 800; color: #8a6a2f; font-size: .82rem; }
          </style>
        </head>
        <body>${ticket.outerHTML}</body>
      </html>
    `);
    printWindow.document.close();

    printWindow.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
      printLockRef.current = false;
    }, 500);
  }

  async function downloadReceiptPng() {
    const ticket = ticketRef.current;

    if (!ticket) {
      alert("No se encontró el recibo para descargar.");
      return;
    }

    try {
      const dataUrl = await toPng(ticket, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#ffffff",
        style: {
          margin: "0",
          transform: "none",
        },
      });

      const link = document.createElement("a");
      const receiptType = isLiquidation ? "liquidacion" : "abono";
      link.download = `recibo-donatello-${receiptType}-${receipt.id}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Error al generar PNG del recibo:", error);
      alert("No se pudo generar la imagen del recibo. Intenta de nuevo o usa Imprimir/PDF.");
    }
  }

  return (
    <div className="receipt-overlay">
      <div className="receipt-panel">
        <div className="receipt-actions no-print">
          <Button onClick={downloadReceiptPng}>
            Descargar PNG
          </Button>

          <Button onClick={printReceipt}>
            Imprimir / PDF
          </Button>

          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>

        <div className="payment-ticket" ref={ticketRef}>
          <div className="payment-ticket-header">
            <div className="payment-ticket-logo">
              <img src={logoDonatello} alt="Ventas Donatello" />
            </div>
            <h2>VENTAS DONATELLO</h2>
            <p className="ticket-brand-line">Bazar • Hogar • Muebles • Iluminación • Juguetes</p>
            <p className="payment-ticket-title">
              {isLiquidation ? "RECIBO DE LIQUIDACIÓN" : "RECIBO DE ABONO"}
            </p>
          </div>

          <div className="payment-ticket-section">
            {receipt.payment_id && <p><b>Recibo:</b> #{receipt.payment_id}</p>}
            <p><b>Apartado:</b> #{receipt.id}</p>
            {receipt.sale_id && <p><b>Venta final:</b> #{receipt.sale_id}</p>}
            <p><b>Fecha:</b> {new Date(receipt.payment_date).toLocaleString("es-MX")}</p>
            <p><b>Cliente:</b> {receipt.customer_name}</p>
            {receipt.customer_phone && <p><b>Teléfono:</b> {receipt.customer_phone}</p>}
            {receipt.due_date && (
              <p><b>Vigencia:</b> {new Date(`${receipt.due_date}T00:00:00`).toLocaleDateString("es-MX")}</p>
            )}
          </div>

          <div className="payment-ticket-section">
            <div className="payment-ticket-row">
              <span>Total apartado</span>
              <b>{money(receipt.total)}</b>
            </div>
            <div className="payment-ticket-row">
              <span>Abonado anterior</span>
              <b>{money(receipt.previous_deposit)}</b>
            </div>
            <div className="payment-ticket-row highlight">
              <span>{isLiquidation ? "Liquidación actual" : "Abono actual"}</span>
              <b>{money(receipt.payment_amount)}</b>
            </div>
            <div className="payment-ticket-row">
              <span>Total abonado</span>
              <b>{money(receipt.total_deposit)}</b>
            </div>
            <div className="payment-ticket-row">
              <span>Saldo pendiente</span>
              <b>{money(receipt.balance)}</b>
            </div>
          </div>

          {receipt.items?.length > 0 && (
            <div className="payment-ticket-items">
              {receipt.items.map((item, index) => (
                <div className="payment-ticket-item" key={`${receipt.id}-${index}`}>
                  <div>
                    <b>{item.name}</b>
                    <span>Cantidad: {item.qty}</span>
                  </div>
                  <b>{money(item.subtotal)}</b>
                </div>
              ))}
            </div>
          )}

          <p className="payment-ticket-note">
            Este recibo ampara únicamente el abono registrado sobre el apartado indicado.
            Conserva este comprobante para cualquier aclaración.
          </p>

          <p className="payment-ticket-footer">
            ✨ Gracias por confiar en Ventas Donatello ✨
          </p>
        </div>
      </div>
    </div>
  );
}

function SalesSection({ sales, loadingSales, loadSales, loadProducts }) {
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [editingSale, setEditingSale] = useState(null);
  const [editForm, setEditForm] = useState({
    discount_percent: 0,
    received: 0,
  });
  const [savingSale, setSavingSale] = useState(false);
  const [voidingSaleId, setVoidingSaleId] = useState(null);

  const completedSales = sales.filter(
    (sale) => String(sale.status || "completed").toLowerCase() !== "voided"
  );

  const totalSold = completedSales.reduce(
    (sum, sale) => sum + Number(sale.total || 0),
    0
  );
  const totalProfit = completedSales.reduce(
    (sum, sale) => sum + Number(sale.profit || 0),
    0
  );
  const totalItems = completedSales.reduce(
    (sum, sale) => sum + Number(sale.items_count || 0),
    0
  );

  function openEditSale(sale) {
    if (String(sale.status || "completed").toLowerCase() === "voided") {
      alert("Una venta anulada no puede editarse.");
      return;
    }

    setEditingSale(sale);
    setEditForm({
      discount_percent: Number(sale.discount_percent || 0),
      received: Number(sale.received || 0),
    });
  }

  async function saveSaleChanges() {
    if (!editingSale || savingSale) return;

    const subtotalOriginal = Number(
      editingSale.subtotal_original ||
        editingSale.sale_items?.reduce(
          (sum, item) => sum + Number(item.subtotal || 0),
          0
        ) ||
        0
    );
    const discountPercent = Number(editForm.discount_percent || 0);
    const receivedAmount = Number(editForm.received || 0);

    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      alert("El descuento debe estar entre 0% y 100%.");
      return;
    }

    const discountAmount = subtotalOriginal * (discountPercent / 100);
    const total = subtotalOriginal - discountAmount;
    const originalProfit = editingSale.sale_items?.reduce(
      (sum, item) => sum + Number(item.profit || 0),
      0
    ) || 0;
    const profit = originalProfit - discountAmount;
    const changeAmount = receivedAmount - total;

    if (total <= 0) {
      alert("El total corregido debe ser mayor a $0.");
      return;
    }

    if (!Number.isFinite(receivedAmount) || receivedAmount < total) {
      alert(`El monto recibido no puede ser menor al total corregido de ${money(total)}.`);
      return;
    }

    const confirmed = window.confirm(
      `Se actualizará la venta #${editingSale.id}:\\n\\nSubtotal: ${money(subtotalOriginal)}\\nDescuento: ${discountPercent}%\\nTotal: ${money(total)}\\nRecibido: ${money(receivedAmount)}\\nCambio: ${money(changeAmount)}\\nUtilidad: ${money(profit)}\\n\\n¿Confirmas la corrección?`
    );

    if (!confirmed) return;

    try {
      setSavingSale(true);

      const { error } = await supabase
        .from("sales")
        .update({
          subtotal_original: subtotalOriginal,
          discount_percent: discountPercent,
          discount_amount: discountAmount,
          total,
          profit,
          received: receivedAmount,
          change_amount: changeAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingSale.id);

      if (error) {
        alert(`No se pudo corregir la venta: ${error.message}`);
        return;
      }

      setEditingSale(null);
      await loadSales();
      alert("Venta corregida. Los indicadores ya fueron recalculados.");
    } finally {
      setSavingSale(false);
    }
  }

  async function voidSale(sale) {
    if (String(sale.status || "completed").toLowerCase() === "voided") return;

    const reason = window.prompt(
      `Motivo para anular la venta #${sale.id}:`,
      "Error de captura"
    );

    if (reason === null) return;
    if (!reason.trim()) {
      alert("Debes escribir el motivo de la anulación.");
      return;
    }

    const confirmed = window.confirm(
      `Se anulará la venta #${sale.id} por ${money(sale.total)}.\\n\\nEl sistema devolverá ${sale.items_count || 0} pieza(s) al inventario y excluirá esta venta de todos los indicadores.\\n\\n¿Confirmas?`
    );

    if (!confirmed) return;

    try {
      setVoidingSaleId(sale.id);

      const { error } = await supabase.rpc("void_sale_transaction", {
        p_sale_id: sale.id,
        p_reason: reason.trim(),
      });

      if (error) {
        alert(`No se pudo anular la venta: ${error.message}`);
        return;
      }

      await Promise.all([loadSales(), loadProducts()]);
      alert("Venta anulada y existencias devueltas al inventario.");
    } finally {
      setVoidingSaleId(null);
    }
  }

  return (
    <section className="inventory-section">
      <div className="sales-header">
        <div>
          <h2>Historial de ventas</h2>
          <p className="muted">
            Últimas 50 ventas. Las anuladas permanecen visibles para auditoría.
          </p>
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
          {sales.map((sale) => {
            const isVoided =
              String(sale.status || "completed").toLowerCase() === "voided";

            return (
              <Card
                key={sale.id}
                className={isVoided ? "sale-card-voided" : ""}
              >
                <div className="sale-card-header">
                  <div>
                    <div className="sale-title-row">
                      <h3>Venta #{sale.id}</h3>
                      <span
                        className={
                          isVoided
                            ? "sale-status sale-status-voided"
                            : "sale-status sale-status-completed"
                        }
                      >
                        {isVoided ? "ANULADA" : "COMPLETADA"}
                      </span>
                    </div>
                    <p>{new Date(sale.sale_date).toLocaleString("es-MX")}</p>
                    {isVoided && (
                      <p className="void-reason">
                        Motivo: {sale.void_reason || "Sin motivo registrado"}
                      </p>
                    )}
                  </div>
                  <div className="sale-total-box">
                    <span>Total</span>
                    <strong>{money(sale.total)}</strong>
                    <button
                      className="text-btn"
                      onClick={() => setSelectedReceipt(sale)}
                    >
                      Ticket
                    </button>
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
                      <div
                        className="sale-item-row"
                        key={`${sale.id}-${item.code}-${index}`}
                      >
                        <div>
                          <strong>{item.name}</strong>
                          <span>Cantidad: {item.qty}</span>
                        </div>
                        <b>{money(item.subtotal)}</b>
                      </div>
                    ))}
                  </div>
                )}

                {!isVoided && (
                  <div className="sale-admin-actions">
                    <Button
                      variant="secondary"
                      onClick={() => openEditSale(sale)}
                    >
                      ✏️ Corregir venta
                    </Button>

                    <Button
                      variant="danger"
                      disabled={Number(voidingSaleId) === Number(sale.id)}
                      onClick={() => voidSale(sale)}
                    >
                      {Number(voidingSaleId) === Number(sale.id)
                        ? "Anulando..."
                        : "❌ Anular venta"}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {selectedReceipt && (
        <ReceiptModal
          sale={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
        />
      )}

      {editingSale && (
        <div className="receipt-overlay">
          <div className="receipt-panel sale-edit-panel">
            <h2>Corregir venta #{editingSale.id}</h2>
            <p className="muted">
              Los productos y cantidades permanecen sin cambios. Se recalcularán
              total, utilidad y cambio.
            </p>

            <div className="sale-edit-summary">
              <div>
                <span>Subtotal real</span>
                <strong>
                  {money(
                    editingSale.subtotal_original ||
                      editingSale.sale_items?.reduce(
                        (sum, item) => sum + Number(item.subtotal || 0),
                        0
                      )
                  )}
                </strong>
              </div>
              <div>
                <span>Producto(s)</span>
                <strong>{editingSale.items_count}</strong>
              </div>
            </div>

            <label className="sale-edit-label">
              Descuento %
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={editForm.discount_percent}
                onChange={(e) =>
                  setEditForm((current) => ({
                    ...current,
                    discount_percent: e.target.value,
                  }))
                }
              />
            </label>

            <label className="sale-edit-label">
              Monto recibido
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.received}
                onChange={(e) =>
                  setEditForm((current) => ({
                    ...current,
                    received: e.target.value,
                  }))
                }
              />
            </label>

            <div className="sale-edit-preview">
              {(() => {
                const subtotalOriginal = Number(
                  editingSale.subtotal_original ||
                    editingSale.sale_items?.reduce(
                      (sum, item) => sum + Number(item.subtotal || 0),
                      0
                    ) ||
                    0
                );
                const discountAmount =
                  subtotalOriginal *
                  (Number(editForm.discount_percent || 0) / 100);
                const correctedTotal = subtotalOriginal - discountAmount;
                const correctedChange =
                  Number(editForm.received || 0) - correctedTotal;

                return (
                  <>
                    <div>
                      <span>Total corregido</span>
                      <strong>{money(correctedTotal)}</strong>
                    </div>
                    <div>
                      <span>Cambio corregido</span>
                      <strong>{money(Math.max(correctedChange, 0))}</strong>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="sale-edit-actions">
              <Button
                variant="secondary"
                disabled={savingSale}
                onClick={() => setEditingSale(null)}
              >
                Cancelar
              </Button>
              <Button disabled={savingSale} onClick={saveSaleChanges}>
                {savingSale ? "Guardando..." : "Guardar corrección"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}


function LayawaysSection({ layaways, loadLayaways, loadSales }) {
  const [selected, setSelected] = useState(null);
  const [payment, setPayment] = useState("");
  const [loadingLayaways, setLoadingLayaways] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [recentPayments, setRecentPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [expandedLayawayHistoryId, setExpandedLayawayHistoryId] = useState(null);

  async function loadRecentPayments() {
    setLoadingPayments(true);

    const { data, error } = await supabase
      .from("layaway_payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("Error cargando historial de abonos:", error);
      setRecentPayments([]);
    } else {
      setRecentPayments(data || []);
    }

    setLoadingPayments(false);
  }

  async function refreshLayaways() {
    setLoadingLayaways(true);

    try {
      await loadLayaways();
      await loadRecentPayments();
    } finally {
      setLoadingLayaways(false);
    }
  }

  async function savePaymentHistory(receiptData, saleId = null) {
    const payload = {
      layaway_id: receiptData.id,
      payment_amount: Number(receiptData.payment_amount || 0),
      previous_balance: Number(receiptData.previous_balance || 0),
      new_balance: Number(receiptData.balance || 0),
      previous_deposit: Number(receiptData.previous_deposit || 0),
      new_deposit: Number(receiptData.total_deposit || 0),
      payment_type: receiptData.type === "liquidation" ? "liquidation" : "payment",
      sale_id: saleId,
      customer_name: receiptData.customer_name || "",
      customer_phone: receiptData.customer_phone || "",
      total: Number(receiptData.total || 0),
      due_date: receiptData.due_date || null,
      items: receiptData.items || [],
    };

    const { data, error } = await supabase
      .from("layaway_payments")
      .insert([payload])
      .select("id, created_at")
      .single();

    if (error) {
      console.error("Error guardando historial de abono:", error);
      alert(`El pago se guardó, pero no se pudo guardar el historial del recibo: ${error.message}`);
      return null;
    }

    return data;
  }

  function openPaymentReceiptFromHistory(payment) {
    setPaymentReceipt({
      id: payment.layaway_id,
      payment_id: payment.id,
      type: payment.payment_type === "liquidation" ? "liquidation" : "payment",
      payment_date: payment.created_at,
      customer_name: payment.customer_name,
      customer_phone: payment.customer_phone,
      total: Number(payment.total || 0),
      previous_deposit: Number(payment.previous_deposit || 0),
      payment_amount: Number(payment.payment_amount || 0),
      total_deposit: Number(payment.new_deposit || 0),
      previous_balance: Number(payment.previous_balance || 0),
      balance: Number(payment.new_balance || 0),
      due_date: payment.due_date,
      items: Array.isArray(payment.items) ? payment.items : [],
      sale_id: payment.sale_id,
    });
  }

  function getPaymentsForLayaway(layawayId) {
    return recentPayments.filter(
      (payment) => Number(payment.layaway_id) === Number(layawayId)
    );
  }

  useEffect(() => {
    refreshLayaways();
  }, []);

  async function liquidateLayaway() {
    if (processingPayment) return;

    if (!selected) {
      alert("No hay apartado seleccionado.");
      return;
    }

    const amount = Number(payment || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Ingresa un monto válido.");
      return;
    }

    const currentBalance = Number(selected.balance || 0);
    const previousDeposit = Number(selected.deposit || 0);

    if (amount > currentBalance) {
      alert("El pago no puede ser mayor al saldo.");
      return;
    }

    const newBalance = Math.max(currentBalance - amount, 0);
    const newDeposit = previousDeposit + amount;
    const newStatus = newBalance <= 0 ? "paid" : "active";
    const paymentReceiptData = {
      id: selected.id,
      type: newStatus === "paid" ? "liquidation" : "payment",
      payment_date: new Date().toISOString(),
      customer_name: selected.customer_name,
      customer_phone: selected.customer_phone,
      total: Number(selected.total || 0),
      previous_deposit: previousDeposit,
      payment_amount: amount,
      total_deposit: newDeposit,
      previous_balance: currentBalance,
      balance: newBalance,
      due_date: selected.due_date,
      items: Array.isArray(selected.items) ? selected.items : [],
    };

    try {
      setProcessingPayment(true);

      if (newStatus === "paid") {
        const items = Array.isArray(selected.items) ? selected.items : [];
        const total = Number(selected.total || 0);
        const totalProfit = items.reduce(
          (sum, item) => sum + Number(item.profit || 0),
          0
        );
        const itemsCount = items.reduce(
          (sum, item) => sum + Number(item.qty || 0),
          0
        );

        const salePayload = {
          total,
          profit: totalProfit,
          received: newDeposit,
          change_amount: 0,
          items_count: itemsCount,
          subtotal_original: total,
          discount_percent: 0,
          discount_amount: 0,
          status: "completed",
          updated_at: new Date().toISOString(),
        };

        const { data: saleData, error: saleError } = await supabase
          .from("sales")
          .insert([salePayload])
          .select("id")
          .single();

        if (saleError) {
          alert(`Error creando venta final: ${saleError.message}`);
          return;
        }

        const saleItems = items.map((item) => ({
          sale_id: saleData.id,
          product_id: item.product_id || null,
          code: item.code,
          name: item.name,
          qty: Number(item.qty || 0),
          cost: Number(item.cost || 0),
          price: Number(item.price || 0),
          subtotal: Number(item.subtotal || 0),
          profit: Number(item.profit || 0),
        }));

        if (saleItems.length > 0) {
          const { error: itemsError } = await supabase
            .from("sale_items")
            .insert(saleItems);

          if (itemsError) {
            alert(`Venta creada, pero falló el detalle: ${itemsError.message}`);
            return;
          }
        }

        const { error } = await supabase
          .from("layaways")
          .update({
            balance: 0,
            deposit: newDeposit,
            status: "paid",
            notes: `Apartado liquidado y registrado como venta #${saleData.id}`,
          })
          .eq("id", selected.id);

        if (error) {
          alert(`Venta creada, pero falló actualizar apartado: ${error.message}`);
          return;
        }

        const savedPayment = await savePaymentHistory(paymentReceiptData, saleData.id);
        setPaymentReceipt({
          ...paymentReceiptData,
          sale_id: saleData.id,
          payment_id: savedPayment?.id,
          payment_date: savedPayment?.created_at || paymentReceiptData.payment_date,
        });
        alert(`Apartado liquidado correctamente. Venta #${saleData.id} creada en historial.`);
      } else {
        const { error } = await supabase
          .from("layaways")
          .update({
            balance: newBalance,
            deposit: newDeposit,
            status: "active",
          })
          .eq("id", selected.id);

        if (error) {
          alert(`Error actualizando apartado: ${error.message}`);
          return;
        }

        const savedPayment = await savePaymentHistory(paymentReceiptData);
        setPaymentReceipt({
          ...paymentReceiptData,
          payment_id: savedPayment?.id,
          payment_date: savedPayment?.created_at || paymentReceiptData.payment_date,
        });
        alert("Pago registrado correctamente.");
      }

      setSelected(null);
      setPayment("");
      await refreshLayaways();
      await loadSales();
    } catch (error) {
      console.error("Error inesperado liquidando apartado:", error);
      alert(`Error inesperado: ${error.message || error}`);
    } finally {
      setProcessingPayment(false);
    }
  }

  return (
    <section className="inventory-section">
      <div className="sales-header">
        <div>
          <h2>Apartados activos</h2>
          <p className="muted">
            Gestiona pagos y liquidaciones. Registros activos: {layaways.length}
          </p>
        </div>

        <Button onClick={refreshLayaways} disabled={loadingLayaways}>
          {loadingLayaways ? "Actualizando..." : "Actualizar"}
        </Button>
      </div>

      {loadingLayaways ? (
        <Card>
          <p className="muted">Cargando apartados...</p>
        </Card>
      ) : layaways.length === 0 ? (
        <Card>
          <p className="muted">
            No hay apartados activos. Si en Supabase sí aparecen, revisa la consola:
            ahora el sistema imprime “Apartados recibidos” para validar qué responde la base.
          </p>
        </Card>
      ) : (
        <div className="sales-list">
          {layaways.map((item) => (
            <Card key={item.id}>
              <div className="sale-card-header">
                <div>
                  <h3>{item.customer_name}</h3>
                  <p>{item.customer_phone || "Sin teléfono"}</p>
                </div>

                <div className="sale-total-box">
                  <span>Saldo</span>
                  <strong>{money(item.balance)}</strong>
                </div>
              </div>

              <div className="sale-summary-grid">
                <div>
                  <span>Total</span>
                  <b>{money(item.total)}</b>
                </div>

                <div>
                  <span>Anticipo</span>
                  <b>{money(item.deposit)}</b>
                </div>

                <div>
                  <span>Saldo</span>
                  <b>{money(item.balance)}</b>
                </div>

                <div>
                  <span>Vence</span>
                  <b>
                    {item.due_date
                      ? new Date(item.due_date + "T00:00:00").toLocaleDateString("es-MX")
                      : "Sin fecha"}
                  </b>
                </div>
              </div>

              {Array.isArray(item.items) && item.items.length > 0 && (
                <div className="sale-items-list">
                  {item.items.map((product, index) => (
                    <div className="sale-item-row" key={`${item.id}-${product.code}-${index}`}>
                      <div>
                        <strong>{product.name}</strong>
                        <span>{product.code} · x{product.qty}</span>
                      </div>

                      <b>{money(product.subtotal)}</b>
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <Button
                  onClick={() => {
                    setSelected(item);
                    setPayment(String(item.balance || ""));
                  }}
                >
                  Liquidar / Abonar
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => {
                    setExpandedLayawayHistoryId((current) =>
                      Number(current) === Number(item.id) ? null : item.id
                    );
                  }}
                >
                  Historial / Reimprimir
                </Button>
              </div>

              {Number(expandedLayawayHistoryId) === Number(item.id) && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 14,
                    borderRadius: 18,
                    background: "#fff7e8",
                    border: "1px solid #ead6ad",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0 }}>Historial de abonos</h3>
                      <p className="muted" style={{ marginTop: 4 }}>
                        Reimprime o descarga el recibo de cada movimiento.
                      </p>
                    </div>

                    <Button
                      variant="secondary"
                      onClick={loadRecentPayments}
                      disabled={loadingPayments}
                    >
                      {loadingPayments ? "Cargando..." : "Actualizar"}
                    </Button>
                  </div>

                  {getPaymentsForLayaway(item.id).length === 0 ? (
                    <p className="muted">
                      Este apartado aún no tiene abonos registrados en historial.
                      Los pagos hechos antes de activar esta función no se pueden reimprimir.
                    </p>
                  ) : (
                    <div className="sale-items-list">
                      {getPaymentsForLayaway(item.id).map((payment) => (
                        <div className="sale-item-row" key={payment.id}>
                          <div>
                            <strong>
                              {payment.payment_type === "liquidation"
                                ? "Liquidación"
                                : "Abono"}{" "}
                              {money(payment.payment_amount)}
                            </strong>
                            <span>
                              {new Date(payment.created_at).toLocaleString("es-MX")} ·
                              Saldo anterior {money(payment.previous_balance)} ·
                              Saldo nuevo {money(payment.new_balance)}
                            </span>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <button
                              className="text-btn"
                              onClick={() => openPaymentReceiptFromHistory(payment)}
                            >
                              Reimprimir recibo
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card>
        <div className="sales-header">
          <div>
            <h2>Historial de abonos</h2>
            <p className="muted">Últimos 30 abonos registrados para reimprimir recibos.</p>
          </div>

          <Button onClick={loadRecentPayments} disabled={loadingPayments}>
            {loadingPayments ? "Cargando..." : "Actualizar historial"}
          </Button>
        </div>

        {recentPayments.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>
            Todavía no hay abonos registrados en historial.
          </p>
        ) : (
          <div className="sale-items-list" style={{ marginTop: 12 }}>
            {recentPayments.map((payment) => (
              <div className="sale-item-row" key={payment.id}>
                <div>
                  <strong>{payment.customer_name || "Cliente sin nombre"}</strong>
                  <span>
                    {new Date(payment.created_at).toLocaleString("es-MX")} · {payment.payment_type === "liquidation" ? "Liquidación" : "Abono"} · Saldo {money(payment.new_balance)}
                  </span>
                </div>

                <div style={{ textAlign: "right", display: "grid", gap: 6 }}>
                  <b>{money(payment.payment_amount)}</b>
                  <button className="text-btn" onClick={() => openPaymentReceiptFromHistory(payment)}>
                    Reimprimir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selected && (
        <div className="receipt-overlay">
          <div className="receipt-panel">
            <h2>Pago apartado</h2>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div>
                <b>Cliente:</b> {selected.customer_name}
              </div>

              <div>
                <b>Saldo actual:</b> {money(selected.balance)}
              </div>

              <input
                type="number"
                placeholder="Monto a pagar"
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <Button variant="secondary" onClick={() => setSelected(null)}>
                  Cancelar
                </Button>

                <Button
                  onClick={liquidateLayaway}
                  disabled={processingPayment}
                >
                  {processingPayment ? "Procesando..." : "Confirmar pago"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentReceipt && (
        <PaymentReceiptModal
          receipt={paymentReceipt}
          onClose={() => setPaymentReceipt(null)}
        />
      )}
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

  .inventory-totals-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .inventory-totals-header {
    background: linear-gradient(135deg, #0b2f23 0%, #123c2c 58%, #b37a20 100%);
    color: #fff7e8;
    border: 1px solid rgba(247,183,51,.35);
    border-radius: 24px;
    padding: 22px;
    box-shadow: 0 14px 34px rgba(0,0,0,.16);
  }

  .inventory-totals-header .eyebrow {
    display: block;
    color: #f7b733;
    font-size: .76rem;
    font-weight: 900;
    letter-spacing: .12em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .inventory-totals-header h2 {
    font-size: clamp(1.45rem, 3vw, 2.2rem);
    font-weight: 900;
    letter-spacing: -.03em;
  }

  .inventory-totals-header p {
    margin-top: 6px;
    color: rgba(255,247,232,.82);
    font-weight: 700;
  }

  .inventory-kpis-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .inventory-kpi-card {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(179,122,32,.25);
  }

  .inventory-kpi-card::after {
    content: "";
    position: absolute;
    right: -35px;
    top: -35px;
    width: 90px;
    height: 90px;
    border-radius: 50%;
    background: rgba(247,183,51,.13);
  }

  .inventory-kpi-card small {
    display: block;
    margin-top: 8px;
    color: var(--muted);
    font-weight: 800;
  }

  .inventory-kpi-card.profit .metric-value {
    color: #b37a20;
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: #fff4df;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    margin-bottom: 6px;
  }


  .ticket-logo-img {
    overflow: hidden;
    padding: 3px;
  }

  .ticket-logo-img img {
    width: 150%;
    height: 150%;
    object-fit: contain;
    display: block;
  }

  .ticket-header h2 {
    font-size: 1.25rem;
    letter-spacing: 0.04em;
    margin: 0;
    color: #12372b;
    font-weight: 900;
  }

  .ticket-brand-line {
    font-size: 0.68rem !important;
    color: #6b5a35 !important;
    font-weight: 700;
    letter-spacing: 0.02em;
    margin-top: 3px !important;
  }

  .ticket-doc-title {
    color: #8a6a2f !important;
    font-weight: 800;
    margin-top: 4px !important;
  }

  .ticket-total-label {
    color: #12372b;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.02em;
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

  .ticket-catalog-box {
    border-top: 1px dashed #aaa;
    margin-top: 12px;
    padding-top: 12px;
    text-align: center;
  }

  .ticket-catalog-box p {
    margin: 0 0 6px;
    font-size: 0.78rem;
    color: #12372b;
    font-weight: 800;
  }

  .ticket-catalog-box img {
    width: 82px;
    height: 82px;
    display: block;
    margin: 0 auto 5px;
    border: 1px solid #e1d4aa;
    border-radius: 8px;
    padding: 4px;
    background: white;
  }

  .ticket-catalog-box span {
    display: block;
    font-size: 0.72rem;
    color: #444;
    font-weight: 700;
  }

  .ticket-footer {
    text-align: center;
    border-top: 1px dashed #aaa;
    padding-top: 10px;
    margin-top: 10px;
    font-weight: 800;
    color: #8a6a2f !important;
  }


  .sale-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .sale-status {
    border-radius: 999px;
    padding: 5px 9px;
    font-size: .68rem;
    font-weight: 900;
    letter-spacing: .06em;
  }

  .sale-status-completed {
    background: #e8f5ee;
    color: #17633c;
    border: 1px solid #b8dfc8;
  }

  .sale-status-voided {
    background: #fdecec;
    color: #a12622;
    border: 1px solid #efb8b5;
  }

  .sale-card-voided {
    opacity: .78;
    border-color: #e5b5b0;
    background: #fff8f7;
  }

  .sale-card-voided .sale-total-box,
  .sale-card-voided .sale-summary-grid div {
    background: #faeeee;
  }

  .void-reason {
    color: #a12622 !important;
    font-weight: 800;
  }

  .sale-admin-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 14px;
  }

  .sale-edit-panel {
    width: min(520px, 100%);
    max-height: 92vh;
    overflow-y: auto;
  }

  .sale-edit-summary,
  .sale-edit-preview {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 16px 0;
  }

  .sale-edit-summary div,
  .sale-edit-preview div {
    background: var(--cream);
    border-radius: 16px;
    padding: 12px;
  }

  .sale-edit-summary span,
  .sale-edit-preview span {
    display: block;
    color: var(--muted);
    font-size: .8rem;
    font-weight: 800;
  }

  .sale-edit-summary strong,
  .sale-edit-preview strong {
    display: block;
    margin-top: 5px;
    font-size: 1.2rem;
  }

  .sale-edit-label {
    display: grid;
    gap: 7px;
    margin-top: 12px;
    font-weight: 900;
  }

  .sale-edit-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 16px;
  }

  .ticket-void-banner {
    background: #a12622;
    color: white;
    text-align: center;
    border-radius: 10px;
    padding: 10px;
    margin-bottom: 10px;
    font-weight: 900;
    letter-spacing: .08em;
  }

  .ticket-void-banner span {
    display: block;
    margin-top: 4px;
    font-size: .72rem;
    letter-spacing: 0;
  }

  @media print {
    @page {
      margin: 0;
      size: auto;
    }

    html,
    body {
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      height: auto !important;
      overflow: visible !important;
    }

    body * {
      visibility: hidden !important;
    }

    .receipt-overlay,
    .receipt-overlay * {
      visibility: visible !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .receipt-overlay {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      right: auto !important;
      bottom: auto !important;
      display: block !important;
      background: white !important;
      padding: 0 !important;
      margin: 0 !important;
      width: 100% !important;
      min-height: auto !important;
    }

    .receipt-panel {
      width: 80mm !important;
      max-width: 80mm !important;
      margin: 0 auto !important;
      padding: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      background: white !important;
    }

    .ticket-print-area,
    .payment-ticket {
      width: 80mm !important;
      max-width: 80mm !important;
      border: none !important;
      border-radius: 0 !important;
      padding: 10px !important;
      margin: 0 !important;
      box-shadow: none !important;
    }

    .no-print {
      display: none !important;
      visibility: hidden !important;
    }
  }


  .payment-ticket {
    background: #ffffff;
    color: #111827;
    border: 1px solid #eee;
    border-radius: 18px;
    padding: 16px;
    font-family: Arial, sans-serif;
  }

  .payment-ticket-header {
    text-align: center;
    border-bottom: 1px dashed #aaa;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }

  .payment-ticket-logo {
    width: 74px;
    height: 74px;
    margin: 0 auto 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .payment-ticket-logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .payment-ticket-header h2 {
    font-size: 1.25rem;
    letter-spacing: 0.04em;
    margin: 0;
    color: #12372b;
    font-weight: 900;
  }

  .payment-ticket-title {
    color: #8a6a2f;
    font-weight: 900;
    margin: 4px 0 0;
    font-size: .86rem;
  }

  .payment-ticket-section {
    border-bottom: 1px dashed #aaa;
    padding-bottom: 8px;
    margin-bottom: 8px;
  }

  .payment-ticket-section p {
    font-size: 0.82rem;
    margin: 3px 0;
  }

  .payment-ticket-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin: 5px 0;
    font-size: 0.84rem;
  }

  .payment-ticket-row span {
    color: #555;
  }

  .payment-ticket-row b {
    font-size: .95rem;
  }

  .payment-ticket-row.highlight {
    background: #fff4df;
    border: 1px solid #ead6ad;
    border-radius: 10px;
    padding: 8px;
    font-weight: 900;
    color: #12372b;
  }

  .payment-ticket-row.highlight b {
    font-size: 1.12rem;
  }

  .payment-ticket-items {
    border-bottom: 1px dashed #aaa;
    padding-bottom: 8px;
    margin-bottom: 8px;
  }

  .payment-ticket-item {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin: 6px 0;
    font-size: .82rem;
  }

  .payment-ticket-item span {
    display: block;
    color: #555;
    font-size: .74rem;
    margin-top: 2px;
  }

  .payment-ticket-note {
    font-size: .76rem;
    line-height: 1.35;
    color: #444;
    text-align: center;
  }

  .payment-ticket-footer {
    text-align: center;
    padding-top: 8px;
    margin-top: 8px;
    font-weight: 800;
    color: #8a6a2f;
    font-size: .82rem;
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
  
  .payment-ticket {
    background: #ffffff;
    color: #111827;
    border: 1px solid #eee;
    border-radius: 18px;
    padding: 16px;
    font-family: Arial, sans-serif;
  }

  .payment-ticket-header {
    text-align: center;
    border-bottom: 1px dashed #aaa;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }

  .payment-ticket-logo {
    width: 74px;
    height: 74px;
    margin: 0 auto 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .payment-ticket-logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .payment-ticket-header h2 {
    font-size: 1.25rem;
    letter-spacing: 0.04em;
    margin: 0;
    color: #12372b;
    font-weight: 900;
  }

  .payment-ticket-title {
    color: #8a6a2f;
    font-weight: 900;
    margin: 4px 0 0;
    font-size: .86rem;
  }

  .payment-ticket-section {
    border-bottom: 1px dashed #aaa;
    padding-bottom: 8px;
    margin-bottom: 8px;
  }

  .payment-ticket-section p {
    font-size: 0.82rem;
    margin: 3px 0;
  }

  .payment-ticket-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin: 5px 0;
    font-size: 0.84rem;
  }

  .payment-ticket-row span {
    color: #555;
  }

  .payment-ticket-row b {
    font-size: .95rem;
  }

  .payment-ticket-row.highlight {
    background: #fff4df;
    border: 1px solid #ead6ad;
    border-radius: 10px;
    padding: 8px;
    font-weight: 900;
    color: #12372b;
  }

  .payment-ticket-row.highlight b {
    font-size: 1.12rem;
  }

  .payment-ticket-items {
    border-bottom: 1px dashed #aaa;
    padding-bottom: 8px;
    margin-bottom: 8px;
  }

  .payment-ticket-item {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin: 6px 0;
    font-size: .82rem;
  }

  .payment-ticket-item span {
    display: block;
    color: #555;
    font-size: .74rem;
    margin-top: 2px;
  }

  .payment-ticket-note {
    font-size: .76rem;
    line-height: 1.35;
    color: #444;
    text-align: center;
  }

  .payment-ticket-footer {
    text-align: center;
    padding-top: 8px;
    margin-top: 8px;
    font-weight: 800;
    color: #8a6a2f;
    font-size: .82rem;
  }

  .qr-layout { grid-template-columns: 1fr; }
    .sales-header { flex-direction: column; align-items: stretch; }
    .sale-card-header { flex-direction: column; }
    .sale-total-box { width: 100%; text-align: left; }
    .sale-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sale-admin-actions,
    .sale-edit-actions,
    .sale-edit-summary,
    .sale-edit-preview {
      grid-template-columns: 1fr;
    }
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

  @media (max-width: 920px) {
    .inventory-kpis-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .inventory-kpis-grid {
      grid-template-columns: 1fr;
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
