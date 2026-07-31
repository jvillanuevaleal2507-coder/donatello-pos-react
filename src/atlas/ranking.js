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
  const value = String(source).toLowerCase().replace(/\s+/g, "");
  if (value.includes("amazon")) return "amazon";
  if (value.includes("homedepot")) return "homedepot";
  if (value.includes("walmart")) return "walmart";
  if (value.includes("wayfair")) return "wayfair";
  if (value.includes("lowes") || value.includes("lowe")) return "lowes";
  if (value.includes("mercadolibre")) return "mercadolibre";
  if (value.includes("manufacturer") || value.includes("fabricante")) return "manufacturer";
  return "other";
}

export function scoreResult(result) {
  const sourceKey = normalizeSource(result.source);
  const sourceIndex = SEARCH_PRIORITY.indexOf(sourceKey);
  const sourcePriority = sourceIndex === -1 ? 0 : SEARCH_PRIORITY.length - sourceIndex;
  const exactImageScore = result.exactImageMatch ? EXACT_IMAGE_BONUS : 0;
  const sourceScore = sourcePriority * SOURCE_PRIORITY_WEIGHT;
  const confidenceScore = Number(result.confidence || 0) * CONFIDENCE_WEIGHT;
  const technicalScore = result.hasTechnicalData ? TECHNICAL_DATA_BONUS : 0;
  const priceScore = result.price ? PRICE_AVAILABLE_BONUS : 0;
  const imageScore = Math.min(Number(result.images?.length || 0), 8) * EXTRA_IMAGE_BONUS;
  return exactImageScore + sourceScore + confidenceScore + technicalScore + priceScore + imageScore;
}

export function rankResults(results = []) {
  return [...results]
    .map((result) => ({
      ...result,
      sourceKey: normalizeSource(result.source),
      atlasScore: scoreResult(result),
    }))
    .sort((a, b) => b.atlasScore - a.atlasScore);
}

export function chooseBestResult(results = []) {
  const ranked = rankResults(results);
  return { best: ranked[0] || null, alternatives: ranked.slice(1) };
}
