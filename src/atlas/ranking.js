import {
  EXACT_IMAGE_BONUS,
  SOURCE_PRIORITY_WEIGHT,
  CONFIDENCE_WEIGHT,
  TECHNICAL_DATA_BONUS,
  PRICE_AVAILABLE_BONUS,
  EXTRA_IMAGE_BONUS,
  SEARCH_PRIORITY,
} from "./constants";

function normalizeSource(source = "") {
  const value = String(source).toLowerCase().replace(/[^a-z0-9]/g, "");

  if (value.includes("amazon")) return "amazon";
  if (value.includes("homedepot")) return "homedepot";
  if (value.includes("walmart")) return "walmart";
  if (value.includes("lowes") || value.includes("lowe")) return "lowes";
  if (value.includes("wayfair")) return "wayfair";
  if (
    value.includes("manufacturer") ||
    value.includes("fabricante") ||
    value.includes("official")
  ) return "manufacturer";

  return "other";
}

function isNormalPrice(result) {
  const text = [
    result.title,
    result.rawTitle,
    result.priceLabel,
    result.metadata?.priceLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const blockedTerms = [
    "clearance",
    "liquidation",
    "liquidación",
    "sale",
    "special offer",
    "oferta especial",
    "prime day",
    "black friday",
    "deal",
    "rollback",
  ];

  return !blockedTerms.some((term) => text.includes(term));
}

export function scoreResult(result) {
  const sourceKey = normalizeSource(result.source);
  const sourceIndex = SEARCH_PRIORITY.indexOf(sourceKey);
  const sourcePriority =
    sourceIndex === -1 ? 0 : SEARCH_PRIORITY.length - sourceIndex;

  return (
    (result.exactImageMatch ? EXACT_IMAGE_BONUS : 0) +
    sourcePriority * SOURCE_PRIORITY_WEIGHT +
    Number(result.confidence || 0) * CONFIDENCE_WEIGHT +
    (result.hasTechnicalData ? TECHNICAL_DATA_BONUS : 0) +
    (result.price && isNormalPrice(result) ? PRICE_AVAILABLE_BONUS : 0) +
    Math.min(Number(result.images?.length || 0), 8) * EXTRA_IMAGE_BONUS
  );
}

export function rankResults(results = []) {
  return [...results]
    .map((result) => ({
      ...result,
      sourceKey: normalizeSource(result.source),
      normalPrice: isNormalPrice(result),
      atlasScore: scoreResult(result),
    }))
    .sort((a, b) => {
      if (a.exactImageMatch !== b.exactImageMatch) {
        return a.exactImageMatch ? -1 : 1;
      }

      const aPriority = SEARCH_PRIORITY.indexOf(a.sourceKey);
      const bPriority = SEARCH_PRIORITY.indexOf(b.sourceKey);

      if (aPriority !== bPriority) return aPriority - bPriority;

      if (Number(a.confidence || 0) !== Number(b.confidence || 0)) {
        return Number(b.confidence || 0) - Number(a.confidence || 0);
      }

      return b.atlasScore - a.atlasScore;
    });
}

export function chooseBestResult(results = []) {
  const ranked = rankResults(results);
  return {
    best: ranked[0] || null,
    alternatives: ranked.slice(1),
  };
}

export function chooseReferencePrice(results = []) {
  const valid = rankResults(results).filter(
    (item) => item.normalPrice && Number(item.price) > 0
  );

  if (!valid.length) return null;

  return [...valid].sort(
    (a, b) => Number(a.price) - Number(b.price)
  )[0];
}
