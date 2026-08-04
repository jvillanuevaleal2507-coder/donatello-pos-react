const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function isValidPublicImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value !== "string") return null;

  const normalized = value
    .replace(/[^0-9.,-]/g, "")
    .replace(/,/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractPrice(match = {}) {
  const candidates = [
    match.price?.extracted_value,
    match.price?.extracted,
    match.extracted_price,
    match.price,
    match.product_price,
  ];

  for (const candidate of candidates) {
    const value = toNumber(candidate);
    if (value !== null && value > 0) return value;
  }

  return null;
}

function extractCurrency(match = {}) {
  return (
    match.price?.currency ||
    match.currency ||
    match.product_currency ||
    "USD"
  );
}

function confidenceFor(match, index) {
  if (match.exact_matches === true) return 99;

  const position = Number(match.position || index + 1);
  return Math.max(60, 93 - (position - 1) * 3);
}

function normalizeImages(match = {}) {
  const candidates = [
    { url: match.image, type: "main", alt: match.title || "" },
    { url: match.thumbnail, type: "main", alt: match.title || "" },
    { url: match.original_image, type: "main", alt: match.title || "" },
    { url: match.product_image, type: "main", alt: match.title || "" },
  ];

  for (const image of match.images || []) {
    if (typeof image === "string") {
      candidates.push({ url: image, type: "other", alt: match.title || "" });
    } else if (image?.link || image?.url || image?.thumbnail) {
      candidates.push({
        url: image.link || image.url || image.thumbnail,
        type: image.type || "other",
        alt: image.title || image.alt || match.title || "",
      });
    }
  }

  const seen = new Set();

  return candidates.filter((image) => {
    if (!isValidPublicImageUrl(image.url) || seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

function normalizeMatch(match, index) {
  const priceValue = extractPrice(match);
  const currency = extractCurrency(match);
  const images = normalizeImages(match);

  return {
    id: `lens-${match.position || index + 1}`,
    source: match.source || match.store || "Otra fuente",
    title: match.title || "Producto encontrado",
    url: match.link || match.product_link || "",
    price: priceValue,
    currency,
    priceLabel:
      match.price?.value ||
      match.price?.displayed_price ||
      match.price_string ||
      "",
    confidence: confidenceFor(match, index),
    exactImageMatch: match.exact_matches === true,
    hasTechnicalData: Boolean(match.title),
    inStock:
      typeof match.in_stock === "boolean"
        ? match.in_stock
        : typeof match.available === "boolean"
        ? match.available
        : null,
    images,
    metadata: {
      brand: match.brand || "",
      model: match.model || match.product_id || "",
      category: match.category || "General",
      position: Number(match.position || index + 1),
      rating: match.rating ?? null,
      reviews: match.reviews ?? null,
      priceLabel:
        match.price?.value ||
        match.price?.displayed_price ||
        match.price_string ||
        "",
      availability:
        match.availability ||
        match.stock ||
        "",
    },
    raw: match,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }

  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    return sendJson(res, 500, {
      error:
        "Falta configurar SERPAPI_KEY en las variables de entorno de Vercel.",
    });
  }

  const { imageUrl } = req.body || {};

  if (!isValidPublicImageUrl(imageUrl)) {
    return sendJson(res, 400, {
      error: "Se requiere una URL pública HTTPS de la imagen.",
    });
  }

  try {
    const params = new URLSearchParams({
      engine: "google_lens",
      type: "visual_matches",
      url: imageUrl,
      hl: "en",
      country: "us",
      safe: "active",
      auto_crop: "false",
      api_key: apiKey,
    });

    const response = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return sendJson(res, response.status || 502, {
        error:
          data.error ||
          "SerpApi no pudo completar la búsqueda visual.",
      });
    }

    const visualMatches = Array.isArray(data.visual_matches)
      ? data.visual_matches
      : [];

    const results = visualMatches
      .slice(0, 25)
      .map(normalizeMatch)
      .filter((item) => item.url || item.images.length);

    return sendJson(res, 200, {
      ok: true,
      searchId: data.search_metadata?.id || null,
      imageUrl,
      results,
    });
  } catch (error) {
    console.error("Atlas API error:", error);

    return sendJson(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado en Atlas API.",
    });
  }
}
