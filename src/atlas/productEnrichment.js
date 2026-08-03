export async function enrichProductCandidate(candidate) {
  if (!candidate?.rawResult?.title) return candidate;

  const rawResult = candidate.rawResult;
  const imageUrl =
    rawResult.images?.[0]?.url ||
    candidate.image_url ||
    "";

  const response = await fetch("/api/atlas/enrich", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rawTitle: rawResult.title,
      source: rawResult.source || candidate.source,
      sourceUrl: rawResult.url || candidate.sourceUrl,
      imageUrl,
      price: rawResult.price ?? null,
      currency: rawResult.currency || "USD",
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || "Atlas no pudo comprender el producto con IA."
    );
  }

  const enriched = data.enriched || {};

  return {
    ...candidate,
    name: enriched.name || candidate.name,
    category: enriched.category || candidate.category,
    atlasBrand: enriched.brand || "",
    description: enriched.shortDescription || "",
    facebookPost: enriched.facebookPost || "",
    keywords: Array.isArray(enriched.keywords)
      ? enriched.keywords
      : [],
    needsMeasurements: Boolean(enriched.needsMeasurements),
    aiEnriched: true,
  };
}
