import { ATLAS_MESSAGES } from "./constants";
import { searchByImage } from "./imageSearch";
import { chooseBestResult } from "./ranking";
import { buildProductCandidate } from "./productBuilder";
import { enrichProductCandidate } from "./productEnrichment";
import { applyPricingToProduct } from "./pricingEngine";
import { applySelectedPhotos } from "./photoSelector";

function notifyProgress(onProgress, step, customMessage = "") {
  onProgress?.({
    step,
    message:
      customMessage ||
      ATLAS_MESSAGES[step] ||
      "Atlas está trabajando...",
  });
}

function buildBaseCandidate(result, context) {
  const candidate = buildProductCandidate(result, context);

  return {
    ...candidate,
    atlasScore:
      result?.atlasScore ??
      candidate.atlasScore ??
      0,
    sourceKey:
      result?.sourceKey ??
      candidate.sourceKey ??
      "",
    promotional:
      Boolean(result?.promotional),
    productCompatibility:
      result?.productCompatibility ??
      candidate.productCompatibility ??
      0,
    compatibleWithAnchor:
      result?.compatibleWithAnchor ??
      true,
  };
}

async function enrichSafely(
  product,
  warningPrefix = "Atlas AI enrichment warning"
) {
  try {
    return await enrichProductCandidate(product);
  } catch (error) {
    console.error(`${warningPrefix}:`, error);

    return {
      ...product,
      aiEnriched: false,
      aiWarning:
        error instanceof Error
          ? error.message
          : "La mejora con IA no estuvo disponible.",
    };
  }
}

function preparePhotos(product, searchResults) {
  return applySelectedPhotos(
    product,
    searchResults,
    4
  );
}

function preparePricing(product, pricingOptions) {
  return applyPricingToProduct(
    product,
    pricingOptions
  );
}

function buildPricingContext(product = {}) {
  return {
    fixedReferencePrice:
      product.referencePrice || null,
    fixedReferenceCurrency:
      product.referenceCurrency || "USD",
    fixedSuggestedPrice:
      product.suggestedPrice || null,
    fixedMarketValueMxn:
      product.pricing?.marketValueMxn || null,
    pricing:
      product.pricing || null,
  };
}

function buildDecisionContext({
  bestResult,
  product,
  results,
  rejected,
}) {
  return {
    bestResultId:
      bestResult?.id || null,
    bestSource:
      bestResult?.source ||
      product?.source ||
      "",
    bestSourceUrl:
      bestResult?.url ||
      product?.sourceUrl ||
      "",
    confidence:
      bestResult?.confidence ??
      product?.confidence ??
      0,
    exactImageMatch:
      Boolean(bestResult?.exactImageMatch),
    productCompatibility:
      bestResult?.productCompatibility ??
      null,
    resultCount:
      results.length,
    rejectedCount:
      rejected.length,
    pricing:
      buildPricingContext(product),
    photoSourcesMixed:
      Boolean(product?.photoSourcesMixed),
  };
}

function buildAlternativeCandidates(
  alternatives,
  candidateContext,
  results
) {
  return alternatives.map((item) =>
    preparePhotos(
      buildBaseCandidate(
        item,
        candidateContext
      ),
      results
    )
  );
}

export async function prepareAtlasAlternative({
  alternative,
  pricingContext = {},
  pricingOptions = {},
  searchResults = [],
}) {
  if (!alternative) {
    throw new Error(
      "Atlas no recibió una alternativa para preparar."
    );
  }

  const enriched = await enrichSafely(
    alternative,
    "Atlas alternative enrichment warning"
  );

  const priced = preparePricing(enriched, {
    ...pricingOptions,
    fixedReferencePrice:
      pricingContext.fixedReferencePrice,
    fixedReferenceCurrency:
      pricingContext.fixedReferenceCurrency,
    fixedSuggestedPrice:
      pricingContext.fixedSuggestedPrice,
    fixedMarketValueMxn:
      pricingContext.fixedMarketValueMxn,
  });

  return preparePhotos(
    priced,
    searchResults.length
      ? searchResults
      : [alternative.rawResult].filter(Boolean)
  );
}

export async function runAtlas({
  photo,
  costUsd,
  stock = "1",
  pricingOptions = {},
  onProgress,
}) {
  if (!photo) {
    throw new Error(
      "Atlas necesita una fotografía para comenzar."
    );
  }

  if (!(Number(costUsd) > 0)) {
    throw new Error(
      "Atlas necesita el costo en USD."
    );
  }

  const candidateContext = {
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
      onProgress: (step) =>
        notifyProgress(onProgress, step),
    });

    if (!Array.isArray(results) || !results.length) {
      notifyProgress(onProgress, "noResults");

      return {
        status: "no_results",
        message:
          ATLAS_MESSAGES.noResults ||
          "No encontré coincidencias claras.",
        best: null,
        alternatives: [],
        rejected: [],
        pricingContext: null,
        decisionContext: null,
        searchResults: [],
      };
    }

    notifyProgress(
      onProgress,
      "comparingImages",
      `Encontré ${results.length} coincidencias. Estoy validando similitud visual, modelo, marca, capacidad y forma.`
    );

    const {
      best,
      alternatives,
      rejected = [],
    } = chooseBestResult(results);

    if (!best) {
      notifyProgress(onProgress, "noResults");

      return {
        status: "no_results",
        message:
          "No encontré una coincidencia suficientemente confiable.",
        best: null,
        alternatives: [],
        rejected,
        pricingContext: null,
        decisionContext: null,
        searchResults: results,
      };
    }

    notifyProgress(
      onProgress,
      "selectingSource",
      `Elegí ${best.source || "la mejor fuente"} por coincidencia del producto, no por precio ni por tienda.`
    );

    let product = buildBaseCandidate(
      best,
      candidateContext
    );

    notifyProgress(
      onProgress,
      "understandingProduct",
      "Estoy preparando el nombre, la categoría y la información comercial..."
    );

    product = await enrichSafely(product);

    notifyProgress(
      onProgress,
      "pricingProduct",
      "Estoy calculando el precio Donatello y garantizando el margen mínimo..."
    );

    product = preparePricing(
      product,
      pricingOptions
    );

    product = preparePhotos(
      product,
      results
    );

    const pricingContext =
      buildPricingContext(product);

    const decisionContext =
      buildDecisionContext({
        bestResult: best,
        product,
        results,
        rejected,
      });

    const preparedAlternatives =
      buildAlternativeCandidates(
        alternatives,
        candidateContext,
        results
      );

    notifyProgress(
      onProgress,
      "buildingProduct",
      "Ya organicé la fuente, el precio y las fotografías válidas."
    );

    const pricingMessage =
      product.suggestedPrice
        ? ` Precio sugerido: $${Number(
            product.suggestedPrice
          ).toLocaleString("es-MX")} MXN.`
        : "";

    const marginMessage =
      product.pricing?.marginGuaranteed
        ? ` Margen mínimo garantizado: ${Number(
            product.pricing.marginPercent
          ).toFixed(2)}%.`
        : "";

    const sourceMessage =
      product.photoSourcesMixed
        ? " Se utilizó una imagen externa únicamente para medidas."
        : "";

    return {
      status: "result",
      message: product.aiEnriched
        ? `Ya entendí el producto y preparé una opción clara para que la revises.${pricingMessage}${marginMessage}${sourceMessage}`
        : `Encontré el producto. La mejora con IA no estuvo disponible, pero puedes revisar esta opción.${pricingMessage}${marginMessage}${sourceMessage}`,
      best: product,
      alternatives: preparedAlternatives,
      rejected,
      pricingContext,
      decisionContext,
      searchResults: results,
    };
  } catch (error) {
    notifyProgress(
      onProgress,
      "error",
      "Algo no salió bien. No guardaré nada sin tu aprobación."
    );

    throw error;
  }
}
