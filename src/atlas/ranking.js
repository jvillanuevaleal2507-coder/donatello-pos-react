const STORE_TIE_BREAK_PRIORITY = [
  "amazon",
  "homedepot",
  "walmart",
  "lowes",
  "target",
  "wayfair",
  "manufacturer",
  "mercadolibre",
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

const SHAPE_GROUPS = [
  ["round", "redonda", "circular"],
  ["rectangular", "rectangle", "rectangulo"],
  ["square", "cuadrada", "cuadrado"],
];

const FEATURE_GROUPS = [
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

function getStorePriority(sourceKey) {
  const index = STORE_TIE_BREAK_PRIORITY.indexOf(sourceKey);
  return index === -1 ? STORE_TIE_BREAK_PRIORITY.length : index;
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

function detectGroup(text, groups) {
  return groups.findIndex((group) =>
    group.some((term) => text.includes(term))
  );
}

function detectConflict(a = {}, b = {}) {
  const textA = getSearchableText(a);
  const textB = getSearchableText(b);

  const shapeA = detectGroup(textA, SHAPE_GROUPS);
  const shapeB = detectGroup(textB, SHAPE_GROUPS);

  if (shapeA >= 0 && shapeB >= 0 && shapeA !== shapeB) {
    return true;
  }

  const featureA = detectGroup(textA, FEATURE_GROUPS);
  const featureB = detectGroup(textB, FEATURE_GROUPS);

  if (featureA >= 0 && featureB >= 0 && featureA !== featureB) {
    return true;
  }

  return false;
}

function deterministicKey(result = {}) {
  return [
    normalizeSource(result.source),
    normalizeText(result.metadata?.brand),
    normalizeText(result.metadata?.model),
    normalizeText(result.title),
    normalizeText(result.url),
  ].join("|");
}

function compareStableText(a, b) {
  return deterministicKey(a).localeCompare(
    deterministicKey(b),
    "en",
    { sensitivity: "base" }
  );
}

function getConsensusScore(result, results) {
  let score = 0;

  for (const other of results) {
    if (other === result) continue;
    if (detectConflict(result, other)) continue;

    const titleSimilarity = jaccardSimilarity(
      getTokens(result),
      getTokens(other)
    );

    const numeric = numericCompatibility(result, other);

    score += titleSimilarity * 100;
    if (numeric > 0) score += 20;
    if (
      normalizeText(result.metadata?.model) &&
      normalizeText(result.metadata?.model) ===
        normalizeText(other.metadata?.model)
    ) {
      score += 40;
    }
    if (
      normalizeText(result.metadata?.brand) &&
      normalizeText(result.metadata?.brand) ===
        normalizeText(other.metadata?.brand)
    ) {
      score += 15;
    }
  }

  return score;
}

function findStableAnchor(results = []) {
  const decorated = results.map((result) => ({
    result,
    exact: Boolean(result.exactImageMatch),
    confidence: getConfidence(result),
    consensus: getConsensusScore(result, results),
    sourcePriority: getStorePriority(
      normalizeSource(result.source)
    ),
  }));

  decorated.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (a.consensus !== b.consensus) {
      return b.consensus - a.consensus;
    }
    if (a.confidence !== b.confidence) {
      return b.confidence - a.confidence;
    }
    if (a.sourcePriority !== b.sourcePriority) {
      return a.sourcePriority - b.sourcePriority;
    }
    return compareStableText(a.result, b.result);
  });

  return decorated[0]?.result || null;
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

export function scoreResult(result = {}, anchor = null) {
  const compatibility = productCompatibility(result, anchor);

  return (
    (result.exactImageMatch ? 100000 : 0) +
    compatibility * 10000 +
    getConfidence(result) * 100 +
    getMetadataScore(result) * 10 +
    getQualityScore(result) * 10
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

  if (confidenceDifference !== 0) {
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

  if (a.promotional !== b.promotional) {
    return a.promotional ? 1 : -1;
  }

  const imageDifference =
    getImageCount(b) - getImageCount(a);

  if (imageDifference !== 0) {
    return imageDifference;
  }

  const sourceDifference =
    getStorePriority(a.sourceKey) -
    getStorePriority(b.sourceKey);

  if (sourceDifference !== 0) {
    return sourceDifference;
  }

  return compareStableText(a, b);
}

export function rankResults(results = []) {
  const anchor = findStableAnchor(results);

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
        deterministicKey: deterministicKey(result),
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
