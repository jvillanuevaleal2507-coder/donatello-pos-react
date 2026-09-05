const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_SEARCH_RESULTS = 18;
const MAX_ACCEPTED = 8;

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

function buildQueries({ targetTitle = "", titleHint = "", identity = null } = {}) {
  const brand = String(identity?.brand || "").trim();
  const model = String(identity?.model || "").trim();
  const productType = String(
    identity?.targetProduct || identity?.productType || ""
  ).trim();
  const distinctive = Array.isArray(identity?.distinctiveTerms)
    ? identity.distinctiveTerms.filter(Boolean).slice(0, 3).join(" ")
    : "";

  const queries = [
    String(titleHint || "").trim(),
    [brand, model, productType].filter(Boolean).join(" "),
    [brand, productType, distinctive].filter(Boolean).join(" "),
    String(targetTitle || "").trim(),
  ]
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 6);

  return unique(queries).slice(0, 3);
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

async function fetchSerpApi(query, apiKey) {
  const params = new URLSearchParams({
    engine: "google_images",
    q: query,
    gl: "us",
    hl: "en",
    api_key: apiKey,
  });

  const response = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `SerpApi respondió HTTP ${response.status}.`);
  }
  return Array.isArray(data.images_results) ? data.images_results : [];
}

function collectImageCandidates(groups = [], existingUrls = []) {
  const existing = new Set(existingUrls.map(publicHttps).filter(Boolean));
  const seenUrls = new Set(existing);
  const seenIdentities = new Set();
  const output = [];

  for (const group of groups) {
    for (const item of group.results || []) {
      const url = publicHttps(item.original || item.image || item.thumbnail || "");
      if (!url || blockedHost(url) || seenUrls.has(url)) continue;

      const identity = imageIdentity(url);
      if (identity && seenIdentities.has(identity)) continue;

      seenUrls.add(url);
      if (identity) seenIdentities.add(identity);

      output.push({
        index: output.length,
        url,
        title: String(item.title || "").slice(0, 300),
        source: String(item.source || "").slice(0, 160),
        pageUrl: publicHttps(item.link || ""),
        query: group.query,
        width: Number(item.original_width || item.width || 0) || null,
        height: Number(item.original_height || item.height || 0) || null,
      });

      if (output.length >= MAX_SEARCH_RESULTS) return output;
    }
  }

  return output;
}

function clamp01(value) {
  const number = Number(value || 0);
  return Math.max(0, Math.min(1, Number.isFinite(number) ? number : 0));
}

async function validateCandidates({
  candidates,
  referenceImageUrl,
  targetTitle,
  titleHint,
  identity,
  openAiKey,
}) {
  if (!candidates.length) return [];

  const identityText = identity && typeof identity === "object"
    ? JSON.stringify({
        targetProduct: identity.targetProduct || "",
        productType: identity.productType || "",
        brand: identity.brand || "",
        model: identity.model || "",
        distinctiveTerms: Array.isArray(identity.distinctiveTerms)
          ? identity.distinctiveTerms
          : [],
      })
    : "No disponible";

  const content = [
    {
      type: "input_text",
      text: `Eres el recuperador visual de catálogo de Ventas Donatello. Debes encontrar fotografías DIFERENTES del MISMO producto objetivo.\n\nProducto objetivo:\n- Título elegido: ${String(targetTitle || "").slice(0, 300)}\n- Título de subasta: ${String(titleHint || "").slice(0, 300) || "No proporcionado"}\n- Identidad Atlas: ${identityText}\n\nReglas:\n- Compara visualmente cada candidata con la FOTO DE REFERENCIA y con la identidad textual.\n- Acepta solo el mismo producto o la misma variante exacta.\n- Rechaza otro color, tamaño, estructura, número de patas/cajones/puertas, accesorios o productos parecidos pero distintos.\n- Una escena de ambiente se acepta solo si el producto objetivo aparece claramente.\n- Una imagen de medidas se acepta solo si las medidas corresponden al mismo producto.\n- Si dos candidatas son esencialmente la misma fotografía (aunque cambie recorte, resolución, fondo o compresión), asígnales el mismo duplicateGroup.\n- Clasifica cada candidata como main, measurements, environment, detail u other.\n- Es preferible regresar menos imágenes antes que contaminar la galería.`,
    },
  ];

  const reference = publicHttps(referenceImageUrl);
  if (reference) {
    content.push({ type: "input_text", text: "FOTO DE REFERENCIA DEL PRODUCTO:" });
    content.push({ type: "input_image", image_url: reference, detail: "low" });
  }

  for (const candidate of candidates) {
    content.push({
      type: "input_text",
      text: `CANDIDATA #${candidate.index}\nTítulo: ${candidate.title}\nFuente: ${candidate.source}\nConsulta: ${candidate.query}`,
    });
    content.push({
      type: "input_image",
      image_url: candidate.url,
      detail: "low",
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
          name: "donatello_gallery_recovery",
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
                  required: [
                    "index",
                    "matchesTarget",
                    "confidence",
                    "type",
                    "duplicateGroup",
                    "reason",
                  ],
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
  const accepted = (Array.isArray(parsed.items) ? parsed.items : [])
    .filter((item) => validIndexes.has(Number(item.index)))
    .map((item) => ({
      index: Number(item.index),
      matchesTarget: Boolean(item.matchesTarget),
      confidence: clamp01(item.confidence),
      type: item.type || "other",
      duplicateGroup: Number(item.duplicateGroup || 0),
      reason: String(item.reason || "").slice(0, 220),
    }))
    .filter((item) => item.matchesTarget && item.confidence >= 0.74)
    .sort((a, b) => b.confidence - a.confidence);

  const seenGroups = new Set();
  const output = [];
  for (const item of accepted) {
    const group = item.duplicateGroup > 0 ? item.duplicateGroup : item.index + 1000;
    if (seenGroups.has(group)) continue;
    seenGroups.add(group);

    const candidate = candidates.find((entry) => entry.index === item.index);
    if (!candidate) continue;

    output.push({
      url: candidate.url,
      type: item.type,
      alt: candidate.title || targetTitle || titleHint || "",
      source: candidate.source || "atlas-recovery",
      pageUrl: candidate.pageUrl || "",
      width: candidate.width,
      height: candidate.height,
      atlasRecovered: true,
      atlasValidationConfidence: item.confidence,
      duplicateGroup: group,
    });

    if (output.length >= MAX_ACCEPTED) break;
  }

  return output;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }

  const serpApiKey = process.env.SERPAPI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!serpApiKey || !openAiKey) {
    return sendJson(res, 500, {
      error: "Falta configurar SERPAPI_API_KEY u OPENAI_API_KEY en Vercel.",
    });
  }

  const {
    targetTitle = "",
    titleHint = "",
    identity = null,
    referenceImageUrl = "",
    existingUrls = [],
  } = req.body || {};

  const queries = buildQueries({ targetTitle, titleHint, identity });
  if (!queries.length) {
    return sendJson(res, 200, {
      ok: true,
      recovered: [],
      queries: [],
      candidateCount: 0,
    });
  }

  try {
    const groups = await Promise.all(
      queries.map(async (query) => ({
        query,
        results: await fetchSerpApi(query, serpApiKey),
      }))
    );

    const candidates = collectImageCandidates(
      groups,
      Array.isArray(existingUrls) ? existingUrls : []
    );

    const recovered = await validateCandidates({
      candidates,
      referenceImageUrl,
      targetTitle,
      titleHint,
      identity,
      openAiKey,
    });

    console.log("Atlas gallery recovery", {
      queries,
      candidateCount: candidates.length,
      recoveredCount: recovered.length,
    });

    return sendJson(res, 200, {
      ok: true,
      recovered,
      queries,
      candidateCount: candidates.length,
    });
  } catch (error) {
    console.error("Atlas gallery recovery error:", error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : "No se pudo recuperar la galería.",
    });
  }
}
