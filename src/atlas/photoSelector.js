const IMAGE_TYPE_PRIORITY = {
  main: 500,
  measurements: 400,
  environment: 300,
  detail: 200,
  other: 100,
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

function getHost(value = "") {
  try {
    return new URL(value).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeSource(value = "") {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getResultSourceKey(result = {}) {
  return normalizeSource(
    result.sourceKey ||
      result.source ||
      getHost(result.url)
  );
}

function classifyImage(image = {}) {
  const explicitType = normalizeText(image.type);

  if (
    ["main", "measurements", "environment", "detail"].includes(
      explicitType
    )
  ) {
    return explicitType;
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

function getImageIdentity(value = "") {
  try {
    const url = new URL(value);

    const cleanPath = url.pathname
      .toLowerCase()
      .replace(/\/+/g, "/")
      .replace(/[-_](small|medium|large|thumb|thumbnail|preview)(?=\.|$)/g, "")
      .replace(/[^a-z0-9/.]/g, "");

    const fileName =
      cleanPath.split("/").filter(Boolean).pop() || "";

    return `${url.hostname.replace(/^www\./, "")}:${fileName}`;
  } catch {
    return normalizeText(value);
  }
}

function isLikelyThumbnail(value = "") {
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

function buildImageCandidate({
  image,
  result,
  selectedSourceKey,
  selectedResultUrl,
}) {
  const rawUrl =
    typeof image === "string" ? image : image?.url;

  const url = normalizeUrl(rawUrl);
  if (!url) return null;

  const type = classifyImage(
    typeof image === "string"
      ? { url }
      : { ...image, url }
  );

  const sourceKey = getResultSourceKey(result);
  const sameSource =
    Boolean(selectedSourceKey) &&
    sourceKey === selectedSourceKey;

  const sameResult =
    Boolean(selectedResultUrl) &&
    normalizeUrl(result?.url) === normalizeUrl(selectedResultUrl);

  const candidate = {
    url,
    type,
    source: result?.source || "",
    sourceKey,
    resultUrl: result?.url || "",
    sameSource,
    sameResult,
    thumbnail: isLikelyThumbnail(url),
    identity: getImageIdentity(url),
  };

  let score = IMAGE_TYPE_PRIORITY[type] || IMAGE_TYPE_PRIORITY.other;

  if (sameResult) score += 1000;
  else if (sameSource) score += 700;

  if (!candidate.thumbnail) score += 100;

  candidate.score = score;

  return candidate;
}

function collectCandidates({
  product = {},
  searchResults = [],
}) {
  const selectedResult = product.rawResult || {};
  const selectedSourceKey = getResultSourceKey(selectedResult) ||
    normalizeSource(product.source);
  const selectedResultUrl =
    selectedResult.url || product.sourceUrl || "";

  const candidates = [];

  const addFromResult = (result) => {
    const images = Array.isArray(result?.images)
      ? result.images
      : [];

    for (const image of images) {
      const candidate = buildImageCandidate({
        image,
        result,
        selectedSourceKey,
        selectedResultUrl,
      });

      if (candidate) candidates.push(candidate);
    }
  };

  // Primero: fotografías del resultado seleccionado.
  addFromResult(selectedResult);

  // Segundo: fotografías de la misma fuente.
  for (const result of searchResults) {
    if (result === selectedResult) continue;

    if (
      getResultSourceKey(result) === selectedSourceKey
    ) {
      addFromResult(result);
    }
  }

  // Tercero: otras fuentes. Solo serán consideradas después
  // para una imagen de medidas y bajo condiciones estrictas.
  for (const result of searchResults) {
    if (
      getResultSourceKey(result) !== selectedSourceKey
    ) {
      addFromResult(result);
    }
  }

  return {
    candidates,
    selectedSourceKey,
    selectedResultUrl,
  };
}

function uniqueCandidates(candidates = []) {
  const seenUrls = new Set();
  const seenIdentities = new Set();
  const output = [];

  for (const candidate of candidates) {
    if (!candidate?.url) continue;
    if (seenUrls.has(candidate.url)) continue;

    if (
      candidate.identity &&
      seenIdentities.has(candidate.identity)
    ) {
      continue;
    }

    seenUrls.add(candidate.url);
    if (candidate.identity) {
      seenIdentities.add(candidate.identity);
    }

    output.push(candidate);
  }

  return output;
}

function chooseFromSameProductSource(candidates = []) {
  const preferred = candidates
    .filter((candidate) => candidate.sameSource)
    .sort((a, b) => b.score - a.score);

  return uniqueCandidates(preferred);
}

function chooseMeasurementFallback({
  candidates = [],
  alreadySelected = [],
}) {
  const usedUrls = new Set(
    alreadySelected.map((image) => image.url)
  );
  const usedIdentities = new Set(
    alreadySelected
      .map((image) => image.identity)
      .filter(Boolean)
  );

  return (
    candidates
      .filter(
        (candidate) =>
          candidate.type === "measurements" &&
          !candidate.sameSource &&
          !usedUrls.has(candidate.url) &&
          !usedIdentities.has(candidate.identity) &&
          !candidate.thumbnail
      )
      .sort((a, b) => b.score - a.score)[0] || null
  );
}

function orderSelectedImages(images = []) {
  const typeOrder = {
    main: 0,
    measurements: 1,
    environment: 2,
    detail: 3,
    other: 4,
  };

  return [...images].sort((a, b) => {
    const typeDifference =
      (typeOrder[a.type] ?? 99) -
      (typeOrder[b.type] ?? 99);

    if (typeDifference !== 0) return typeDifference;

    return b.score - a.score;
  });
}

export function selectProductPhotos({
  product = {},
  searchResults = [],
  maximum = 4,
} = {}) {
  const {
    candidates,
    selectedSourceKey,
    selectedResultUrl,
  } = collectCandidates({
    product,
    searchResults,
  });

  const sameSourceImages =
    chooseFromSameProductSource(candidates);

  const selected = [];
  const usedTypes = new Set();

  const addBestType = (type) => {
    const candidate = sameSourceImages.find(
      (image) =>
        image.type === type &&
        !selected.some(
          (selectedImage) =>
            selectedImage.url === image.url ||
            selectedImage.identity === image.identity
        )
    );

    if (candidate) {
      selected.push(candidate);
      usedTypes.add(type);
    }
  };

  addBestType("main");
  addBestType("measurements");
  addBestType("environment");
  addBestType("detail");

  // Completar con fotografías distintas de la misma fuente.
  for (const candidate of sameSourceImages) {
    if (selected.length >= maximum) break;

    const duplicated = selected.some(
      (image) =>
        image.url === candidate.url ||
        image.identity === candidate.identity
    );

    if (!duplicated) selected.push(candidate);
  }

  // Única excepción: foto de medidas de otra tienda.
  // Nunca se usan fotos de ambiente, detalle o principal
  // de una fuente distinta.
  if (
    selected.length < maximum &&
    !usedTypes.has("measurements")
  ) {
    const measurementFallback =
      chooseMeasurementFallback({
        candidates,
        alreadySelected: selected,
      });

    if (measurementFallback) {
      selected.push({
        ...measurementFallback,
        crossSourceMeasurement: true,
      });
    }
  }

  const finalSelection = orderSelectedImages(
    uniqueCandidates(selected)
  ).slice(0, Math.max(1, Number(maximum) || 4));

  return {
    selectedSourceKey,
    selectedResultUrl,
    selected: finalSelection,
    image_url: finalSelection[0]?.url || "",
    image_url_2: finalSelection[1]?.url || "",
    image_url_3: finalSelection[2]?.url || "",
    image_url_4: finalSelection[3]?.url || "",
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
  };
}
