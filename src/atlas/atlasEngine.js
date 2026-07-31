import { ATLAS_MESSAGES } from "./constants";
import { searchByImage } from "./imageSearch";
import { chooseBestResult } from "./ranking";
import { buildProductCandidate } from "./productBuilder";

export async function runAtlas({ photo, costUsd, stock = "1", onProgress }) {
  if (!photo) throw new Error("Atlas necesita una fotografía para comenzar.");
  if (!(Number(costUsd) > 0)) throw new Error("Atlas necesita el costo en USD.");

  const notify = (step) => {
    onProgress?.({ step, message: ATLAS_MESSAGES[step] || "Atlas está trabajando..." });
  };

  try {
    const results = await searchByImage({ photo, onProgress: notify });

    if (!results.length) {
      notify("noResults");
      return { status: "no_results", message: ATLAS_MESSAGES.noResults, best: null, alternatives: [] };
    }

    notify("comparingImages");
    const { best, alternatives } = chooseBestResult(results);
    notify("selectingSource");
    const product = buildProductCandidate(best, { costUsd, stock });
    notify("buildingProduct");

    return {
      status: "result",
      message: ATLAS_MESSAGES.ready,
      best: product,
      alternatives: alternatives.map((item) => buildProductCandidate(item, { costUsd, stock })),
    };
  } catch (error) {
    notify("error");
    throw error;
  }
}
