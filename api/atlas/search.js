import { enrichResultWithGallery } from "./galleryExtractor.js";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

const TITLE_NOISE_WORDS = new Set([
  "new", "open", "box", "lot", "item", "return", "returns",
  "the", "and", "for", "with", "from", "this", "that",
  "de", "la", "el", "los", "las", "para", "con", "por",
  "set", "piece", "pieces", "pack", "pcs", "pc",
  "modern", "home", "style", "color",
]);

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

function usefulTitleTokens(value = "") {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter(
        (token) =>
          token.length >= 2 &&
          !TITLE_NOISE_WORDS.has(token)
      )
  );
}

function extractTitleNumbers(value = "") {
  return new Set(
    (normalizeText(value).match(/\b\d+(?:\.\d+)?\b/g) || [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  );
}

function titleHintCompatibility(resultTitle = "", titleHint = "") {
  const hint = String(titleHint || "").trim();
  if (!hint) return 0;

  const hintTokens = usefulTitleTokens(hint);
  const resultTokens = usefulTitleTokens(resultTitle);

  if (!hintTokens.size || !resultTokens.size) return 0;

  let matched = 0;
  for (const token of hintTokens) {
    if (resultTokens.has(token)) matched += 1;
  }

  const coverage = matched / hintTokens.size;

  const hintNumbers = extractTitleNumbers(hint);
  const resultNumbers = extractTitleNumbers(resultTitle);
  let numericBonus = 0;

  if (hintNumbers.size && resultNumbers.size) {
    const numberMatch = [...hintNumbers].some((value) => resultNumbers.has(value));
    numericBonus = numberMatch ? 0.12 : -0.08;
  }

  return Math.max(0, Math.min(1, coverage + numericBonus));
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

function normalizeMatch(match, index, titleHint = "") {
  const priceValue = extractPrice(match);
  const currency = extractCurrency(match);
  const images = normalizeImages(match);
  const titleHintScore = titleHintCompatibility(match.title || "", titleHint);
  const baseConfidence = confidenceFor(match, index);
  const confidence = Math.min(
    99,
    Math.round(baseConfidence + titleHintScore * 10)
  );

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
    confidence,
    titleHintScore,
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
      titleHintScore,
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

const BLOCKED_SOCIAL_HOSTS = [
  "tiktok.com",
  "pinterest.com",
  "pin.it",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
  "reddit.com",
];

const COMMERCIAL_STORE_ORDER = [
  "amazon",
  "homedepot",
  "walmart",
  "lowes",
  "target",
  "wayfair",
];

function normalizeSourceKey(result = {}) {
  const text = [
    result.source,
    result.title,
    result.url,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (text.includes("amazon")) return "amazon";
  if (text.includes("homedepot")) return "homedepot";
  if (text.includes("walmart")) return "walmart";
  if (text.includes("lowes") || text.includes("lowe")) return "lowes";
  if (text.includes("target")) return "target";
  if (text.includes("wayfair")) return "wayfair";

  return "other";
}

function isBlockedSocialResult(result = {}) {
  try {
    const hostname = new URL(result.url).hostname
      .toLowerCase()
      .replace(/^www\./, "");

    if (
      BLOCKED_SOCIAL_HOSTS.some(
        (host) =>
          hostname === host ||
          hostname.endsWith(`.${host}`)
      )
    ) {
      return true;
    }
  } catch {
    // Si no hay URL válida, todavía revisamos texto.
  }

  const text = [
    result.source,
    result.title,
    result.url,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return BLOCKED_SOCIAL_HOSTS.some((host) =>
    text.includes(host.replace(".com", ""))
  );
}

function preliminaryCompatibilityScore(result = {}) {
  const sourceKey = normalizeSourceKey(result);
  const position = Number(result.metadata?.position || 99);
  const confidence = Number(result.confidence || 0);
  const exact = result.exactImageMatch ? 1000 : 0;
  const commercialSource =
    sourceKey === "other" ? 0 : 150;
  const hasPrice = Number(result.price) > 0 ? 25 : 0;
  const initialImages = Array.isArray(result.images)
    ? Math.min(result.images.length, 4) * 8
    : 0;
  const titleHint = Number(result.titleHintScore || 0) * 320;

  return (
    exact +
    commercialSource +
    titleHint +
    confidence * 5 +
    hasPrice +
    initialImages -
    position
  );
}

function selectGalleryCandidates(results = [], limit = 8) {
  const selected = [];
  const selectedIds = new Set();

  function add(result) {
    if (!result || selectedIds.has(result.id)) return;
    selected.push(result);
    selectedIds.add(result.id);
  }

  const ordered = [...results].sort(
    (a, b) =>
      preliminaryCompatibilityScore(b) -
      preliminaryCompatibilityScore(a)
  );

  // Garantiza que las tiendas prioritarias compitan con galería enriquecida,
  // y dentro de cada tienda favorece la coincidencia con el título capturado.
  for (const store of COMMERCIAL_STORE_ORDER) {
    const candidate = ordered.find(
      (result) => normalizeSourceKey(result) === store
    );

    add(candidate);

    if (selected.length >= limit) return selected;
  }

  for (const result of ordered) {
    add(result);
    if (selected.length >= limit) break;
  }

  return selected;
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

  const { imageUrl, titleHint = "" } = req.body || {};

  if (!isValidPublicImageUrl(imageUrl)) {
    return sendJson(res, 400, {
      error: "Se requiere una URL pública HTTPS de la imagen.",
    });
  }

  const cleanTitleHint = String(titleHint || "").trim().slice(0, 300);

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

    const normalizedResults = visualMatches
      .slice(0, 30)
      .map((match, index) => normalizeMatch(match, index, cleanTitleHint))
      .filter((item) => item.url || item.images.length)
      .filter((item) => !isBlockedSocialResult(item));

    const galleryLimit = Math.max(
      1,
      Math.min(
        10,
        Number(process.env.ATLAS_GALLERY_LIMIT || 8)
      )
    );

    const candidatesForGallery =
      selectGalleryCandidates(
        normalizedResults,
        galleryLimit
      );

    const candidateIds = new Set(
      candidatesForGallery.map((result) => result.id)
    );

    const remainingResults = normalizedResults.filter(
      (result) => !candidateIds.has(result.id)
    );

    const enrichedCandidates = await Promise.all(
      candidatesForGallery.map(async (result) => {
        try {
          return await enrichResultWithGallery(result, {
            timeoutMs: 9000,
            maximum: 30,
          });
        } catch (error) {
          console.warn(
            `Atlas gallery warning for ${result.source || result.url}:`,
            error
          );

          return {
            ...result,
            galleryExtraction: {
              ok: false,
              count: 0,
              url: result.url || "",
              provider: "none",
              error:
                error instanceof Error
                  ? error.message
                  : "No se pudo extraer la galería.",
            },
          };
        }
      })
    );

    const results = [
      ...enrichedCandidates,
      ...remainingResults,
    ];

    return sendJson(res, 200, {
      ok: true,
      searchId: data.search_metadata?.id || null,
      imageUrl,
      titleHintUsed: Boolean(cleanTitleHint),
      titleHint: cleanTitleHint,
      galleryExtractionEnabled: true,
      galleryCandidateStrategy: cleanTitleHint
        ? "commercial-store-coverage-plus-title-hint"
        : "commercial-store-coverage",
      galleryCandidatesProcessed: candidatesForGallery.length,
      blockedSocialResults:
        visualMatches.length - normalizedResults.length,
      enrichedStores:
        candidatesForGallery.map(normalizeSourceKey),
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
