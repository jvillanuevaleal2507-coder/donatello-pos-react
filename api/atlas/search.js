import { enrichResultWithGallery } from "./galleryExtractor.js";
import { buildProductIdentity } from "./productIdentity.js";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

const TITLE_NOISE_WORDS = new Set([
  "new", "open", "box", "lot", "item", "return", "returns", "pallet",
  "the", "and", "for", "with", "from", "this", "that", "of", "to", "in",
  "de", "la", "el", "los", "las", "para", "con", "por",
  "set", "piece", "pieces", "pack", "pcs", "pc",
  "modern", "home", "style", "color",
]);

const BLOCKED_SOCIAL_HOSTS = [
  "tiktok.com", "pinterest.com", "pin.it", "facebook.com", "instagram.com",
  "youtube.com", "youtu.be", "x.com", "twitter.com", "reddit.com",
];

const COMMERCIAL_STORE_ORDER = [
  "amazon", "homedepot", "walmart", "lowes", "target", "wayfair",
];

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

function canonicalToken(token = "") {
  const value = normalizeText(token).replace(/[^a-z0-9.]/g, "");
  if (value.length > 5 && value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.length > 4 && value.endsWith("es")) return value.slice(0, -2);
  if (value.length > 4 && value.endsWith("s")) return value.slice(0, -1);
  return value;
}

function usefulTitleTokens(value = "") {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map(canonicalToken)
      .filter((token) => token.length >= 2 && !TITLE_NOISE_WORDS.has(token))
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
  for (const token of hintTokens) if (resultTokens.has(token)) matched += 1;

  const coverage = matched / hintTokens.size;
  const hintNumbers = extractTitleNumbers(hint);
  const resultNumbers = extractTitleNumbers(resultTitle);
  let numericBonus = 0;

  if (hintNumbers.size && resultNumbers.size) {
    const matchedNumbers = [...hintNumbers].filter((value) => resultNumbers.has(value)).length;
    numericBonus = matchedNumbers ? Math.min(0.18, matchedNumbers * 0.09) : -0.1;
  }

  return Math.max(0, Math.min(1, coverage + numericBonus));
}

function phraseCoverage(text = "", phrase = "") {
  const phraseTokens = [...usefulTitleTokens(phrase)];
  if (!phraseTokens.length) return 0;
  const textTokens = usefulTitleTokens(text);
  const matched = phraseTokens.filter((token) => textTokens.has(token)).length;
  return matched / phraseTokens.length;
}

function identityCompatibility(resultTitle = "", identity = {}) {
  if (!identity?.targetProduct && !identity?.productType && !identity?.brand && !identity?.model) {
    return { score: 0, conflict: false, reasons: [] };
  }

  const text = normalizeText(resultTitle);
  let score = 0;
  const reasons = [];

  const typeCandidates = [
    identity.productType,
    identity.targetProduct,
    ...(Array.isArray(identity.aliases) ? identity.aliases : []),
  ].filter(Boolean);

  let bestTypeCoverage = 0;
  for (const candidate of typeCandidates) {
    bestTypeCoverage = Math.max(bestTypeCoverage, phraseCoverage(text, candidate));
  }

  if (bestTypeCoverage >= 0.99) {
    score += 0.44;
    reasons.push("product-type-exact");
  } else if (bestTypeCoverage >= 0.66) {
    score += 0.34;
    reasons.push("product-type-strong");
  } else if (bestTypeCoverage >= 0.34) {
    score += 0.2;
    reasons.push("product-type-partial");
  }

  const brand = normalizeText(identity.brand || "");
  if (brand && text.includes(brand)) {
    score += 0.18;
    reasons.push("brand");
  }

  const model = normalizeText(identity.model || "");
  if (model && text.includes(model)) {
    score += 0.26;
    reasons.push("model");
  }

  const distinctiveTerms = Array.isArray(identity.distinctiveTerms)
    ? identity.distinctiveTerms.filter(Boolean)
    : [];
  if (distinctiveTerms.length) {
    const distinctiveCoverage = distinctiveTerms.reduce(
      (sum, term) => sum + Math.min(1, phraseCoverage(text, term)),
      0
    ) / distinctiveTerms.length;
    score += distinctiveCoverage * 0.18;
    if (distinctiveCoverage >= 0.5) reasons.push("distinctive");
  }

  const excluded = Array.isArray(identity.excludedObjects)
    ? identity.excludedObjects.filter(Boolean)
    : [];
  const excludedMatches = excluded.filter((term) => phraseCoverage(text, term) >= 0.8);

  const hasPrimarySignal = bestTypeCoverage >= 0.34 || Boolean(model && text.includes(model));
  const conflict = excludedMatches.length > 0 && !hasPrimarySignal;

  if (conflict) {
    score -= 0.5;
    reasons.push(`conflict:${excludedMatches.join(",")}`);
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    conflict,
    reasons,
  };
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
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
  return match.price?.currency || match.currency || match.product_currency || "USD";
}

function confidenceFor(match, index) {
  if (match.exact_matches === true) return 99;
  const position = Number(match.position || index + 1);
  return Math.max(55, 93 - (position - 1) * 3);
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

function normalizeMatch(match, index, {
  titleHint = "",
  identity = {},
  idPrefix = "lens",
  searchOrigin = "visual",
  searchQuery = "",
} = {}) {
  const priceValue = extractPrice(match);
  const currency = extractCurrency(match);
  const images = normalizeImages(match);
  const title = match.title || "Producto encontrado";
  const titleHintScore = titleHintCompatibility(title, titleHint);
  const semantic = identityCompatibility(title, identity);
  const baseConfidence = confidenceFor(match, index);
  const confidence = Math.min(
    99,
    Math.round(baseConfidence + titleHintScore * 5 + semantic.score * 8)
  );
  const titleHintUsed = Boolean(String(titleHint || "").trim());
  const identityUsed = Boolean(
    identity?.targetProduct || identity?.productType || identity?.brand || identity?.model
  );

  return {
    id: `${idPrefix}-${match.position || index + 1}`,
    source: match.source || match.store || match.merchant || "Otra fuente",
    title,
    url: match.link || match.product_link || "",
    price: priceValue,
    currency,
    priceLabel: match.price?.value || match.price?.displayed_price || match.price_string || "",
    confidence,
    titleHintScore,
    titleHintUsed,
    identityScore: semantic.score,
    identityUsed,
    semanticConflict: semantic.conflict,
    semanticReasons: semantic.reasons,
    searchOrigin,
    searchQuery,
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
      titleHintUsed,
      identityScore: semantic.score,
      identityUsed,
      semanticConflict: semantic.conflict,
      semanticReasons: semantic.reasons,
      searchOrigin,
      searchQuery,
      productIdentity: identityUsed ? identity : null,
      priceLabel: match.price?.value || match.price?.displayed_price || match.price_string || "",
      availability: match.availability || match.stock || "",
    },
    raw: match,
  };
}

function normalizeSourceKey(result = {}) {
  const text = [result.source, result.title, result.url]
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
    const hostname = new URL(result.url).hostname.toLowerCase().replace(/^www\./, "");
    if (BLOCKED_SOCIAL_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      return true;
    }
  } catch {}

  const text = [result.source, result.title, result.url].filter(Boolean).join(" ").toLowerCase();
  return BLOCKED_SOCIAL_HOSTS.some((host) => text.includes(host.replace(".com", "")));
}

function preliminaryCompatibilityScore(result = {}) {
  const sourceKey = normalizeSourceKey(result);
  const position = Number(result.metadata?.position || 99);
  const confidence = Number(result.confidence || 0);
  const exact = result.exactImageMatch ? 1000 : 0;
  const commercialSource = sourceKey === "other" ? 0 : 150;
  const hasPrice = Number(result.price) > 0 ? 25 : 0;
  const initialImages = Array.isArray(result.images) ? Math.min(result.images.length, 4) * 8 : 0;
  const titleHint = Number(result.titleHintScore || 0) * 600;
  const identity = Number(result.identityScore || 0) * 1200;
  const semanticConflict = result.semanticConflict ? -1600 : 0;
  const searchOrigin = result.searchOrigin === "visual" ? 0 : 90;

  return (
    exact +
    commercialSource +
    titleHint +
    identity +
    semanticConflict +
    searchOrigin +
    confidence * 5 +
    hasPrice +
    initialImages -
    position
  );
}

function mergeImages(a = [], b = []) {
  const seen = new Set();
  const output = [];

  for (const image of [...a, ...b]) {
    if (!image?.url || seen.has(image.url)) continue;
    seen.add(image.url);
    output.push(image);
  }

  return output;
}

function resultIdentityKey(result = {}) {
  const url = normalizeText(result.url || "");
  if (url) return `url:${url}`;
  return `title:${normalizeSourceKey(result)}|${normalizeText(result.title || "")}`;
}

function mergeDuplicateResults(results = []) {
  const byKey = new Map();

  for (const result of results) {
    const key = resultIdentityKey(result);
    if (!key) continue;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, result);
      continue;
    }

    const stronger = preliminaryCompatibilityScore(result) > preliminaryCompatibilityScore(existing)
      ? result
      : existing;
    const weaker = stronger === result ? existing : result;

    byKey.set(key, {
      ...weaker,
      ...stronger,
      exactImageMatch: Boolean(existing.exactImageMatch || result.exactImageMatch),
      confidence: Math.max(Number(existing.confidence || 0), Number(result.confidence || 0)),
      titleHintScore: Math.max(Number(existing.titleHintScore || 0), Number(result.titleHintScore || 0)),
      identityScore: Math.max(Number(existing.identityScore || 0), Number(result.identityScore || 0)),
      semanticConflict: Boolean(existing.semanticConflict && result.semanticConflict),
      searchOrigin:
        existing.searchOrigin !== result.searchOrigin ? "hybrid" : stronger.searchOrigin,
      images: mergeImages(existing.images, result.images),
      metadata: {
        ...weaker.metadata,
        ...stronger.metadata,
        titleHintScore: Math.max(
          Number(existing.metadata?.titleHintScore || 0),
          Number(result.metadata?.titleHintScore || 0)
        ),
        identityScore: Math.max(
          Number(existing.metadata?.identityScore || 0),
          Number(result.metadata?.identityScore || 0)
        ),
        semanticConflict: Boolean(existing.semanticConflict && result.semanticConflict),
        searchOrigin:
          existing.searchOrigin !== result.searchOrigin ? "hybrid" : stronger.searchOrigin,
      },
    });
  }

  return [...byKey.values()];
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
    (a, b) => preliminaryCompatibilityScore(b) - preliminaryCompatibilityScore(a)
  );

  const hasSemanticSignal = ordered.some(
    (result) => result.identityUsed || result.titleHintUsed
  );

  let pool = ordered;
  if (hasSemanticSignal) {
    const viable = ordered.filter(
      (result) =>
        !result.semanticConflict &&
        (
          Number(result.identityScore || 0) >= 0.32 ||
          Number(result.titleHintScore || 0) >= 0.22 ||
          result.exactImageMatch
        )
    );
    if (viable.length) pool = viable;
  }

  for (const store of COMMERCIAL_STORE_ORDER) {
    const candidate = pool.find((result) => normalizeSourceKey(result) === store);
    add(candidate);
    if (selected.length >= limit) return selected;
  }

  for (const result of pool) {
    add(result);
    if (selected.length >= limit) break;
  }

  return selected;
}

function buildSearchQueries(titleHint = "", identity = {}) {
  const candidates = [
    titleHint,
    ...(Array.isArray(identity.searchQueries) ? identity.searchQueries : []),
    [identity.brand, identity.model].filter(Boolean).join(" "),
    [identity.targetProduct, ...(identity.distinctiveTerms || []).slice(0, 2)]
      .filter(Boolean)
      .join(" "),
  ];

  const seen = new Set();
  const output = [];

  for (const candidate of candidates) {
    const clean = String(candidate || "").replace(/\s+/g, " ").trim().slice(0, 220);
    const key = normalizeText(clean);
    if (!clean || !key || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= 3) break;
  }

  return output;
}

async function fetchShoppingMatches(apiKey, query, queryIndex, titleHint, identity) {
  if (!query) return [];

  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    hl: "en",
    gl: "us",
    safe: "active",
    api_key: apiKey,
  });

  try {
    const response = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const data = await response.json();

    if (!response.ok || data.error) {
      console.warn("Atlas shopping search warning:", data.error || response.status);
      return [];
    }

    const matches = Array.isArray(data.shopping_results) ? data.shopping_results : [];

    return matches
      .slice(0, 20)
      .map((match, index) =>
        normalizeMatch(match, index, {
          titleHint,
          identity,
          idPrefix: `shop${queryIndex}`,
          searchOrigin: "identity",
          searchQuery: query,
        })
      )
      .filter((item) => item.url || item.images.length)
      .filter((item) => !isBlockedSocialResult(item));
  } catch (error) {
    console.warn("Atlas shopping search warning:", error);
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return sendJson(res, 500, {
      error: "Falta configurar SERPAPI_KEY en las variables de entorno de Vercel.",
    });
  }

  const { imageUrl, titleHint = "" } = req.body || {};
  if (!isValidPublicImageUrl(imageUrl)) {
    return sendJson(res, 400, { error: "Se requiere una URL pública HTTPS de la imagen." });
  }

  const cleanTitleHint = String(titleHint || "").trim().slice(0, 300);

  try {
    const lensParams = new URLSearchParams({
      engine: "google_lens",
      type: "visual_matches",
      url: imageUrl,
      hl: "en",
      country: "us",
      safe: "active",
      auto_crop: "false",
      api_key: apiKey,
    });

    const lensPromise = fetch(`${SERPAPI_ENDPOINT}?${lensParams.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const identity = await buildProductIdentity({
      imageUrl,
      titleHint: cleanTitleHint,
    });

    const searchQueries = buildSearchQueries(cleanTitleHint, identity);
    const shoppingPromise = Promise.all(
      searchQueries.map((query, index) =>
        fetchShoppingMatches(apiKey, query, index + 1, cleanTitleHint, identity)
      )
    );

    const [visualResponse, shoppingGroups] = await Promise.all([
      lensPromise,
      shoppingPromise,
    ]);

    const data = await visualResponse.json();
    if (!visualResponse.ok || data.error) {
      return sendJson(res, visualResponse.status || 502, {
        error: data.error || "SerpApi no pudo completar la búsqueda visual.",
      });
    }

    const visualMatches = Array.isArray(data.visual_matches) ? data.visual_matches : [];
    const normalizedVisual = visualMatches
      .slice(0, 35)
      .map((match, index) =>
        normalizeMatch(match, index, {
          titleHint: cleanTitleHint,
          identity,
          idPrefix: "lens",
          searchOrigin: "visual",
        })
      )
      .filter((item) => item.url || item.images.length)
      .filter((item) => !isBlockedSocialResult(item));

    const shoppingMatches = shoppingGroups.flat();
    const normalizedResults = mergeDuplicateResults([
      ...shoppingMatches,
      ...normalizedVisual,
    ]);

    const galleryLimit = Math.max(
      1,
      Math.min(10, Number(process.env.ATLAS_GALLERY_LIMIT || 8))
    );
    const candidatesForGallery = selectGalleryCandidates(normalizedResults, galleryLimit);
    const candidateIds = new Set(candidatesForGallery.map((result) => result.id));
    const remainingResults = normalizedResults.filter((result) => !candidateIds.has(result.id));

    const enrichedCandidates = await Promise.all(
      candidatesForGallery.map(async (result) => {
        try {
          if (!result.url) return result;
          return await enrichResultWithGallery(result, { timeoutMs: 9000, maximum: 30 });
        } catch (error) {
          console.warn(`Atlas gallery warning for ${result.source || result.url}:`, error);
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

    const results = [...enrichedCandidates, ...remainingResults].sort(
      (a, b) => preliminaryCompatibilityScore(b) - preliminaryCompatibilityScore(a)
    );

    return sendJson(res, 200, {
      ok: true,
      searchId: data.search_metadata?.id || null,
      imageUrl,
      titleHintUsed: Boolean(cleanTitleHint),
      titleHint: cleanTitleHint,
      identity,
      identityUsed: Boolean(identity?.targetProduct || identity?.productType),
      searchQueries,
      shoppingSearchResults: shoppingMatches.length,
      visualSearchResults: normalizedVisual.length,
      galleryExtractionEnabled: true,
      galleryCandidateStrategy: "ai-identity-plus-visual-validation",
      galleryCandidatesProcessed: candidatesForGallery.length,
      blockedSocialResults: Math.max(0, visualMatches.length - normalizedVisual.length),
      enrichedStores: candidatesForGallery.map(normalizeSourceKey),
      results,
    });
  } catch (error) {
    console.error("Atlas API error:", error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Error inesperado en Atlas API.",
    });
  }
}
