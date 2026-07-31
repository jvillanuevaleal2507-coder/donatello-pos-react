const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function isValidPublicImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function confidenceFor(match, index) {
  if (match.exact_matches === true) return 99;

  const position = Number(match.position || index + 1);
  return Math.max(60, 93 - (position - 1) * 3);
}

function normalizeMatch(match, index) {
  const imageUrl = match.image || match.thumbnail || "";
  const priceValue = match.price?.extracted_value ?? null;
  const currency = match.price?.currency || "USD";

  return {
    id: `lens-${match.position || index + 1}`,
    source: match.source || "Otra fuente",
    title: match.title || "Producto encontrado",
    url: match.link || "",
    price: priceValue,
    currency,
    confidence: confidenceFor(match, index),
    exactImageMatch: match.exact_matches === true,
    hasTechnicalData: Boolean(match.title),
    inStock:
      typeof match.in_stock === "boolean" ? match.in_stock : null,
    images: imageUrl
      ? [
          {
            url: imageUrl,
            type: "main",
          },
        ]
      : [],
    metadata: {
      brand: "",
      model: "",
      category: "General",
      position: Number(match.position || index + 1),
      rating: match.rating ?? null,
      reviews: match.reviews ?? null,
      priceLabel: match.price?.value || "",
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, {
      error: "Método no permitido.",
    });
  }

  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    return sendJson(res, 500, {
      error:
        "Falta configurar SERPAPI_KEY en las variables de entorno de Vercel.",
    });
  }

  const { imageUrl } = req.body || {};

  if (!isValidPublicImageUrl(imageUrl)) {
    return sendJson(res, 400, {
      error: "Se requiere una URL pública HTTPS de la imagen.",
    });
  }

  try {
    const params = new URLSearchParams({
      engine: "google_lens",
      type: "visual_matches",
      url: imageUrl,
      hl: "en",
      country: "us",
      safe: "active",
      auto_crop: "false",
      api_key: apiKey,
    });

    const response = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return sendJson(res, response.status || 502, {
        error:
          data.error ||
          "SerpApi no pudo completar la búsqueda visual.",
      });
    }

    const visualMatches = Array.isArray(data.visual_matches)
      ? data.visual_matches
      : [];

    const results = visualMatches
      .slice(0, 25)
      .map(normalizeMatch)
      .filter((item) => item.url || item.images.length);

    return sendJson(res, 200, {
      ok: true,
      searchId: data.search_metadata?.id || null,
      imageUrl,
      results,
    });
  } catch (error) {
    console.error("Atlas API error:", error);

    return sendJson(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado en Atlas API.",
    });
  }
}
