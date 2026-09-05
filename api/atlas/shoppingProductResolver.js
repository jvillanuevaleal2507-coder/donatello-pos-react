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

function isGoogleShoppingUrl(value = "") {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      (host === "google.com" || host.endsWith(".google.com")) &&
      (/\/shopping\//i.test(url.pathname) || /\/shopping$/i.test(url.pathname))
    );
  } catch {
    return false;
  }
}

function directMerchantUrl(value = "") {
  const url = unwrapGoogleRedirect(value);
  if (!url || isGoogleShoppingUrl(url)) return "";
  return url;
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
        ? { url, type: "other", source: "google-immersive-media" }
        : { ...image, url }
    );
  }

  return output;
}

function pushMedia(output, value, productTitle = "", index = 0) {
  if (!value) return;

  if (typeof value === "string") {
    const url = normalizeImageUrl(value);
    if (!url) return;
    output.push({
      url,
      type: index === 0 && output.length === 0 ? "main" : "other",
      alt: productTitle,
      source: "google-immersive-media",
    });
    return;
  }

  if (typeof value === "object") {
    const url = normalizeImageUrl(
      value.link || value.url || value.image || value.thumbnail || value.src || ""
    );
    if (!url) return;
    output.push({
      url,
      type: index === 0 && output.length === 0 ? "main" : "other",
      alt: value.title || value.alt || productTitle,
      source: "google-immersive-media",
      width: Number(value.width || 0) || null,
      height: Number(value.height || 0) || null,
    });
  }
}

function extractProductMedia(data = {}) {
  const product = data.product_results || {};
  const output = [];

  const collections = [
    product.media,
    product.images,
    product.thumbnails,
  ];

  for (const collection of collections) {
    if (Array.isArray(collection)) {
      collection.forEach((item, index) => pushMedia(output, item, product.title || "", index));
    } else {
      pushMedia(output, collection, product.title || "", 0);
    }
  }

  [product.image, product.thumbnail].forEach((item, index) =>
    pushMedia(output, item, product.title || "", index)
  );

  return mergeImages([], output);
}

function bestSellerForSource(sellers = [], source = "") {
  if (!Array.isArray(sellers) || !sellers.length) return null;

  const ranked = sellers
    .map((seller, index) => ({
      seller,
      index,
      score: merchantSimilarity(seller?.name || seller?.source || "", source),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.index - b.index;
    });

  if (ranked[0]?.score >= 0.48) return ranked[0].seller;

  const desiredFamily = merchantFamily(source);
  if (desiredFamily !== "other") {
    const familyMatch = sellers.find(
      (seller) => merchantFamily(seller?.name || seller?.source || "") === desiredFamily
    );
    if (familyMatch) return familyMatch;
  }

  return sellers.length === 1 ? sellers[0] : null;
}

function immersiveToken(result = {}) {
  const raw = result.raw || {};
  const direct = String(
    raw.immersive_product_page_token ||
      raw.page_token ||
      raw.immersiveProductPageToken ||
      ""
  ).trim();
  if (direct) return direct;

  const serpApiUrl = String(raw.serpapi_immersive_product_api || "").trim();
  if (!serpApiUrl) return "";

  try {
    const url = new URL(serpApiUrl);
    return String(url.searchParams.get("page_token") || "").trim();
  } catch {
    return "";
  }
}

function buildImmersiveApiUrl(result = {}, apiKey = "") {
  const token = immersiveToken(result);
  if (!token || !apiKey) return "";

  const params = new URLSearchParams({
    engine: "google_immersive_product",
    page_token: token,
    more_stores: "true",
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
  if (!result) return result;

  const raw = result.raw || {};
  const productId = String(raw.product_id || raw.productId || "").trim();
  const searchOrigin = String(result.searchOrigin || result.metadata?.searchOrigin || "");

  // Google Images shopping results and some visual results already provide a merchant URL.
  const rawMerchantUrl = directMerchantUrl(raw.link || raw.direct_link || "");
  const existingMerchantUrl = directMerchantUrl(result.url || "");
  const immediateUrl = rawMerchantUrl || existingMerchantUrl;

  // Visual matches normally already point at the retailer/page that Lens found.
  // No extra SerpApi call is needed in that case.
  if (searchOrigin === "visual") {
    return {
      ...result,
      url: immediateUrl || result.url || "",
      productResolution: {
        ok: Boolean(immediateUrl || result.url),
        productId,
        merchant: result.source || "",
        directUrl: immediateUrl || result.url || "",
        mediaCount: Array.isArray(result.images) ? result.images.length : 0,
        sellerCount: 0,
        source: immediateUrl ? "direct-merchant-link" : "visual-result",
      },
    };
  }

  if (!apiKey) return result;

  const apiUrl = buildImmersiveApiUrl(result, apiKey);

  // If Google Shopping already gave us a direct merchant URL, keep it even when
  // an immersive token is not available.
  if (!apiUrl) {
    return {
      ...result,
      url: immediateUrl || result.url || "",
      productResolution: {
        ok: Boolean(immediateUrl),
        productId,
        merchant: result.source || "",
        directUrl: immediateUrl,
        mediaCount: Array.isArray(result.images) ? result.images.length : 0,
        sellerCount: 0,
        source: immediateUrl ? "direct-merchant-link" : "unresolved-shopping-result",
        error: immediateUrl ? "" : "Google Shopping no proporcionó token inmersivo ni URL directa.",
      },
    };
  }

  try {
    const data = await fetchJsonWithTimeout(apiUrl, timeoutMs);
    const stores = Array.isArray(data?.product_results?.stores)
      ? data.product_results.stores
      : Array.isArray(data?.sellers_results?.online_sellers)
      ? data.sellers_results.online_sellers
      : [];

    const seller = bestSellerForSource(stores, result.source || "");
    const sellerUrl = directMerchantUrl(
      seller?.direct_link || seller?.link || seller?.url || ""
    );
    const resolvedUrl = sellerUrl || immediateUrl || "";
    const productMedia = extractProductMedia(data);
    const images = mergeImages(result.images || [], productMedia);
    const sellerName = seller?.name || seller?.source || "";

    console.log("Atlas immersive product resolver", {
      source: result.source || "",
      productId,
      storeCount: stores.length,
      resolvedMerchant: sellerName,
      resolvedHost: (() => {
        try {
          return resolvedUrl ? new URL(resolvedUrl).hostname : "";
        } catch {
          return "";
        }
      })(),
      mediaCount: productMedia.length,
    });

    return {
      ...result,
      url: resolvedUrl || result.url || "",
      images,
      source:
        sellerName && merchantSimilarity(sellerName, result.source || "") >= 0.48
          ? sellerName
          : result.source,
      metadata: {
        ...(result.metadata || {}),
        resolvedMerchant: sellerName,
        resolvedProductUrl: resolvedUrl,
        googleProductId: productId,
        immersiveProductTitle: data?.product_results?.title || "",
      },
      productResolution: {
        ok: Boolean(resolvedUrl || productMedia.length),
        productId,
        merchant: sellerName,
        directUrl: resolvedUrl,
        mediaCount: productMedia.length,
        sellerCount: stores.length,
        source: "google-immersive-product-api",
      },
    };
  } catch (error) {
    console.warn("Atlas immersive product resolver warning:", error);
    return {
      ...result,
      url: immediateUrl || result.url || "",
      productResolution: {
        ok: Boolean(immediateUrl),
        productId,
        merchant: result.source || "",
        directUrl: immediateUrl,
        mediaCount: Array.isArray(result.images) ? result.images.length : 0,
        sellerCount: 0,
        source: "google-immersive-product-api",
        error: error instanceof Error ? error.message : "No se pudo resolver el producto.",
      },
    };
  }
}
