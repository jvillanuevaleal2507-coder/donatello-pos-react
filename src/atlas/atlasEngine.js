import { ATLAS_MESSAGES } from "./constants";
import { searchByImage } from "./imageSearch";
import { chooseBestResult } from "./ranking";
import { buildProductCandidate } from "./productBuilder";
import { enrichProductCandidate } from "./productEnrichment";
import { applyPricingToProduct } from "./pricingEngine";
import { applySelectedPhotos } from "./photoSelector";
import { validateProductGallery } from "./galleryValidation";

function notifyProgress(onProgress, step, customMessage = "") {
  onProgress?.({
    step,
    message: customMessage || ATLAS_MESSAGES[step] || "Atlas está trabajando...",
  });
}

function buildBaseCandidate(result, context) {
  const candidate = buildProductCandidate(result, context);

  return {
    ...candidate,
    atlasScore: result?.atlasScore ?? candidate.atlasScore ?? 0,
    sourceKey: result?.sourceKey ?? candidate.sourceKey ?? "",
    promotional: Boolean(result?.promotional),
    productCompatibility:
      result?.productCompatibility ?? candidate.productCompatibility ?? 0,
    compatibleWithAnchor: result?.compatibleWithAnchor ?? true,
    titleHintScore:
      result?.titleHintScore ?? result?.metadata?.titleHintScore ?? 0,
    identityScore:
      result?.identityScore ?? result?.metadata?.identityScore ?? 0,
  };
}

async function enrichSafely(product, warningPrefix = "Atlas AI enrichment warning") {
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

function dedupeRankedResults(results = []) {
  const seen = new Set();
  const output = [];

  for (const result of results) {
    if (!result) continue;
    const key = result.id || result.url || `${result.source}|${result.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(result);
  }

  return output;
}

function preparePhotos(product, selectedResult = null, searchResults = []) {
  const result = selectedResult || product?.rawResult || null;
  const allResults = dedupeRankedResults([
    ...(result ? [result] : []),
    ...(Array.isArray(searchResults) ? searchResults : []),
  ]);

  return applySelectedPhotos(product, allResults, 4);
}

function preparePricing(product, pricingOptions) {
  return applyPricingToProduct(product, pricingOptions);
}

function buildPricingContext(product = {}) {
  return {
    fixedReferencePrice: product.referencePrice || null,
    fixedReferenceCurrency: product.referenceCurrency || "USD",
    fixedSuggestedPrice: product.suggestedPrice || null,
    fixedMarketValueMxn: product.pricing?.marketValueMxn || null,
    pricing: product.pricing || null,
  };
}

function buildDecisionContext({ bestResult, product, results, rejected }) {
  return {
    bestResultId: bestResult?.id || null,
    bestSource: bestResult?.source || product?.source || "",
    bestSourceUrl: bestResult?.url || product?.sourceUrl || "",
    confidence: bestResult?.confidence ?? product?.confidence ?? 0,
    exactImageMatch: Boolean(bestResult?.exactImageMatch),
    productCompatibility: bestResult?.productCompatibility ?? null,
    titleHintScore:
      bestResult?.titleHintScore ?? bestResult?.metadata?.titleHintScore ?? 0,
    identityScore:
      bestResult?.identityScore ?? bestResult?.metadata?.identityScore ?? 0,
    resultCount: results.length,
    rejectedCount: rejected.length,
    pricing: buildPricingContext(product),
    photoSourcesMixed: Boolean(product?.photoSourcesMixed),
    photoCount: Number(product?.photoDiagnostics?.selectedCount || 0),
    photoCandidateCount: Number(product?.photoDiagnostics?.totalCandidateCount || 0),
    photoPeerCandidateCount: Number(
      product?.photoDiagnostics?.verifiedPeerCandidateCount || 0
    ),
    photoProviders: product?.photoDiagnostics?.providers || [],
    photoSourceKeys: product?.photoDiagnostics?.sourceKeys || [],
    photoThumbnailCount: Number(product?.photoDiagnostics?.thumbnailCount || 0),
    galleryAiValidated: Boolean(product?.rawResult?.galleryValidation?.ok),
    galleryValidationFallback: Boolean(product?.rawResult?.galleryValidation?.fallbackUsed),
  };
}

function buildAlternativeCandidates(
  alternatives,
  candidateContext,
  searchResults = []
) {
  return alternatives.map((item) =>
    preparePhotos(
      buildBaseCandidate(item, candidateContext),
      item,
      searchResults
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
    throw new Error("Atlas no recibió una alternativa para preparar.");
  }

  const enriched = await enrichSafely(
    alternative,
    "Atlas alternative enrichment warning"
  );

  const priced = preparePricing(enriched, {
    ...pricingOptions,
    fixedReferencePrice: pricingContext.fixedReferencePrice,
    fixedReferenceCurrency: pricingContext.fixedReferenceCurrency,
    fixedSuggestedPrice: pricingContext.fixedSuggestedPrice,
    fixedMarketValueMxn: pricingContext.fixedMarketValueMxn,
  });

  return preparePhotos(
    priced,
    alternative.rawResult || null,
    searchResults
  );
}

export async function runAtlas({
  photo,
  titleHint = "",
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

  const candidateContext = { costUsd, stock };

  try {
    const cleanTitleHint = String(titleHint || "").trim();

    notifyProgress(
      onProgress,
      "analyzingImage",
      cleanTitleHint
        ? "Déjame cruzar la foto con el título de la subasta..."
        : "Déjame investigar este producto..."
    );

    const results = await searchByImage({
      photo,
      titleHint: cleanTitleHint,
      onProgress: (step) => notifyProgress(onProgress, step),
    });

    if (!Array.isArray(results) || !results.length) {
      notifyProgress(onProgress, "noResults");
      return {
        status: "no_results",
        message: ATLAS_MESSAGES.noResults || "No encontré coincidencias claras.",
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
      cleanTitleHint
        ? `Encontré ${results.length} coincidencias. Estoy comparando imagen, título, modelo, marca, capacidad y forma.`
        : `Encontré ${results.length} coincidencias. Estoy validando similitud visual, modelo, marca, capacidad y forma.`
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
        message: "No encontré una coincidencia suficientemente confiable.",
        best: null,
        alternatives: [],
        rejected,
        pricingContext: null,
        decisionContext: null,
        searchResults: results,
      };
    }

    const rankedSearchResults = dedupeRankedResults([
      best,
      ...alternatives,
      ...rejected,
    ]);

    notifyProgress(
      onProgress,
      "selectingPhotos",
      "Estoy verificando visualmente cada fotografía para asegurar que pertenezca al mismo producto..."
    );

    const galleryValidation = await validateProductGallery({
      bestResult: best,
      searchResults: rankedSearchResults,
      titleHint: cleanTitleHint,
    });

    const photoBest = galleryValidation.bestResult || best;
    const photoSearchResults = Array.isArray(galleryValidation.searchResults)
      ? galleryValidation.searchResults
      : rankedSearchResults;

    notifyProgress(
      onProgress,
      "selectingSource",
      `Elegí ${best.source || "la mejor fuente"} por coincidencia del producto, no por precio ni por tienda.`
    );

    let product = buildBaseCandidate(photoBest, candidateContext);

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

    product = preparePricing(product, pricingOptions);

    notifyProgress(
      onProgress,
      "selectingPhotos",
      "Estoy ordenando únicamente las fotografías que pasaron la validación visual..."
    );

    product = preparePhotos(product, photoBest, photoSearchResults);

    const pricingContext = buildPricingContext(product);
    const decisionContext = buildDecisionContext({
      bestResult: photoBest,
      product,
      results: rankedSearchResults,
      rejected,
    });

    const preparedAlternatives = buildAlternativeCandidates(
      alternatives,
      candidateContext,
      photoSearchResults
    );

    notifyProgress(
      onProgress,
      "buildingProduct",
      "Ya organicé la fuente, el precio y las fotografías verificadas."
    );

    const pricingMessage = product.suggestedPrice
      ? ` Precio sugerido: $${Number(product.suggestedPrice).toLocaleString("es-MX")} MXN.`
      : "";

    const marginMessage = product.pricing?.marginGuaranteed
      ? ` Margen mínimo garantizado: ${Number(product.pricing.marginPercent).toFixed(2)}%.`
      : "";

    const photoCount = Number(product.photoDiagnostics?.selectedCount || 0);
    const photoMessage = photoCount
      ? ` Galería validada: ${photoCount}/4 imagen${photoCount === 1 ? "" : "es"} útil${photoCount === 1 ? "" : "es"}.`
      : " No encontré imágenes que pasaran la validación visual.";

    const sourceMessage = product.photoSourcesMixed
      ? " Completé la galería únicamente con imágenes del mismo producto que pasaron validación visual."
      : "";

    const fallbackMessage = product?.rawResult?.galleryValidation?.fallbackUsed
      ? " El validador no estuvo disponible y por seguridad conservé solo la imagen principal."
      : "";

    const titleMessage =
      cleanTitleHint &&
      Number(best?.titleHintScore || best?.metadata?.titleHintScore || 0) >= 0.35
        ? " El título de subasta ayudó a validar esta coincidencia."
        : "";

    return {
      status: "result",
      message: product.aiEnriched
        ? `Ya entendí el producto y preparé una opción clara para que la revises.${pricingMessage}${marginMessage}${photoMessage}${sourceMessage}${fallbackMessage}${titleMessage}`
        : `Encontré el producto. La mejora con IA no estuvo disponible, pero puedes revisar esta opción.${pricingMessage}${marginMessage}${photoMessage}${sourceMessage}${fallbackMessage}${titleMessage}`,
      best: product,
      alternatives: preparedAlternatives,
      rejected,
      pricingContext,
      decisionContext,
      searchResults: rankedSearchResults,
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
