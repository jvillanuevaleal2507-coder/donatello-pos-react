const GOOGLE_IMAGE_HOSTS = [
  "gstatic.com",
  "googleusercontent.com",
  "google.com",
];

function normalizeUrl(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function imageKey(value = "") {
  try {
    const url = new URL(value);
    const fileName = url.pathname.split("/").filter(Boolean).pop() || "";
    return fileName.toLowerCase().replace(/[^a-z0-9]/g, "");
  } catch {
    return "";
  }
}

function isGoogleThumbnail(value = "") {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return GOOGLE_IMAGE_HOSTS.some((item) => host.includes(item));
  } catch {
    return false;
  }
}

function flattenImageCandidates(product = {}, searchResults = []) {
  const candidates = [];

  const push = (url, type = "other", source = "") => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;

    candidates.push({
      url: normalized,
      type,
      source,
      googleThumbnail: isGoogleThumbnail(normalized),
      key: imageKey(normalized),
    });
  };

  push(product.image_url, "main", product.source);
  push(product.image_url_2, "other", product.source);
  push(product.image_url_3, "other", product.source);
  push(product.image_url_4, "other", product.source);

  for (const image of product.rawResult?.images || []) {
    push(
      typeof image === "string" ? image : image?.url,
      typeof image === "string" ? "other" : image?.type || "other",
      product.rawResult?.source || product.source
    );
  }

  for (const result of searchResults || []) {
    for (const image of result?.images || []) {
      push(
        typeof image === "string" ? image : image?.url,
        typeof image === "string" ? "other" : image?.type || "other",
        result?.source || ""
      );
    }
  }

  return candidates;
}

function distinctImages(candidates = []) {
  const directImagesExist = candidates.some(
    (image) => !image.googleThumbnail
  );

  const seenUrls = new Set();
  const seenKeys = new Set();
  const output = [];

  for (const image of candidates) {
    if (directImagesExist && image.googleThumbnail) continue;
    if (seenUrls.has(image.url)) continue;

    // Evita la misma fotografía servida por dos URLs diferentes.
    if (image.key && seenKeys.has(image.key)) continue;

    seenUrls.add(image.url);
    if (image.key) seenKeys.add(image.key);
    output.push(image);
  }

  return output;
}

function scoreImage(image = {}, index = 0) {
  let score = 100 - index;

  if (image.type === "main") score += 500;
  if (image.type === "measurements") score += 400;
  if (image.type === "environment") score += 300;
  if (image.type === "detail") score += 200;
  if (!image.googleThumbnail) score += 100;

  return score;
}

export function selectProductPhotos({
  product = {},
  searchResults = [],
  maximum = 4,
} = {}) {
  const candidates = flattenImageCandidates(product, searchResults);
  const selected = distinctImages(candidates)
    .map((image, index) => ({
      ...image,
      score: scoreImage(image, index),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Number(maximum) || 4));

  return {
    selected,
    image_url: selected[0]?.url || "",
    image_url_2: selected[1]?.url || "",
    image_url_3: selected[2]?.url || "",
    image_url_4: selected[3]?.url || "",
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
  };
}
