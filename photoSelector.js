const CATEGORY_RULES = {
  dining_table: {
    needsMeasurements: true,
    needsEnvironment: true,
    needsDetail: true,
  },
  nightstand: {
    needsMeasurements: true,
    needsEnvironment: true,
    needsDetail: true,
  },
  sofa: {
    needsMeasurements: true,
    needsEnvironment: true,
    needsDetail: true,
  },
  rocking_chair: {
    needsMeasurements: true,
    needsEnvironment: true,
    needsDetail: true,
  },
  mirror: {
    needsMeasurements: true,
    needsEnvironment: true,
    needsDetail: false,
  },
  bar_stool: {
    needsMeasurements: true,
    needsEnvironment: true,
    needsDetail: true,
  },
  chair: {
    needsMeasurements: true,
    needsEnvironment: true,
    needsDetail: true,
  },
  lamp: {
    needsMeasurements: false,
    needsEnvironment: true,
    needsDetail: true,
  },
  default: {
    needsMeasurements: false,
    needsEnvironment: true,
    needsDetail: true,
  },
};

const CATEGORY_PATTERNS = [
  {
    key: "dining_table",
    patterns: [
      "dining table",
      "dining set",
      "mesa de comedor",
      "comedor",
    ],
  },
  {
    key: "nightstand",
    patterns: ["nightstand", "bedside table", "buró", "buro"],
  },
  {
    key: "sofa",
    patterns: ["sofa", "couch", "sectional", "sillón", "sillon"],
  },
  {
    key: "rocking_chair",
    patterns: ["rocking chair", "glider", "mecedora"],
  },
  {
    key: "mirror",
    patterns: ["mirror", "espejo"],
  },
  {
    key: "bar_stool",
    patterns: ["bar stool", "counter stool", "banco alto"],
  },
  {
    key: "chair",
    patterns: ["chair", "accent chair", "silla"],
  },
  {
    key: "lamp",
    patterns: [
      "lamp",
      "table lamp",
      "desk lamp",
      "floor lamp",
      "lámpara",
      "lampara",
    ],
  },
];

function cleanText(value = "") {
  return String(value || "").toLowerCase();
}

function uniqueImages(images = []) {
  const seen = new Set();

  return images.filter((image) => {
    if (!image?.url || seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

export function detectProductCategory(product = {}) {
  const text = cleanText(
    [
      product.name,
      product.category,
      product.rawResult?.title,
      product.description,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const match = CATEGORY_PATTERNS.find(({ patterns }) =>
    patterns.some((pattern) => text.includes(pattern))
  );

  return match?.key || "default";
}

export function getCategoryPhotoRules(product = {}) {
  const categoryKey = detectProductCategory(product);

  return {
    categoryKey,
    ...(CATEGORY_RULES[categoryKey] || CATEGORY_RULES.default),
  };
}

export function selectProductPhotos({
  product = {},
  sourceDecision = {},
  maximum = 4,
} = {}) {
  const rules = getCategoryPhotoRules(product);

  const candidates = {
    main: sourceDecision.images?.main || null,
    measurements: sourceDecision.images?.measurements || null,
    environment: sourceDecision.images?.environment || null,
    detail: sourceDecision.images?.detail || null,
  };

  const ordered = [];

  if (candidates.main) {
    ordered.push({
      ...candidates.main,
      type: "main",
    });
  }

  if (rules.needsMeasurements && candidates.measurements) {
    ordered.push({
      ...candidates.measurements,
      type: "measurements",
    });
  }

  if (rules.needsEnvironment && candidates.environment) {
    ordered.push({
      ...candidates.environment,
      type: "environment",
    });
  }

  if (rules.needsDetail && candidates.detail) {
    ordered.push({
      ...candidates.detail,
      type: "detail",
    });
  }

  // Rellenar huecos con imágenes útiles disponibles.
  const fallbacks = [
    candidates.measurements,
    candidates.environment,
    candidates.detail,
  ]
    .filter(Boolean)
    .map((image) => ({
      ...image,
      type: image.type || "other",
    }));

  const selected = uniqueImages([...ordered, ...fallbacks]).slice(
    0,
    Math.max(1, Number(maximum) || 4)
  );

  return {
    categoryKey: rules.categoryKey,
    rules,
    selected,
    slots: {
      main: selected[0] || null,
      second: selected[1] || null,
      third: selected[2] || null,
      fourth: selected[3] || null,
    },
    missing: {
      measurements:
        rules.needsMeasurements && !candidates.measurements,
      environment:
        rules.needsEnvironment && !candidates.environment,
      detail:
        rules.needsDetail && !candidates.detail,
    },
  };
}

export function applySelectedPhotos(product = {}, selection = {}) {
  const selected = selection.selected || [];

  return {
    ...product,
    image_url: selected[0]?.url || product.image_url || "",
    image_url_2: selected[1]?.url || product.image_url_2 || "",
    image_url_3: selected[2]?.url || product.image_url_3 || "",
    image_url_4: selected[3]?.url || product.image_url_4 || "",
    photoSelection: selection,
  };
}

export const PHOTO_SELECTOR_CONFIG = {
  categoryRules: CATEGORY_RULES,
};
