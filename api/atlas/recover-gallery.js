import { extractGalleryFromUrl } from "./galleryExtractor.js";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_IMAGE_POOL = 48;
const MAX_ACCEPTED = 8;
const VALIDATION_BATCH_SIZE = 8;
const TARGET_RECOVERED = 6;

function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function publicHttps(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || !url.hostname) return "";
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    ) {
      return "";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return "";
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function preferredDomain(value = "") {
  const text = normalizeText(value).replace(/\s+/g, "");
  if (text.includes("garvee")) return "garvee.com";
  if (text.includes("walmart")) return "walmart.com";
  if (text.includes("amazon")) return "amazon.com";
  if (text.includes("homedepot")) return "homedepot.com";
  if (text.includes("lowes") || text.includes("lowe")) return "lowes.com";
  if (text.includes("target")) return "target.com";
  if (text.includes("wayfair")) return "wayfair.com";
  return "";
}

function firstIdentifier(identity = null, productMetadata = null) {
  const values = [
    identity?.model,
    productMetadata?.sku,
    ...(Array.isArray(productMetadata?.skus) ? productMetadata.skus : []),
    productMetadata?.barcode,
    ...(Array.isArray(productMetadata?.barcodes) ? productMetadata.barcodes : []),
  ]
    .map((value) => String(value || "").trim())
    .filter((value) => value.length >= 4);

  return unique(values)[0] || "";
}

function buildQueries({
  targetTitle = "",
  titleHint = "",
  identity = null,
  preferredSource = "",
  productMetadata = null,
} = {}) {
  const brand = String(identity?.brand || productMetadata?.vendor || "").trim();
  const model = firstIdentifier(identity, productMetadata);
  const productType = String(
    identity?.targetProduct || identity?.productType || productMetadata?.type || ""
  ).trim();
  const distinctive = Array.isArray(identity?.distinctiveTerms)
    ? identity.distinctiveTerms.filter(Boolean).slice(0, 3).join(" ")
    : "";
  const domain = preferredDomain(preferredSource);
  const primary = String(titleHint || targetTitle || productMetadata?.title || "").trim();

  const queries = [
    model && brand ? `"${model}" ${brand}` : "",
    model ? `"${model}"` : "",
    domain && primary ? `${primary} site:${domain}` : "",
    [brand, primary].filter(Boolean).join(" "),
    [brand, productType, distinctive].filter(Boolean).join(" "),
    String(targetTitle || productMetadata?.title || "").trim(),
  ]
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 6);

  return unique(queries).slice(0, 4);
}

function blockedHost(url = "") {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return [
      "pinterest.com",
      "pin.it",
      "facebook.com",
      "instagram.com",
      "tiktok.com",
      "youtube.com",
      "reddit.com",
      "x.com",
      "twitter.com",
    ].some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return true;
  }
}

function imageIdentity(value = "") {
  try {
    const url = new URL(value);
    const filename = url.pathname.split("/").filter(Boolean).pop()?.toLowerCase() || "";
    return filename
      .replace(/[-_](thumb|thumbnail|small|medium|large|preview|zoom|main|hero)/g, "")
      .replace(/[-_]\d+x\d+/g, "")
      .replace(/\.(jpe?g|png|webp|avif)$/i, "")
      .replace(/[^a-z0-9]/g, "");
  } catch {
    return normalizeText(value);
  }
}

function uniqueImages(images = []) {
  const seenUrls = new Set();
  const seenIdentities = new Set();
  const output = [];

  for (const image of images) {
    const url = publicHttps(typeof image === "string" ? image : image?.url || image?.link);
    if (!url || seenUrls.has(url)) continue;
    const identity = imageIdentity(url);
    if (identity && seenIdentities.has(identity)) continue;
    seenUrls.add(url);
    if (identity) seenIdentities.add(identity);
    output.push(typeof image === "string" ? { url } : { ...image, url });
  }

  return output;
}

function tokenSet(value = "") {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !["the", "and", "for", "with", "from", "table", "mesa"].includes(token))
  );
}

function tokenSimilarity(a = "", b = "") {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / Math.max(left.size, right.size);
}

async function fetchSerpImages(query, apiKey) {
  const params = new URLSearchParams({
    engine: "google_images",
    q: query,
    gl: "us",
    hl: "en",
    safe: "active",
    api_key: apiKey,
  });

  const response = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `SerpApi Images respondió HTTP ${response.status}.`);
  }

  return Array.isArray(data.images_results) ? data.images_results : [];
}

async function fetchSerpWeb(query, apiKey) {
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    gl: "us",
    hl: "en",
    num: "10",
    api_key: apiKey,
  });

  const response = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `SerpApi Web respondió HTTP ${response.status}.`);
  }

  return Array.isArray(data.organic_results) ? data.organic_results : [];
}

function scoreProductPage(result = {}, context = {}) {
  const link = publicHttps(result?.link || "");
  if (!link || blockedHost(link)) return -10000;

  const title = String(result?.title || "");
  const snippet = String(result?.snippet || "");
  const combined = `${title} ${snippet} ${link}`;
  const primary = String(context.titleHint || context.targetTitle || context.productMetadata?.title || "");
  const brand = String(context.identity?.brand || context.productMetadata?.vendor || "").trim();
  const identifier = firstIdentifier(context.identity, context.productMetadata);

  let score = tokenSimilarity(primary, combined) * 260;
  if (brand && normalizeText(combined).includes(normalizeText(brand))) score += 90;
  if (identifier && normalizeText(combined).includes(normalizeText(identifier))) score += 420;
  if (/\/products?\/|\/ip\/|\/pd\/|\/p\/|\/product\//i.test(new URL(link).pathname)) score += 80;
  if (/garvee|walmart|homedepot|lowes|target|wayfair|nfm|amazon/i.test(new URL(link).hostname)) score += 45;
  if (preferredDomain(context.preferredSource) && new URL(link).hostname.includes(preferredDomain(context.preferredSource))) score += 35;
  return score;
}

async function discoverProductPages({
  queries = [],
  apiKey,
  productUrl = "",
  context = {},
} = {}) {
  const webQueries = queries.slice(0, 2);
  const groups = await Promise.all(
    webQueries.map(async (query) => {
      try {
        return { query, results: await fetchSerpWeb(query, apiKey), error: "" };
      } catch (error) {
        return { query, results: [], error: error instanceof Error ? error.message : "Falló búsqueda web." };
      }
    })
  );

  const seen = new Set([publicHttps(productUrl)].filter(Boolean));
  const pages = [];
  for (const group of groups) {
    for (const result of group.results) {
      const link = publicHttps(result?.link || "");
      if (!link || seen.has(link) || blockedHost(link)) continue;
      seen.add(link);
      const score = scoreProductPage(result, context);
      if (score < 115) continue;
      pages.push({
        url: link,
        title: String(result?.title || ""),
        snippet: String(result?.snippet || ""),
        source: String(result?.source || ""),
        query: group.query,
        score,
      });
    }
  }

  pages.sort((a, b) => b.score - a.score);
  const selected = pages.slice(0, 3);

  const extracted = await Promise.all(
    selected.map(async (page) => {
      try {
        const gallery = await extractGalleryFromUrl({
          url: page.url,
          timeoutMs: 6000,
          maximum: 24,
        });
        return {
          ...page,
          ok: Boolean(gallery.ok),
          provider: gallery.providerUsed || gallery.provider || "generic",
          images: Array.isArray(gallery.images) ? gallery.images : [],
          metadata: gallery.metadata || null,
          error: gallery.error || "",
        };
      } catch (error) {
        return {
          ...page,
          ok: false,
          provider: "none",
          images: [],
          metadata: null,
          error: error instanceof Error ? error.message : "No se pudo extraer página descubierta.",
        };
      }
    })
  );

  return {
    groups,
    pages: extracted,
  };
}

function addCandidate(output, seenUrls, seenIdentities, candidate = {}) {
  if (output.length >= MAX_IMAGE_POOL) return;
  const url = publicHttps(candidate.url);
  if (!url || blockedHost(url) || seenUrls.has(url)) return;
  const identity = imageIdentity(url);
  if (identity && seenIdentities.has(identity)) return;

  seenUrls.add(url);
  if (identity) seenIdentities.add(identity);
  output.push({
    index: output.length,
    url,
    title: String(candidate.title || "").slice(0, 300),
    source: String(candidate.source || "").slice(0, 160),
    pageUrl: publicHttps(candidate.pageUrl || ""),
    query: String(candidate.query || ""),
    width: Number(candidate.width || 0) || null,
    height: Number(candidate.height || 0) || null,
    originalType: candidate.originalType || "other",
    trust: candidate.trust || "search-image",
    provider: candidate.provider || "",
  });
}

function collectImageCandidates({
  imageGroups = [],
  directGallery = [],
  directProvider = "generic",
  discoveredPages = [],
  existingUrls = [],
  preferredSource = "",
  productUrl = "",
} = {}) {
  const seenUrls = new Set(existingUrls.map(publicHttps).filter(Boolean));
  const seenIdentities = new Set(existingUrls.map(imageIdentity).filter(Boolean));
  const output = [];

  for (const image of directGallery) {
    addCandidate(output, seenUrls, seenIdentities, {
      url: typeof image === "string" ? image : image?.url || image?.link,
      title: typeof image === "string" ? "" : image?.alt || "",
      source: preferredSource || "direct-product-gallery",
      pageUrl: productUrl,
      query: "direct-product-gallery",
      width: typeof image === "string" ? null : image?.width,
      height: typeof image === "string" ? null : image?.height,
      originalType: typeof image === "string" ? "other" : image?.type || "other",
      trust: directProvider === "generic" ? "direct-generic" : "trusted-product-page",
      provider: directProvider,
    });
  }

  for (const page of discoveredPages) {
    for (const image of page.images || []) {
      addCandidate(output, seenUrls, seenIdentities, {
        url: typeof image === "string" ? image : image?.url || image?.link,
        title: typeof image === "string" ? page.title : image?.alt || page.title,
        source: page.source || page.provider || "discovered-product-page",
        pageUrl: page.url,
        query: `product-page:${page.query}`,
        width: typeof image === "string" ? null : image?.width,
        height: typeof image === "string" ? null : image?.height,
        originalType: typeof image === "string" ? "other" : image?.type || "other",
        trust: page.provider === "generic" ? "discovered-generic" : "trusted-product-page",
        provider: page.provider,
      });
    }
  }

  for (const group of imageGroups) {
    for (const item of group.results || []) {
      addCandidate(output, seenUrls, seenIdentities, {
        url: item.original || item.image || item.thumbnail || "",
        title: item.title || "",
        source: item.source || "",
        pageUrl: item.link || "",
        query: group.query,
        width: item.original_width || item.width,
        height: item.original_height || item.height,
        trust: "search-image",
        provider: "google-images",
      });
    }
  }

  return output.slice(0, MAX_IMAGE_POOL);
}

function structuredGalleryCanBypass(diagnostics = {}) {
  const metadata = diagnostics?.metadata || null;
  return Boolean(
    diagnostics?.provider === "shopify" &&
    metadata?.exactProductGallery === true &&
    Number(metadata?.variantCount) === 1 &&
    Number(diagnostics?.count || 0) >= 2
  );
}

function structuredImages(images = [], preferredSource = "", productUrl = "") {
  return uniqueImages(images)
    .slice(0, MAX_ACCEPTED)
    .map((image, index) => ({
      ...image,
      type: image.type || (index === 0 ? "main" : "other"),
      source: preferredSource || image.source || "structured-product-gallery",
      pageUrl: productUrl,
      atlasRecovered: true,
      atlasValidationConfidence: 1,
      atlasValidationOrigin: "structured-product-api",
      duplicateGroup: index + 1000,
    }));
}

function clamp01(value) {
  const number = Number(value || 0);
  return Math.max(0, Math.min(1, Number.isFinite(number) ? number : 0));
}

function thresholdForCandidate(candidate = {}) {
  if (candidate.trust === "trusted-product-page") return 0.58;
  if (candidate.trust === "direct-generic" || candidate.trust === "discovered-generic") return 0.68;
  return 0.78;
}

async function validateCandidates({
  candidates,
  referenceImageUrl,
  targetTitle,
  titleHint,
  identity,
  productMetadata,
  openAiKey,
}) {
  if (!candidates.length) return [];

  const identityText = identity && typeof identity === "object"
    ? JSON.stringify({
        targetProduct: identity.targetProduct || "",
        productType: identity.productType || "",
        brand: identity.brand || "",
        model: identity.model || productMetadata?.sku || "",
        distinctiveTerms: Array.isArray(identity.distinctiveTerms)
          ? identity.distinctiveTerms
          : [],
      })
    : JSON.stringify({
        brand: productMetadata?.vendor || "",
        model: productMetadata?.sku || "",
        title: productMetadata?.title || "",
      });

  const content = [
    {
      type: "input_text",
      text: `Eres el recuperador visual de catálogo de Ventas Donatello. Debes seleccionar fotografías DIFERENTES del MISMO producto objetivo.\n\nProducto objetivo:\n- Título elegido: ${String(targetTitle || productMetadata?.title || "").slice(0, 300)}\n- Título de subasta: ${String(titleHint || "").slice(0, 300) || "No proporcionado"}\n- Identidad Atlas: ${identityText}\n\nJerarquía de evidencia:\n1. La foto de referencia y un SKU/modelo explícito son las señales más fuertes.\n2. Una candidata marcada TRUST=trusted-product-page viene de la galería de una página de producto concreta y debe considerarse evidencia fuerte; acepta ángulos, ambientes, infografías de medidas y vistas funcionales aunque se vean muy distintas a la foto principal, salvo que exista una contradicción clara de color, estructura, tamaño o variante.\n3. Una candidata TRUST=search-image proviene de búsqueda abierta y debe superar un estándar visual mucho más estricto.\n\nReglas:\n- Rechaza categorías u objetos diferentes.\n- Diferentes ángulos del mismo producto son válidos y deseables.\n- Infografías que muestran cajones, mecanismos o medidas del mismo producto son válidas.\n- Una escena de ambiente es válida si el producto objetivo está claramente presente.\n- Marca duplicados visuales con el mismo duplicateGroup; no agrupes ángulos distintos como duplicados.\n- Clasifica como main, measurements, environment, detail u other.`,
    },
  ];

  const reference = publicHttps(referenceImageUrl);
  if (reference) {
    content.push({ type: "input_text", text: "FOTO DE REFERENCIA DEL PRODUCTO:" });
    content.push({ type: "input_image", image_url: reference, detail: "high" });
  }

  for (const candidate of candidates) {
    content.push({
      type: "input_text",
      text: `CANDIDATA #${candidate.index}\nTRUST=${candidate.trust}\nProveedor=${candidate.provider}\nTítulo=${candidate.title}\nFuente=${candidate.source}\nConsulta=${candidate.query}\nTipo previo=${candidate.originalType || "other"}`,
    });
    content.push({
      type: "input_image",
      image_url: candidate.url,
      detail: candidate.trust === "search-image" ? "low" : "high",
    });
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6",
      reasoning: { effort: "low" },
      max_output_tokens: 1400,
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "donatello_gallery_recovery_v2",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    index: { type: "integer" },
                    matchesTarget: { type: "boolean" },
                    confidence: { type: "number" },
                    type: {
                      type: "string",
                      enum: ["main", "measurements", "environment", "detail", "other"],
                    },
                    duplicateGroup: { type: "integer" },
                    reason: { type: "string" },
                  },
                  required: ["index", "matchesTarget", "confidence", "type", "duplicateGroup", "reason"],
                },
              },
            },
            required: ["items"],
          },
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "OpenAI no pudo recuperar la galería.");
  }

  const text = extractOutputText(data);
  if (!text) throw new Error("El recuperador visual no devolvió datos utilizables.");

  const parsed = JSON.parse(text);
  const validIndexes = new Set(candidates.map((item) => item.index));
  const normalized = (Array.isArray(parsed.items) ? parsed.items : [])
    .filter((item) => validIndexes.has(Number(item.index)))
    .map((item) => ({
      index: Number(item.index),
      matchesTarget: Boolean(item.matchesTarget),
      confidence: clamp01(item.confidence),
      type: item.type || "other",
      duplicateGroup: Number(item.duplicateGroup || 0),
      reason: String(item.reason || "").slice(0, 220),
    }));

  const accepted = [];
  const seenGroups = new Set();
  for (const item of normalized.sort((a, b) => b.confidence - a.confidence)) {
    const candidate = candidates.find((entry) => entry.index === item.index);
    if (!candidate || !item.matchesTarget || item.confidence < thresholdForCandidate(candidate)) continue;
    const group = item.duplicateGroup > 0 ? item.duplicateGroup : item.index + 1000;
    if (seenGroups.has(group)) continue;
    seenGroups.add(group);

    accepted.push({
      url: candidate.url,
      type: item.type || candidate.originalType || "other",
      alt: candidate.title || targetTitle || titleHint || "",
      source: candidate.source || "atlas-recovery",
      pageUrl: candidate.pageUrl || "",
      width: candidate.width,
      height: candidate.height,
      atlasRecovered: true,
      atlasValidationConfidence: item.confidence,
      atlasValidationOrigin: candidate.trust,
      duplicateGroup: group,
    });
  }

  return accepted;
}

async function validateInBatches(options = {}) {
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  let recovered = [];
  let batches = 0;

  for (let start = 0; start < candidates.length && recovered.length < TARGET_RECOVERED; start += VALIDATION_BATCH_SIZE) {
    const batch = candidates.slice(start, start + VALIDATION_BATCH_SIZE);
    if (!batch.length) break;
    batches += 1;
    const accepted = await validateCandidates({ ...options, candidates: batch });
    recovered = uniqueImages([...recovered, ...accepted]);
  }

  return { recovered: recovered.slice(0, MAX_ACCEPTED), batches };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }

  const serpApiKey = process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!serpApiKey || !openAiKey) {
    return sendJson(res, 500, {
      error: "Falta configurar SERPAPI_KEY u OPENAI_API_KEY en Vercel.",
    });
  }

  const {
    targetTitle = "",
    titleHint = "",
    identity = null,
    referenceImageUrl = "",
    preferredSource = "",
    productUrl = "",
    existingUrls = [],
  } = req.body || {};

  let directGallery = [];
  let directGalleryDiagnostics = {
    attempted: false,
    ok: false,
    provider: "none",
    count: 0,
    metadata: null,
    error: "",
  };

  const safeProductUrl = publicHttps(productUrl);
  if (safeProductUrl) {
    directGalleryDiagnostics.attempted = true;
    try {
      const gallery = await extractGalleryFromUrl({
        url: safeProductUrl,
        timeoutMs: 9000,
        maximum: 40,
      });
      directGallery = Array.isArray(gallery.images) ? gallery.images : [];
      directGalleryDiagnostics = {
        attempted: true,
        ok: Boolean(gallery.ok),
        provider: gallery.providerUsed || gallery.provider || "generic",
        count: directGallery.length,
        metadata: gallery.metadata || null,
        error: gallery.error || "",
      };
    } catch (error) {
      directGalleryDiagnostics = {
        attempted: true,
        ok: false,
        provider: "none",
        count: 0,
        metadata: null,
        error: error instanceof Error ? error.message : "No se pudo leer la tienda.",
      };
    }
  }

  const existing = Array.isArray(existingUrls) ? existingUrls : [];
  if (structuredGalleryCanBypass(directGalleryDiagnostics)) {
    const recovered = structuredImages(directGallery, preferredSource, safeProductUrl)
      .filter((image) => !existing.includes(image.url));

    console.log("Atlas gallery recovery structured", {
      preferredSource,
      productHost: safeProductUrl ? new URL(safeProductUrl).hostname : "",
      provider: directGalleryDiagnostics.provider,
      directCount: directGalleryDiagnostics.count,
      variantCount: directGalleryDiagnostics.metadata?.variantCount,
      recoveredCount: recovered.length,
      sku: directGalleryDiagnostics.metadata?.sku || "",
    });

    return sendJson(res, 200, {
      ok: true,
      recovered,
      queries: [],
      candidateCount: directGalleryDiagnostics.count,
      directGallery: directGalleryDiagnostics,
      strategy: "structured-product-api",
      validationBatches: 0,
    });
  }

  const queries = buildQueries({
    targetTitle,
    titleHint,
    identity,
    preferredSource,
    productMetadata: directGalleryDiagnostics.metadata,
  });

  if (!queries.length && !directGallery.length) {
    return sendJson(res, 200, {
      ok: true,
      recovered: [],
      queries: [],
      candidateCount: 0,
      directGallery: directGalleryDiagnostics,
      strategy: "no-candidates",
    });
  }

  try {
    const imageGroupsPromise = Promise.all(
      queries.slice(0, 3).map(async (query) => {
        try {
          return { query, results: await fetchSerpImages(query, serpApiKey), error: "" };
        } catch (error) {
          return { query, results: [], error: error instanceof Error ? error.message : "Falló Google Images." };
        }
      })
    );

    const discoveryPromise = discoverProductPages({
      queries,
      apiKey: serpApiKey,
      productUrl: safeProductUrl,
      context: {
        targetTitle,
        titleHint,
        identity,
        productMetadata: directGalleryDiagnostics.metadata,
        preferredSource,
      },
    });

    const [imageGroups, discovery] = await Promise.all([imageGroupsPromise, discoveryPromise]);

    const candidates = collectImageCandidates({
      imageGroups,
      directGallery,
      directProvider: directGalleryDiagnostics.provider,
      discoveredPages: discovery.pages.filter((page) => page.ok && page.images.length),
      existingUrls: existing,
      preferredSource,
      productUrl: safeProductUrl,
    });

    const validation = await validateInBatches({
      candidates,
      referenceImageUrl,
      targetTitle,
      titleHint,
      identity,
      productMetadata: directGalleryDiagnostics.metadata,
      openAiKey,
    });

    const recovered = validation.recovered;
    const discoveredSummary = discovery.pages.map((page) => ({
      host: (() => {
        try { return new URL(page.url).hostname; } catch { return ""; }
      })(),
      provider: page.provider,
      count: page.images.length,
      score: Math.round(page.score),
      ok: page.ok,
      error: page.error || "",
    }));

    console.log("Atlas gallery recovery v2", {
      preferredSource,
      productHost: (() => {
        try { return safeProductUrl ? new URL(safeProductUrl).hostname : ""; } catch { return ""; }
      })(),
      directGallery: directGalleryDiagnostics,
      queries,
      imageSearchCount: imageGroups.reduce((sum, group) => sum + group.results.length, 0),
      imageQueryErrors: imageGroups.filter((group) => group.error).map((group) => group.error),
      discoveredPages: discoveredSummary,
      webQueryErrors: discovery.groups.filter((group) => group.error).map((group) => group.error),
      candidateCount: candidates.length,
      validationBatches: validation.batches,
      recoveredCount: recovered.length,
    });

    return sendJson(res, 200, {
      ok: true,
      recovered,
      queries,
      candidateCount: candidates.length,
      directGallery: directGalleryDiagnostics,
      strategy: "structured-plus-product-page-discovery",
      validationBatches: validation.batches,
      discoveredPages: discoveredSummary,
      searchDiagnostics: {
        imageCount: imageGroups.reduce((sum, group) => sum + group.results.length, 0),
        imageQueryErrors: imageGroups.filter((group) => group.error).map((group) => group.error),
        webQueryErrors: discovery.groups.filter((group) => group.error).map((group) => group.error),
      },
    });
  } catch (error) {
    console.error("Atlas gallery recovery v2 error:", error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : "No se pudo recuperar la galería.",
      directGallery: directGalleryDiagnostics,
    });
  }
}
