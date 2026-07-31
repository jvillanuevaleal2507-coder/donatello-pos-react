export const ATLAS_IDENTITY = {
  name: "Atlas",
  projectName: "Proyecto Donatello–Atlas",
  role: "Copiloto comercial de Ventas Donatello",
  tone: "cercano, claro, útil y honesto",
};

export const ATLAS_MESSAGES = {
  idle: "Listo cuando tú lo estés.",
  analyzingImage: "Estoy revisando la fotografía...",
  searchingMatches: "Estoy buscando coincidencias visuales...",
  checkingAmazon: "Estoy revisando Amazon primero...",
  checkingOtherStores: "No me convenció Amazon. Estoy buscando otra fuente...",
  comparingImages: "Estoy comparando las fotografías...",
  selectingSource: "Estoy eligiendo la fuente más confiable...",
  selectingPhotos: "Estoy seleccionando las mejores imágenes...",
  buildingProduct: "Estoy preparando el producto para tu revisión...",
  ready: "Encontré una opción. Revísala y dime si es la correcta.",
  noResults: "No encontré una coincidencia suficientemente clara.",
  error: "Algo no salió bien, pero no guardaré nada sin tu aprobación.",
};

export const SEARCH_PRIORITY = [
  "amazon",
  "homedepot",
  "walmart",
  "wayfair",
  "manufacturer",
  "lowes",
  "mercadolibre",
  "other",
];

export const SOURCE_LABELS = {
  amazon: "Amazon",
  homedepot: "Home Depot",
  walmart: "Walmart",
  wayfair: "Wayfair",
  manufacturer: "Fabricante",
  lowes: "Lowe's",
  mercadolibre: "Mercado Libre",
  other: "Otra fuente",
};

export const MAX_PRODUCT_IMAGES = 4;
export const IMAGE_SLOT_PRIORITY = ["main", "dimensions", "environment", "detail"];
export const CONFIDENCE = { HIGH: 95, MEDIUM: 80, LOW: 60 };
export const PRODUCT_STATUS = {
  IDLE: "idle",
  ANALYZING: "analyzing",
  SEARCHING: "searching",
  RESULT: "result",
  NO_RESULTS: "no_results",
  ERROR: "error",
};

export const EXACT_IMAGE_BONUS = 1000;
export const SOURCE_PRIORITY_WEIGHT = 100;
export const CONFIDENCE_WEIGHT = 10;
export const TECHNICAL_DATA_BONUS = 25;
export const PRICE_AVAILABLE_BONUS = 15;
export const EXTRA_IMAGE_BONUS = 5;
