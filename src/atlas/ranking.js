const STORE_TIE_BREAK_PRIORITY = [
  "amazon",
  "homedepot",
  "walmart",
  "lowes",
  "target",
  "wayfair",
  "mercadolibre",
  "manufacturer",
  "other",
];

const PROMOTION_TERMS = [
  "clearance",
  "liquidation",
  "liquidación",
  "sale",
  "special offer",
  "oferta",
  "deal",
  "coupon",
  "% off",
  "rollback",
  "flash deal",
];

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSource(source = "") {
  const value = normalizeText(source).replace(/\s+/g, "");

  if (value.includes("amazon")) return "amazon";
  if (value.includes("homedepot")) return "homedepot";
  if (value.includes("walmart")) return "walmart";
  if (value.includes("lowes") || value.includes("lowe")) return "lowes";
  if (value.includes("target")) return "target";
  if (value.includes("wayfair")) return "wayfair";
  if (value.includes("mercadolibre")) return "mercadolibre";
  if (
    value.includes("manufacturer") ||
    value.includes("fabricante") ||
    value.includes("officialstore")
  ) {
    return "manufacturer";
  }

  return "other";
}

function getStoreTieBreakScore(sourceKey) {
  const index = STORE_TIE_BREAK_PRIORITY.indexOf(sourceKey);
  if (index === -1) return 0;

  return STORE_TIE_BREAK_PRIORITY.length - index;
}

function getSearchableText(result = {}) {
  return normalizeText(
    [
      result.title,
      result.source,
      result.url,
      result.priceLabel,
      result.metadata?.brand,
      result.metadata?.model,
      result.metadata?.category,
      result.metadata?.availability,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function isPromotional(result = {}) {
  const text = getSearchableText(result);

  return PROMOTION_TERMS.some((term) =>
    text.includes(normalizeText(term))
  );
}

function getConfidence(result = {}) {
  const value = Number(result.confidence || 0);

  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(100, value));
}

function getImageCount(result = {}) {
  return Array.isArray(result.images) ? result.images.length : 0;
}

function getMetadataScore(result = {}) {
  let score = 0;

  if (result.metadata?.brand) score += 8;
  if (result.metadata?.model) score += 16;
  if (result.metadata?.category) score += 4;
  if (result.hasTechnicalData) score += 6;

  return score;
}

function getQualityScore(result = {}) {
  let score = 0;

  if (Number(result.price) > 0) score += 3;
  if (getImageCount(result) > 0) score += Math.min(getImageCount(result), 4);
  if (result.inStock === false) score -= 4;
  if (isPromotional(result)) score -= 25;

  return score;
}

export function scoreResult(result = {}) {
  const sourceKey = normalizeSource(result.source);

  const exactImageScore = result.exactImageMatch ? 100000 : 0;
  const confidenceScore = getConfidence(result) * 100;
  const metadataScore = getMetadataScore(result) * 10;
  const qualityScore = getQualityScore(result) * 10;

  // La tienda solo sirve como desempate. Nunca debe vencer
  // a una coincidencia visual o de confianza claramente superior.
  const storeTieBreakScore = getStoreTieBreakScore(sourceKey);

  return (
    exactImageScore +
    confidenceScore +
    metadataScore +
    qualityScore +
    storeTieBreakScore
  );
}

function compareResults(a, b) {
  if (Boolean(a.exactImageMatch) !== Boolean(b.exactImageMatch)) {
    return a.exactImageMatch ? -1 : 1;
  }

  const confidenceDifference =
    getConfidence(b) - getConfidence(a);

  if (Math.abs(confidenceDifference) >= 3) {
    return confidenceDifference;
  }

  const modelA = normalizeText(a.metadata?.model);
  const modelB = normalizeText(b.metadata?.model);

  if (Boolean(modelA) !== Boolean(modelB)) {
    return modelA ? -1 : 1;
  }

  const brandA = normalizeText(a.metadata?.brand);
  const brandB = normalizeText(b.metadata?.brand);

  if (Boolean(brandA) !== Boolean(brandB)) {
    return brandA ? -1 : 1;
  }

  const technicalDifference =
    Number(Boolean(b.hasTechnicalData)) -
    Number(Boolean(a.hasTechnicalData));

  if (technicalDifference !== 0) {
    return technicalDifference;
  }

  const imageDifference =
    getImageCount(b) - getImageCount(a);

  if (imageDifference !== 0) {
    return imageDifference;
  }

  const promotionDifference =
    Number(isPromotional(a)) -
    Number(isPromotional(b));

  if (promotionDifference !== 0) {
    return promotionDifference;
  }

  const sourceA = normalizeSource(a.source);
  const sourceB = normalizeSource(b.source);

  return (
    getStoreTieBreakScore(sourceB) -
    getStoreTieBreakScore(sourceA)
  );
}

export function rankResults(results = []) {
  return [...results]
    .map((result) => {
      const sourceKey = normalizeSource(result.source);

      return {
        ...result,
        sourceKey,
        promotional: isPromotional(result),
        atlasScore: scoreResult(result),
      };
    })
    .sort(compareResults);
}

export function chooseBestResult(results = []) {
  const ranked = rankResults(results);

  return {
    best: ranked[0] || null,
    alternatives: ranked.slice(1),
  };
}
