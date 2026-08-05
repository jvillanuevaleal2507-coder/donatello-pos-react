const HOME_DEPOT_HOSTS = [
  "homedepot.com",
  "homedepot.ca",
  "homedepot.com.mx",
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

function getHostname(value = "") {
  try {
    return new URL(value).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isHomeDepotUrl(value = "") {
  const hostname = getHostname(value);

  return HOME_DEPOT_HOSTS.some(
    (host) =>
      hostname === host ||
      hostname.endsWith(`.${host}`)
  );
}

function isHomeDepotProductUrl(value = "") {
  if (!isHomeDepotUrl(value)) return false;

  try {
    const url = new URL(value);

    return (
      /\/p\//i.test(url.pathname) ||
      /\/product\//i.test(url.pathname) ||
      /\/productdetails\//i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function extractProductId(value = "") {
  const patterns = [
    /\/p\/[^/]+\/(\d{6,})/i,
    /\/product\/[^/]+\/(\d{6,})/i,
    /[?&](?:productId|itemId|sku)=(\d{6,})/i,
  ];

  for (const pattern of patterns) {
    const match = String(value).match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

function normalizeHomeDepotImageUrl(value = "") {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  try {
    const url = new URL(normalized);

    if (url.protocol !== "https:") return "";

    url.hash = "";

    [
      "wid",
      "hei",
      "fit",
      "fmt",
      "qlt",
      "op_usm",
      "resMode",
      "scl",
      "crop",
    ].forEach((key) => url.searchParams.delete(key));

    return url.toString();
  } catch {
    return "";
  }
}

function imageIdentity(value = "") {
  try {
    const url = new URL(value);
    const fileName =
      url.pathname.split("/").filter(Boolean).pop()?.toLowerCase() || "";

    return fileName
      .replace(/[-_](thumb|thumbnail|small|medium|large|zoom|main|hero)/g, "")
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
    /dimension|dimensions|measurement|measurements|specification|specifications|width|height|depth|length|size chart|inch|inches|medidas|dimensiones/.test(
      text
    )
  ) {
    return "measurements";
  }

  if (
    /living room|dining room|bedroom|office|kitchen|lifestyle|room scene|in use|installed|ambiente|sala|comedor|recamara/.test(
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

function isLikelyHomeDepotImage(value = "") {
  const url = normalizeHomeDepotImageUrl(value);
  if (!url || !IMAGE_EXTENSIONS.test(url)) return false;

  const hostname = getHostname(url);
  const text = url.toLowerCase();

  const allowedHosts = [
    "homedepot.com",
    "homedepot.ca",
    "homedepot.com.mx",
    "thdstatic.com",
    "scene7.com",
    "cloudfront.net",
    "akamaihd.net",
  ];

  if (
    !allowedHosts.some(
      (host) =>
        hostname === host ||
        hostname.endsWith(`.${host}`) ||
        hostname.includes("homedepot") ||
        hostname.includes("thd")
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
    "swatch",
  ].some((term) => text.includes(term));
}

function pushImage(bucket, candidate = {}) {
  const url = normalizeHomeDepotImageUrl(candidate.url);

  if (!isLikelyHomeDepotImage(url)) return;

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
    source: candidate.source || "homedepot",
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

function extractStructuredJson(html, bucket) {
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
            /image|media|asset|thumbnail|zoom|scene7/.test(normalizedKey)
          ) {
            pushImage(bucket, {
              url: value,
              source: "homedepot-json",
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
            /image|media|asset|gallery|carousel/.test(normalizedKey)
          ) {
            value.forEach((item, index) => {
              if (typeof item === "string") {
                pushImage(bucket, {
                  url: item,
                  source: "homedepot-json-array",
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
                  item.assetUrl ||
                  item.primary;

                pushImage(bucket, {
                  url,
                  source: "homedepot-json-array",
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

function extractThdStaticUrls(html, bucket) {
  const regex =
    /https:\\?\/\\?\/[^"'\\\s<>]*(?:thdstatic|homedepot|scene7)[^"'\\\s<>]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'\\\s<>]*)?/gi;

  let match;

  while ((match = regex.exec(html))) {
    pushImage(bucket, {
      url: match[0],
      source: "homedepot-embedded-url",
    });

    if (bucket.length >= MAX_IMAGES) return;
  }
}

function extractEmbeddedImageObjects(html, bucket) {
  const patterns = [
    /["'](?:imageUrl|image_url|primaryImage|zoomImage|largeImage|assetUrl|src|thumbnail)["']\s*:\s*["']([^"']+)["']/gi,
    /["'](?:url|src)["']\s*:\s*["'](https?:\\?\/\\?\/[^"']+\.(?:jpe?g|png|webp|avif)[^"']*)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.exec(html))) {
      pushImage(bucket, {
        url: match[1],
        source: "homedepot-embedded-json",
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
        source: "homedepot-img-tag",
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

  const sourcePriority = {
    "homedepot-json": 0,
    "homedepot-json-array": 1,
    "homedepot-embedded-url": 2,
    "homedepot-embedded-json": 3,
    "homedepot-img-tag": 4,
  };

  return [...images].sort((a, b) => {
    const typeDifference =
      (typeOrder[a.type] ?? 9) -
      (typeOrder[b.type] ?? 9);

    if (typeDifference !== 0) return typeDifference;

    return (
      (sourcePriority[a.source] ?? 9) -
      (sourcePriority[b.source] ?? 9)
    );
  });
}

export function canHandleHomeDepotUrl(url = "") {
  return isHomeDepotProductUrl(url);
}

export function extractHomeDepotGallery({
  html = "",
  url = "",
  maximum = MAX_IMAGES,
} = {}) {
  if (!canHandleHomeDepotUrl(url)) {
    return {
      ok: false,
      provider: "homedepot",
      productId: "",
      images: [],
      count: 0,
      error:
        "La URL no corresponde a un producto válido de Home Depot.",
    };
  }

  if (!html) {
    return {
      ok: false,
      provider: "homedepot",
      productId: extractProductId(url),
      images: [],
      count: 0,
      error:
        "No se recibió el HTML del producto de Home Depot.",
    };
  }

  const images = [];

  extractStructuredJson(html, images);
  extractThdStaticUrls(html, images);
  extractEmbeddedImageObjects(html, images);
  extractImgTags(html, images);

  const selected = prioritize(images)
    .slice(0, Math.max(1, Number(maximum) || MAX_IMAGES))
    .map(({ identity, ...image }) => image);

  return {
    ok: selected.length > 0,
    provider: "homedepot",
    productId: extractProductId(url),
    url,
    images: selected,
    count: selected.length,
    error:
      selected.length > 0
        ? ""
        : "Home Depot no expuso una galería utilizable en el HTML recibido.",
  };
}
