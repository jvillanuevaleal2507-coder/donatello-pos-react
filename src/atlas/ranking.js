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

const GENERIC_WORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that",
  "de", "la", "el", "los", "las", "para", "con", "por",
  "mesa", "table", "comedor", "dining", "mueble", "furniture",
  "industrial", "modern", "home", "set", "piece", "pieces",
  "color", "style", "room", "people", "personas",
]);

const CONFLICT_GROUPS = [
  ["round", "redonda", "circular"],
  ["rectangular", "rectangle", "rectangulo"],
  ["square", "cuadrada", "cuadrado"],
  ["extendable", "extensible", "extension"],
  ["folding", "foldable", "plegable"],
];

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
  return index === -1
    ? 0
    : STORE_TIE_BREAK_PRIORITY.length - index;
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
  return Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : 0;
}

function getImageCount(result = {}) {
  return Array.isArray(result.images)
    ? result.images.length
    : 0;
}

function getTokens(result = {}) {
  const text = normalizeText(
    [
      result.title,
      result.metadata?.brand,
      result.metadata?.model,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return new Set(
    text
      .split(" ")
      .map((token) => token.trim())
      .filter(
        (token) =>
          token.length >= 3 &&
          !GENERIC_WORDS.has(token)
      )
  );
}

function jaccardSimilarity(a, b) {
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }

  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function extractNumbers(result = {}) {
  const text = normalizeText(
    [
      result.title,
      result.metadata?.model,
      result.metadata?.capacity,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return new Set(
    (text.match(/\b\d+(?:\.\d+)?\b/g) || [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  );
}

function numericCompatibility(a, b) {
  const numbersA = extractNumbers(a);
  const numbersB = extractNumbers(b);

  if (!numbersA.size || !numbersB.size) return 0;

  for (const value of numbersA) {
    if (numbersB.has(value)) return 1;
  }

  return -1;
}

function detectConflict(resultA = {}, resultB = {}) {
  const textA = getSearchableText(resultA);
  const textB = getSearchableText(resultB);

  const activeA = CONFLICT_GROUPS
    .map((group, index) => ({
      index,
      found: group.some((term) => textA.includes(term)),
    }))
    .filter((item) => item.found)
    .map((item) => item.index);

  const activeB = CONFLICT_GROUPS
    .map((group, index) => ({
      index,
      found: group.some((term) => textB.includes(term)),
    }))
    .filter((item) => item.found)
    .map((item) => item.index);

  const shapeGroups = new Set([0, 1, 2]);
  const shapeA = activeA.find((index) => shapeGroups.has(index));
  const shapeB = activeB.find((index) => shapeGroups.has(index));

  if (
    shapeA !== undefined &&
    shapeB !== undefined &&
    shapeA !== shapeB
  ) {
    return true;
  }

  return false;
}

function getMetadataScore(result = {}) {
  let score = 0;
  if (result.metadata?.model) score += 18;
  if (result.metadata?.brand) score += 10;
  if (result.metadata?.category) score += 4;
  if (result.hasTechnicalData) score += 8;
  return score;
}

function getQualityScore(result = {}) {
  let score = 0;
  if (Number(result.price) > 0) score += 3;
  if (getImageCount(result) > 0) {
    score += Math.min(getImageCount(result), 4);
  }
  if (result.inStock === false) score -= 4;
  if (isPromotional(result)) score -= 30;
  return score;
}

function findVisualAnchor(results = []) {
  return [...results].sort((a, b) => {
    if (Boolean(a.exactImageMatch) !== Boolean(b.exactImageMatch)) {
      return a.exactImageMatch ? -1 : 1;
    }

    return getConfidence(b) - getConfidence(a);
  })[0] || null;
}

function productCompatibility(result, anchor) {
  if (!anchor || result === anchor) return 1;

  if (detectConflict(result, anchor)) return -1;

  const titleSimilarity = jaccardSimilarity(
    getTokens(result),
    getTokens(anchor)
  );

  const numeric = numericCompatibility(result, anchor);

  if (numeric < 0 && titleSimilarity < 0.35) {
    return -0.5;
  }

  return Math.min(
    1,
    titleSimilarity + (numeric > 0 ? 0.2 : 0)
  );
}

export function scoreResult(result = {}, anchor = null) {
  const sourceKey = normalizeSource(result.source);
  const compatibility = productCompatibility(result, anchor);

  const exactImageScore = result.exactImageMatch ? 100000 : 0;
  const confidenceScore = getConfidence(result) * 100;
  const compatibilityScore = compatibility * 5000;
  const metadataScore = getMetadataScore(result) * 10;
  const qualityScore = getQualityScore(result) * 10;
  const storeTieBreakScore = getStoreTieBreakScore(sourceKey);

  return (
    exactImageScore +
    confidenceScore +
    compatibilityScore +
    metadataScore +
    qualityScore +
    storeTieBreakScore
  );
}

function compareResults(a, b) {
  if (Boolean(a.exactImageMatch) !== Boolean(b.exactImageMatch)) {
    return a.exactImageMatch ? -1 : 1;
  }

  if (a.productCompatibility !== b.productCompatibility) {
    return b.productCompatibility - a.productCompatibility;
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

  const promotionDifference =
    Number(a.promotional) - Number(b.promotional);

  if (promotionDifference !== 0) {
    return promotionDifference;
  }

  const imageDifference =
    getImageCount(b) - getImageCount(a);

  if (imageDifference !== 0) {
    return imageDifference;
  }

  return (
    getStoreTieBreakScore(b.sourceKey) -
    getStoreTieBreakScore(a.sourceKey)
  );
}

export function rankResults(results = []) {
  const anchor = findVisualAnchor(results);

  return [...results]
    .map((result) => {
      const sourceKey = normalizeSource(result.source);
      const compatibility = productCompatibility(result, anchor);

      return {
        ...result,
        sourceKey,
        promotional: isPromotional(result),
        productCompatibility: compatibility,
        compatibleWithAnchor: compatibility >= 0,
        atlasScore: scoreResult(result, anchor),
      };
    })
    .sort(compareResults);
}

export function chooseBestResult(results = []) {
  const ranked = rankResults(results);

  const compatible = ranked.filter(
    (result) => result.compatibleWithAnchor
  );

  const rejected = ranked.filter(
    (result) => !result.compatibleWithAnchor
  );

  const validRanked = compatible.length
    ? compatible
    : ranked;

  return {
    best: validRanked[0] || null,
    alternatives: validRanked.slice(1),
    rejected,
  };
}
