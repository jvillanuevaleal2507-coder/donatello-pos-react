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
      cacheControl: "31536000",
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
      loading="lazy"
      decoding="async"
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
  const checkoutRunningRef = useRef(false);
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
    if (!products.length || typeof window === "undefined") return;

    const saveData = navigator.connection?.saveData;
    if (saveData) return;

    const urls = products
      .map((product) => product.image_url)
      .filter(Boolean);

    const uniqueUrls = [...new Set(urls)];
    if (!uniqueUrls.length) return;

    // Abre conexiones antes de que el usuario entre a Inventario.
    const origins = [...new Set(
      uniqueUrls
        .map((url) => {
          try {
            return new URL(url).origin;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    )].slice(0, 4);

    const connectionLinks = [];
    origins.forEach((origin) => {
      ["preconnect", "dns-prefetch"].forEach((rel) => {
        if (document.head.querySelector(`link[rel="${rel}"][href="${origin}"]`)) return;
        const link = document.createElement("link");
        link.rel = rel;
        link.href = origin;
        if (rel === "preconnect") link.crossOrigin = "anonymous";
        document.head.appendChild(link);
        connectionLinks.push(link);
      });
    });

    // Prioridad alta para las fotos que suelen quedar arriba de Inventario.
    uniqueUrls.slice(0, 12).forEach((url) => {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    });

    // El resto se llena en caché cuando el navegador queda libre.
    const remaining = uniqueUrls.slice(12);
    let cancelled = false;
    let cursor = 0;

    const warmBatch = () => {
      if (cancelled) return;
      remaining.slice(cursor, cursor + 10).forEach((url) => {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
      });
      cursor += 10;

      if (cursor < remaining.length) {
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(warmBatch, { timeout: 1200 });
        } else {
          window.setTimeout(warmBatch, 250);
        }
      }
    };

    if (remaining.length) {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(warmBatch, { timeout: 800 });
      } else {
        window.setTimeout(warmBatch, 180);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [products]);

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

    if (checkoutRunningRef.current) return;
    checkoutRunningRef.current = true;
    try {
      const { data: receipt, error } = await supabase.rpc("donatello_checkout", {
        p_mode: saleMode,
        p_items: cart.map((item) => ({
          id: item.id,
          qty: item.qty,
          expected_price: Number(item.price || 0),
        })),
        p_discount_percent: Number(discountPercent || 0),
        p_received: saleMode === "sale" ? Number(received || 0) : 0,
        p_customer_name: saleMode === "layaway" ? customerName.trim() : null,
        p_customer_phone: saleMode === "layaway" ? customerPhone.trim() : null,
        p_deposit: saleMode === "layaway" ? Number(depositAmount || 0) : 0,
        p_due_date: saleMode === "layaway" ? dueDate : null,
      });
      if (error || !receipt?.id) {
        setScanStatus(
          `No se pudo confirmar el registro: ${error?.message || "respuesta inválida"}. Antes de intentarlo otra vez, revisa el historial para evitar duplicados.`
        );
        return;
      }
      setLastReceipt(receipt);
      const confirmation = saleMode === "layaway"
        ? `Apartado registrado: ${money(receipt.deposit)} | Saldo: ${money(receipt.balance)}`
        : `Venta cobrada: ${money(receipt.total)} | Cambio: ${money(receipt.change_amount)}`;
      clearCart();
      setScanStatus(confirmation);
      const refreshResults = await Promise.allSettled([
        loadProducts(),
        loadSales(),
        ...(saleMode === "layaway" ? [loadLayaways()] : []),
      ]);
      if (refreshResults.some((result) => result.status === "rejected")) {
        setScanStatus(`${confirmation}. Algunos datos no se actualizaron; vuelve a cargar la pantalla.`);
      }
    } catch (error) {
      console.error("Checkout confirmation error:", error);
      setScanStatus("No se pudo confirmar el registro. Revisa el historial de ventas y apartados antes de reintentar, para evitar duplicados.");
    } finally {
      checkoutRunningRef.current = false;
    }
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
        <header className="brand-header brand-header-modern">
          <div className="brand-logo-modern">
            <img src={logoDonatello} alt="Ventas Donatello" />
          </div>

          <div className="brand-copy-modern">
            <span className="eyebrow">Operación Donatello</span>
            <h1>Ventas Donatello</h1>
            <p>Inventario, ventas y control en un solo lugar.</p>
          </div>

          <div className="brand-session-modern">
            <strong>POS</strong>
            <span>{session?.user?.email || "Sesión activa"}</span>
          </div>
        </header>

        <div className="workspace">
          <aside className="sidebar-shell">
            <Navbar clearCart={clearCart} loadProducts={loadProducts} />
            <button className="sidebar-signout" onClick={signOut} type="button">
              <span aria-hidden="true">↪</span>
              <span>Cerrar sesión</span>
            </button>
          </aside>

          <section className="workspace-content">
      {loadingProducts && (
        <Card>
          <p className="muted">Cargando inventario desde Supabase...</p>
        </Card>
      )}

      <Routes>
        <Route
          path="/"
          element={
            <section className="sale-screen">
              <div className="sale-page-heading">
                <div>
                  <span className="eyebrow">Punto de venta</span>
                  <h2>Nueva venta</h2>
                  <p className="muted">Busca el producto, agrégalo y cobra sin pasos innecesarios.</p>
                </div>
                <div className="sale-heading-badge">
                  <span>{itemsCount} {itemsCount === 1 ? "pieza" : "piezas"}</span>
                  <strong>{money(totalFinal)}</strong>
                </div>
              </div>

              <div className="sale-kpis">
                <Card className="sale-kpi-card">
                  <span>Total actual</span>
                  <strong>{money(subtotal)}</strong>
                  <small>Antes de descuento</small>
                </Card>
                <Card className="sale-kpi-card">
                  <span>Descuento</span>
                  <strong>{Number(discountPercent || 0)}%</strong>
                  <small>{money(discountAmount)}</small>
                </Card>
                <Card className="sale-kpi-card sale-profit-kpi">
                  <span>Utilidad estimada</span>
                  <strong>{money(adjustedProfit)}</strong>
                  <small>Venta actual</small>
                </Card>
              </div>

              <div className="sale-layout sale-layout-modern">
                <div className="left-panel sale-product-column">
                  <Card className="sale-search-card">
                    <div className="sale-card-heading">
                      <div>
                        <span className="eyebrow">Producto</span>
                        <h2>Agregar a la venta</h2>
                      </div>
                      <span className="sale-step">01</span>
                    </div>

                    <div className="sale-search-wrap">
                      <span aria-hidden="true">⌕</span>
                      <input
                        value={quickSearch}
                        onChange={(e) => setQuickSearch(e.target.value)}
                        placeholder="Escribe nombre, código o categoría..."
                        autoFocus
                      />
                    </div>

                    {quickSearch.trim() ? (
                      <div className="quick-results sale-quick-results">
                        {products
                          .filter((p) => Number(p.stock || 0) > 0)
                          .filter((p) => {
                            const text = `${p.name || ""} ${p.code || ""} ${p.category || ""}`
                              .normalize("NFD")
                              .replace(/[\u0300-\u036f]/g, "")
                              .toLowerCase();
                            const query = String(quickSearch || "")
                              .normalize("NFD")
                              .replace(/[\u0300-\u036f]/g, "")
                              .toLowerCase()
                              .trim();
                            return text.includes(query);
                          })
                          .map((p) => (
                            <button
                              key={p.id}
                              className="quick-result-btn sale-result-btn"
                              onClick={() => {
                                addToCart(p);
                                setQuickSearch("");
                              }}
                              type="button"
                            >
                              <ProductImage src={p.image_url} alt={p.name} small />
                              <div className="sale-result-copy">
                                <strong>{p.name}</strong>
                                <span>{p.code} · {p.category || "General"}</span>
                              </div>
                              <div className="sale-result-meta">
                                <strong>{money(p.price)}</strong>
                                <span>Stock {p.stock}</span>
                              </div>
                            </button>
                          ))}
                      </div>
                    ) : (
                      <div className="sale-search-hint">
                        <span>⌕</span>
                        <div>
                          <strong>Empieza a escribir para buscar</strong>
                          <p>Solo aparecerán productos con existencia disponible.</p>
                        </div>
                      </div>
                    )}
                  </Card>

                </div>

                <div className="right-panel sale-checkout-column">
                  <Card className="sale-cart-card">
                    <div className="sale-card-heading">
                      <div>
                        <span className="eyebrow">Pedido actual</span>
                        <h2>Carrito</h2>
                      </div>
                      <span className="sale-step">{itemsCount}</span>
                    </div>

                    {cart.length === 0 ? (
                      <div className="sale-cart-empty">
                        <span>□</span>
                        <strong>Aún no hay productos</strong>
                        <p>Busca un artículo a la izquierda para iniciar la venta.</p>
                      </div>
                    ) : (
                      <div className="cart-list sale-cart-list">
                        {cart.map((item) => (
                          <div className="cart-item sale-cart-item" key={item.id}>
                            <ProductImage src={item.image_url} alt={item.name} small />
                            <div className="cart-info">
                              <strong>{item.name}</strong>
                              <span>{item.code} · Cant. {item.qty}</span>
                            </div>
                            <div className="cart-price">
                              <strong>{money(Number(item.price || 0) * item.qty)}</strong>
                              <button onClick={() => removeFromCart(item.id)} type="button">Quitar</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card className="sale-checkout-card">
                    <div className="sale-card-heading">
                      <div>
                        <span className="eyebrow">Finalizar</span>
                        <h2>Cobro</h2>
                      </div>
                      <span className="sale-step">03</span>
                    </div>

                    <div className="sale-mode-toggle">
                      <button
                        onClick={() => setSaleMode("sale")}
                        className={saleMode === "sale" ? "active" : ""}
                        type="button"
                      >
                        Venta normal
                      </button>
                      <button
                        onClick={() => setSaleMode("layaway")}
                        className={saleMode === "layaway" ? "active" : ""}
                        type="button"
                      >
                        Apartado
                      </button>
                    </div>

                    <div className="sale-discount-section">
                      <label>Descuento</label>
                      <div className="sale-discount-pills">
                        {[0, 5, 10, 15].map((value) => (
                          <button
                            key={value}
                            onClick={() => setDiscountPercent(value)}
                            className={Number(discountPercent) === value ? "active" : ""}
                            type="button"
                          >
                            {value}%
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(e.target.value)}
                        placeholder="Otro porcentaje"
                      />
                    </div>

                    {saleMode === "layaway" && (
                      <div className="sale-layaway-fields">
                        <input
                          placeholder="Nombre del cliente"
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

                    {saleMode === "sale" && (
                      <div className="sale-received-field">
                        <label>Monto recibido</label>
                        <input
                          type="number"
                          value={received}
                          onChange={(e) => setReceived(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    )}

                    <div className="sale-total-summary">
                      <div>
                        <span>Subtotal</span>
                        <b>{money(subtotal)}</b>
                      </div>
                      <div>
                        <span>Descuento</span>
                        <b>-{money(discountAmount)}</b>
                      </div>
                      <div className="sale-total-final-row">
                        <span>Total final</span>
                        <strong>{money(totalFinal)}</strong>
                      </div>
                      <div className="sale-change-row">
                        <span>{saleMode === "layaway" ? "Saldo pendiente" : "Cambio"}</span>
                        <strong>
                          {saleMode === "layaway"
                            ? money(Math.max(totalFinal - Number(depositAmount || 0), 0))
                            : change >= 0
                            ? money(change)
                            : money(0)}
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
                      style={{ minHeight: 58, fontSize: "1.15rem", width: "100%" }}
                    >
                      {saleMode === "layaway" ? "Registrar apartado" : "Cobrar venta"}
                    </Button>
                  </Card>
                </div>
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
          path="/importar"
          element={<ImportCSV products={products} loadProducts={loadProducts} />}
        />
        <Route
          path="/csv"
          element={<ImportCSV products={products} loadProducts={loadProducts} />}
        />
      </Routes>

          </section>
        </div>

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
  const [mobileBulkOpen, setMobileBulkOpen] = useState(false);

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
    <section className="qr-modern">
      <div className="qr-heading-modern">
        <div>
          <span className="eyebrow">Etiquetado</span>
          <h2>Etiquetas QR</h2>
          <p>Genera códigos individuales o imprime todas las etiquetas del inventario.</p>
        </div>
        <div className="qr-count-badge">
          <span>Productos</span>
          <strong>{products.length}</strong>
        </div>
      </div>

      {products.length === 0 ? (
        <Card className="qr-empty-card">
          <strong>No hay productos cargados.</strong>
          <span>Agrega productos al inventario para generar sus etiquetas.</span>
        </Card>
      ) : (
        <div className="qr-layout qr-layout-modern">
          <Card className="qr-controls qr-controls-modern">
            <div className="qr-section-title">
              <div>
                <span className="eyebrow">Seleccionar</span>
                <h3>Producto</h3>
              </div>
              <span className="sale-step">01</span>
            </div>

            <label className="qr-product-select">
              Buscar en inventario
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
            </label>

            {selectedProduct && (
              <div className="qr-product-box qr-product-box-modern">
                <ProductImage src={selectedProduct.image_url} alt={selectedProduct.name} />
                <div>
                  <h3>{selectedProduct.name}</h3>
                  <p>{selectedProduct.code} · {selectedProduct.category || "General"}</p>
                  <div className="qr-product-meta">
                    <span>Precio <b>{money(selectedProduct.price)}</b></span>
                    <span>Stock <b>{selectedProduct.stock}</b></span>
                  </div>
                </div>
              </div>
            )}

            <button
              className="qr-mobile-bulk-toggle"
              type="button"
              aria-expanded={mobileBulkOpen}
              onClick={() => setMobileBulkOpen((value) => !value)}
            >
              <span>Acciones masivas</span>
              <span aria-hidden="true">{mobileBulkOpen ? "⌃" : "⌄"}</span>
            </button>

            <div className={`qr-bulk-actions qr-mobile-bulk-panel ${mobileBulkOpen ? "is-open" : ""}`}>
              <button className="qr-action-card" onClick={downloadAllQRCodes} disabled={downloadingAll} type="button">
                <span className="qr-action-icon">ZIP</span>
                <div>
                  <strong>{downloadingAll ? "Generando..." : "Todos los QR"}</strong>
                  <small>Descarga un ZIP con todos los códigos.</small>
                </div>
              </button>

              <button className="qr-action-card" onClick={generateLabelsPDF} disabled={generatingPdf} type="button">
                <span className="qr-action-icon">PDF</span>
                <div>
                  <strong>{generatingPdf ? "Generando..." : "Etiquetas imprimibles"}</strong>
                  <small>Hoja carta con 10 etiquetas por página.</small>
                </div>
              </button>
            </div>
          </Card>

          <Card className="qr-preview qr-preview-modern">
            <div className="qr-section-title">
              <div>
                <span className="eyebrow">Vista previa</span>
                <h3>QR individual</h3>
              </div>
              <span className="sale-step">02</span>
            </div>

            {qrDataUrl ? (
              <div className="qr-code-stage">
                <img src={qrDataUrl} alt={`QR ${selectedProduct?.code}`} />
                <strong>{selectedProduct?.code}</strong>
                <span>{selectedProduct?.name}</span>
                <a
                  className="download-btn qr-download-single"
                  href={qrDataUrl}
                  download={`QR_${selectedProduct?.code}.png`}
                >
                  Descargar QR individual
                </a>
              </div>
            ) : (
              <p className="muted">Generando QR...</p>
            )}
          </Card>
        </div>
      )}
    </section>
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
  const [salesSearch, setSalesSearch] = useState("");
  const [salesStatus, setSalesStatus] = useState("all");
  const [expandedSaleId, setExpandedSaleId] = useState(null);
  const [selectedSalesYear, setSelectedSalesYear] = useState("");
  const [selectedSalesMonth, setSelectedSalesMonth] = useState("");

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

  const visibleSales = sales.filter((sale) => {
    const isVoided = String(sale.status || "completed").toLowerCase() === "voided";
    const matchesStatus =
      salesStatus === "all" ||
      (salesStatus === "completed" && !isVoided) ||
      (salesStatus === "voided" && isVoided);

    const query = salesSearch.trim().toLowerCase();
    const itemText = (sale.sale_items || [])
      .map((item) => `${item.name || ""} ${item.code || ""}`)
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !query ||
      String(sale.id || "").includes(query) ||
      itemText.includes(query);

    return matchesStatus && matchesSearch;
  });


  const salesByYear = Object.entries(
    visibleSales
      .slice()
      .sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date))
      .reduce((years, sale) => {
        const date = new Date(sale.sale_date);
        const year = String(date.getFullYear());
        const monthNumber = String(date.getMonth() + 1).padStart(2, "0");
        const monthKey = `${year}-${monthNumber}`;
        const monthLabel = date.toLocaleDateString("es-MX", {
          month: "long",
        });

        if (!years[year]) years[year] = {};
        if (!years[year][monthKey]) {
          years[year][monthKey] = {
            key: monthKey,
            label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
            sales: [],
            total: 0,
          };
        }

        years[year][monthKey].sales.push(sale);
        if (String(sale.status || "completed").toLowerCase() !== "voided") {
          years[year][monthKey].total += Number(sale.total || 0);
        }
        return years;
      }, {})
  )
    .sort(([yearA], [yearB]) => Number(yearB) - Number(yearA))
    .map(([year, months]) => ({
      year,
      months: Object.values(months).sort((a, b) => b.key.localeCompare(a.key)),
    }));

  const effectiveSalesYear =
    selectedSalesYear && salesByYear.some(({ year }) => year === selectedSalesYear)
      ? selectedSalesYear
      : salesByYear[0]?.year || "";

  const selectedYearGroup =
    salesByYear.find(({ year }) => year === effectiveSalesYear) || salesByYear[0];

  const availableSalesMonths = selectedYearGroup?.months || [];

  const effectiveSalesMonth =
    selectedSalesMonth &&
    availableSalesMonths.some((month) => month.key === selectedSalesMonth)
      ? selectedSalesMonth
      : availableSalesMonths[0]?.key || "";

  const selectedMonthGroup =
    availableSalesMonths.find((month) => month.key === effectiveSalesMonth) ||
    availableSalesMonths[0];

  function changeSalesYear(year) {
    setSelectedSalesYear(year);
    const firstMonth = salesByYear.find((group) => group.year === year)?.months?.[0]?.key || "";
    setSelectedSalesMonth(firstMonth);
    setExpandedSaleId(null);
  }

  function changeSalesMonth(monthKey) {
    setSelectedSalesMonth(monthKey);
    setExpandedSaleId(null);
  }

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


  function renderSaleCard(sale) {
    const isVoided =
      String(sale.status || "completed").toLowerCase() === "voided";

    return (
      <Card
        key={sale.id}
        className={`sales-history-card ${isVoided ? "sale-card-voided" : ""}`}
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

        <button
          className="sales-mobile-detail-toggle"
          type="button"
          aria-expanded={Number(expandedSaleId) === Number(sale.id)}
          onClick={() =>
            setExpandedSaleId((current) =>
              Number(current) === Number(sale.id) ? null : sale.id
            )
          }
        >
          <span>Ver detalles</span>
          <span aria-hidden="true">
            {Number(expandedSaleId) === Number(sale.id) ? "⌃" : "⌄"}
          </span>
        </button>

        <div
          className={`sales-mobile-detail-panel ${
            Number(expandedSaleId) === Number(sale.id) ? "is-open" : ""
          }`}
        >
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
        </div>
      </Card>
    );
  }

  return (
    <section className="inventory-section sales-modern">
      <div className="sales-header sales-heading-modern">
        <div>
          <span className="eyebrow">Operación</span>
          <h2>Historial de ventas</h2>
          <p className="muted">
            Consulta tickets, corrige capturas y conserva la trazabilidad de anulaciones.
          </p>
        </div>
        <Button variant="secondary" onClick={loadSales}>↻ Actualizar</Button>
      </div>

      <div className="metrics-grid sales-kpi-grid">
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

      <Card className="sales-toolbar-card">
        <div className="sales-search-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={salesSearch}
            onChange={(e) => setSalesSearch(e.target.value)}
            placeholder="Buscar por número de venta, producto o código..."
          />
        </div>
        <div className="sales-status-pills">
          {[
            ["all", "Todas"],
            ["completed", "Completadas"],
            ["voided", "Anuladas"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={salesStatus === value ? "active" : ""}
              onClick={() => setSalesStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="sales-result-count">{visibleSales.length} registros</span>
      </Card>

      {loadingSales ? (
        <Card><p className="muted">Cargando ventas...</p></Card>
      ) : sales.length === 0 ? (
        <Card><p className="muted">Todavía no hay ventas registradas.</p></Card>
      ) : (
        <div className="sales-period-selector">
          <div className="sales-period-topline">
            {salesByYear.length > 1 ? (
              <label className="sales-period-field">
                <span>Año</span>
                <select
                  value={effectiveSalesYear}
                  onChange={(e) => changeSalesYear(e.target.value)}
                >
                  {salesByYear.map(({ year }) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="sales-single-year">
                <span>Año</span>
                <strong>{effectiveSalesYear}</strong>
              </div>
            )}

            <label className="sales-period-field sales-period-month">
              <span>Mes</span>
              <select
                value={effectiveSalesMonth}
                onChange={(e) => changeSalesMonth(e.target.value)}
              >
                {availableSalesMonths.map((month) => (
                  <option key={month.key} value={month.key}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedMonthGroup ? (
            <>
              <div className="sales-period-summary">
                <div>
                  <span>Periodo</span>
                  <strong>{selectedMonthGroup.label} {effectiveSalesYear}</strong>
                </div>
                <div>
                  <span>Ventas</span>
                  <strong>{selectedMonthGroup.sales.length}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{money(selectedMonthGroup.total)}</strong>
                </div>
              </div>

              <div className="sales-list sales-list-modern">
                {selectedMonthGroup.sales.map(renderSaleCard)}
              </div>
            </>
          ) : (
            <Card><p className="muted">No hay ventas para el periodo seleccionado.</p></Card>
          )}
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
  const [expandedLayawayDetailsId, setExpandedLayawayDetailsId] = useState(null);
  const [mobilePaymentsOpen, setMobilePaymentsOpen] = useState(false);
  const [selectedPaymentsYear, setSelectedPaymentsYear] = useState("");
  const [selectedPaymentsMonth, setSelectedPaymentsMonth] = useState("");

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

  const totalLayawayValue = layaways.reduce(
    (sum, item) => sum + Number(item.total || 0),
    0
  );
  const totalLayawayBalance = layaways.reduce(
    (sum, item) => sum + Number(item.balance || 0),
    0
  );
  const totalLayawayDeposit = layaways.reduce(
    (sum, item) => sum + Number(item.deposit || 0),
    0
  );

  const paymentPeriods = Object.entries(
    recentPayments.reduce((years, payment) => {
      const date = new Date(payment.created_at);
      const year = String(date.getFullYear());
      const monthNumber = String(date.getMonth() + 1).padStart(2, "0");
      const monthKey = `${year}-${monthNumber}`;
      const monthLabel = date.toLocaleDateString("es-MX", { month: "long" });

      if (!years[year]) years[year] = {};
      if (!years[year][monthKey]) {
        years[year][monthKey] = {
          key: monthKey,
          label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
          payments: [],
          total: 0,
        };
      }

      years[year][monthKey].payments.push(payment);
      years[year][monthKey].total += Number(payment.payment_amount || 0);
      return years;
    }, {})
  )
    .sort(([yearA], [yearB]) => Number(yearB) - Number(yearA))
    .map(([year, months]) => ({
      year,
      months: Object.values(months).sort((a, b) => b.key.localeCompare(a.key)),
    }));

  const effectivePaymentsYear =
    selectedPaymentsYear &&
    paymentPeriods.some(({ year }) => year === selectedPaymentsYear)
      ? selectedPaymentsYear
      : paymentPeriods[0]?.year || "";

  const selectedPaymentsYearGroup =
    paymentPeriods.find(({ year }) => year === effectivePaymentsYear) ||
    paymentPeriods[0];

  const availablePaymentsMonths = selectedPaymentsYearGroup?.months || [];

  const effectivePaymentsMonth =
    selectedPaymentsMonth &&
    availablePaymentsMonths.some((month) => month.key === selectedPaymentsMonth)
      ? selectedPaymentsMonth
      : availablePaymentsMonths[0]?.key || "";

  const selectedPaymentsMonthGroup =
    availablePaymentsMonths.find((month) => month.key === effectivePaymentsMonth) ||
    availablePaymentsMonths[0];

  function changePaymentsYear(year) {
    setSelectedPaymentsYear(year);
    const firstMonth =
      paymentPeriods.find((group) => group.year === year)?.months?.[0]?.key || "";
    setSelectedPaymentsMonth(firstMonth);
  }

  return (
    <section className="inventory-section layaways-modern">
      <div className="sales-header layaways-heading">
        <div>
          <span className="eyebrow">Seguimiento</span>
          <h2>Apartados</h2>
          <p className="muted">Controla saldos, fechas límite, abonos y recibos desde una sola pantalla.</p>
        </div>

        <Button variant="secondary" onClick={refreshLayaways} disabled={loadingLayaways}>
          {loadingLayaways ? "Actualizando..." : "↻ Actualizar"}
        </Button>
      </div>

      <div className="layaway-kpi-grid">
        <Card className="layaway-kpi">
          <span>Activos</span>
          <strong>{layaways.length}</strong>
          <small>Apartados abiertos</small>
        </Card>
        <Card className="layaway-kpi">
          <span>Valor apartado</span>
          <strong>{money(totalLayawayValue)}</strong>
          <small>Total comprometido</small>
        </Card>
        <Card className="layaway-kpi">
          <span>Anticipos recibidos</span>
          <strong>{money(totalLayawayDeposit)}</strong>
          <small>Capital ya cobrado</small>
        </Card>
        <Card className="layaway-kpi olive">
          <span>Saldo pendiente</span>
          <strong>{money(totalLayawayBalance)}</strong>
          <small>Por recuperar</small>
        </Card>
      </div>

      {loadingLayaways ? (
        <Card>
          <p className="muted">Cargando apartados...</p>
        </Card>
      ) : layaways.length === 0 ? (
        <Card>
          <p className="muted">
            No hay apartados activos por el momento.
          </p>
        </Card>
      ) : (
        <div className="sales-list layaways-list">
          {layaways.map((item) => (
            <Card key={item.id} className="layaway-card">
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

              <div className="layaway-essential-row">
                <div>
                  <span>Vence</span>
                  <strong>
                    {item.due_date
                      ? new Date(item.due_date + "T00:00:00").toLocaleDateString("es-MX")
                      : "Sin fecha"}
                  </strong>
                </div>
                <button
                  className="layaway-mobile-detail-toggle"
                  type="button"
                  aria-expanded={Number(expandedLayawayDetailsId) === Number(item.id)}
                  onClick={() =>
                    setExpandedLayawayDetailsId((current) =>
                      Number(current) === Number(item.id) ? null : item.id
                    )
                  }
                >
                  <span>Ver detalles</span>
                  <span aria-hidden="true">
                    {Number(expandedLayawayDetailsId) === Number(item.id) ? "⌃" : "⌄"}
                  </span>
                </button>
              </div>

              <div
                className={`layaway-mobile-detail-panel ${
                  Number(expandedLayawayDetailsId) === Number(item.id) ? "is-open" : ""
                }`}
              >
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
              </div>

              <div className="layaway-actions">
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
                <div className="layaway-history-panel">
                  <div className="layaway-history-heading">
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

      <Card className="layaway-payments-card">
        <div className="sales-header layaway-payments-heading">
          <div>
            <span className="eyebrow">Movimientos recientes</span>
            <h2>Historial de abonos</h2>
            <p className="muted">Últimos 30 abonos registrados para reimprimir recibos.</p>
          </div>

          <div className="layaway-payments-actions">
            <Button onClick={loadRecentPayments} disabled={loadingPayments}>
              {loadingPayments ? "Cargando..." : "Actualizar historial"}
            </Button>
            <button
              className="layaway-mobile-history-toggle"
              type="button"
              aria-expanded={mobilePaymentsOpen}
              onClick={() => setMobilePaymentsOpen((value) => !value)}
            >
              <span>{mobilePaymentsOpen ? "Ocultar" : "Ver historial"}</span>
              <span aria-hidden="true">{mobilePaymentsOpen ? "⌃" : "⌄"}</span>
            </button>
          </div>
        </div>

        <div className={`layaway-mobile-history-panel ${mobilePaymentsOpen ? "is-open" : ""}`}>
        {recentPayments.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>
            Todavía no hay abonos registrados en historial.
          </p>
        ) : (
          <div className="layaway-payment-period">
            <div className="layaway-payment-period-controls">
              {paymentPeriods.length > 1 ? (
                <label>
                  <span>Año</span>
                  <select
                    value={effectivePaymentsYear}
                    onChange={(e) => changePaymentsYear(e.target.value)}
                  >
                    {paymentPeriods.map(({ year }) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="layaway-payment-single-year">
                  <span>Año</span>
                  <strong>{effectivePaymentsYear}</strong>
                </div>
              )}

              <label>
                <span>Mes</span>
                <select
                  value={effectivePaymentsMonth}
                  onChange={(e) => setSelectedPaymentsMonth(e.target.value)}
                >
                  {availablePaymentsMonths.map((month) => (
                    <option key={month.key} value={month.key}>{month.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {selectedPaymentsMonthGroup && (
              <div className="layaway-payment-period-summary">
                <div>
                  <span>Periodo</span>
                  <strong>{selectedPaymentsMonthGroup.label} {effectivePaymentsYear}</strong>
                </div>
                <div>
                  <span>Movimientos</span>
                  <strong>{selectedPaymentsMonthGroup.payments.length}</strong>
                </div>
                <div>
                  <span>Total abonado</span>
                  <strong>{money(selectedPaymentsMonthGroup.total)}</strong>
                </div>
              </div>
            )}

            <div className="sale-items-list layaway-payment-month-list">
              {(selectedPaymentsMonthGroup?.payments || []).map((payment) => (
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
          </div>
        )}
        </div>
      </Card>

      {selected && (
        <div className="receipt-overlay">
          <div className="receipt-panel layaway-payment-panel">
            <span className="eyebrow">Registrar movimiento</span>
            <h2>Pago de apartado</h2>

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
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

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
      setMobilePreviewOpen(false);
      setMessage(`Importación lista. Productos importados: ${imported.length}. Omitidos: ${skipped}.`);
      await loadProducts();
    };
    reader.readAsText(file, "UTF-8");
  }

  return (
    <section className="import-modern">
      <div className="import-heading">
        <div>
          <span className="eyebrow">Herramientas</span>
          <h2>Importar inventario</h2>
          <p>Carga productos en lote desde un archivo CSV sin capturarlos uno por uno.</p>
        </div>
      </div>

      <Card className="import-main-card">
        <div className="import-step-heading">
          <div>
            <span className="eyebrow">Archivo fuente</span>
            <h3>Selecciona el CSV</h3>
          </div>
          <span className="sale-step">01</span>
        </div>

        <label className="import-drop-zone">
          <span className="import-file-icon">CSV</span>
          <div>
            <strong>Seleccionar archivo .csv</strong>
            <small>Se leerán código, nombre, categoría, costo, precio, stock e imagen.</small>
          </div>
          <input type="file" accept=".csv" onChange={handleFile} />
        </label>

        <div className="import-status-box">
          <span>Estado</span>
          <p>{message}</p>
        </div>
      </Card>

      {preview.length > 0 && (
        <Card className="import-preview-card">
          <div className="import-step-heading import-preview-heading">
            <div>
              <span className="eyebrow">Resultado</span>
              <h3>Productos importados</h3>
            </div>
            <span className="sale-step">02</span>
            <button
              className="import-mobile-preview-toggle"
              type="button"
              aria-expanded={mobilePreviewOpen}
              onClick={() => setMobilePreviewOpen((value) => !value)}
            >
              <span>{mobilePreviewOpen ? "Ocultar" : "Ver"}</span>
              <span aria-hidden="true">{mobilePreviewOpen ? "⌃" : "⌄"}</span>
            </button>
          </div>

          <div className={`import-mobile-preview-panel ${mobilePreviewOpen ? "is-open" : ""}`}>
          <p className="import-preview-note">Mostrando hasta 10 productos del último archivo procesado.</p>

          <div className="import-preview-grid">
            {preview.map((p) => (
              <div className="import-product-row" key={p.code}>
                <ProductImage src={p.image_url} alt={p.name} small />
                <div>
                  <strong>{p.name}</strong>
                  <span>{p.code} · {p.category}</span>
                </div>
                <div className="import-product-price">
                  <strong>{money(p.price)}</strong>
                  <span>Costo {money(p.cost)} · Stock {p.stock}</span>
                </div>
              </div>
            ))}
          </div>
          </div>
        </Card>
      )}
    </section>
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


/* ===== Donatello 2026 · refresh visual ===== */
:root {
  --terracotta: #b75f3d;
  --terracotta-dark: #8e432b;
  --olive: #6f7651;
  --olive-dark: #535a3d;
  --sand: #f4eee5;
  --sand-2: #ebe1d5;
  --ink: #24211e;
  --soft-text: #746d65;
  --line: #e7ddd1;
  --surface: #fffdf9;
  --surface-2: #faf6f0;

  --orange: var(--terracotta);
  --gold: #c99158;
  --dark: var(--ink);
  --brown: #4b3b31;
  --cream: var(--sand);
  --card: var(--surface);
  --border: var(--line);
  --muted: var(--soft-text);
}

body {
  background:
    radial-gradient(circle at 88% 2%, rgba(183,95,61,.09), transparent 24%),
    linear-gradient(180deg, #f7f2eb 0%, #f1ebe3 100%);
  color: var(--ink);
}

.app {
  padding: 18px;
  background: transparent;
}

.shell {
  width: min(1480px, 100%);
  gap: 18px;
}

.brand-header-modern {
  margin: 0;
  padding: 18px 22px;
  border-radius: 24px;
  background: rgba(255,253,249,.94);
  color: var(--ink);
  border: 1px solid var(--line);
  box-shadow: 0 16px 42px rgba(62,43,28,.08);
  backdrop-filter: blur(14px);
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
}

.brand-logo-modern {
  width: 76px;
  height: 76px;
  border-radius: 20px;
  background: #f1e4d6;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.brand-logo-modern img {
  width: 112%;
  height: 112%;
  object-fit: contain;
}

.brand-copy-modern .eyebrow,
.eyebrow {
  display: inline-block;
  color: var(--terracotta);
  font-weight: 900;
  font-size: .74rem;
  text-transform: uppercase;
  letter-spacing: .12em;
}

.brand-copy-modern h1 {
  margin-top: 3px;
  font-size: clamp(1.8rem, 3vw, 2.55rem);
  font-family: Georgia, "Times New Roman", serif;
  letter-spacing: -.03em;
}

.brand-copy-modern p {
  color: var(--soft-text);
  margin-top: 5px;
  font-size: .98rem;
  font-weight: 650;
}

.brand-session-modern {
  min-width: 180px;
  text-align: right;
  display: grid;
  gap: 3px;
}

.brand-session-modern strong {
  color: var(--terracotta);
  font-size: .82rem;
  letter-spacing: .12em;
}

.brand-session-modern span {
  color: var(--soft-text);
  font-size: .78rem;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace {
  display: grid;
  grid-template-columns: 218px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.sidebar-shell {
  position: sticky;
  top: 18px;
  background: rgba(255,253,249,.92);
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 12px;
  box-shadow: 0 14px 35px rgba(62,43,28,.07);
}

.donatello-nav {
  display: grid;
  gap: 5px;
}

.nav-section-label {
  padding: 10px 12px 6px;
  color: #9a9189;
  text-transform: uppercase;
  letter-spacing: .12em;
  font-size: .68rem;
  font-weight: 900;
}

.nav-tools-label {
  margin-top: 8px;
}

.donatello-nav-link {
  min-height: 46px;
  width: 100%;
  border: 0;
  border-radius: 13px;
  background: transparent;
  color: #4b4540;
  text-decoration: none;
  display: grid;
  grid-template-columns: 30px 1fr;
  gap: 8px;
  align-items: center;
  padding: 8px 11px;
  font: inherit;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
  transition: .18s ease;
}

.donatello-nav-link:hover {
  background: #f4ebe2;
  color: var(--terracotta-dark);
  transform: translateX(2px);
}

.donatello-nav-link.active {
  background: linear-gradient(135deg, #bf6845, #a94f32);
  color: #fff;
  box-shadow: 0 10px 22px rgba(169,79,50,.23);
}

.donatello-nav-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: rgba(183,95,61,.09);
  font-size: 1.05rem;
  font-weight: 900;
}

.donatello-nav-link.active .donatello-nav-icon {
  background: rgba(255,255,255,.16);
}

.nav-action {
  appearance: none;
}

.sidebar-signout {
  width: 100%;
  margin-top: 10px;
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: #fff;
  color: #6e625a;
  font-weight: 850;
  display: flex;
  gap: 9px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.workspace-content {
  min-width: 0;
  display: grid;
  gap: 16px;
}

.card {
  border-radius: 20px;
  border-color: var(--line);
  box-shadow: 0 10px 28px rgba(59,44,32,.06);
}

.btn {
  border-radius: 12px;
  box-shadow: none;
}

.btn-primary {
  background: linear-gradient(135deg, var(--terracotta), var(--terracotta-dark));
}

.btn-secondary {
  background: #fff;
  border: 1px solid var(--line);
}

.inventory-totals-section {
  margin: 0;
}

.inventory-totals-header {
  display: none;
}

.inventory-kpis-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.inventory-kpi-card {
  padding: 17px 18px;
  min-height: 118px;
  display: grid;
  align-content: center;
  gap: 5px;
}

.inventory-kpi-card .metric-label {
  font-size: .85rem;
  color: var(--soft-text);
}

.inventory-kpi-card .metric-value {
  font-size: clamp(1.55rem, 2.3vw, 2.15rem);
  font-family: Georgia, "Times New Roman", serif;
}

.inventory-kpi-card small {
  color: #93887f;
  font-weight: 650;
}

.inventory-kpi-card.profit {
  background: #f1f4eb;
  border-color: #dfe5d3;
}

.inventory-modern {
  display: grid;
  gap: 14px;
}

.inventory-heading-row {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  padding: 4px 2px;
}

.inventory-heading-row h2 {
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 3.6vw, 3rem);
  line-height: 1;
  margin-top: 4px;
}

.inventory-heading-row .muted {
  margin-top: 8px;
  font-size: .94rem;
}

.inventory-heading-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.inventory-add-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.inventory-toolbar-card {
  padding: 14px;
  display: grid;
  gap: 12px;
}

.inventory-search-wrap {
  min-height: 52px;
  border: 1px solid #ded5cb;
  background: #fff;
  border-radius: 14px;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
}

.inventory-search-wrap > span {
  color: #8f8379;
  font-size: 1.35rem;
}

.inventory-search-input {
  border: 0 !important;
  background: transparent !important;
  outline: none;
  min-height: 48px !important;
  padding: 0 !important;
  font-size: 1rem !important;
  box-shadow: none !important;
}

.inventory-filter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.inventory-status-pills,
.category-pills {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.category-pill {
  border: 1px solid #e5ddd4;
  background: #f7f3ee;
  color: #645b54;
  min-height: 34px;
  padding: 7px 12px;
  border-radius: 999px;
  font-weight: 800;
  cursor: pointer;
}

.category-pill.active {
  background: var(--terracotta);
  border-color: var(--terracotta);
  color: #fff;
}

.category-pill.category-secondary.active {
  background: var(--olive);
  border-color: var(--olive);
}

.inventory-view-toggle {
  display: flex;
  gap: 4px;
  background: #f4eee7;
  padding: 4px;
  border-radius: 11px;
}

.inventory-view-toggle button {
  border: 0;
  background: transparent;
  padding: 7px 10px;
  border-radius: 8px;
  color: #6d645d;
  font-weight: 800;
  cursor: pointer;
}

.inventory-view-toggle button.active {
  background: #fff;
  color: var(--terracotta-dark);
  box-shadow: 0 3px 10px rgba(45,32,23,.07);
}

.inventory-category-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.inventory-filter-label {
  color: #9a9088;
  font-size: .75rem;
  text-transform: uppercase;
  letter-spacing: .1em;
  font-weight: 900;
  white-space: nowrap;
}

.catalog-counter {
  color: #9a9088;
  font-size: .78rem;
  font-weight: 800;
}

.inventory-products-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 13px;
}

.inventory-product-card {
  padding: 0;
  overflow: hidden;
}

.inventory-product-card-main {
  min-width: 0;
}

.inventory-image-wrap {
  position: relative;
  aspect-ratio: 4 / 3;
  background: #eee5dc;
  overflow: hidden;
}

.inventory-product-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.inventory-product-image.placeholder {
  display: grid;
  place-items: center;
  color: #998e84;
  font-weight: 900;
  background:
    linear-gradient(135deg, rgba(183,95,61,.05), rgba(111,118,81,.08)),
    #f2ebe4;
}

.inventory-photo-count {
  position: absolute;
  right: 9px;
  bottom: 9px;
  padding: 6px 9px;
  background: rgba(36,33,30,.78);
  color: white;
  border-radius: 999px;
  font-size: .72rem;
  font-weight: 900;
}

.inventory-product-content {
  padding: 13px;
  display: grid;
  gap: 11px;
}

.inventory-product-topline {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  align-items: start;
}

.inventory-product-topline h3 {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.14rem;
  line-height: 1.08;
}

.inventory-product-topline p {
  margin-top: 4px;
  color: #8a8078;
  font-size: .78rem;
  font-weight: 700;
}

.stock-status {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 6px 9px;
  font-size: .7rem;
  font-weight: 900;
}

.stock-status.ok {
  background: #e9f4e6;
  color: #38743c;
}

.stock-status.low {
  background: #fff1cf;
  color: #9b6b08;
}

.stock-status.out {
  background: #f7dddd;
  color: #9e3e3e;
}

.inventory-price-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: end;
}

.inventory-price-row div {
  display: grid;
  gap: 2px;
}

.inventory-price-row span,
.inventory-detail-strip {
  color: #8d837a;
  font-size: .74rem;
  font-weight: 750;
}

.inventory-price-row strong {
  font-size: 1.35rem;
  color: var(--ink);
}

.inventory-price-row div:last-child {
  text-align: right;
}

.inventory-detail-strip {
  display: flex;
  gap: 14px;
  padding-top: 9px;
  border-top: 1px solid #eee5dc;
}

.inventory-detail-strip b {
  color: #4f4842;
}

.inventory-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.inventory-card-actions .btn {
  padding: 8px 11px;
  font-size: .82rem;
}

.inventory-danger-link {
  border: 0;
  background: transparent;
  color: #b35a52;
  font-weight: 800;
  cursor: pointer;
  padding: 8px;
}

.inventory-edit-box {
  border-top: 1px solid var(--line);
  padding: 15px;
  background: #fbf7f1;
}

.inventory-edit-title {
  margin-bottom: 12px;
}

.inventory-empty {
  min-height: 180px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 5px;
  text-align: center;
  color: #756c64;
}

.inventory-products-grid.list-mode {
  grid-template-columns: 1fr;
}

.inventory-products-grid.list-mode .inventory-product-card-main {
  display: grid;
  grid-template-columns: 210px 1fr;
}

.inventory-products-grid.list-mode .inventory-image-wrap {
  aspect-ratio: auto;
  min-height: 165px;
}

@media (max-width: 1180px) {
  .inventory-products-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .inventory-kpis-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .app {
    padding: 10px;
  }

  .brand-header-modern {
    grid-template-columns: auto 1fr;
    padding: 13px 15px;
    border-radius: 18px;
  }

  .brand-session-modern {
    display: none;
  }

  .brand-logo-modern {
    width: 58px;
    height: 58px;
    border-radius: 15px;
  }

  .brand-copy-modern p {
    display: none;
  }

  .workspace {
    grid-template-columns: 1fr;
  }

  .sidebar-shell {
    position: static;
    padding: 7px;
    border-radius: 16px;
    overflow-x: auto;
  }

  .donatello-nav {
    display: flex;
    gap: 5px;
    min-width: max-content;
  }

  .nav-section-label,
  .nav-tools-label,
  .sidebar-signout {
    display: none;
  }

  .donatello-nav-link {
    min-height: 42px;
    width: auto;
    grid-template-columns: auto auto;
    padding: 7px 10px;
    white-space: nowrap;
  }

  .donatello-nav-link:hover {
    transform: none;
  }

  .inventory-heading-row {
    align-items: start;
    flex-direction: column;
  }

  .inventory-heading-actions {
    width: 100%;
  }

  .inventory-heading-actions .btn {
    flex: 1;
  }
}

@media (max-width: 640px) {
  .shell {
    gap: 10px;
  }

  .brand-copy-modern .eyebrow {
    display: none;
  }

  .brand-copy-modern h1 {
    font-size: 1.45rem;
  }

  .inventory-kpis-grid {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding-bottom: 3px;
  }

  .inventory-kpi-card {
    min-width: 220px;
    scroll-snap-align: start;
  }

  .inventory-filter-row {
    align-items: stretch;
    flex-direction: column;
  }

  .inventory-view-toggle {
    align-self: flex-start;
  }

  .inventory-category-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .inventory-products-grid {
    grid-template-columns: 1fr;
  }

  .inventory-products-grid.list-mode .inventory-product-card-main {
    grid-template-columns: 1fr;
  }

  .inventory-heading-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .inventory-product-topline {
    gap: 6px;
  }

  .inventory-image-wrap {
    aspect-ratio: 16 / 10;
  }

  .donatello-nav-link {
    grid-template-columns: 1fr;
    gap: 3px;
    justify-items: center;
    min-width: 72px;
    font-size: .72rem;
  }

  .donatello-nav-icon {
    width: 25px;
    height: 25px;
  }
}


/* ===== Venta · flujo comercial ===== */
.sale-screen {
  display: grid;
  gap: 14px;
}

.sale-page-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  padding: 4px 2px;
}

.sale-page-heading h2 {
  margin-top: 4px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 3.6vw, 3rem);
  line-height: 1;
}

.sale-page-heading .muted {
  margin-top: 8px;
  font-size: .94rem;
}

.sale-heading-badge {
  min-width: 160px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fff;
  padding: 10px 14px;
  text-align: right;
  box-shadow: 0 8px 22px rgba(59,44,32,.05);
}

.sale-heading-badge span {
  display: block;
  color: #8a8078;
  font-size: .76rem;
  font-weight: 800;
}

.sale-heading-badge strong {
  display: block;
  margin-top: 2px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.45rem;
}

.sale-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 12px;
}

.sale-kpi-card {
  min-height: 105px;
  display: grid;
  align-content: center;
  gap: 4px;
  padding: 15px 17px;
}

.sale-kpi-card > span {
  color: var(--soft-text);
  font-size: .82rem;
  font-weight: 800;
}

.sale-kpi-card > strong {
  font-size: clamp(1.5rem, 2.4vw, 2rem);
  font-family: Georgia, "Times New Roman", serif;
}

.sale-kpi-card > small {
  color: #9b9188;
  font-weight: 650;
}

.sale-profit-kpi {
  background: #f1f4eb;
  border-color: #dfe5d3;
}

.sale-layout-modern {
  grid-template-columns: minmax(0, 1.45fr) minmax(340px, .85fr);
  align-items: start;
}

.sale-checkout-column {
  position: sticky;
  top: 18px;
}

.sale-card-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 10px;
  margin-bottom: 13px;
}

.sale-card-heading h2 {
  margin-top: 3px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.45rem;
}

.sale-step {
  min-width: 36px;
  height: 36px;
  padding: 0 9px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #f2e9df;
  color: var(--terracotta-dark);
  font-weight: 900;
}

.sale-search-card {
  overflow: visible;
}

.sale-search-wrap {
  min-height: 58px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 9px;
  align-items: center;
  border: 1px solid #ded5cb;
  border-radius: 14px;
  padding: 0 14px;
  background: #fff;
}

.sale-search-wrap > span {
  font-size: 1.4rem;
  color: #8d837a;
}

.sale-search-wrap input {
  border: 0;
  box-shadow: none;
  padding: 0;
  min-height: 54px;
  font-size: 1.05rem;
  background: transparent;
}

.sale-search-wrap input:focus {
  border: 0;
  box-shadow: none;
}

.sale-search-hint {
  margin-top: 12px;
  min-height: 90px;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  background: #faf6f1;
  border: 1px dashed #ded4ca;
  border-radius: 14px;
  color: #81776f;
  text-align: left;
}

.sale-search-hint > span {
  font-size: 1.8rem;
  color: #b8aba0;
}

.sale-search-hint p {
  margin-top: 2px;
  font-size: .8rem;
  color: #9b9189;
}

.sale-quick-results {
  max-height: 410px;
  overflow: auto;
}

.sale-result-btn {
  grid-template-columns: auto minmax(0,1fr) auto;
  background: #fff;
  border-color: #e7ddd3;
  border-radius: 14px;
  padding: 10px;
}

.sale-result-btn:hover {
  border-color: #c99a86;
  background: #fffaf6;
}

.sale-result-copy {
  min-width: 0;
}

.sale-result-copy strong {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sale-result-meta {
  text-align: right;
}

.sale-result-meta strong {
  font-size: .95rem;
}

.sale-result-meta span {
  font-size: .72rem;
}

.sale-scanner-compact {
  padding: 15px;
}

.scanner-box-modern {
  min-height: 150px;
  border-radius: 16px;
  background: #2a2826;
  box-shadow: none;
}

.scanner-box-modern.active {
  min-height: 300px;
}

.scanner-box-modern::after {
  inset: 12px;
  border-radius: 12px;
}

.scanner-idle {
  display: grid;
  place-items: center;
  gap: 4px;
  color: #f7f0e9;
  text-align: center;
}

.scanner-idle > span {
  position: static !important;
  font-size: 1.8rem;
}

.scanner-idle small {
  color: #bdb4ad;
  font-weight: 650;
}

.scanner-actions-modern {
  grid-template-columns: auto 1fr;
  margin-top: 10px;
  gap: 8px;
}

.status-box-modern {
  min-height: 44px;
  border-radius: 12px;
  font-size: .82rem;
  background: #f7f3ee;
}

.manual-row-modern {
  margin-top: 8px;
  grid-template-columns: 1fr auto;
}

.manual-row-modern input {
  border-radius: 12px;
}

.sale-cart-card,
.sale-checkout-card {
  padding: 15px;
}

.sale-cart-empty {
  min-height: 120px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 4px;
  text-align: center;
  color: #81776f;
  border: 1px dashed #ded5cb;
  border-radius: 14px;
  background: #faf6f1;
}

.sale-cart-empty > span {
  font-size: 1.7rem;
  color: #b8aaa0;
}

.sale-cart-empty p {
  font-size: .78rem;
  color: #9a9088;
}

.sale-cart-list {
  max-height: 300px;
  overflow: auto;
}

.sale-cart-item {
  border: 1px solid #eee5dd;
  background: #faf6f1;
  border-radius: 13px;
  padding: 9px;
}

.sale-cart-item .product-img.small {
  width: 46px;
  height: 46px;
  border-radius: 11px;
}

.sale-mode-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: #f2ece5;
  padding: 4px;
  border-radius: 12px;
  gap: 4px;
  margin-bottom: 14px;
}

.sale-mode-toggle button {
  border: 0;
  background: transparent;
  border-radius: 9px;
  padding: 10px;
  font-weight: 850;
  color: #70665e;
  cursor: pointer;
}

.sale-mode-toggle button.active {
  background: #fff;
  color: var(--terracotta-dark);
  box-shadow: 0 4px 12px rgba(50,35,24,.07);
}

.sale-discount-section,
.sale-received-field {
  display: grid;
  gap: 8px;
  margin-bottom: 13px;
}

.sale-discount-section > label,
.sale-received-field > label {
  color: #6e655e;
  font-size: .78rem;
  font-weight: 900;
}

.sale-discount-pills {
  display: grid;
  grid-template-columns: repeat(4,1fr);
  gap: 6px;
}

.sale-discount-pills button {
  min-height: 38px;
  border: 1px solid #e4dbd2;
  border-radius: 10px;
  background: #faf6f1;
  color: #6f655e;
  font-weight: 850;
  cursor: pointer;
}

.sale-discount-pills button.active {
  background: var(--terracotta);
  color: #fff;
  border-color: var(--terracotta);
}

.sale-checkout-card input {
  border-radius: 12px;
  min-height: 46px;
}

.sale-layaway-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 13px;
}

.sale-total-summary {
  display: grid;
  gap: 7px;
  margin: 14px 0;
  border-top: 1px solid #ece3da;
  padding-top: 12px;
}

.sale-total-summary > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #776d65;
  font-size: .84rem;
}

.sale-total-final-row {
  align-items: end;
  padding-top: 5px;
}

.sale-total-final-row strong {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.85rem;
  color: var(--ink);
}

.sale-change-row {
  background: #f1f4eb;
  border-radius: 10px;
  padding: 9px 10px;
  color: var(--olive-dark) !important;
  font-weight: 850;
}

@media (max-width: 1040px) {
  .sale-layout-modern {
    grid-template-columns: 1fr;
  }

  .sale-checkout-column {
    position: static;
  }
}

@media (max-width: 640px) {
  .sale-page-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .sale-heading-badge {
    text-align: left;
  }

  .sale-kpis {
    display: flex;
    overflow-x: auto;
  }

  .sale-kpi-card {
    min-width: 215px;
  }

  .sale-result-btn {
    grid-template-columns: auto minmax(0,1fr);
  }

  .sale-result-meta {
    grid-column: 2;
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-align: left;
  }

  .scanner-actions-modern {
    grid-template-columns: 1fr;
  }

  .sale-layaway-fields {
    grid-template-columns: 1fr;
  }
}


/* ===== Resumen ejecutivo ===== */
.dashboard-modern {
  display: grid;
  gap: 14px;
}

.dashboard-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  padding: 4px 2px;
}

.dashboard-heading h2 {
  margin-top: 4px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 3.6vw, 3rem);
  line-height: 1;
}

.dashboard-heading p {
  margin-top: 8px;
  color: var(--soft-text);
  font-size: .94rem;
  font-weight: 650;
}

.dashboard-today-pill {
  min-width: 200px;
  border: 1px solid #dce3d1;
  border-radius: 16px;
  background: #f1f4eb;
  padding: 10px 14px;
  text-align: right;
}

.dashboard-today-pill span,
.dashboard-today-pill small {
  display: block;
  color: #6d7457;
  font-size: .74rem;
  font-weight: 800;
}

.dashboard-today-pill strong {
  display: block;
  margin: 2px 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.55rem;
  color: var(--olive-dark);
}

.dashboard-card {
  padding: 16px;
}

.dashboard-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0,1fr));
  gap: 12px;
}

.dashboard-kpi {
  min-height: 116px;
  display: grid;
  align-content: center;
  gap: 4px;
}

.dashboard-kpi > span {
  color: var(--soft-text);
  font-size: .82rem;
  font-weight: 850;
}

.dashboard-kpi > strong {
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(1.55rem, 2.2vw, 2.05rem);
}

.dashboard-kpi > small {
  color: #958a82;
  font-size: .74rem;
  font-weight: 650;
}

.dashboard-kpi.olive {
  background: #f1f4eb;
  border-color: #dfe5d3;
}

.dashboard-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(300px, .7fr);
  gap: 12px;
}

.dashboard-side-stack {
  display: grid;
  gap: 12px;
}

.dashboard-section-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
  margin-bottom: 14px;
}

.dashboard-section-heading.compact {
  align-items: center;
}

.dashboard-section-heading h3,
.dashboard-today-card h3,
.dashboard-inventory-card h3 {
  margin-top: 3px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.4rem;
}

.dashboard-chart-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  color: #7a7169;
  font-size: .74rem;
  font-weight: 800;
}

.dashboard-chart-legend span {
  display: flex;
  align-items: center;
  gap: 5px;
}

.dashboard-chart-legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.sale-dot { background: var(--terracotta); }
.profit-dot { background: var(--olive); }

.dashboard-chart {
  width: 100%;
  height: 330px;
}

.dashboard-today-card {
  background: #fffaf6;
}

.dashboard-today-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.dashboard-today-grid div {
  border: 1px solid #eee4da;
  border-radius: 12px;
  padding: 10px;
  background: #fff;
}

.dashboard-today-grid span,
.dashboard-inventory-lines span {
  display: block;
  color: #8b8179;
  font-size: .74rem;
  font-weight: 800;
}

.dashboard-today-grid strong {
  display: block;
  margin-top: 3px;
  font-size: 1.05rem;
}

.dashboard-inventory-card {
  background: #f1f4eb;
  border-color: #dfe5d3;
}

.dashboard-inventory-value {
  margin: 12px 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 2rem;
  color: var(--olive-dark);
  font-weight: 800;
}

.dashboard-inventory-lines {
  display: grid;
  gap: 8px;
}

.dashboard-inventory-lines div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid #dce3d1;
  padding-top: 8px;
}

.dashboard-inventory-lines b {
  color: var(--olive-dark);
}

.dashboard-lists-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.dashboard-ranked-list,
.dashboard-low-list,
.dashboard-recent-list {
  display: grid;
}

.dashboard-ranked-row,
.dashboard-low-row,
.dashboard-recent-row {
  display: grid;
  align-items: center;
  gap: 10px;
  border-top: 1px solid #eee6de;
  padding: 10px 0;
}

.dashboard-ranked-row:first-child,
.dashboard-low-row:first-child,
.dashboard-recent-row:first-child {
  border-top: 0;
}

.dashboard-ranked-row {
  grid-template-columns: auto minmax(0,1fr) auto;
}

.rank-number {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: #f2e9df;
  color: var(--terracotta-dark);
  font-weight: 900;
}

.dashboard-ranked-row div,
.dashboard-low-row div,
.dashboard-recent-row div {
  min-width: 0;
}

.dashboard-ranked-row strong,
.dashboard-low-row strong,
.dashboard-recent-row strong {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dashboard-ranked-row span,
.dashboard-low-row span,
.dashboard-recent-row span {
  display: block;
  margin-top: 2px;
  color: #91867e;
  font-size: .74rem;
  font-weight: 700;
}

.dashboard-ranked-row > b {
  white-space: nowrap;
}

.dashboard-low-row {
  grid-template-columns: minmax(0,1fr) auto;
}

.dashboard-low-row > b {
  border-radius: 999px;
  padding: 6px 9px;
  background: #fff1cf;
  color: #966708;
  font-size: .72rem;
}

.dashboard-low-row > b.out {
  background: #f7dddd;
  color: #9c4040;
}

.dashboard-count-badge {
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #f2e9df;
  color: var(--terracotta-dark);
  font-weight: 900;
}

.dashboard-recent-row {
  grid-template-columns: auto minmax(0,1fr) auto auto;
}

.dashboard-sale-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: #e9f4e6;
  color: #3c7541;
  font-weight: 900;
}

.dashboard-recent-row > span {
  margin: 0;
  white-space: nowrap;
}

.dashboard-recent-row > b {
  min-width: 90px;
  text-align: right;
}

.dashboard-empty {
  min-height: 100px;
  display: grid;
  place-items: center;
  text-align: center;
  color: #8e847c;
  font-size: .84rem;
  font-weight: 750;
}

@media (max-width: 1180px) {
  .dashboard-kpi-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .dashboard-main-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-side-stack {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .dashboard-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .dashboard-today-pill {
    text-align: left;
  }

  .dashboard-kpi-grid {
    display: flex;
    overflow-x: auto;
  }

  .dashboard-kpi {
    min-width: 215px;
  }

  .dashboard-lists-grid,
  .dashboard-side-stack {
    grid-template-columns: 1fr;
  }

  .dashboard-chart {
    height: 270px;
  }

  .dashboard-recent-row {
    grid-template-columns: auto minmax(0,1fr) auto;
  }

  .dashboard-recent-row > span {
    display: none;
  }
}


/* ===== Alta de producto ===== */
.add-product-modern {
  display: grid;
  gap: 14px;
}

.add-product-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  padding: 4px 2px;
}

.add-product-heading h2 {
  margin-top: 4px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 3.6vw, 3rem);
  line-height: 1;
}

.add-product-heading p {
  margin-top: 8px;
  color: var(--soft-text);
  font-size: .94rem;
  font-weight: 650;
}

.add-product-margin-badge {
  min-width: 190px;
  border-radius: 16px;
  padding: 10px 14px;
  background: #f1f4eb;
  border: 1px solid #dfe5d3;
  text-align: right;
}

.add-product-margin-badge span,
.add-product-margin-badge small {
  display: block;
  color: #6d7457;
  font-size: .74rem;
  font-weight: 800;
}

.add-product-margin-badge strong {
  display: block;
  margin: 2px 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.55rem;
  color: var(--olive-dark);
}

.add-product-atlas-card {
  padding: 12px;
}

.add-product-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(290px, .7fr);
  gap: 14px;
  align-items: start;
}

.add-product-side {
  display: grid;
  gap: 14px;
  position: sticky;
  top: 18px;
}

.add-product-section-title {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.add-product-section-title h3,
.add-product-save-card h3 {
  margin-top: 3px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.4rem;
}

.add-product-form-grid,
.add-image-url-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.add-product-form-grid label,
.add-image-url-grid .add-image-field {
  display: grid;
  gap: 7px;
  color: #6d645d;
  font-size: .78rem;
  font-weight: 900;
}

.add-product-form-grid input,
.add-image-url-grid input {
  min-height: 48px;
  border-radius: 12px;
  font-size: .95rem;
}

.add-product-form-grid .span-2 {
  grid-column: span 2;
}

.add-product-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0 12px;
  color: #9a9088;
  font-size: .72rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .1em;
}

.add-product-divider::before,
.add-product-divider::after {
  content: "";
  height: 1px;
  background: #ece3da;
  flex: 1;
}

.add-cost-summary {
  display: grid;
  gap: 8px;
}

.add-cost-summary > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid #ece4db;
  padding-top: 8px;
  color: #766d65;
  font-size: .82rem;
}

.add-cost-summary > div:first-child {
  border-top: 0;
  padding-top: 0;
}

.add-cost-summary .total,
.add-cost-summary .profit {
  margin-top: 4px;
  border-radius: 10px;
  padding: 10px;
  border: 0;
}

.add-cost-summary .total {
  background: #f7f3ee;
  color: #544c46;
}

.add-cost-summary .profit {
  background: #f1f4eb;
  color: var(--olive-dark);
}

.add-cost-summary strong {
  font-size: 1rem;
}

.add-product-save-card p {
  margin-top: 6px;
  color: #8c8179;
  font-size: .8rem;
  font-weight: 650;
}

.add-product-images-card {
  padding: 16px;
}

.add-image-upload {
  width: 100%;
  font-family: inherit;
  line-height: 1.2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  border-radius: 10px;
  border: 1px dashed #d6b9aa;
  background: #fff8f3;
  color: var(--terracotta-dark);
  font-size: .78rem;
  font-weight: 900;
  cursor: pointer;
}

.add-image-preview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.add-image-preview-card {
  border: 1px solid #e9e0d7;
  border-radius: 14px;
  padding: 8px;
  background: #fff;
  min-width: 0;
}

.add-image-preview-card > span {
  display: block;
  margin-top: 6px;
  color: #82776f;
  font-size: .72rem;
  font-weight: 800;
}

/* ===== Historial de ventas ===== */
.sales-modern {
  gap: 14px;
}

.sales-heading-modern h2 {
  margin-top: 4px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 3.6vw, 3rem);
  line-height: 1;
}

.sales-heading-modern .muted {
  margin-top: 8px;
  font-size: .94rem;
}

.sales-kpi-grid .card {
  min-height: 105px;
  display: grid;
  align-content: center;
  gap: 4px;
  padding: 15px 17px;
}

.sales-kpi-grid .metric-label {
  font-size: .82rem;
  color: var(--soft-text);
}

.sales-kpi-grid .metric-value {
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(1.5rem, 2.4vw, 2rem);
}

.sales-toolbar-card {
  display: grid;
  grid-template-columns: minmax(0,1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
}

.sales-search-wrap {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  border: 1px solid #e0d7ce;
  border-radius: 12px;
  padding: 0 12px;
  background: #fff;
}

.sales-search-wrap > span {
  color: #92877e;
  font-size: 1.2rem;
}

.sales-search-wrap input {
  border: 0;
  box-shadow: none;
  padding: 0;
  min-height: 42px;
  background: transparent;
  font-size: .92rem;
}

.sales-search-wrap input:focus {
  border: 0;
  box-shadow: none;
}

.sales-status-pills {
  display: flex;
  gap: 5px;
  background: #f4eee7;
  padding: 4px;
  border-radius: 11px;
}

.sales-status-pills button {
  border: 0;
  background: transparent;
  color: #6e655e;
  border-radius: 8px;
  padding: 7px 10px;
  font-weight: 850;
  cursor: pointer;
}

.sales-status-pills button.active {
  background: #fff;
  color: var(--terracotta-dark);
  box-shadow: 0 3px 10px rgba(45,32,23,.07);
}

.sales-result-count {
  color: #968b83;
  font-size: .74rem;
  font-weight: 850;
  white-space: nowrap;
}

.sales-list-modern {
  gap: 10px;
}

.sales-history-card {
  padding: 14px 15px;
}

.sales-history-card .sale-card-header {
  align-items: center;
}

.sales-history-card .sale-title-row h3 {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.2rem;
}

.sales-history-card .sale-total-box {
  background: #f7f3ee;
  border-radius: 12px;
  min-width: 135px;
}

.sales-history-card .sale-summary-grid {
  gap: 7px;
}

.sales-history-card .sale-summary-grid div {
  border-radius: 11px;
  padding: 8px 10px;
  background: #faf6f1;
}

.sales-history-card .sale-items-list {
  background: #fff;
  border: 1px solid #eee6de;
  border-radius: 12px;
  padding: 0 10px 8px;
}

.sales-history-card .sale-admin-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.sales-history-card.sale-card-voided {
  opacity: .72;
  background: #fbf8f5;
}

@media (max-width: 980px) {
  .add-product-layout {
    grid-template-columns: 1fr;
  }

  .add-product-side {
    position: static;
    grid-template-columns: 1fr 1fr;
  }

  .sales-toolbar-card {
    grid-template-columns: 1fr;
  }

  .sales-status-pills {
    width: max-content;
    max-width: 100%;
  }
}

@media (max-width: 640px) {
  .add-product-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .add-product-margin-badge {
    text-align: left;
  }

  .add-product-side,
  .add-product-form-grid,
  .add-image-url-grid {
    grid-template-columns: 1fr;
  }

  .add-product-form-grid .span-2 {
    grid-column: auto;
  }

  .add-image-preview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sales-heading-modern {
    align-items: flex-start;
    flex-direction: column;
  }

  .sales-kpi-grid {
    display: flex;
    overflow-x: auto;
  }

  .sales-kpi-grid .card {
    min-width: 215px;
  }

  .sales-status-pills {
    overflow-x: auto;
  }

  .sales-history-card .sale-card-header {
    align-items: stretch;
    flex-direction: column;
  }

  .sales-history-card .sale-total-box {
    text-align: left;
  }

  .sales-history-card .sale-summary-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .sales-history-card .sale-admin-actions {
    justify-content: stretch;
  }

  .sales-history-card .sale-admin-actions .btn {
    flex: 1;
  }
}


/* ===== Apartados ===== */
.layaways-modern {
  gap: 14px;
}

.layaways-heading h2 {
  margin-top: 4px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 3.6vw, 3rem);
  line-height: 1;
}

.layaways-heading .muted {
  margin-top: 8px;
  font-size: .94rem;
}

.layaway-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0,1fr));
  gap: 12px;
}

.layaway-kpi {
  min-height: 110px;
  display: grid;
  align-content: center;
  gap: 4px;
  padding: 15px 17px;
}

.layaway-kpi > span {
  color: var(--soft-text);
  font-size: .82rem;
  font-weight: 850;
}

.layaway-kpi > strong {
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(1.5rem, 2.3vw, 2rem);
}

.layaway-kpi > small {
  color: #948a82;
  font-size: .74rem;
  font-weight: 650;
}

.layaway-kpi.olive {
  background: #f1f4eb;
  border-color: #dfe5d3;
}

.layaways-list {
  gap: 10px;
}

.layaway-card {
  padding: 14px 15px;
}

.layaway-card .sale-card-header {
  align-items: center;
}

.layaway-card .sale-card-header h3 {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.25rem;
}

.layaway-card .sale-summary-grid {
  gap: 7px;
}

.layaway-card .sale-summary-grid > div {
  background: #faf6f1;
  border-radius: 11px;
  padding: 8px 10px;
}

.layaway-card .sale-items-list {
  background: #fff;
  border: 1px solid #eee6de;
  border-radius: 12px;
  padding: 0 10px 8px;
}

.layaway-actions {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.layaway-history-panel {
  margin-top: 12px;
  padding: 12px;
  border-radius: 14px;
  background: #faf6f1;
  border: 1px solid #e9dfd5;
}

.layaway-history-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.layaway-history-heading h3 {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.1rem;
}

.layaway-payments-card {
  padding: 15px;
}

.layaway-payments-heading h2 {
  margin-top: 3px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.4rem;
}

.layaway-payments-card .sale-item-row {
  padding: 10px 0;
}

.layaway-payment-panel {
  border-radius: 18px;
}

.layaway-payment-panel h2 {
  margin-top: 3px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.55rem;
}

/* ===== QR ===== */
.qr-modern {
  display: grid;
  gap: 14px;
}

.qr-heading-modern {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  padding: 4px 2px;
}

.qr-heading-modern h2 {
  margin-top: 4px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 3.6vw, 3rem);
  line-height: 1;
}

.qr-heading-modern p {
  margin-top: 8px;
  color: var(--soft-text);
  font-size: .94rem;
  font-weight: 650;
}

.qr-count-badge {
  min-width: 130px;
  padding: 10px 14px;
  background: #f1f4eb;
  border: 1px solid #dfe5d3;
  border-radius: 16px;
  text-align: right;
}

.qr-count-badge span {
  display: block;
  color: #6d7457;
  font-size: .72rem;
  font-weight: 850;
}

.qr-count-badge strong {
  display: block;
  margin-top: 2px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.55rem;
  color: var(--olive-dark);
}

.qr-layout-modern {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(300px, .8fr);
  gap: 14px;
  align-items: start;
}

.qr-controls-modern,
.qr-preview-modern {
  padding: 16px;
}

.qr-preview-modern {
  position: sticky;
  top: 18px;
}

.qr-section-title {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 10px;
  margin-bottom: 14px;
}

.qr-section-title h3 {
  margin-top: 3px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.4rem;
}

.qr-product-select {
  display: grid;
  gap: 7px;
  color: #6d645d;
  font-size: .78rem;
  font-weight: 900;
}

.qr-product-select select {
  min-height: 48px;
  border-radius: 12px;
}

.qr-product-box-modern {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 90px minmax(0,1fr);
  gap: 12px;
  align-items: center;
  padding: 11px;
  border: 1px solid #e9e0d7;
  border-radius: 14px;
  background: #faf6f1;
}

.qr-product-box-modern .product-img {
  width: 90px;
  height: 90px;
  border-radius: 12px;
}

.qr-product-box-modern h3 {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.15rem;
}

.qr-product-box-modern p {
  margin-top: 4px;
  color: #8b8179;
  font-size: .78rem;
  font-weight: 700;
}

.qr-product-meta {
  margin-top: 8px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.qr-product-meta span {
  color: #8b8179;
  font-size: .76rem;
  font-weight: 750;
}

.qr-product-meta b {
  color: var(--ink);
}

.qr-bulk-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}

.qr-action-card {
  border: 1px solid #e6ddd4;
  background: #fff;
  border-radius: 13px;
  padding: 11px;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 9px;
  text-align: left;
  cursor: pointer;
}

.qr-action-card:hover {
  background: #fffaf6;
  border-color: #d7b9aa;
}

.qr-action-card:disabled {
  opacity: .55;
  cursor: wait;
}

.qr-action-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #f2e9df;
  color: var(--terracotta-dark);
  font-size: .72rem;
  font-weight: 900;
}

.qr-action-card strong,
.qr-action-card small {
  display: block;
}

.qr-action-card strong {
  color: #4e4742;
  font-size: .84rem;
}

.qr-action-card small {
  margin-top: 2px;
  color: #958a82;
  font-size: .68rem;
  line-height: 1.25;
}

.qr-code-stage {
  min-height: 390px;
  display: grid;
  place-items: center;
  align-content: center;
  text-align: center;
  gap: 5px;
  background: #faf6f1;
  border: 1px dashed #dfd4ca;
  border-radius: 16px;
  padding: 20px;
}

.qr-code-stage img {
  width: min(245px, 78%);
  aspect-ratio: 1;
  object-fit: contain;
  border-radius: 12px;
  background: #fff;
  padding: 8px;
  box-shadow: 0 8px 24px rgba(55,40,30,.06);
}

.qr-code-stage > strong {
  margin-top: 8px;
  font-size: 1rem;
}

.qr-code-stage > span {
  color: #8c8279;
  font-size: .78rem;
  max-width: 290px;
}

.qr-download-single {
  margin-top: 9px;
  display: inline-flex;
  justify-content: center;
  text-decoration: none;
  border-radius: 11px;
  padding: 9px 12px;
  background: var(--terracotta);
  color: #fff;
  font-weight: 850;
  font-size: .8rem;
}

.qr-empty-card {
  min-height: 180px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 5px;
  text-align: center;
  color: #82786f;
}

/* ===== Importar CSV ===== */
.import-modern {
  display: grid;
  gap: 14px;
}

.import-heading h2 {
  margin-top: 4px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 3.6vw, 3rem);
  line-height: 1;
}

.import-heading p {
  margin-top: 8px;
  color: var(--soft-text);
  font-size: .94rem;
  font-weight: 650;
}

.import-main-card,
.import-preview-card {
  padding: 16px;
}

.import-step-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 10px;
  margin-bottom: 14px;
}

.import-step-heading h3 {
  margin-top: 3px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.4rem;
}

.import-drop-zone {
  min-height: 145px;
  border: 1px dashed #d7c5b9;
  border-radius: 16px;
  background: #faf6f1;
  display: grid;
  grid-template-columns: auto minmax(0,1fr);
  align-items: center;
  gap: 14px;
  padding: 18px;
  cursor: pointer;
}

.import-drop-zone:hover {
  background: #fffaf6;
  border-color: #cba28f;
}

.import-drop-zone input {
  display: none;
}

.import-file-icon {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: #f2e9df;
  color: var(--terracotta-dark);
  font-size: .8rem;
  font-weight: 900;
}

.import-drop-zone strong,
.import-drop-zone small {
  display: block;
}

.import-drop-zone strong {
  font-size: 1rem;
}

.import-drop-zone small {
  margin-top: 4px;
  color: #8f847c;
  font-size: .76rem;
  line-height: 1.35;
}

.import-status-box {
  margin-top: 12px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: start;
  background: #f1f4eb;
  border: 1px solid #dfe5d3;
  border-radius: 12px;
  padding: 10px 12px;
}

.import-status-box > span {
  color: var(--olive-dark);
  font-size: .72rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.import-status-box p {
  color: #697052;
  font-size: .8rem;
  font-weight: 700;
}

.import-preview-note {
  margin-bottom: 8px;
  color: #8e837b;
  font-size: .76rem;
  font-weight: 700;
}

.import-preview-grid {
  display: grid;
}

.import-product-row {
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-top: 1px solid #eee5dd;
}

.import-product-row:first-child {
  border-top: 0;
}

.import-product-row .product-img.small {
  width: 48px;
  height: 48px;
  border-radius: 11px;
}

.import-product-row strong,
.import-product-row span {
  display: block;
}

.import-product-row > div:nth-child(2) strong {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.import-product-row span {
  margin-top: 2px;
  color: #91867e;
  font-size: .72rem;
  font-weight: 700;
}

.import-product-price {
  text-align: right;
}

.import-product-price > strong {
  font-size: .9rem;
}

@media (max-width: 980px) {
  .layaway-kpi-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .qr-layout-modern {
    grid-template-columns: 1fr;
  }

  .qr-preview-modern {
    position: static;
  }
}

@media (max-width: 640px) {
  .layaways-heading,
  .qr-heading-modern {
    align-items: flex-start;
    flex-direction: column;
  }

  .layaway-kpi-grid {
    display: flex;
    overflow-x: auto;
  }

  .layaway-kpi {
    min-width: 215px;
  }

  .layaway-actions,
  .qr-bulk-actions {
    grid-template-columns: 1fr;
  }

  .layaway-history-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .qr-count-badge {
    text-align: left;
  }

  .qr-product-box-modern {
    grid-template-columns: 70px minmax(0,1fr);
  }

  .qr-product-box-modern .product-img {
    width: 70px;
    height: 70px;
  }

  .qr-code-stage {
    min-height: 320px;
  }

  .import-drop-zone {
    grid-template-columns: 1fr;
    text-align: center;
    justify-items: center;
  }

  .import-product-row {
    grid-template-columns: auto minmax(0,1fr);
  }

  .import-product-price {
    grid-column: 2;
    text-align: left;
  }
}


/* ===== Pulido final de densidad · desktop + mobile ===== */
html {
  font-size: 15px;
}

body {
  line-height: 1.35;
}

.app {
  padding: 12px;
}

.shell {
  width: min(1420px, 100%);
  gap: 14px;
}

.brand-header-modern {
  padding: 13px 16px;
  border-radius: 18px;
  gap: 12px;
}

.brand-logo-modern {
  width: 62px;
  height: 62px;
  border-radius: 15px;
}

.brand-copy-modern h1 {
  font-size: clamp(1.5rem, 2.2vw, 2rem);
}

.brand-copy-modern p {
  font-size: .84rem;
}

.brand-session-modern {
  min-width: 150px;
}

.workspace {
  grid-template-columns: 198px minmax(0, 1fr);
  gap: 14px;
}

.sidebar-shell {
  padding: 9px;
  border-radius: 18px;
}

.nav-section-label {
  padding: 8px 10px 5px;
  font-size: .62rem;
}

.donatello-nav-link {
  min-height: 40px;
  border-radius: 10px;
  grid-template-columns: 26px 1fr;
  gap: 6px;
  padding: 6px 9px;
  font-size: .82rem;
}

.donatello-nav-icon {
  width: 25px;
  height: 25px;
  border-radius: 7px;
  font-size: .92rem;
}

.sidebar-signout {
  min-height: 38px;
  border-radius: 10px;
  font-size: .8rem;
}

.card {
  border-radius: 16px;
  padding: 14px;
}

.btn {
  min-height: 38px;
  padding: 8px 11px;
  border-radius: 10px;
  font-size: .84rem;
  line-height: 1.15;
}

input,
select {
  border-radius: 10px;
  padding: 9px 11px;
  font-size: .9rem;
}

.muted,
.section-title-row p {
  font-size: .86rem;
}

.inventory-heading-row h2,
.sale-page-heading h2,
.dashboard-heading h2,
.sales-heading-modern h2,
.add-product-heading h2,
.layaways-heading h2,
.qr-heading-modern h2,
.import-heading h2 {
  font-size: clamp(1.75rem, 2.7vw, 2.3rem);
}

.inventory-heading-row .muted,
.sale-page-heading .muted,
.sales-heading-modern .muted,
.layaways-heading .muted,
.dashboard-heading p,
.add-product-heading p,
.qr-heading-modern p,
.import-heading p {
  font-size: .84rem;
}

.eyebrow {
  font-size: .67rem;
  letter-spacing: .1em;
}

.inventory-kpi-card,
.sale-kpi-card,
.dashboard-kpi,
.layaway-kpi {
  min-height: 92px;
  padding: 12px 14px;
}

.inventory-kpi-card .metric-value,
.sale-kpi-card > strong,
.dashboard-kpi > strong,
.layaway-kpi > strong {
  font-size: clamp(1.35rem, 1.9vw, 1.72rem);
}

.metric-label,
.sales-kpi-grid .metric-label {
  font-size: .78rem;
}

.metric-value,
.sales-kpi-grid .metric-value {
  font-size: clamp(1.35rem, 2vw, 1.8rem);
}

.inventory-toolbar-card {
  padding: 11px;
  gap: 9px;
}

.inventory-search-wrap {
  min-height: 46px;
  border-radius: 11px;
  padding: 0 11px;
}

.inventory-search-input {
  min-height: 42px !important;
  font-size: .92rem !important;
}

.category-pill {
  min-height: 30px;
  padding: 5px 10px;
  font-size: .75rem;
}

.inventory-view-toggle button {
  padding: 6px 8px;
  font-size: .74rem;
}

.inventory-product-content {
  padding: 11px;
  gap: 9px;
}

.inventory-product-topline h3 {
  font-size: 1.02rem;
}

.inventory-price-row strong {
  font-size: 1.18rem;
}

.stock-status {
  padding: 5px 8px;
  font-size: .65rem;
}

.sale-heading-badge,
.dashboard-today-pill,
.add-product-margin-badge,
.qr-count-badge {
  padding: 8px 11px;
  border-radius: 13px;
}

.sale-heading-badge strong,
.dashboard-today-pill strong,
.add-product-margin-badge strong,
.qr-count-badge strong {
  font-size: 1.28rem;
}

.sale-card-heading {
  margin-bottom: 10px;
}

.sale-card-heading h2,
.dashboard-section-heading h3,
.dashboard-today-card h3,
.dashboard-inventory-card h3,
.add-product-section-title h3,
.add-product-save-card h3,
.qr-section-title h3,
.import-step-heading h3,
.layaway-payments-heading h2 {
  font-size: 1.18rem;
}

.sale-step {
  min-width: 31px;
  height: 31px;
  border-radius: 9px;
  font-size: .8rem;
}

.sale-search-wrap {
  min-height: 48px;
  border-radius: 11px;
  padding: 0 11px;
}

.sale-search-wrap input {
  min-height: 44px;
  font-size: .94rem;
}

.sale-search-hint {
  min-height: 72px;
}

.sale-result-btn {
  border-radius: 11px;
  padding: 8px;
}

.sale-cart-card,
.sale-checkout-card,
.sale-scanner-compact {
  padding: 12px;
}

.sale-checkout-card .btn {
  min-height: 48px !important;
  font-size: .95rem !important;
}

.sale-checkout-card input,
.add-product-form-grid input,
.add-image-url-grid input,
.qr-product-select select {
  min-height: 42px;
}

.scanner-box-modern {
  min-height: 125px;
}

.scanner-box-modern.active {
  min-height: 250px;
}

.sale-mode-toggle button,
.sale-discount-pills button {
  min-height: 34px;
  padding: 7px 8px;
  font-size: .78rem;
}

.sale-total-final-row strong {
  font-size: 1.55rem;
}

.dashboard-card,
.add-product-form-card,
.add-product-cost-card,
.add-product-save-card,
.add-product-images-card,
.qr-controls-modern,
.qr-preview-modern,
.import-main-card,
.import-preview-card,
.layaway-payments-card {
  padding: 13px;
}

.dashboard-chart {
  height: 285px;
}

.dashboard-inventory-value {
  font-size: 1.65rem;
}

.sales-history-card,
.layaway-card {
  padding: 11px 13px;
}

.sales-history-card .sale-title-row h3,
.layaway-card .sale-card-header h3 {
  font-size: 1.08rem;
}

.sale-summary-grid {
  gap: 7px;
}

.sale-summary-grid div {
  padding: 8px;
  border-radius: 10px;
}

.sale-summary-grid span {
  font-size: .7rem;
}

.sale-total-box {
  border-radius: 11px;
  padding: 8px 10px;
}

.sale-total-box strong {
  font-size: 1.05rem;
}

.sales-toolbar-card {
  padding: 10px;
}

.add-product-layout {
  gap: 11px;
}

.add-product-form-grid,
.add-image-url-grid {
  gap: 9px;
}

.add-product-form-grid label,
.add-image-url-grid .add-image-field {
  gap: 5px;
  font-size: .73rem;
}

.add-product-divider {
  margin: 14px 0 9px;
}

.add-image-upload {
  min-height: 34px;
  font-size: .73rem;
}

.qr-code-stage {
  min-height: 335px;
  padding: 15px;
}

.qr-code-stage img {
  width: min(210px, 72%);
}

.qr-action-card {
  padding: 9px;
  border-radius: 10px;
}

.import-drop-zone {
  min-height: 118px;
  padding: 14px;
}

.receipt-panel {
  border-radius: 18px;
}

@media (min-width: 1280px) {
  .inventory-products-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  html {
    font-size: 15px;
  }

  .app {
    padding: 8px;
  }

  .brand-header-modern {
    padding: 10px 12px;
    border-radius: 14px;
  }

  .brand-logo-modern {
    width: 50px;
    height: 50px;
    border-radius: 12px;
  }

  .brand-copy-modern h1 {
    font-size: 1.28rem;
  }

  .workspace {
    gap: 9px;
  }

  .sidebar-shell {
    position: sticky;
    top: 5px;
    z-index: 30;
    padding: 5px;
    border-radius: 13px;
    background: rgba(255,253,249,.96);
    backdrop-filter: blur(12px);
  }

  .donatello-nav-link {
    min-height: 38px;
    padding: 5px 8px;
    font-size: .74rem;
  }

  .inventory-heading-row,
  .sale-page-heading,
  .dashboard-heading,
  .sales-heading-modern,
  .add-product-heading,
  .layaways-heading,
  .qr-heading-modern {
    gap: 9px;
  }
}

@media (max-width: 640px) {
  html {
    font-size: 14px;
  }

  .app {
    padding: 6px;
  }

  .shell {
    gap: 8px;
  }

  .brand-header-modern {
    grid-template-columns: auto 1fr;
    gap: 8px;
    padding: 8px 9px;
  }

  .brand-logo-modern {
    width: 42px;
    height: 42px;
    border-radius: 10px;
  }

  .brand-copy-modern h1 {
    font-size: 1.08rem;
  }

  .card {
    border-radius: 13px;
    padding: 11px;
  }

  .btn {
    min-height: 40px;
    font-size: .82rem;
  }

  input,
  select {
    min-height: 42px;
    font-size: 16px;
  }

  .sidebar-shell {
    margin-inline: -1px;
  }

  .donatello-nav {
    gap: 3px;
  }

  .donatello-nav-link {
    min-width: 62px;
    min-height: 42px;
    padding: 5px 6px;
    font-size: .64rem;
    border-radius: 9px;
  }

  .donatello-nav-icon {
    width: 22px;
    height: 22px;
    font-size: .82rem;
  }

  .inventory-heading-row h2,
  .sale-page-heading h2,
  .dashboard-heading h2,
  .sales-heading-modern h2,
  .add-product-heading h2,
  .layaways-heading h2,
  .qr-heading-modern h2,
  .import-heading h2 {
    font-size: 1.62rem;
  }

  .inventory-heading-row .muted,
  .sale-page-heading .muted,
  .sales-heading-modern .muted,
  .layaways-heading .muted,
  .dashboard-heading p,
  .add-product-heading p,
  .qr-heading-modern p,
  .import-heading p {
    font-size: .78rem;
  }

  .inventory-kpi-card,
  .sale-kpi-card,
  .dashboard-kpi,
  .layaway-kpi {
    min-width: 184px;
    min-height: 82px;
    padding: 10px 11px;
  }

  .inventory-products-grid {
    gap: 8px;
  }

  .inventory-product-content {
    padding: 10px;
  }

  .inventory-image-wrap {
    aspect-ratio: 16 / 9;
  }

  .inventory-product-topline h3 {
    font-size: 1rem;
  }

  .inventory-heading-actions .btn {
    min-height: 40px;
  }

  .sale-layout-modern {
    display: flex;
    flex-direction: column;
  }

  .sale-product-column,
  .sale-checkout-column {
    display: contents;
  }

  .sale-search-card {
    order: 1;
  }

  .sale-cart-card {
    order: 2;
  }

  .sale-checkout-card {
    order: 3;
  }

  .sale-scanner-compact {
    order: 4;
  }

  .sale-heading-badge {
    min-width: 0;
    width: 100%;
  }

  .sale-kpis {
    gap: 8px;
  }

  .sale-card-heading h2,
  .dashboard-section-heading h3,
  .dashboard-today-card h3,
  .dashboard-inventory-card h3,
  .add-product-section-title h3,
  .add-product-save-card h3,
  .qr-section-title h3,
  .import-step-heading h3 {
    font-size: 1.08rem;
  }

  .sale-checkout-card .btn {
    min-height: 46px !important;
  }

  .scanner-box-modern {
    min-height: 100px;
  }

  .scanner-box-modern.active {
    min-height: 220px;
  }

  .dashboard-chart {
    height: 225px;
  }

  .dashboard-today-grid {
    gap: 6px;
  }

  .dashboard-recent-row {
    gap: 7px;
  }

  .sales-history-card,
  .layaway-card {
    padding: 10px;
  }

  .sale-summary-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .sale-items-list {
    font-size: .82rem;
  }

  .add-product-layout,
  .add-product-side {
    gap: 9px;
  }

  .add-product-atlas-card {
    padding: 8px;
  }

  .add-product-form-grid,
  .add-image-url-grid {
    gap: 8px;
  }

  .add-image-preview {
    gap: 7px;
  }

  .qr-code-stage {
    min-height: 270px;
  }

  .qr-code-stage img {
    width: min(190px, 68vw);
  }

  .import-product-row {
    gap: 8px;
  }

  .receipt-overlay {
    padding: 7px;
    align-items: flex-start;
    overflow-y: auto;
  }

  .receipt-panel {
    margin: 8px auto;
    padding: 10px;
    border-radius: 14px;
  }

  .receipt-actions {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}


/* ===== Fix móvil: layout a una sola columna ===== */
@media (max-width: 640px) {
  html,
  body {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  .app,
  .shell,
  .workspace,
  .workspace-content,
  .inventory-section,
  .sale-screen,
  .dashboard-modern,
  .add-product-modern,
  .layaways-modern,
  .qr-modern,
  .import-modern {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .workspace {
    display: block !important;
    grid-template-columns: 1fr !important;
  }

  .sidebar-shell {
    position: static !important;
    top: auto !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 0 8px 0 !important;
    overflow-x: auto;
  }

  .workspace-content {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
  }

  .sale-page-heading,
  .inventory-heading-row,
  .dashboard-heading,
  .sales-heading-modern,
  .add-product-heading,
  .layaways-heading,
  .qr-heading-modern,
  .import-heading {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .sale-layout-modern,
  .sale-kpis,
  .dashboard-main-grid,
  .dashboard-lists-grid,
  .add-product-layout,
  .qr-layout-modern {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .sale-search-card,
  .sale-cart-card,
  .sale-checkout-card,
  .sale-scanner-compact,
  .inventory-toolbar-card,
  .inventory-product-card,
  .dashboard-card,
  .add-product-form-card,
  .add-product-cost-card,
  .add-product-save-card,
  .add-product-images-card,
  .layaway-card,
  .layaway-payments-card,
  .qr-controls-modern,
  .qr-preview-modern,
  .import-main-card,
  .import-preview-card {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .sale-heading-badge,
  .dashboard-today-pill,
  .add-product-margin-badge,
  .qr-count-badge {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }
}



/* ===== Inventario compacto + paginación ===== */
@media (min-width: 901px) {
  .inventory-products-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 9px;
  }

  .inventory-image-wrap {
    aspect-ratio: 16 / 10;
  }

  .inventory-product-content {
    padding: 9px 10px;
  }

  .inventory-product-topline h3 {
    font-size: .92rem;
    line-height: 1.18;
  }

  .inventory-product-topline p,
  .inventory-detail-strip,
  .inventory-price-row span {
    font-size: .72rem;
  }

  .inventory-price-row strong {
    font-size: 1rem;
  }

  .inventory-card-actions .btn {
    min-height: 34px;
    padding: 6px 9px;
    font-size: .74rem;
  }
}

@media (min-width: 1440px) {
  .inventory-products-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.inventory-pagination {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) auto minmax(180px, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255,255,255,.82);
}

.inventory-pagination-summary {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  align-items: baseline;
  font-size: .76rem;
  color: #8b8178;
}

.inventory-pagination-summary strong {
  color: #514941;
}

.inventory-page-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.inventory-page-slot {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.inventory-page-buttons button {
  width: 31px;
  height: 31px;
  border: 1px solid #ded5cb;
  border-radius: 9px;
  background: #fff;
  color: #514941;
  font-size: .76rem;
  font-weight: 800;
  cursor: pointer;
}

.inventory-page-buttons button.active {
  background: var(--terracotta);
  border-color: var(--terracotta);
  color: #fff;
}

.inventory-page-buttons button:disabled {
  opacity: .38;
  cursor: default;
}

.inventory-page-ellipsis {
  color: #9a9088;
  padding: 0 2px;
}

.inventory-page-size {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: .73rem;
  color: #766d65;
  font-weight: 750;
}

.inventory-page-size select {
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid #ded5cb;
  border-radius: 9px;
  background: #fff;
  font: inherit;
  color: #514941;
}

@media (max-width: 900px) {
  .inventory-pagination {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .inventory-pagination-summary,
  .inventory-page-size {
    justify-self: center;
  }
}



/* ===== Inventario móvil realmente compacto ===== */
@media (max-width: 760px) {
  .inventory-totals-section {
    margin-bottom: 8px;
  }

  .inventory-totals-header {
    margin-bottom: 6px;
  }

  .inventory-totals-header h2 {
    font-size: 1.15rem !important;
    margin: 1px 0 0 !important;
  }

  .inventory-totals-header p {
    display: none !important;
  }

  .inventory-kpis-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 6px !important;
    overflow: visible !important;
  }

  .inventory-kpi-card {
    min-width: 0 !important;
    min-height: 66px !important;
    padding: 8px 9px !important;
    border-radius: 11px !important;
  }

  .inventory-kpi-card .metric-label {
    font-size: .62rem !important;
  }

  .inventory-kpi-card .metric-value {
    font-size: 1.02rem !important;
    line-height: 1.05 !important;
  }

  .inventory-kpi-card small {
    display: none !important;
  }

  .inventory-heading-row {
    gap: 6px !important;
    margin-bottom: 7px !important;
  }

  .inventory-heading-row h2 {
    font-size: 1.3rem !important;
    line-height: 1 !important;
  }

  .inventory-heading-row .muted {
    font-size: .68rem !important;
    line-height: 1.25 !important;
  }

  .inventory-heading-actions {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 6px !important;
    width: 100% !important;
  }

  .inventory-heading-actions .btn {
    min-height: 34px !important;
    padding: 6px 7px !important;
    font-size: .68rem !important;
  }

  .inventory-toolbar-card {
    padding: 8px !important;
    gap: 7px !important;
    border-radius: 12px !important;
  }

  .inventory-search-wrap {
    min-height: 38px !important;
  }

  .inventory-search-input {
    min-height: 38px !important;
    font-size: 16px !important;
  }

  .inventory-filter-row,
  .inventory-category-row {
    gap: 6px !important;
  }

  .inventory-status-pills,
  .category-pills {
    gap: 5px !important;
  }

  .category-pill,
  .inventory-view-toggle button {
    min-height: 30px !important;
    padding: 5px 8px !important;
    font-size: .64rem !important;
  }

  .catalog-counter {
    margin: 0 !important;
    font-size: .64rem !important;
  }

  .inventory-products-grid {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 7px !important;
  }

  .inventory-product-card {
    padding: 0 !important;
    overflow: hidden !important;
    border-radius: 12px !important;
  }

  .inventory-product-card-main {
    display: grid !important;
    grid-template-columns: 96px minmax(0, 1fr) !important;
    width: 100% !important;
    min-width: 0 !important;
    align-items: stretch !important;
  }

  .inventory-image-wrap {
    width: 96px !important;
    height: 100% !important;
    min-height: 132px !important;
    aspect-ratio: auto !important;
    border-radius: 0 !important;
  }

  .inventory-product-image {
    width: 100% !important;
    height: 100% !important;
    min-height: 132px !important;
    object-fit: cover !important;
  }

  .inventory-photo-count {
    left: 5px !important;
    bottom: 5px !important;
    padding: 3px 5px !important;
    font-size: .56rem !important;
  }

  .inventory-product-content {
    min-width: 0 !important;
    padding: 8px 9px !important;
    gap: 5px !important;
  }

  .inventory-product-topline {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 5px !important;
    align-items: start !important;
  }

  .inventory-product-topline h3 {
    margin: 0 !important;
    font-size: .82rem !important;
    line-height: 1.1 !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2 !important;
    -webkit-box-orient: vertical !important;
    overflow: hidden !important;
  }

  .inventory-product-topline p {
    margin: 2px 0 0 !important;
    font-size: .58rem !important;
    line-height: 1.1 !important;
  }

  .stock-status {
    padding: 3px 5px !important;
    font-size: .54rem !important;
    line-height: 1 !important;
    white-space: nowrap !important;
  }

  .inventory-price-row {
    display: grid !important;
    grid-template-columns: 1fr auto !important;
    gap: 8px !important;
    padding: 0 !important;
  }

  .inventory-price-row span {
    font-size: .56rem !important;
  }

  .inventory-price-row strong {
    font-size: .86rem !important;
    line-height: 1.05 !important;
  }

  .inventory-detail-strip {
    display: flex !important;
    gap: 8px !important;
    padding-top: 4px !important;
    font-size: .57rem !important;
  }

  .inventory-card-actions {
    display: grid !important;
    grid-template-columns: 1fr auto !important;
    gap: 5px !important;
    margin-top: 1px !important;
  }

  .inventory-card-actions .btn,
  .inventory-danger-link {
    min-height: 28px !important;
    padding: 4px 7px !important;
    font-size: .6rem !important;
    border-radius: 8px !important;
  }

  .inventory-pagination {
    gap: 7px !important;
    padding: 8px !important;
    border-radius: 11px !important;
  }

  .inventory-page-size {
    display: none !important;
  }

  .inventory-pagination-summary {
    font-size: .66rem !important;
  }

  .inventory-page-buttons button {
    width: 28px !important;
    height: 28px !important;
    font-size: .68rem !important;
  }
}

@media (max-width: 430px) {
  .inventory-product-card-main {
    grid-template-columns: 88px minmax(0, 1fr) !important;
  }

  .inventory-image-wrap {
    width: 88px !important;
    min-height: 124px !important;
  }

  .inventory-product-image {
    min-height: 124px !important;
  }

  .inventory-product-content {
    padding: 7px 8px !important;
  }

  .inventory-product-topline h3 {
    font-size: .78rem !important;
  }

  .inventory-detail-strip {
    gap: 6px !important;
  }
}



/* ===== Última pasada móvil Inventario · 2026-10-07 ===== */
@media (max-width: 430px) {
  .inventory-totals-section {
    margin-bottom: 5px !important;
  }

  .inventory-totals-header {
    margin-bottom: 4px !important;
  }

  .inventory-totals-header .eyebrow {
    display: none !important;
  }

  .inventory-totals-header h2 {
    font-size: 1rem !important;
  }

  .inventory-kpis-grid {
    gap: 4px !important;
  }

  .inventory-kpi-card {
    min-height: 56px !important;
    padding: 6px 7px !important;
  }

  .inventory-kpi-card .metric-label {
    font-size: .56rem !important;
  }

  .inventory-kpi-card .metric-value {
    font-size: .9rem !important;
  }

  .inventory-heading-row {
    margin-bottom: 5px !important;
  }

  .inventory-heading-row .eyebrow {
    display: none !important;
  }

  .inventory-heading-row h2 {
    font-size: 1.15rem !important;
  }

  .inventory-heading-row .muted {
    display: none !important;
  }

  .inventory-heading-actions {
    gap: 4px !important;
  }

  .inventory-heading-actions .btn {
    min-height: 30px !important;
    padding: 4px 6px !important;
    font-size: .62rem !important;
  }

  .inventory-toolbar-card {
    padding: 6px !important;
    gap: 5px !important;
  }

  .inventory-search-wrap,
  .inventory-search-input {
    min-height: 34px !important;
  }

  .inventory-filter-row {
    align-items: center !important;
  }

  .inventory-status-pills,
  .category-pills {
    gap: 4px !important;
  }

  .category-pill,
  .inventory-view-toggle button {
    min-height: 27px !important;
    padding: 4px 7px !important;
    font-size: .59rem !important;
  }

  .inventory-filter-label {
    font-size: .58rem !important;
  }

  .catalog-counter {
    font-size: .59rem !important;
  }

  .inventory-products-grid {
    gap: 5px !important;
  }

  .inventory-product-card {
    border-radius: 10px !important;
  }

  .inventory-product-card-main {
    grid-template-columns: 80px minmax(0, 1fr) !important;
    min-height: 110px !important;
  }

  .inventory-image-wrap {
    width: 80px !important;
    min-height: 110px !important;
  }

  .inventory-product-image {
    min-height: 110px !important;
  }

  .inventory-photo-count {
    left: 4px !important;
    bottom: 4px !important;
    padding: 2px 4px !important;
    font-size: .5rem !important;
  }

  .inventory-product-content {
    padding: 6px 7px !important;
    gap: 3px !important;
  }

  .inventory-product-topline {
    gap: 4px !important;
  }

  .inventory-product-topline h3 {
    font-size: .72rem !important;
    line-height: 1.04 !important;
  }

  .inventory-product-topline p {
    margin-top: 1px !important;
    font-size: .52rem !important;
  }

  .stock-status {
    padding: 2px 4px !important;
    font-size: .48rem !important;
  }

  .inventory-price-row {
    gap: 5px !important;
  }

  .inventory-price-row span {
    font-size: .5rem !important;
  }

  .inventory-price-row strong {
    font-size: .77rem !important;
  }

  .inventory-detail-strip {
    gap: 5px !important;
    padding-top: 2px !important;
    font-size: .51rem !important;
  }

  .inventory-card-actions {
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 4px !important;
    margin-top: 0 !important;
  }

  .inventory-card-actions .btn,
  .inventory-danger-link {
    min-height: 24px !important;
    padding: 3px 6px !important;
    font-size: .54rem !important;
    border-radius: 7px !important;
  }
}


/* ===== Filtros desplegables Inventario móvil ===== */
.inventory-mobile-filter-toggle {
  display: none;
}

.inventory-mobile-filter-panel {
  display: contents;
}

@media (max-width: 430px) {
  .inventory-mobile-filter-toggle {
    display: flex !important;
    width: 100% !important;
    min-height: 30px !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 4px 8px !important;
    border: 1px solid #e4d8cd !important;
    border-radius: 9px !important;
    background: #fffaf5 !important;
    color: #65564b !important;
    font-size: .62rem !important;
    font-weight: 800 !important;
  }

  .inventory-mobile-filter-panel {
    display: none !important;
  }

  .inventory-mobile-filter-panel.is-open {
    display: grid !important;
    gap: 5px !important;
  }

  .inventory-mobile-filter-panel .inventory-filter-row {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 5px !important;
  }

  .inventory-mobile-filter-panel .inventory-view-toggle {
    justify-self: start !important;
  }

  .inventory-mobile-filter-panel .inventory-category-row {
    display: grid !important;
    gap: 4px !important;
  }
}

/* ===== Carga visual de imágenes ===== */
.inventory-image-wrap {
  background: #eee5dc;
}

.inventory-image-skeleton {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.46) 45%, rgba(255,255,255,0) 90%),
    linear-gradient(135deg, #eee5dc, #f5efe8);
  background-size: 220% 100%, 100% 100%;
  animation: donatello-image-shimmer 1.15s linear infinite;
}

.inventory-product-image {
  transition: opacity .18s ease;
}

.inventory-product-image.is-loading {
  opacity: 0;
}

.inventory-product-image.is-loaded {
  opacity: 1;
}

@keyframes donatello-image-shimmer {
  from { background-position: 200% 0, 0 0; }
  to { background-position: -20% 0, 0 0; }
}

@media (prefers-reduced-motion: reduce) {
  .inventory-image-skeleton {
    animation: none;
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
