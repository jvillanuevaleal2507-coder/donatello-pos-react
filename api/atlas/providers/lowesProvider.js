const LOWES_HOSTS = [
  "lowes.com",
  "lowes.ca",
];

const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp|avif)(?:$|\?)/i;
const MAX_IMAGES = 30;

function normalizeText(value = "") {
  return String(value || "")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();
}

function normalizeLowesImageUrl(value = "") {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  try {
    const url = new URL(normalized);

    if (url.protocol !== "https:") return "";

    url.hash = "";

    // Quita parámetros de tamaño para intentar conservar la versión grande.
    [
      "wid",
      "hei",
      "fmt",
      "qlt",
      "fit",
      "op_usm",
      "resMode",
      "scl",
    ].forEach((key) => url.searchParams.delete(key));

    return url.toString();
  } catch {
    return "";
  }
}

function getHostname(value = "") {
  try {
    return new URL(value).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isLowesUrl(value = "") {
  const hostname = getHostname(value);

  return LOWES_HOSTS.some(
    (host) =>
      hostname === host ||
      hostname.endsWith(`.${host}`)
  );
}

function isLowesProductUrl(value = "") {
  if (!isLowesUrl(value)) return false;

  try {
    const url = new URL(value);

    return (
      /\/pd\//i.test(url.pathname) ||
      /\/product\//i.test(url.pathname) ||
      /\/pdp\//i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function extractProductId(value = "") {
  const patterns = [
    /\/pd\/[^/]+\/(\d+)/i,
    /\/product\/[^/]+\/(\d+)/i,
    /[?&](?:productId|itemId)=(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = String(value).match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

function imageIdentity(value = "") {
  try {
    const url = new URL(value);
    const fileName =
      url.pathname.split("/").filter(Boolean).pop()?.toLowerCase() || "";

    return fileName
      .replace(/[-_](thumb|thumbnail|small|medium|large|zoom|main)/g, "")
      .replace(/[-_]\d+x\d+/g, "")
      .replace(/\.(jpe?g|png|webp|avif)$/i, "")
      .replace(/[^a-z0-9]/g, "");
  } catch {
    return normalizeText(value).toLowerCase();
  }
}

function classifyImage(url = "", hint = "") {
  const text = `${url} ${hint}`.toLowerCase();

  if (
    /dimension|dimensions|measurement|measurements|specification|specifications|width|height|depth|length|inch|inches|size|medidas|dimensiones/.test(
      text
    )
  ) {
    return "measurements";
  }

  if (
    /living room|dining room|bedroom|office|kitchen|lifestyle|styled|room scene|in use|ambiente|sala|comedor|recamara/.test(
      text
    )
  ) {
    return "environment";
  }

  if (
    /detail|close[- ]?up|texture|finish|material|wood grain|fabric|metal|detalle|acabado|textura/.test(
      text
    )
  ) {
    return "detail";
  }

  return "other";
}

function isLikelyLowesImage(value = "") {
  const url = normalizeLowesImageUrl(value);
  if (!url || !IMAGE_EXTENSIONS.test(url)) return false;

  const hostname = getHostname(url);
  const text = url.toLowerCase();

  const allowedHosts = [
    "lowes.com",
    "lowes.ca",
    "scene7.com",
    "scene7.com.is",
    "akamaihd.net",
    "cloudfront.net",
  ];

  if (
    !allowedHosts.some(
      (host) =>
        hostname === host ||
        hostname.endsWith(`.${host}`) ||
        hostname.includes("lowes")
    )
  ) {
    return false;
  }

  return ![
    "logo",
    "icon",
    "sprite",
    "badge",
    "avatar",
    "pixel",
    "placeholder",
    "loading",
  ].some((term) => text.includes(term));
}

function pushImage(bucket, candidate = {}) {
  const url = normalizeLowesImageUrl(candidate.url);

  if (!isLikelyLowesImage(url)) return;

  const identity = imageIdentity(url);

  if (
    bucket.some(
      (item) =>
        item.url === url ||
        (identity && item.identity === identity)
    )
  ) {
    return;
  }

  bucket.push({
    url,
    type:
      candidate.type ||
      classifyImage(
        url,
        candidate.alt ||
          candidate.title ||
          candidate.role ||
          ""
      ),
    alt: candidate.alt || "",
    source: candidate.source || "lowes",
    role: candidate.role || "",
    identity,
  });
}

function safeJsonParse(value = "") {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function walkObject(value, visit, path = []) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkObject(item, visit, [...path, index])
    );
    return;
  }

  visit(value, path);

  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === "object") {
      walkObject(child, visit, [...path, key]);
    }
  }
}

function extractJsonScripts(html, bucket) {
  const patterns = [
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ];

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.exec(html))) {
      const parsed = safeJsonParse(match[1].trim());
      if (!parsed) continue;

      walkObject(parsed, (node) => {
        for (const [key, value] of Object.entries(node)) {
          const normalizedKey = key.toLowerCase();

          if (
            typeof value === "string" &&
            /image|img|media|scene7|asset/.test(normalizedKey)
          ) {
            pushImage(bucket, {
              url: value,
              source: "lowes-json",
              role: normalizedKey,
              alt:
                node.alt ||
                node.altText ||
                node.title ||
                node.description ||
                "",
            });
          }

          if (
            Array.isArray(value) &&
            /image|media|asset|gallery/.test(normalizedKey)
          ) {
            value.forEach((item, index) => {
              if (typeof item === "string") {
                pushImage(bucket, {
                  url: item,
                  source: "lowes-json-array",
                  role: normalizedKey,
                });
              } else if (item && typeof item === "object") {
                const url =
                  item.url ||
                  item.src ||
                  item.imageUrl ||
                  item.image_url ||
                  item.full ||
                  item.zoom ||
                  item.large ||
                  item.assetUrl;

                pushImage(bucket, {
                  url,
                  source: "lowes-json-array",
                  role:
                    item.type ||
                    item.role ||
                    normalizedKey,
                  alt:
                    item.alt ||
                    item.altText ||
                    item.title ||
                    item.description ||
                    "",
                  type:
                    index === 0 && bucket.length === 0
                      ? "main"
                      : undefined,
                });
              }
            });
          }
        }
      });
    }
  }
}

function extractScene7Urls(html, bucket) {
  const regex =
    /https:\\?\/\\?\/[^"'\\\s<>]*scene7[^"'\\\s<>]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'\\\s<>]*)?/gi;

  let match;

  while ((match = regex.exec(html))) {
    pushImage(bucket, {
      url: match[0],
      source: "lowes-scene7",
    });

    if (bucket.length >= MAX_IMAGES) return;
  }
}

function extractEmbeddedImageObjects(html, bucket) {
  const patterns = [
    /["'](?:imageUrl|image_url|primaryImage|zoomImage|largeImage|assetUrl|src)["']\s*:\s*["']([^"']+)["']/gi,
    /["'](?:url|src)["']\s*:\s*["'](https?:\\?\/\\?\/[^"']+\.(?:jpe?g|png|webp|avif)[^"']*)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.exec(html))) {
      pushImage(bucket, {
        url: match[1],
        source: "lowes-embedded-json",
      });

      if (bucket.length >= MAX_IMAGES) return;
    }
  }
}

function extractImgTags(html, bucket) {
  const regex = /<img\b[^>]*>/gi;
  let match;

  while ((match = regex.exec(html))) {
    const tag = match[0];

    const alt =
      tag.match(/\balt=["']([^"']*)["']/i)?.[1] || "";

    const candidates = [
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1],
      tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1],
      tag.match(/\bdata-zoom-image=["']([^"']+)["']/i)?.[1],
      tag.match(/\bdata-image=["']([^"']+)["']/i)?.[1],
    ].filter(Boolean);

    const srcset =
      tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bdata-srcset=["']([^"']+)["']/i)?.[1];

    if (srcset) {
      const largest = srcset
        .split(",")
        .map((item) => item.trim().split(/\s+/)[0])
        .filter(Boolean)
        .pop();

      if (largest) candidates.push(largest);
    }

    candidates.forEach((url, index) => {
      pushImage(bucket, {
        url,
        alt,
        source: "lowes-img-tag",
        type:
          bucket.length === 0 && index === 0
            ? "main"
            : undefined,
      });
    });
  }
}

function prioritize(images = []) {
  const typeOrder = {
    main: 0,
    measurements: 1,
    environment: 2,
    other: 3,
    detail: 4,
  };

  return [...images].sort((a, b) => {
    const sourcePriority = (image) => {
      if (image.source === "lowes-json") return 0;
      if (image.source === "lowes-json-array") return 1;
      if (image.source === "lowes-scene7") return 2;
      if (image.source === "lowes-embedded-json") return 3;
      return 4;
    };

    const typeDifference =
      (typeOrder[a.type] ?? 9) -
      (typeOrder[b.type] ?? 9);

    if (typeDifference !== 0) return typeDifference;

    return sourcePriority(a) - sourcePriority(b);
  });
}

export function canHandleLowesUrl(url = "") {
  return isLowesProductUrl(url);
}

export function extractLowesGallery({
  html = "",
  url = "",
  maximum = MAX_IMAGES,
} = {}) {
  if (!canHandleLowesUrl(url)) {
    return {
      ok: false,
      provider: "lowes",
      productId: "",
      images: [],
      count: 0,
      error: "La URL no corresponde a un producto válido de Lowe's.",
    };
  }

  if (!html) {
    return {
      ok: false,
      provider: "lowes",
      productId: extractProductId(url),
      images: [],
      count: 0,
      error: "No se recibió el HTML del producto de Lowe's.",
    };
  }

  const images = [];

  extractJsonScripts(html, images);
  extractScene7Urls(html, images);
  extractEmbeddedImageObjects(html, images);
  extractImgTags(html, images);

  const selected = prioritize(images)
    .slice(0, Math.max(1, Number(maximum) || MAX_IMAGES))
    .map(({ identity, ...image }) => image);

  return {
    ok: selected.length > 0,
    provider: "lowes",
    productId: extractProductId(url),
    url,
    images: selected,
    count: selected.length,
    error:
      selected.length > 0
        ? ""
        : "Lowe's no expuso una galería utilizable en el HTML recibido.",
  };
}
