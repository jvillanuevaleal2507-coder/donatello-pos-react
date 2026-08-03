const STORE_PRIORITY = [
  "amazon",
  "homedepot",
  "walmart",
  "lowes",
  "target",
  "wayfair",
  "manufacturer",
  "other",
];

const STORE_LABELS = {
  amazon: "Amazon",
  homedepot: "Home Depot",
  walmart: "Walmart",
  lowes: "Lowe's",
  target: "Target",
  wayfair: "Wayfair",
  manufacturer: "Fabricante",
  other: "Otra fuente",
};

const BLOCKED_PROMOTION_TERMS = [
  "clearance",
  "liquidation",
  "liquidación",
  "special offer",
  "oferta especial",
  "prime day",
  "black friday",
  "rollback",
  "flash deal",
  "limited time deal",
  "coupon",
  "save ",
  "% off",
];

const MEASUREMENT_TERMS = [
  "dimension",
  "dimensions",
  "measurement",
  "measurements",
  "size chart",
  "product size",
  "overall size",
  "inch",
  "inches",
  "cm",
  "mm",
  "width",
  "height",
  "depth",
  "length",
  "ancho",
  "alto",
  "profundidad",
  "medidas",
  "dimensiones",
];

const ENVIRONMENT_TERMS = [
  "room",
  "living room",
  "dining room",
  "bedroom",
  "office",
  "kitchen",
  "home decor",
  "in use",
  "lifestyle",
  "ambiente",
  "comedor",
  "sala",
  "recámara",
];

const DETAIL_TERMS = [
  "detail",
  "close up",
  "close-up",
  "texture",
  "finish",
  "material",
  "wood grain",
  "fabric",
  "metal",
  "detalle",
  "acabado",
  "textura",
  "madera",
];

function cleanText(value = "") {
  return String(value || "").toLowerCase().trim();
}

function getSearchableText(result = {}) {
  return [
    result.title,
    result.source,
    result.url,
    result.priceLabel,
    result.metadata?.priceLabel,
    result.metadata?.brand,
    result.metadata?.model,
    ...(Array.isArray(result.images)
      ? result.images.flatMap((image) => [
          image?.type,
          image?.alt,
          image?.title,
          image?.url,
        ])
      : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function normalizeStore(result = {}) {
  const value = cleanText(
    [result.source, result.url].filter(Boolean).join(" ")
  ).replace(/[^a-z0-9]/g, "");

  if (value.includes("amazon")) return "amazon";
  if (value.includes("homedepot")) return "homedepot";
  if (value.includes("walmart")) return "walmart";
  if (value.includes("lowes") || value.includes("lowe")) return "lowes";
  if (value.includes("target")) return "target";
  if (value.includes("wayfair")) return "wayfair";

  if (
    value.includes("manufacturer") ||
    value.includes("fabricante") ||
    value.includes("officialstore")
  ) {
    return "manufacturer";
  }

  return "other";
}

export function getStoreLabel(storeKey = "other") {
  return STORE_LABELS[storeKey] || STORE_LABELS.other;
}

export function getStorePriority(storeKey = "other") {
  const index = STORE_PRIORITY.indexOf(storeKey);
  return index === -1 ? STORE_PRIORITY.length : index;
}

export function isPromotionalResult(result = {}) {
  const text = getSearchableText(result);
  return BLOCKED_PROMOTION_TERMS.some((term) =>
    text.includes(term.toLowerCase())
  );
}

export function hasUsablePrice(result = {}) {
  return Number(result.price) > 0 && !isPromotionalResult(result);
}

export function calculateConfidence(result = {}) {
  let confidence = Number(result.confidence || 0);

  if (!Number.isFinite(confidence) || confidence <= 0) {
    confidence = 60;
  }

  if (result.exactImageMatch) confidence += 8;
  if (result.hasTechnicalData) confidence += 3;
  if (Array.isArray(result.images) && result.images.length > 0) confidence += 2;
  if (hasUsablePrice(result)) confidence += 2;

  return Math.max(0, Math.min(99, Math.round(confidence)));
}

export function scoreSourceResult(result = {}) {
  const storeKey = normalizeStore(result);
  const priority = getStorePriority(storeKey);

  let score = 0;

  if (result.exactImageMatch) score += 1000;
  score += Math.max(0, 800 - priority * 100);
  score += calculateConfidence(result) * 5;

  if (result.hasTechnicalData) score += 40;
  if (Array.isArray(result.images)) {
    score += Math.min(result.images.length, 8) * 8;
  }

  if (hasUsablePrice(result)) score += 35;
  if (isPromotionalResult(result)) score -= 300;
  if (result.inStock === false) score -= 20;

  return score;
}

function normalizeImage(image, fallbackType = "main") {
  if (!image?.url) return null;

  return {
    url: image.url,
    type: image.type || fallbackType,
    alt: image.alt || image.title || "",
    source: image.source || "",
  };
}

function imageMatchesTerms(image, terms) {
  const text = [
    image?.type,
    image?.alt,
    image?.title,
    image?.url,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return terms.some((term) => text.includes(term));
}

function collectImages(results = []) {
  const seen = new Set();
  const output = [];

  for (const result of results) {
    const storeKey = normalizeStore(result);
    const images = Array.isArray(result.images) ? result.images : [];

    for (const image of images) {
      const normalized = normalizeImage(image);

      if (!normalized?.url || seen.has(normalized.url)) continue;

      seen.add(normalized.url);
      output.push({
        ...normalized,
        source: normalized.source || getStoreLabel(storeKey),
        sourceKey: storeKey,
        result,
      });
    }
  }

  return output;
}

export function findMeasurementsImage(results = []) {
  return collectImages(results).find((image) =>
    imageMatchesTerms(image, MEASUREMENT_TERMS)
  ) || null;
}

export function findEnvironmentImage(results = []) {
  return collectImages(results).find((image) =>
    imageMatchesTerms(image, ENVIRONMENT_TERMS)
  ) || null;
}

export function findDetailImage(results = []) {
  return collectImages(results).find((image) =>
    imageMatchesTerms(image, DETAIL_TERMS)
  ) || null;
}

export function findMainImage(result = {}) {
  const images = Array.isArray(result.images) ? result.images : [];
  const explicitMain = images.find((image) => image?.type === "main");
  const selected = explicitMain || images[0];

  return selected
    ? {
        ...normalizeImage(selected, "main"),
        source: getStoreLabel(normalizeStore(result)),
      }
    : null;
}

export function findBestReferencePrice(results = []) {
  const valid = results
    .filter(hasUsablePrice)
    .map((result) => ({
      result,
      price: Number(result.price),
      storeKey: normalizeStore(result),
    }))
    .sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      return getStorePriority(a.storeKey) - getStorePriority(b.storeKey);
    });

  if (!valid.length) return null;

  const winner = valid[0];

  return {
    price: winner.price,
    currency: winner.result.currency || "USD",
    source: getStoreLabel(winner.storeKey),
    sourceKey: winner.storeKey,
    sourceUrl: winner.result.url || "",
    result: winner.result,
  };
}

export function rankSourceResults(results = []) {
  return [...results]
    .map((result) => {
      const storeKey = normalizeStore(result);

      return {
        ...result,
        storeKey,
        storeLabel: getStoreLabel(storeKey),
        promotional: isPromotionalResult(result),
        resolvedConfidence: calculateConfidence(result),
        sourceScore: scoreSourceResult(result),
      };
    })
    .sort((a, b) => b.sourceScore - a.sourceScore);
}

export function resolveBestSource(results = []) {
  if (!Array.isArray(results) || results.length === 0) {
    return {
      best: null,
      alternatives: [],
      referencePrice: null,
      images: {
        main: null,
        measurements: null,
        environment: null,
        detail: null,
      },
      summary: "No encontré coincidencias para evaluar.",
    };
  }

  const ranked = rankSourceResults(results);
  const best = ranked[0] || null;
  const referencePrice = findBestReferencePrice(ranked);

  const images = {
    main: best ? findMainImage(best) : null,
    measurements: findMeasurementsImage(ranked),
    environment: findEnvironmentImage(ranked),
    detail: findDetailImage(ranked),
  };

  const alternatives = ranked.slice(1, 6);
  const summaryParts = [];

  if (best) {
    summaryParts.push(`${best.storeLabel} será la fuente principal`);
  }

  if (
    referencePrice &&
    best &&
    referencePrice.sourceKey !== best.storeKey
  ) {
    summaryParts.push(
      `${referencePrice.source} tiene el precio normal más bajo`
    );
  }

  if (
    images.measurements &&
    best &&
    images.measurements.sourceKey !== best.storeKey
  ) {
    summaryParts.push(
      `${images.measurements.source} aporta la imagen con medidas`
    );
  }

  return {
    best,
    alternatives,
    referencePrice,
    images,
    summary:
      summaryParts.length > 0
        ? `${summaryParts.join(". ")}.`
        : "Encontré una opción para revisar.",
  };
}

export const SOURCE_RESOLVER_CONFIG = {
  storePriority: [...STORE_PRIORITY],
  blockedPromotionTerms: [...BLOCKED_PROMOTION_TERMS],
};
