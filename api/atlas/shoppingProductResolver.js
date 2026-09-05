const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const DEFAULT_TIMEOUT_MS = 7500;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMerchant(value = "") {
  return normalizeText(value)
    .replace(/\b(?:official|store|shop|marketplace|seller)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function merchantFamily(value = "") {
  const text = normalizeMerchant(value).replace(/\s+/g, "");
  if (text.includes("amazon")) return "amazon";
  if (text.includes("homedepot")) return "homedepot";
  if (text.includes("walmart")) return "walmart";
  if (text.includes("lowes") || text.includes("lowe")) return "lowes";
  if (text.includes("target")) return "target";
  if (text.includes("wayfair")) return "wayfair";
  return "other";
}

function tokenSet(value = "") {
  return new Set(
    normalizeMerchant(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}

function merchantSimilarity(a = "", b = "") {
  const normalizedA = normalizeMerchant(a);
  const normalizedB = normalizeMerchant(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return 0.9;

  const familyA = merchantFamily(a);
  const familyB = merchantFamily(b);
  let score = familyA !== "other" && familyA === familyB ? 0.6 : 0;

  const tokensA = tokenSet(a);
  const tokensB = tokenSet(b);
  if (tokensA.size && tokensB.size) {
    let intersection = 0;
    for (const token of tokensA) if (tokensB.has(token)) intersection += 1;
    const union = new Set([...tokensA, ...tokensB]).size;
    score = Math.max(score, union ? intersection / union : 0);
  }

  return Math.min(1, score);
}

function isPublicHttpsUrl(value = "") {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname) return false;

    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
      /^169\.254\./.test(hostname)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function unwrapGoogleRedirect(value = "") {
  if (!value) return "";

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (hostname.endsWith("google.com") && url.pathname === "/url") {
      const target = url.searchParams.get("q") || url.searchParams.get("url") || "";
      if (isPublicHttpsUrl(target)) return target;
    }

    return isPublicHttpsUrl(value) ? value : "";
  } catch {
    return "";
  }
}

function normalizeImageUrl(value = "") {
  if (!isPublicHttpsUrl(value)) return "";

  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function imageIdentity(value = "") {
  try {
    const url = new URL(value);
    const fileName = url.pathname.split("/").filter(Boolean).pop()?.toLowerCase() || "";
    const clean = fileName
      .replace(/[-_](thumb|thumbnail|small|medium|large|preview|zoom|main|hero)/g, "")
      .replace(/[-_]\d+x\d+/g, "")
      .replace(/\.(jpe?g|png|webp|avif)$/i, "")
      .replace(/[^a-z0-9]/g, "");
    return clean.length >= 8 ? clean : url.toString();
  } catch {
    return value;
  }
}

function mergeImages(existing = [], extra = []) {
  const output = [];
  const seenUrls = new Set();
  const seenIdentities = new Set();

  for (const image of [...existing, ...extra]) {
    const rawUrl = typeof image === "string" ? image : image?.url || image?.link;
    const url = normalizeImageUrl(rawUrl);
    if (!url || seenUrls.has(url)) continue;

    const identity = imageIdentity(url);
    if (identity && seenIdentities.has(identity)) continue;

    seenUrls.add(url);
    if (identity) seenIdentities.add(identity);

    output.push(
      typeof image === "string"
        ? { url, type: "other", source: "google-product-media" }
        : { ...image, url }
    );
  }

  return output;
}

function extractProductMedia(data = {}) {
  const product = data.product_results || {};
  const media = Array.isArray(product.media) ? product.media : [];
  const output = [];

  for (const item of media) {
    if (!item) continue;
    const type = String(item.type || "").toLowerCase();
    if (type && type !== "image") continue;

    const url = normalizeImageUrl(item.link || item.url || item.image || "");
    if (!url) continue;

    output.push({
      url,
      type: output.length === 0 ? "main" : "other",
      alt: product.title || "",
      source: "google-product-media",
      width: Number(item.width || 0) || null,
      height: Number(item.height || 0) || null,
    });
  }

  const directImages = [
    product.image,
    product.thumbnail,
  ].filter(Boolean);

  for (const value of directImages) {
    const url = normalizeImageUrl(value);
    if (!url) continue;
    output.push({
      url,
      type: output.length === 0 ? "main" : "other",
      alt: product.title || "",
      source: "google-product-media",
    });
  }

  return mergeImages([], output);
}

function bestSellerForSource(sellers = [], source = "") {
  if (!Array.isArray(sellers) || !sellers.length) return null;

  const ranked = sellers
    .map((seller, index) => ({
      seller,
      index,
      score: merchantSimilarity(seller?.name || "", source),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.index - b.index;
    });

  if (ranked[0]?.score >= 0.48) return ranked[0].seller;

  const desiredFamily = merchantFamily(source);
  if (desiredFamily !== "other") {
    const familyMatch = sellers.find(
      (seller) => merchantFamily(seller?.name || "") === desiredFamily
    );
    if (familyMatch) return familyMatch;
  }

  return sellers.length === 1 ? sellers[0] : null;
}

function buildProductApiUrl(result = {}, apiKey = "") {
  const raw = result.raw || {};
  const productId = String(raw.product_id || raw.productId || "").trim();
  if (!productId || !apiKey) return "";

  const params = new URLSearchParams({
    engine: "google_product",
    product_id: productId,
    gl: "us",
    hl: "en",
    api_key: apiKey,
  });

  return `${SERPAPI_ENDPOINT}?${params.toString()}`;
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.error) {
      throw new Error(data?.error || `SerpApi respondió HTTP ${response.status}.`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveShoppingProduct(
  result = {},
  { apiKey = "", timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  if (!result || !apiKey) return result;

  const raw = result.raw || {};
  const productId = String(raw.product_id || raw.productId || "").trim();
  const searchOrigin = String(result.searchOrigin || result.metadata?.searchOrigin || "");

  if (!productId || searchOrigin === "visual") return result;

  const apiUrl = buildProductApiUrl(result, apiKey);
  if (!apiUrl) return result;

  try {
    const data = await fetchJsonWithTimeout(apiUrl, timeoutMs);
    const sellers = data?.sellers_results?.online_sellers || [];
    const seller = bestSellerForSource(sellers, result.source || "");
    const resolvedUrl = unwrapGoogleRedirect(
      seller?.direct_link || seller?.link || ""
    );
    const productMedia = extractProductMedia(data);
    const images = mergeImages(result.images || [], productMedia);

    return {
      ...result,
      url: resolvedUrl || result.url || "",
      images,
      source:
        seller?.name && merchantSimilarity(seller.name, result.source || "") >= 0.48
          ? seller.name
          : result.source,
      metadata: {
        ...(result.metadata || {}),
        resolvedMerchant: seller?.name || "",
        resolvedProductUrl: resolvedUrl || "",
        googleProductId: productId,
        googleProductTitle: data?.product_results?.title || "",
      },
      productResolution: {
        ok: Boolean(resolvedUrl || productMedia.length),
        productId,
        merchant: seller?.name || "",
        directUrl: resolvedUrl || "",
        mediaCount: productMedia.length,
        sellerCount: Array.isArray(sellers) ? sellers.length : 0,
        source: "google-product-api",
      },
    };
  } catch (error) {
    console.warn("Atlas product resolver warning:", error);
    return {
      ...result,
      productResolution: {
        ok: false,
        productId,
        merchant: "",
        directUrl: "",
        mediaCount: 0,
        sellerCount: 0,
        source: "google-product-api",
        error: error instanceof Error ? error.message : "No se pudo resolver el producto.",
      },
    };
  }
}
