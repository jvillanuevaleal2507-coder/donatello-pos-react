import {
  canHandleAmazonUrl,
  extractAmazonGallery,
} from "./providers/amazonProvider.js";

import {
  canHandleHomeDepotUrl,
  extractHomeDepotGallery,
} from "./providers/homeDepotProvider.js";

import {
  canHandleLowesUrl,
  extractLowesGallery,
} from "./providers/lowesProvider.js";

import {
  canHandleTargetUrl,
  extractTargetGallery,
} from "./providers/targetProvider.js";

import {
  canHandleWalmartUrl,
  extractWalmartGallery,
} from "./providers/walmartProvider.js";

import {
  canHandleShopifyProductPage,
  extractShopifyGallery,
} from "../../server/atlas/shopifyProvider.js";

import { resolveShoppingProduct } from "./shoppingProductResolver.js";

const DEFAULT_TIMEOUT_MS = 12000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 40;

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/,
];

const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp|avif)(?:$|\?)/i;

function normalizeText(value = "") {
  return String(value || "")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))
    );
  } catch {
    return false;
  }
}

function absoluteUrl(value, pageUrl) {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  try {
    return new URL(normalized, pageUrl).toString();
  } catch {
    return "";
  }
}

function isLikelyProductImage(value) {
  if (!isPublicHttpsUrl(value)) return false;

  const text = value.toLowerCase();
  if (
    text.includes("logo") ||
    text.includes("icon") ||
    text.includes("sprite") ||
    text.includes("favicon") ||
    text.includes("avatar") ||
    text.includes("badge") ||
    text.includes("tracking") ||
    text.includes("pixel") ||
    text.includes("placeholder")
  ) {
    return false;
  }

  return (
    IMAGE_EXTENSIONS.test(value) ||
    text.includes("/image") ||
    text.includes("/images/") ||
    text.includes("media")
  );
}

function classifyImage(url, hint = "") {
  const text = `${url} ${hint}`.toLowerCase();

  if (
    /dimension|measurement|measurements|size chart|width|height|depth|length|medidas|dimensiones/.test(
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

function imageIdentity(url) {
  try {
    const parsed = new URL(url);
    const fileName =
      parsed.pathname.split("/").filter(Boolean).pop()?.toLowerCase() || "";

    const clean = fileName
      .replace(/[-_](thumb|thumbnail|small|medium|large|preview|zoom|main|hero)/g, "")
      .replace(/[-_]\d+x\d+/g, "")
      .replace(/\.(jpe?g|png|webp|avif)$/i, "")
      .replace(/[^a-z0-9]/g, "");

    return clean.length >= 8 ? clean : parsed.toString();
  } catch {
    return url;
  }
}

function pushImage(bucket, candidate) {
  if (!candidate?.url) return;

  const url = candidate.url;
  if (!isLikelyProductImage(url)) return;

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
    type: candidate.type || classifyImage(url, candidate.alt || ""),
    alt: candidate.alt || "",
    source: candidate.source || "page",
    width: candidate.width || null,
    height: candidate.height || null,
    identity,
  });
}

function extractJsonLd(html, pageUrl, bucket) {
  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = scriptRegex.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const nodes = Array.isArray(parsed)
        ? parsed
        : parsed?.["@graph"]
        ? parsed["@graph"]
        : [parsed];

      for (const node of nodes) {
        const images = node?.image;

        if (typeof images === "string") {
          pushImage(bucket, {
            url: absoluteUrl(images, pageUrl),
            type: "main",
            source: "json-ld",
          });
        } else if (Array.isArray(images)) {
          images.forEach((image, index) => {
            const url =
              typeof image === "string"
                ? image
                : image?.url || image?.contentUrl;

            pushImage(bucket, {
              url: absoluteUrl(url, pageUrl),
              type: index === 0 ? "main" : "other",
              alt: image?.caption || image?.name || "",
              source: "json-ld",
            });
          });
        }
      }
    } catch {
      // JSON-LD inválido: se ignora sin romper la extracción.
    }
  }
}

function extractMetaImages(html, pageUrl, bucket) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      pushImage(bucket, {
        url: absoluteUrl(match[1], pageUrl),
        type: "main",
        source: "meta",
      });
    }
  }
}

function extractImgTags(html, pageUrl, bucket) {
  const imgRegex = /<img\b[^>]*>/gi;
  let tag;

  while ((tag = imgRegex.exec(html))) {
    const htmlTag = tag[0];
    const alt = htmlTag.match(/\balt=["']([^"']*)["']/i)?.[1] || "";

    const candidates = [
      htmlTag.match(/\bsrc=["']([^"']+)["']/i)?.[1],
      htmlTag.match(/\bdata-src=["']([^"']+)["']/i)?.[1],
      htmlTag.match(/\bdata-zoom-image=["']([^"']+)["']/i)?.[1],
      htmlTag.match(/\bdata-image=["']([^"']+)["']/i)?.[1],
    ].filter(Boolean);

    const srcset =
      htmlTag.match(/\bsrcset=["']([^"']+)["']/i)?.[1] ||
      htmlTag.match(/\bdata-srcset=["']([^"']+)["']/i)?.[1];

    if (srcset) {
      const highestCandidate = srcset
        .split(",")
        .map((item) => item.trim().split(/\s+/)[0])
        .filter(Boolean)
        .pop();
      if (highestCandidate) candidates.push(highestCandidate);
    }

    for (const candidate of candidates) {
      pushImage(bucket, {
        url: absoluteUrl(candidate, pageUrl),
        type: classifyImage(candidate, alt),
        alt,
        source: "img-tag",
      });
    }
  }
}

function extractEmbeddedImageUrls(html, pageUrl, bucket) {
  const patterns = [
    /https:\\?\/\\?\/[^"'\\\s<>]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'\\\s<>]*)?/gi,
    /["'](?:url|imageUrl|image_url|zoomUrl|hiRes|largeImage|primaryImage)["']\s*:\s*["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const value = match[1] || match[0];
      pushImage(bucket, {
        url: absoluteUrl(value, pageUrl),
        type: classifyImage(value),
        source: "embedded-json",
      });

      if (bucket.length >= MAX_IMAGES) return;
    }
  }
}

async function fetchHtml(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!isPublicHttpsUrl(url)) {
    throw new Error("La URL del producto no es pública o válida.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`La tienda respondió con HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      throw new Error("La URL no devolvió una página HTML.");
    }

    const text = await response.text();
    return text.length > MAX_HTML_BYTES ? text.slice(0, MAX_HTML_BYTES) : text;
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractGalleryFromUrl({
  url,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maximum = MAX_IMAGES,
} = {}) {
  if (!url) {
    return {
      ok: false,
      url: "",
      images: [],
      error: "Falta la URL del producto.",
    };
  }

  try {
    const html = await fetchHtml(url, timeoutMs);

    if (canHandleAmazonUrl(url)) {
      const gallery = extractAmazonGallery({ html, url, maximum });
      if (gallery.ok && gallery.images.length) {
        return { ...gallery, providerUsed: "amazon", fallbackUsed: false };
      }
    }

    if (canHandleHomeDepotUrl(url)) {
      const gallery = extractHomeDepotGallery({ html, url, maximum });
      if (gallery.ok && gallery.images.length) {
        return { ...gallery, providerUsed: "homedepot", fallbackUsed: false };
      }
    }

    if (canHandleLowesUrl(url)) {
      const gallery = extractLowesGallery({ html, url, maximum });
      if (gallery.ok && gallery.images.length) {
        return { ...gallery, providerUsed: "lowes", fallbackUsed: false };
      }
    }

    if (canHandleTargetUrl(url)) {
      const gallery = extractTargetGallery({ html, url, maximum });
      if (gallery.ok && gallery.images.length) {
        return { ...gallery, providerUsed: "target", fallbackUsed: false };
      }
    }

    if (canHandleWalmartUrl(url)) {
      const gallery = extractWalmartGallery({ html, url, maximum });
      if (gallery.ok && gallery.images.length) {
        return { ...gallery, providerUsed: "walmart", fallbackUsed: false };
      }
    }

    if (canHandleShopifyProductPage({ html, url })) {
      const gallery = await extractShopifyGallery({
        html,
        url,
        maximum,
        timeoutMs: Math.min(timeoutMs, 8000),
      });
      if (gallery.ok && gallery.images.length) {
        return { ...gallery, providerUsed: "shopify", fallbackUsed: false };
      }
    }

    const images = [];
    extractJsonLd(html, url, images);
    extractMetaImages(html, url, images);
    extractImgTags(html, url, images);
    extractEmbeddedImageUrls(html, url, images);

    const selected = images
      .sort((a, b) => {
        if (a.type === "main" && b.type !== "main") return -1;
        if (b.type === "main" && a.type !== "main") return 1;
        return 0;
      })
      .slice(0, Math.max(1, Number(maximum) || MAX_IMAGES))
      .map(({ identity, ...image }) => image);

    return {
      ok: selected.length > 0,
      url,
      images: selected,
      count: selected.length,
      provider: "generic",
      providerUsed: "generic",
      fallbackUsed:
        canHandleAmazonUrl(url) ||
        canHandleHomeDepotUrl(url) ||
        canHandleLowesUrl(url) ||
        canHandleTargetUrl(url) ||
        canHandleWalmartUrl(url) ||
        canHandleShopifyProductPage({ html, url }),
      error:
        selected.length > 0
          ? ""
          : "No se encontraron imágenes utilizables en la página.",
    };
  } catch (error) {
    return {
      ok: false,
      url,
      images: [],
      count: 0,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible extraer la galería.",
    };
  }
}

export async function enrichResultWithGallery(result, options = {}) {
  if (!result) return result;

  const timeoutMs = Math.max(
    1500,
    Number(options.timeoutMs || DEFAULT_TIMEOUT_MS)
  );
  const maximum = Math.max(1, Number(options.maximum || MAX_IMAGES));

  const resolved = await resolveShoppingProduct(result, {
    apiKey: process.env.SERPAPI_KEY || "",
    timeoutMs: Math.min(timeoutMs, 8000),
  });

  if (!resolved?.url) {
    return {
      ...resolved,
      galleryExtraction: {
        ok: Array.isArray(resolved?.images) && resolved.images.length > 0,
        count: Array.isArray(resolved?.images) ? resolved.images.length : 0,
        url: "",
        provider: resolved?.productResolution?.mediaCount ? "google-product" : "none",
        fallbackUsed: false,
        productMetadata: null,
        productResolution: resolved?.productResolution || null,
        error: resolved?.images?.length ? "" : "No se encontró una URL directa del producto.",
      },
    };
  }

  const gallery = await extractGalleryFromUrl({
    url: resolved.url,
    timeoutMs,
    maximum,
  });

  const existing = Array.isArray(resolved.images) ? resolved.images : [];
  const merged = [];

  for (const image of [...existing, ...(gallery.images || [])]) {
    pushImage(merged, image);
  }

  const enrichedMetadata = {
    ...(resolved.metadata || {}),
    ...(gallery?.metadata?.sku && !resolved.metadata?.model
      ? { model: gallery.metadata.sku }
      : {}),
    extractedProductMetadata: gallery?.metadata || null,
  };

  if (!gallery.ok || !gallery.images?.length) {
    return {
      ...resolved,
      metadata: enrichedMetadata,
      images: merged.map(({ identity, ...image }) => image),
      galleryExtraction: {
        ...gallery,
        ok: merged.length > 0,
        count: merged.length,
        provider:
          resolved?.productResolution?.mediaCount
            ? "google-product"
            : gallery.provider || "none",
        productMetadata: gallery?.metadata || null,
        productResolution: resolved?.productResolution || null,
      },
    };
  }

  return {
    ...resolved,
    metadata: enrichedMetadata,
    images: merged.map(({ identity, ...image }) => image),
    galleryExtraction: {
      ok: true,
      count: merged.length,
      url: gallery.url,
      provider:
        gallery.providerUsed ||
        gallery.provider ||
        "generic",
      fallbackUsed: Boolean(gallery.fallbackUsed),
      asin: gallery.asin || "",
      productId: gallery.productId || "",
      tcin: gallery.tcin || "",
      itemId: gallery.itemId || "",
      productMetadata: gallery?.metadata || null,
      productResolution: resolved?.productResolution || null,
    },
  };
}
