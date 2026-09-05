const IMAGE_TYPE_ORDER = {
  main: 0,
  measurements: 1,
  environment: 2,
  other: 3,
  detail: 4,
};

const TYPE_SCORE = {
  main: 520,
  measurements: 500,
  environment: 450,
  other: 330,
  detail: 100,
};

const MEASUREMENT_TERMS = [
  "dimension", "dimensions", "measurement", "measurements", "size chart",
  "width", "height", "depth", "length", "inch", "inches", "cm", "mm",
  "medidas", "dimensiones", "ancho", "alto", "profundidad", "largo",
];

const ENVIRONMENT_TERMS = [
  "living room", "dining room", "bedroom", "office", "kitchen", "room scene",
  "lifestyle", "in use", "styled", "ambiente", "sala", "comedor", "recamara", "recámara",
];

const DETAIL_TERMS = [
  "detail", "close up", "close-up", "texture", "finish", "material",
  "wood grain", "fabric", "metal", "detalle", "acabado", "textura", "madera",
];

const LOW_VALUE_DETAIL_TERMS = [
  "texture", "wood grain", "fabric swatch", "material sample", "close up",
  "close-up", "macro", "surface", "finish sample", "textura", "muestra", "acercamiento",
];

const COLOR_TERMS = [
  "black", "white", "brown", "beige", "cream", "gray", "grey", "blue", "navy",
  "green", "red", "pink", "gold", "silver", "orange", "yellow", "purple",
  "negro", "blanco", "cafe", "café", "beige", "crema", "gris", "azul", "verde",
  "rojo", "rosa", "dorado", "plateado", "naranja", "amarillo", "morado",
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

function normalizeUrl(value = "") {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeSource(value = "") {
  return normalizeText(value)
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]/g, "");
}

function hostFromUrl(value = "") {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getSourceKey(result = {}) {
  return normalizeSource(
    result.sourceKey || result.source || hostFromUrl(result.url)
  );
}

function classifyImage(image = {}) {
  const explicit = normalizeText(image.type);
  if (explicit === "dimensions") return "measurements";
  if (["main", "measurements", "environment", "detail", "other"].includes(explicit)) {
    return explicit;
  }

  const text = normalizeText(
    [image.alt, image.title, image.role, image.variant, image.url]
      .filter(Boolean)
      .join(" ")
  );

  if (MEASUREMENT_TERMS.some((term) => text.includes(normalizeText(term)))) {
    return "measurements";
  }
  if (ENVIRONMENT_TERMS.some((term) => text.includes(normalizeText(term)))) {
    return "environment";
  }
  if (DETAIL_TERMS.some((term) => text.includes(normalizeText(term)))) {
    return "detail";
  }
  return "other";
}

function isLowValueDetail(image = {}) {
  const text = normalizeText(
    [image.alt, image.title, image.role, image.variant, image.url]
      .filter(Boolean)
      .join(" ")
  );
  return LOW_VALUE_DETAIL_TERMS.some((term) => text.includes(normalizeText(term)));
}

function imageIdentity(value = "") {
  try {
    const url = new URL(value);
    const fileName =
      url.pathname
        .split("/")
        .filter(Boolean)
        .pop()
        ?.toLowerCase() || "";

    const clean = fileName
      .replace(/[-_](small|medium|large|thumb|thumbnail|preview|zoom|main|hero)(?=\.|$)/g, "")
      .replace(/[-_]\d+x\d+/g, "")
      .replace(/\.(jpe?g|png|webp|avif)$/i, "")
      .replace(/[^a-z0-9]/g, "");

    return clean.length >= 8 ? clean : url.toString();
  } catch {
    return normalizeText(value);
  }
}

function isThumbnail(value = "") {
  const text = normalizeText(value);
  return [
    "gstatic.com", "googleusercontent.com", "encrypted-tbn", "serpapi.com/images",
    "thumbnail", "thumb", "small", "shopping q tbn",
  ].some((term) => text.includes(normalizeText(term)));
}

function resolutionScore(image = {}) {
  const width = Number(image.width || image.image_width || 0);
  const height = Number(image.height || image.image_height || 0);
  if (!(width > 0 && height > 0)) return 0;
  const shortest = Math.min(width, height);
  if (shortest >= 900) return 180;
  if (shortest >= 650) return 130;
  if (shortest >= 400) return 70;
  if (shortest < 220) return -350;
  return 0;
}

function normalizeImage(image, result, origin) {
  const rawUrl = typeof image === "string" ? image : image?.url || image?.link;
  const url = normalizeUrl(rawUrl);
  if (!url) return null;

  const sourceImage = typeof image === "string" ? { url } : { ...image, url };
  const type = classifyImage(sourceImage);
  const thumbnail = isThumbnail(url);
  const lowValueDetail = isLowValueDetail(sourceImage);

  let originScore = 0;
  if (origin === "selected_result") originScore = 1050;
  else if (origin === "verified_peer") originScore = 360;

  const exactPeerBonus =
    origin === "verified_peer" && result?.exactImageMatch ? 260 : 0;
  const directBonus = thumbnail ? -420 : 340;
  const providerBonus =
    result?.galleryExtraction?.provider &&
    !["generic", "google-product", "none"].includes(result.galleryExtraction.provider)
      ? 170
      : 0;

  const normalized = {
    url,
    type,
    source: result?.source || "",
    sourceKey: getSourceKey(result),
    resultUrl: normalizeUrl(result?.url),
    resultId: result?.id || "",
    identity: imageIdentity(url),
    thumbnail,
    origin,
    lowValueDetail,
    width: Number(sourceImage.width || sourceImage.image_width || 0) || null,
    height: Number(sourceImage.height || sourceImage.image_height || 0) || null,
    galleryProvider: result?.galleryExtraction?.provider || "",
  };

  normalized.score =
    (TYPE_SCORE[type] || TYPE_SCORE.other) +
    originScore +
    exactPeerBonus +
    directBonus +
    providerBonus +
    resolutionScore(sourceImage) -
    (lowValueDetail ? 950 : 0);

  return normalized;
}

function uniqueImages(images = []) {
  const seenUrls = new Set();
  const seenIdentities = new Set();
  const output = [];

  for (const image of images) {
    if (!image?.url || seenUrls.has(image.url)) continue;
    if (image.identity && seenIdentities.has(image.identity)) continue;

    seenUrls.add(image.url);
    if (image.identity) seenIdentities.add(image.identity);
    output.push(image);
  }

  return output;
}

function sameModel(a = {}, b = {}) {
  const modelA = normalizeText(a.metadata?.model);
  const modelB = normalizeText(b.metadata?.model);
  return Boolean(modelA && modelB && modelA === modelB);
}

function sameBrand(a = {}, b = {}) {
  const brandA = normalizeText(a.metadata?.brand);
  const brandB = normalizeText(b.metadata?.brand);
  return Boolean(brandA && brandB && brandA === brandB);
}

function extractNumbers(result = {}) {
  const text = normalizeText([
    result.title,
    result.metadata?.model,
    result.metadata?.capacity,
  ].filter(Boolean).join(" "));
  return new Set(
    (text.match(/\b\d+(?:\.\d+)?\b/g) || [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  );
}

function hasNumberConflict(a = {}, b = {}) {
  const aNumbers = extractNumbers(a);
  const bNumbers = extractNumbers(b);
  if (!aNumbers.size || !bNumbers.size) return false;
  for (const value of aNumbers) if (bNumbers.has(value)) return false;
  return true;
}

function detectedColors(result = {}) {
  const text = normalizeText(result.title || "");
  return new Set(
    COLOR_TERMS
      .map(normalizeText)
      .filter((color) => color && new RegExp(`\\b${color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text))
  );
}

function hasColorConflict(a = {}, b = {}) {
  const colorsA = detectedColors(a);
  const colorsB = detectedColors(b);
  if (!colorsA.size || !colorsB.size) return false;
  for (const color of colorsA) if (colorsB.has(color)) return false;
  return true;
}

function isSameRecord(a = {}, b = {}) {
  if (a.id && b.id && a.id === b.id) return true;
  const urlA = normalizeUrl(a.url);
  const urlB = normalizeUrl(b.url);
  return Boolean(urlA && urlB && urlA === urlB);
}

function isVerifiedPeer(result = {}, selectedResult = {}) {
  if (!result || isSameRecord(result, selectedResult)) return false;
  if (result.semanticConflict || result.metadata?.semanticConflict) return false;
  if (result.compatibleWithAnchor === false) return false;
  if (hasNumberConflict(result, selectedResult) && !sameModel(result, selectedResult)) return false;
  if (hasColorConflict(result, selectedResult) && !sameModel(result, selectedResult)) return false;

  if (sameModel(result, selectedResult)) return true;
  if (result.exactImageMatch === true) return true;

  const compatibility = Number(result.productCompatibility || 0);
  const identity = Number(result.identityScore ?? result.metadata?.identityScore ?? 0);
  const title = Number(result.titleHintScore ?? result.metadata?.titleHintScore ?? 0);

  if (compatibility >= 0.86) return true;
  if (identity >= 0.55 && compatibility >= 0.55) return true;
  if (sameBrand(result, selectedResult) && title >= 0.5 && compatibility >= 0.62) return true;

  return false;
}

function collectResultImages(result = {}, origin = "selected_result") {
  const images = Array.isArray(result.images) ? result.images : [];
  return images
    .map((image) => normalizeImage(image, result, origin))
    .filter(Boolean);
}

function collectSelectedResultImages(product = {}) {
  const selectedResult = product.rawResult || {};
  const output = collectResultImages(selectedResult, "selected_result");

  const directFields = [
    { url: product.image_url, type: "main" },
    { url: product.image_url_2, type: "other" },
    { url: product.image_url_3, type: "other" },
    { url: product.image_url_4, type: "other" },
  ];

  for (const image of directFields) {
    if (!image.url) continue;
    const normalized = normalizeImage(image, selectedResult, "selected_result");
    if (normalized) output.push(normalized);
  }

  return uniqueImages(output);
}

function collectVerifiedPeerImages(product = {}, searchResults = []) {
  const selectedResult = product.rawResult || {};
  const output = [];

  for (const result of searchResults) {
    if (!isVerifiedPeer(result, selectedResult)) continue;
    output.push(...collectResultImages(result, "verified_peer"));
  }

  return uniqueImages(output);
}

function compareImageQuality(a, b) {
  if (a.thumbnail !== b.thumbnail) return a.thumbnail ? 1 : -1;
  if (a.score !== b.score) return b.score - a.score;
  return a.url.localeCompare(b.url);
}

function chooseCandidate(pool, selected, predicate) {
  return [...pool]
    .filter((candidate) => !candidate.lowValueDetail)
    .filter(predicate)
    .filter(
      (candidate) =>
        !selected.some(
          (chosen) =>
            chosen.url === candidate.url ||
            (chosen.identity && chosen.identity === candidate.identity)
        )
    )
    .sort(compareImageQuality)[0] || null;
}

function orderImages(images = []) {
  return [...images].sort((a, b) => {
    const typeDiff =
      (IMAGE_TYPE_ORDER[a.type] ?? 99) -
      (IMAGE_TYPE_ORDER[b.type] ?? 99);
    if (typeDiff !== 0) return typeDiff;
    return compareImageQuality(a, b);
  });
}

export function selectProductPhotos({
  product = {},
  searchResults = [],
  maximum = 4,
} = {}) {
  const limit = Math.max(1, Number(maximum) || 4);
  const selectedImages = collectSelectedResultImages(product);
  const peerImages = collectVerifiedPeerImages(product, searchResults);
  const pool = uniqueImages([...selectedImages, ...peerImages]);
  const selected = [];

  const add = (candidate) => {
    if (!candidate || selected.length >= limit) return;
    if (
      selected.some(
        (item) =>
          item.url === candidate.url ||
          (item.identity && item.identity === candidate.identity)
      )
    ) return;
    selected.push(candidate);
  };

  // 1) Foto principal: prioriza una imagen directa de la coincidencia elegida;
  // si solo existe miniatura de Google, una imagen directa de un peer verificado puede ganar.
  add(
    chooseCandidate(pool, selected, (image) => image.type === "main") ||
    chooseCandidate(pool, selected, (image) => image.type === "other")
  );

  // 2) Medidas y 3) ambiente son comercialmente más útiles que repetir vistas casi iguales.
  add(chooseCandidate(pool, selected, (image) => image.type === "measurements"));
  add(chooseCandidate(pool, selected, (image) => image.type === "environment"));

  // 4) Completa con vistas generales, evitando close-ups y miniaturas mientras haya alternativas.
  while (selected.length < limit) {
    const candidate =
      chooseCandidate(pool, selected, (image) => image.type === "other" && !image.thumbnail) ||
      chooseCandidate(pool, selected, (image) => image.type === "main" && !image.thumbnail) ||
      chooseCandidate(pool, selected, (image) => image.type === "other") ||
      chooseCandidate(pool, selected, (image) => image.type === "main") ||
      chooseCandidate(pool, selected, (image) => image.type === "detail");

    if (!candidate) break;
    add(candidate);
  }

  const finalSelection = orderImages(uniqueImages(selected)).slice(0, limit);
  const sourceKeys = [...new Set(finalSelection.map((image) => image.sourceKey).filter(Boolean))];
  const providers = [...new Set(finalSelection.map((image) => image.galleryProvider).filter(Boolean))];

  return {
    selectedSourceKey:
      getSourceKey(product.rawResult || {}) || normalizeSource(product.source),
    selectedResultUrl:
      normalizeUrl(product.rawResult?.url || product.sourceUrl),
    selected: finalSelection,
    image_url: finalSelection[0]?.url || "",
    image_url_2: finalSelection[1]?.url || "",
    image_url_3: finalSelection[2]?.url || "",
    image_url_4: finalSelection[3]?.url || "",
    mixedSources: finalSelection.some((image) => image.origin === "verified_peer"),
    diagnostics: {
      selectedCount: finalSelection.length,
      selectedCandidateCount: selectedImages.length,
      verifiedPeerCandidateCount: peerImages.length,
      totalCandidateCount: pool.length,
      sourceKeys,
      providers,
      thumbnailCount: finalSelection.filter((image) => image.thumbnail).length,
    },
  };
}

export function applySelectedPhotos(
  product = {},
  searchResults = [],
  maximum = 4
) {
  const selection = selectProductPhotos({
    product,
    searchResults,
    maximum,
  });

  return {
    ...product,
    image_url: selection.image_url,
    image_url_2: selection.image_url_2,
    image_url_3: selection.image_url_3,
    image_url_4: selection.image_url_4,
    photoSelection: selection.selected,
    photoSourceKey: selection.selectedSourceKey,
    photoResultUrl: selection.selectedResultUrl,
    photoSourcesMixed: selection.mixedSources,
    photoDiagnostics: selection.diagnostics,
  };
}
