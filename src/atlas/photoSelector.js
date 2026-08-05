const IMAGE_TYPE_ORDER = {
  main: 0,
  measurements: 1,
  environment: 2,
  other: 3,
  detail: 4,
};

const TYPE_SCORE = {
  main: 500,
  measurements: 450,
  environment: 400,
  other: 300,
  detail: 100,
};

const MEASUREMENT_TERMS = [
  "dimension",
  "dimensions",
  "measurement",
  "measurements",
  "size",
  "width",
  "height",
  "depth",
  "length",
  "inch",
  "inches",
  "cm",
  "mm",
  "medidas",
  "dimensiones",
  "ancho",
  "alto",
  "profundidad",
  "largo",
];

const ENVIRONMENT_TERMS = [
  "living room",
  "dining room",
  "bedroom",
  "office",
  "kitchen",
  "room",
  "lifestyle",
  "in use",
  "ambiente",
  "sala",
  "comedor",
  "recamara",
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

const LOW_VALUE_DETAIL_TERMS = [
  "texture",
  "wood grain",
  "fabric swatch",
  "material sample",
  "close up",
  "close-up",
  "macro",
  "surface",
  "finish sample",
  "textura",
  "muestra",
  "acercamiento",
];

function isLowValueDetail(image = {}) {
  const text = normalizeText(
    [image.alt, image.title, image.url]
      .filter(Boolean)
      .join(" ")
  );

  return LOW_VALUE_DETAIL_TERMS.some((term) =>
    text.includes(normalizeText(term))
  );
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value = "") {
  try {
    const url = new URL(value);
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
    return new URL(value).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getSourceKey(result = {}) {
  return normalizeSource(
    result.sourceKey ||
      result.source ||
      hostFromUrl(result.url)
  );
}

function classifyImage(image = {}) {
  const explicit = normalizeText(image.type);

  if (
    ["main", "measurements", "environment", "detail"].includes(explicit)
  ) {
    return explicit;
  }

  const text = normalizeText(
    [image.alt, image.title, image.url]
      .filter(Boolean)
      .join(" ")
  );

  if (MEASUREMENT_TERMS.some((term) => text.includes(term))) {
    return "measurements";
  }

  if (ENVIRONMENT_TERMS.some((term) => text.includes(term))) {
    return "environment";
  }

  if (DETAIL_TERMS.some((term) => text.includes(term))) {
    return "detail";
  }

  return "other";
}

function imageIdentity(value = "") {
  try {
    const url = new URL(value);

    const fileName =
      url.pathname
        .split("/")
        .filter(Boolean)
        .pop()
        ?.toLowerCase()
        .replace(
          /[-_](small|medium|large|thumb|thumbnail|preview)(?=\.|$)/g,
          ""
        )
        .replace(/[^a-z0-9.]/g, "") || "";

    return fileName
      ? `${url.hostname.replace(/^www\./, "")}:${fileName}`
      : url.toString();
  } catch {
    return normalizeText(value);
  }
}

function isThumbnail(value = "") {
  const text = normalizeText(value);

  return [
    "gstatic.com",
    "googleusercontent.com",
    "encrypted-tbn",
    "thumbnail",
    "thumb",
    "small",
  ].some((term) => text.includes(term));
}

function normalizeImage(image, result, origin) {
  const rawUrl =
    typeof image === "string" ? image : image?.url;

  const url = normalizeUrl(rawUrl);
  if (!url) return null;

  const sourceImage =
    typeof image === "string"
      ? { url }
      : { ...image, url };

  const normalized = {
    url,
    type: classifyImage(sourceImage),
    source: result?.source || "",
    sourceKey: getSourceKey(result),
    resultUrl: normalizeUrl(result?.url),
    resultId: result?.id || "",
    identity: imageIdentity(url),
    thumbnail: isThumbnail(url),
    origin,
    lowValueDetail: isLowValueDetail(sourceImage),
  };

  normalized.score =
    (TYPE_SCORE[normalized.type] || TYPE_SCORE.other) +
    (origin === "selected_result" ? 1000 : 0) +
    (!normalized.thumbnail ? 100 : 0) -
    (normalized.lowValueDetail ? 900 : 0);

  return normalized;
}

function uniqueImages(images = []) {
  const seenUrls = new Set();
  const seenIdentities = new Set();
  const output = [];

  for (const image of images) {
    if (!image?.url) continue;
    if (seenUrls.has(image.url)) continue;

    if (
      image.identity &&
      seenIdentities.has(image.identity)
    ) {
      continue;
    }

    seenUrls.add(image.url);
    if (image.identity) {
      seenIdentities.add(image.identity);
    }

    output.push(image);
  }

  return output;
}

function collectSelectedResultImages(product = {}) {
  const selectedResult = product.rawResult || {};
  const images = Array.isArray(selectedResult.images)
    ? selectedResult.images
    : [];

  const output = images
    .map((image) =>
      normalizeImage(
        image,
        selectedResult,
        "selected_result"
      )
    )
    .filter(Boolean);

  const directFields = [
    { url: product.image_url, type: "main" },
    { url: product.image_url_2, type: "other" },
    { url: product.image_url_3, type: "other" },
    { url: product.image_url_4, type: "other" },
  ];

  for (const image of directFields) {
    if (!image.url) continue;

    const normalized = normalizeImage(
      image,
      selectedResult,
      "selected_result"
    );

    if (normalized) output.push(normalized);
  }

  const unique = uniqueImages(output);
  const directImages = unique.filter((image) => !image.thumbnail);

  // Si existe al menos una imagen directa de la tienda, descartamos
  // por completo miniaturas de Google. Esas miniaturas suelen ser
  // la misma foto principal con otra URL y provocan duplicados visuales.
  return directImages.length ? directImages : unique;
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

function safeMeasurementFallback(
  product = {},
  searchResults = [],
  selectedImages = []
) {
  const selectedResult = product.rawResult || {};
  const selectedUrl = normalizeUrl(selectedResult.url);
  const selectedId = selectedResult.id || "";

  const usedUrls = new Set(
    selectedImages.map((image) => image.url)
  );
  const usedIdentities = new Set(
    selectedImages
      .map((image) => image.identity)
      .filter(Boolean)
  );

  const candidates = [];

  for (const result of searchResults) {
    if (!result) continue;

    const sameRecord =
      (selectedId && result.id === selectedId) ||
      (selectedUrl &&
        normalizeUrl(result.url) === selectedUrl);

    if (sameRecord) continue;

    const isVerifiedSameProduct =
      result.exactImageMatch === true ||
      sameModel(result, selectedResult) ||
      (
        sameBrand(result, selectedResult) &&
        Number(result.productCompatibility || 0) >= 0.75
      );

    if (!isVerifiedSameProduct) continue;

    for (const image of result.images || []) {
      const normalized = normalizeImage(
        image,
        result,
        "measurement_fallback"
      );

      if (!normalized) continue;
      if (normalized.type !== "measurements") continue;
      if (normalized.thumbnail) continue;
      if (usedUrls.has(normalized.url)) continue;
      if (
        normalized.identity &&
        usedIdentities.has(normalized.identity)
      ) {
        continue;
      }

      candidates.push(normalized);
    }
  }

  return candidates.sort((a, b) => b.score - a.score)[0] || null;
}

function orderImages(images = []) {
  return [...images].sort((a, b) => {
    const typeDiff =
      (IMAGE_TYPE_ORDER[a.type] ?? 99) -
      (IMAGE_TYPE_ORDER[b.type] ?? 99);

    if (typeDiff !== 0) return typeDiff;

    return b.score - a.score;
  });
}

export function selectProductPhotos({
  product = {},
  searchResults = [],
  maximum = 4,
} = {}) {
  const limit = Math.max(1, Number(maximum) || 4);

  const selectedResultImages =
    collectSelectedResultImages(product)
      .filter((image) => !image.lowValueDetail)
      .sort((a, b) => b.score - a.score);

  const selected = [];
  const usedTypes = new Set();

  const addType = (type) => {
    const candidate = selectedResultImages.find(
      (image) =>
        image.type === type &&
        !selected.some(
          (chosen) =>
            chosen.url === image.url ||
            chosen.identity === image.identity
        )
    );

    if (candidate) {
      selected.push(candidate);
      usedTypes.add(type);
    }
  };

  addType("main");
  addType("measurements");
  addType("environment");

  for (const candidate of selectedResultImages) {
    if (selected.length >= limit) break;

    const duplicate = selected.some(
      (image) =>
        image.url === candidate.url ||
        image.identity === candidate.identity
    );

    if (duplicate) continue;

    // Evita llenar espacios con texturas o close-ups cuando todavía
    // hay vistas completas o ambientes disponibles.
    if (candidate.type === "detail") continue;

    selected.push(candidate);
  }

  // Solo usa un detalle cuando no hay suficientes imágenes comerciales.
  if (selected.length < limit) {
    const usefulDetail = collectSelectedResultImages(product)
      .filter(
        (image) =>
          image.type === "detail" &&
          !image.lowValueDetail &&
          !selected.some(
            (chosen) =>
              chosen.url === image.url ||
              chosen.identity === image.identity
          )
      )
      .sort((a, b) => b.score - a.score)[0];

    if (usefulDetail) selected.push(usefulDetail);
  }

  if (
    selected.length < limit &&
    !usedTypes.has("measurements")
  ) {
    const fallback = safeMeasurementFallback(
      product,
      searchResults,
      selected
    );

    if (fallback) {
      selected.push({
        ...fallback,
        crossSourceMeasurement: true,
      });
    }
  }

  const finalSelection = orderImages(
    uniqueImages(selected)
  ).slice(0, limit);

  return {
    selectedSourceKey:
      getSourceKey(product.rawResult || {}) ||
      normalizeSource(product.source),
    selectedResultUrl:
      normalizeUrl(
        product.rawResult?.url ||
        product.sourceUrl
      ),
    selected: finalSelection,
    image_url: finalSelection[0]?.url || "",
    image_url_2: finalSelection[1]?.url || "",
    image_url_3: finalSelection[2]?.url || "",
    image_url_4: finalSelection[3]?.url || "",
    mixedSources:
      finalSelection.some(
        (image) => image.origin === "measurement_fallback"
      ),
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
  };
}
