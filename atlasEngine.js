import { ATLAS_MESSAGES } from "./constants";
import { searchByImage } from "./imageSearch";
import { buildProductCandidate } from "./productBuilder";
import { enrichProductCandidate } from "./productEnrichment";
import { resolveBestSource } from "./sourceResolver";
import { applyPricingToProduct } from "./pricingEngine";
import {
  applySelectedPhotos,
  selectProductPhotos,
} from "./photoSelector";

function notifyProgress(onProgress, step, customMessage = "") {
  onProgress?.({
    step,
    message:
      customMessage ||
      ATLAS_MESSAGES[step] ||
      "Atlas está trabajando...",
  });
}

function applySourceDecision(product, decision) {
  if (!product || !decision?.best) return product;

  const referencePrice = decision.referencePrice;

  return {
    ...product,
    source:
      decision.best.storeLabel ||
      decision.best.source ||
      product.source ||
      "",
    sourceKey:
      decision.best.storeKey ||
      product.sourceKey ||
      "",
    sourceUrl:
      decision.best.url ||
      product.sourceUrl ||
      "",
    confidence:
      decision.best.resolvedConfidence ??
      decision.best.confidence ??
      product.confidence ??
      0,
    exactImageMatch: Boolean(decision.best.exactImageMatch),
    referencePrice: referencePrice?.price ?? null,
    referenceCurrency: referencePrice?.currency || "USD",
    referenceStore: referencePrice?.source || "",
    referenceUrl: referencePrice?.sourceUrl || "",
    atlasDecisionSummary: decision.summary || "",
    rawResult: decision.best,
  };
}

function buildAlternativeProducts(alternatives, context) {
  return alternatives
    .map((result) => buildProductCandidate(result, context))
    .filter(Boolean)
    .map((candidate) => ({
      ...candidate,
      source: candidate.rawResult?.storeLabel || candidate.source,
      sourceKey: candidate.rawResult?.storeKey || "",
      confidence:
        candidate.rawResult?.resolvedConfidence ??
        candidate.confidence ??
        0,
    }));
}

export async function runAtlas({
  photo,
  costUsd,
  stock = "1",
  pricingOptions = {},
  onProgress,
}) {
  if (!photo) {
    throw new Error("Atlas necesita una fotografía para comenzar.");
  }

  if (!(Number(costUsd) > 0)) {
    throw new Error("Atlas necesita el costo en USD.");
  }

  const context = {
    costUsd,
    stock,
  };

  try {
    notifyProgress(
      onProgress,
      "analyzingImage",
      "Déjame investigar este producto..."
    );

    const results = await searchByImage({
      photo,
      onProgress: (step) => notifyProgress(onProgress, step),
    });

    if (!Array.isArray(results) || results.length === 0) {
      notifyProgress(onProgress, "noResults");

      return {
        status: "no_results",
        message:
          ATLAS_MESSAGES.noResults ||
          "No encontré una coincidencia suficientemente clara.",
        best: null,
        alternatives: [],
      };
    }

    notifyProgress(
      onProgress,
      "comparingImages",
      `Encontré ${results.length} coincidencias. Ahora voy a compararlas con tu fotografía.`
    );

    const decision = resolveBestSource(results);

    if (!decision.best) {
      notifyProgress(onProgress, "noResults");

      return {
        status: "no_results",
        message: "No encontré una fuente suficientemente clara para continuar.",
        best: null,
        alternatives: [],
      };
    }

    notifyProgress(
      onProgress,
      "selectingSource",
      decision.summary ||
        "Ya elegí la mejor fuente. Ahora estoy preparando la información."
    );

    let product = buildProductCandidate(decision.best, context);
    product = applySourceDecision(product, decision);

    const photoSelection = selectProductPhotos({
      product,
      sourceDecision: decision,
      maximum: 4,
    });

    product = applySelectedPhotos(product, photoSelection);

    notifyProgress(
      onProgress,
      "understandingProduct",
      "Ya encontré una coincidencia. Ahora estoy entendiendo el producto y preparando un nombre claro en español..."
    );

    try {
      product = await enrichProductCandidate(product);
    } catch (aiError) {
      console.error("Atlas AI enrichment warning:", aiError);

      product = {
        ...product,
        aiEnriched: false,
        aiWarning:
          aiError instanceof Error
            ? aiError.message
            : "La mejora con IA no estuvo disponible.",
      };
    }

    notifyProgress(
      onProgress,
      "pricingProduct",
      "Estoy calculando un precio Donatello basado en tu costo y el valor real de mercado..."
    );

    product = applyPricingToProduct(product, pricingOptions);

    notifyProgress(
      onProgress,
      "buildingProduct",
      "Estoy organizando la fuente, el precio y las mejores imágenes..."
    );

    const alternatives = buildAlternativeProducts(
      decision.alternatives,
      context
    );

    const pricingMessage = product.pricing?.suggestedPrice
      ? ` Precio Donatello sugerido: $${Number(
          product.pricing.suggestedPrice
        ).toLocaleString("es-MX")} MXN.`
      : "";

    const finalMessage = product.aiEnriched
      ? `${decision.summary} Ya entendí el producto y preparé una opción clara para que la revises.${pricingMessage}`
      : `${decision.summary} Encontré el producto, aunque la mejora del nombre con IA no estuvo disponible.${pricingMessage}`;

    return {
      status: "result",
      message: finalMessage.trim(),
      best: product,
      alternatives,
      decision: {
        summary: decision.summary,
        referencePrice: decision.referencePrice,
        photoSelection,
        pricing: product.pricing,
        resultCount: results.length,
      },
    };
  } catch (error) {
    notifyProgress(
      onProgress,
      "error",
      "Algo no salió bien, pero no guardaré nada sin tu aprobación."
    );

    throw error;
  }
}
