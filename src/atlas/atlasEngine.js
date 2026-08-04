import { ATLAS_MESSAGES } from "./constants";
import { searchByImage } from "./imageSearch";
import { chooseBestResult } from "./ranking";
import { buildProductCandidate } from "./productBuilder";
import { enrichProductCandidate } from "./productEnrichment";
import { applyPricingToProduct } from "./pricingEngine";
import { applySelectedPhotos } from "./photoSelector";

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

  const notify = (step, customMessage = "") => {
    onProgress?.({
      step,
      message:
        customMessage ||
        ATLAS_MESSAGES[step] ||
        "Atlas está trabajando...",
    });
  };

  try {
    const results = await searchByImage({
      photo,
      onProgress: (step) => notify(step),
    });

    if (!results.length) {
      notify("noResults");
      return {
        status: "no_results",
        message: ATLAS_MESSAGES.noResults,
        best: null,
        alternatives: [],
      };
    }

    notify("comparingImages");

    const { best, alternatives } = chooseBestResult(results);

    notify("selectingSource");

    const baseProduct = buildProductCandidate(best, {
      costUsd,
      stock,
    });

    notify(
      "understandingProduct",
      "Ya encontré una coincidencia. Ahora estoy entendiendo el producto y preparando un nombre claro en español..."
    );

    let product = baseProduct;

    try {
      product = await enrichProductCandidate(baseProduct);
    } catch (aiError) {
      console.error("Atlas AI enrichment warning:", aiError);
      product = {
        ...baseProduct,
        aiEnriched: false,
        aiWarning: aiError.message,
      };
    }

    notify(
      "pricingProduct",
      "Estoy calculando un precio Donatello con tu costo y el valor de mercado..."
    );

    product = applyPricingToProduct(product, pricingOptions);
    product = applySelectedPhotos(product, results, 4);

    notify("buildingProduct");

    const pricingMessage = product.suggestedPrice
      ? ` Precio sugerido: $${Number(product.suggestedPrice).toLocaleString("es-MX")} MXN.`
      : "";

    return {
      status: "result",
      message: product.aiEnriched
        ? `Ya entendí el producto y preparé una opción clara para que la revises.${pricingMessage}`
        : `Encontré el producto. La mejora con IA no estuvo disponible, pero puedes revisar esta opción.${pricingMessage}`,
      best: product,
      alternatives: alternatives.map((item) => {
        const alternative = applyPricingToProduct(
          buildProductCandidate(item, { costUsd, stock }),
          pricingOptions
        );

        return applySelectedPhotos(alternative, results, 4);
      }),
    };
  } catch (error) {
    notify("error");
    throw error;
  }
}
