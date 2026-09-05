const MAX_IMAGES = 40;
const DEFAULT_TIMEOUT_MS = 8000;
const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp|avif)(?:$|\?)/i;

function normalizeText(value = "") {
  return String(value || "")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();
}

function publicHttps(value = "", pageUrl = "") {
  const raw = normalizeText(value);
  if (!raw) return "";

  try {
    const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
    const url = new URL(normalized, pageUrl || undefined);
    if (url.protocol !== "https:" || !url.hostname) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function productPath(url = "") {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^(.*?\/products\/[^/?#]+?)(?:\.js)?\/?$/i);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function shopifyAjaxUrl(url = "") {
  try {
    const parsed = new URL(url);
    const path = productPath(url);
    if (!path) return "";
    parsed.pathname = `${path}.js`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function isShopifyHtml(html = "") {
  return /cdn\.shopify\.com|shopify-section|window\.Shopify|Shopify\.theme|shopify-features/i.test(
    String(html || "")
  );
}

function normalizeShopifyImageUrl(value = "", pageUrl = "") {
  const url = publicHttps(value, pageUrl);
  if (!url) return "";

  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase().endsWith("cdn.shopify.com")) {
      ["width", "height", "crop", "format", "quality"].forEach((key) =>
        parsed.searchParams.delete(key)
      );
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function imageIdentity(value = "") {
  try {
    const url = new URL(value);
    return (
      url.pathname
        .split("/")
        .filter(Boolean)
        .pop()
        ?.toLowerCase()
        .replace(/[-_](thumb|thumbnail|small|medium|large|preview|zoom|main|hero)/g, "")
        .replace(/[-_]\d+x\d+/g, "")
        .replace(/\.(jpe?g|png|webp|avif)$/i, "")
        .replace(/[^a-z0-9]/g, "") || url.toString()
    );
  } catch {
    return String(value || "").toLowerCase();
  }
}

function classifyImage(url = "", hint = "") {
  const text = `${url} ${hint}`.toLowerCase();
  if (/dimension|measurement|size chart|width|height|depth|length|medidas|dimensiones/.test(text)) {
    return "measurements";
  }
  if (/living room|dining room|bedroom|office|kitchen|lifestyle|room scene|ambiente|sala|comedor/.test(text)) {
    return "environment";
  }
  if (/detail|close[- ]?up|texture|finish|material|wood grain|fabric|detalle|acabado|textura/.test(text)) {
    return "detail";
  }
  return "other";
}

function pushImage(bucket, candidate = {}, pageUrl = "") {
  const url = normalizeShopifyImageUrl(candidate.url, pageUrl);
  if (!url || !IMAGE_EXTENSIONS.test(url)) return;

  const lower = url.toLowerCase();
  if (["logo", "icon", "sprite", "favicon", "avatar", "badge", "pixel", "placeholder"].some((term) => lower.includes(term))) {
    return;
  }

  const identity = imageIdentity(url);
  if (bucket.some((item) => item.url === url || (identity && item.identity === identity))) return;

  bucket.push({
    url,
    type: candidate.type || classifyImage(url, candidate.alt || ""),
    alt: candidate.alt || "",
    source: candidate.source || "shopify-product",
    width: Number(candidate.width || 0) || null,
    height: Number(candidate.height || 0) || null,
    identity,
  });
}

function productMetadata(product = {}) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const skus = [...new Set(variants.map((variant) => String(variant?.sku || "").trim()).filter(Boolean))];
  const barcodes = [...new Set(variants.map((variant) => String(variant?.barcode || "").trim()).filter(Boolean))];
  const options = Array.isArray(product?.options)
    ? product.options.map((option) =>
        typeof option === "string"
          ? option
          : String(option?.name || "").trim()
      ).filter(Boolean)
    : [];

  return {
    title: String(product?.title || "").trim(),
    vendor: String(product?.vendor || "").trim(),
    type: String(product?.type || "").trim(),
    handle: String(product?.handle || "").trim(),
    sku: skus[0] || "",
    skus,
    barcode: barcodes[0] || "",
    barcodes,
    variantCount: variants.length,
    options,
    exactProductGallery: true,
    structuredSource: "shopify-ajax-product-api",
  };
}

async function fetchProductJson(url = "", timeoutMs = DEFAULT_TIMEOUT_MS) {
  const endpoint = shopifyAjaxUrl(url);
  if (!endpoint) throw new Error("No se pudo construir el endpoint Shopify del producto.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Shopify Ajax respondió HTTP ${response.status}.`);
    }

    const data = await response.json();
    if (!data || typeof data !== "object") {
      throw new Error("Shopify Ajax no devolvió un producto válido.");
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function extractFromProductJson(product = {}, pageUrl = "", maximum = MAX_IMAGES) {
  const images = [];

  pushImage(images, {
    url: product?.featured_image,
    type: "main",
    source: "shopify-featured-image",
  }, pageUrl);

  for (const image of Array.isArray(product?.images) ? product.images : []) {
    pushImage(images, {
      url: typeof image === "string" ? image : image?.src || image?.url,
      alt: typeof image === "string" ? "" : image?.alt || "",
      source: "shopify-product-images",
    }, pageUrl);
  }

  for (const media of Array.isArray(product?.media) ? product.media : []) {
    const preview = media?.preview_image || media?.previewImage || {};
    pushImage(images, {
      url: media?.src || media?.image?.src || preview?.src || preview?.url,
      alt: media?.alt || preview?.alt || "",
      width: media?.width || preview?.width,
      height: media?.height || preview?.height,
      source: "shopify-product-media",
    }, pageUrl);
  }

  for (const variant of Array.isArray(product?.variants) ? product.variants : []) {
    const featured = variant?.featured_image || variant?.featuredImage || {};
    pushImage(images, {
      url: typeof featured === "string" ? featured : featured?.src || featured?.url,
      alt: variant?.title || "",
      source: "shopify-variant-image",
    }, pageUrl);
  }

  return images
    .slice(0, Math.max(1, Number(maximum) || MAX_IMAGES))
    .map(({ identity, ...image }) => image);
}

function extractScopedHtmlImages(html = "", pageUrl = "", maximum = MAX_IMAGES) {
  const images = [];
  const imgRegex = /<img\b[^>]*>/gi;
  let match;

  while ((match = imgRegex.exec(html))) {
    const tag = match[0];
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1] || "";
    if (!/product\s+(?:image|thumbnail)|product-media|product__media/i.test(`${alt} ${tag}`)) {
      continue;
    }

    const srcset =
      tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bdata-srcset=["']([^"']+)["']/i)?.[1] || "";
    const srcsetUrl = srcset
      ? srcset.split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean).pop()
      : "";
    const url =
      tag.match(/\bdata-zoom-image=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ||
      srcsetUrl ||
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ||
      "";

    pushImage(images, {
      url,
      alt,
      source: "shopify-scoped-html",
    }, pageUrl);

    if (images.length >= maximum) break;
  }

  return images.map(({ identity, ...image }) => image);
}

export function canHandleShopifyProductPage({ html = "", url = "" } = {}) {
  return Boolean(productPath(url) && isShopifyHtml(html));
}

export async function extractShopifyGallery({
  html = "",
  url = "",
  maximum = MAX_IMAGES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!canHandleShopifyProductPage({ html, url })) {
    return {
      ok: false,
      provider: "shopify",
      url,
      images: [],
      count: 0,
      metadata: null,
      error: "La página no parece ser un producto Shopify.",
    };
  }

  let ajaxError = "";
  try {
    const product = await fetchProductJson(url, timeoutMs);
    const images = extractFromProductJson(product, url, maximum);
    if (images.length) {
      return {
        ok: true,
        provider: "shopify",
        providerUsed: "shopify",
        url,
        images,
        count: images.length,
        metadata: productMetadata(product),
        ajaxEndpoint: shopifyAjaxUrl(url),
        error: "",
      };
    }
  } catch (error) {
    ajaxError = error instanceof Error ? error.message : "Falló Shopify Ajax.";
  }

  const fallbackImages = extractScopedHtmlImages(html, url, maximum);
  return {
    ok: fallbackImages.length > 0,
    provider: "shopify",
    providerUsed: "shopify",
    url,
    images: fallbackImages,
    count: fallbackImages.length,
    metadata: {
      exactProductGallery: true,
      structuredSource: "shopify-scoped-html",
      variantCount: null,
      sku: "",
      skus: [],
      barcode: "",
      barcodes: [],
      options: [],
    },
    ajaxEndpoint: shopifyAjaxUrl(url),
    error: fallbackImages.length ? ajaxError : ajaxError || "Shopify no expuso imágenes de producto utilizables.",
  };
}
