const AMAZON_HOSTS = [
  "amazon.com",
  "amazon.com.mx",
  "amazon.ca",
  "amazon.co.uk",
];

const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp|avif)(?:$|\?)/i;
const MAX_IMAGES = 30;

function normalizeText(value = "") {
  return String(value || "")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();
}

function normalizeAmazonImageUrl(value = "") {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  try {
    const url = new URL(normalized);

    if (!/^https:$/.test(url.protocol)) return "";

    // Amazon inserta modificadores de tamaño entre puntos:
    // image._AC_SX679_.jpg -> image.jpg
    url.pathname = url.pathname.replace(
      /\._[A-Z0-9_,\-]+_\.(?=(?:jpe?g|png|webp|avif)$)/i,
      "."
    );

    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function isAmazonUrl(value = "") {
  try {
    const hostname = new URL(value).hostname
      .toLowerCase()
      .replace(/^www\./, "");

    return AMAZON_HOSTS.some(
      (host) =>
        hostname === host ||
        hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

function isAmazonProductUrl(value = "") {
  if (!isAmazonUrl(value)) return false;

  try {
    const url = new URL(value);

    return (
      /\/dp\/[A-Z0-9]{10}/i.test(url.pathname) ||
      /\/gp\/product\/[A-Z0-9]{10}/i.test(url.pathname) ||
      /\/gp\/aw\/d\/[A-Z0-9]{10}/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function extractAsin(value = "") {
  const match = String(value).match(
    /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i
  );

  return match?.[1]?.toUpperCase() || "";
}

function imageIdentity(value = "") {
  try {
    const url = new URL(value);
    const fileName =
      url.pathname.split("/").filter(Boolean).pop()?.toLowerCase() || "";

    return fileName
      .replace(/\._[a-z0-9_,\-]+_\./gi, ".")
      .replace(/\.(jpe?g|png|webp|avif)$/i, "")
      .replace(/[^a-z0-9]/g, "");
  } catch {
    return normalizeText(value).toLowerCase();
  }
}

function classifyImage(url = "", hint = "") {
  const text = `${url} ${hint}`.toLowerCase();

  if (
    /dimension|dimensions|measurement|measurements|size chart|width|height|depth|length|inch|inches|medidas|dimensiones/.test(
      text
    )
  ) {
    return "measurements";
  }

  if (
    /living room|dining room|bedroom|office|kitchen|lifestyle|in use|ambiente|sala|comedor|recamara/.test(
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

function isLikelyAmazonProductImage(url = "") {
  if (!url || !IMAGE_EXTENSIONS.test(url)) return false;

  const text = url.toLowerCase();

  const allowedImageHosts = [
    "m.media-amazon.com",
    "images-na.ssl-images-amazon.com",
    "images.amazon.com",
  ];

  let hostname = "";

  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  if (!allowedImageHosts.some((host) => hostname.endsWith(host))) {
    return false;
  }

  return ![
    "sprite",
    "logo",
    "icon",
    "badge",
    "avatar",
    "transparent-pixel",
    "grey-pixel",
    "loading",
  ].some((term) => text.includes(term));
}

function pushImage(bucket, candidate = {}) {
  const url = normalizeAmazonImageUrl(candidate.url);

  if (!isLikelyAmazonProductImage(url)) return;

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
      classifyImage(url, candidate.alt || candidate.variant || ""),
    alt: candidate.alt || "",
    source: candidate.source || "amazon",
    variant: candidate.variant || "",
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

function extractDynamicImageAttribute(html, bucket) {
  const regex =
    /data-a-dynamic-image=(["'])(.*?)\1/gi;

  let match;

  while ((match = regex.exec(html))) {
    const raw = normalizeText(match[2])
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"');

    const parsed = safeJsonParse(raw);

    if (!parsed || typeof parsed !== "object") continue;

    for (const [url, dimensions] of Object.entries(parsed)) {
      pushImage(bucket, {
        url,
        type: bucket.length === 0 ? "main" : "other",
        source: "amazon-dynamic-image",
        variant: Array.isArray(dimensions)
          ? `${dimensions[0]}x${dimensions[1]}`
          : "",
      });
    }
  }
}

function extractImageBlockData(html, bucket) {
  const blockPatterns = [
    /'colorImages'\s*:\s*(\{[\s\S]*?\})\s*,\s*'colorToAsin'/gi,
    /"colorImages"\s*:\s*(\{[\s\S]*?\})\s*,\s*"colorToAsin"/gi,
    /var\s+obj\s*=\s*(\{[\s\S]*?"colorImages"[\s\S]*?\});/gi,
  ];

  for (const pattern of blockPatterns) {
    let match;

    while ((match = pattern.exec(html))) {
      let raw = match[1]
        .replace(/'/g, '"')
        .replace(/\bundefined\b/g, "null");

      const parsed = safeJsonParse(raw);
      const groups =
        parsed?.colorImages ||
        parsed;

      if (!groups || typeof groups !== "object") continue;

      for (const variants of Object.values(groups)) {
        if (!Array.isArray(variants)) continue;

        variants.forEach((image, index) => {
          const url =
            image?.hiRes ||
            image?.large ||
            image?.mainUrl ||
            image?.thumb;

          pushImage(bucket, {
            url,
            type: index === 0 && bucket.length === 0 ? "main" : "other",
            alt:
              image?.variant ||
              image?.altText ||
              "",
            source: "amazon-color-images",
            variant: image?.variant || "",
          });
        });
      }
    }
  }
}

function extractHiResAndLargePairs(html, bucket) {
  const objectRegex =
    /\{[^{}]{0,2500}?(?:"|')(?:hiRes|large)(?:"|')\s*:\s*(?:"|')https?:\\?\/\\?\/[^"'\\]+(?:"|')[^{}]{0,2500}?\}/gi;

  let match;

  while ((match = objectRegex.exec(html))) {
    const block = normalizeText(match[0]);

    const hiRes =
      block.match(
        /["']hiRes["']\s*:\s*["']([^"']+)["']/i
      )?.[1] || "";

    const large =
      block.match(
        /["']large["']\s*:\s*["']([^"']+)["']/i
      )?.[1] || "";

    const variant =
      block.match(
        /["']variant["']\s*:\s*["']([^"']+)["']/i
      )?.[1] || "";

    pushImage(bucket, {
      url: hiRes || large,
      source: "amazon-image-object",
      variant,
      alt: variant,
    });
  }
}

function extractAmazonMediaUrls(html, bucket) {
  const regex =
    /https:\\?\/\\?\/(?:m\.media-amazon\.com|images-na\.ssl-images-amazon\.com|images\.amazon\.com)\/images\/I\/[^"'\\\s<>]+?\.(?:jpe?g|png|webp|avif)/gi;

  let match;

  while ((match = regex.exec(html))) {
    pushImage(bucket, {
      url: match[0],
      source: "amazon-embedded-url",
    });

    if (bucket.length >= MAX_IMAGES) return;
  }
}

function removeRecommendationImages(images = [], html = "") {
  // Amazon suele mezclar recomendaciones en módulos alejados de ImageBlock.
  // Conservamos primero imágenes obtenidas desde estructuras propias de galería.
  const trustedSources = new Set([
    "amazon-dynamic-image",
    "amazon-color-images",
    "amazon-image-object",
  ]);

  const trusted = images.filter((image) =>
    trustedSources.has(image.source)
  );

  if (trusted.length >= 2) {
    return trusted;
  }

  return images;
}

export function canHandleAmazonUrl(url = "") {
  return isAmazonProductUrl(url);
}

export function extractAmazonGallery({
  html = "",
  url = "",
  maximum = MAX_IMAGES,
} = {}) {
  if (!canHandleAmazonUrl(url)) {
    return {
      ok: false,
      provider: "amazon",
      asin: "",
      images: [],
      count: 0,
      error: "La URL no corresponde a un producto válido de Amazon.",
    };
  }

  if (!html) {
    return {
      ok: false,
      provider: "amazon",
      asin: extractAsin(url),
      images: [],
      count: 0,
      error: "No se recibió el HTML del producto de Amazon.",
    };
  }

  const images = [];

  extractDynamicImageAttribute(html, images);
  extractImageBlockData(html, images);
  extractHiResAndLargePairs(html, images);
  extractAmazonMediaUrls(html, images);

  const filtered = removeRecommendationImages(images, html)
    .slice(0, Math.max(1, Number(maximum) || MAX_IMAGES))
    .map(({ identity, ...image }) => image);

  return {
    ok: filtered.length > 0,
    provider: "amazon",
    asin: extractAsin(url),
    url,
    images: filtered,
    count: filtered.length,
    error:
      filtered.length > 0
        ? ""
        : "Amazon no expuso una galería utilizable en el HTML recibido.",
  };
}
