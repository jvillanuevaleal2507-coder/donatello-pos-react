function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function sourceFamily(value = "") {
  const text = normalizeText(value).replace(/[^a-z0-9]/g, "");
  if (text.includes("amazon")) return "amazon";
  if (text.includes("homedepot")) return "homedepot";
  if (text.includes("walmart")) return "walmart";
  if (text.includes("lowes") || text.includes("lowe")) return "lowes";
  if (text.includes("target")) return "target";
  if (text.includes("wayfair")) return "wayfair";
  return "other";
}

function urlFamily(value = "") {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "amazon.com" || host.endsWith(".amazon.com")) return "amazon";
    if (host === "homedepot.com" || host.endsWith(".homedepot.com")) return "homedepot";
    if (host === "walmart.com" || host.endsWith(".walmart.com")) return "walmart";
    if (host === "lowes.com" || host.endsWith(".lowes.com")) return "lowes";
    if (host === "target.com" || host.endsWith(".target.com")) return "target";
    if (host === "wayfair.com" || host.endsWith(".wayfair.com")) return "wayfair";
    if (host.includes("google.")) return "google";
    return "other";
  } catch {
    return "other";
  }
}

function sameModel(a = {}, b = {}) {
  const modelA = normalizeText(a.metadata?.model);
  const modelB = normalizeText(b.metadata?.model);
  return Boolean(modelA && modelB && modelA === modelB);
}

function strictPeer(result = {}, selected = {}) {
  if (!result || result === selected) return false;
  if (result.semanticConflict || result.metadata?.semanticConflict) return false;
  if (result.compatibleWithAnchor === false) return false;

  if (sameModel(result, selected)) return true;
  if (result.exactImageMatch === true) return true;

  const identity = Number(result.identityScore ?? result.metadata?.identityScore ?? 0);
  const title = Number(result.titleHintScore ?? result.metadata?.titleHintScore ?? 0);
  const compatibility = Number(result.productCompatibility || 0);

  return identity >= 0.72 && title >= 0.58 && compatibility >= 0.72;
}

function candidateKey(candidate = {}) {
  return `${candidate.resultId || ""}|${candidate.url || ""}`;
}

function collectCandidates(bestResult = {}, searchResults = [], maximum = 12) {
  const candidates = [];
  const seen = new Set();

  const addResult = (result, origin) => {
    for (const image of result?.images || []) {
      const url = normalizeUrl(typeof image === "string" ? image : image?.url || image?.link);
      if (!url) continue;

      if (seen.has(url)) continue;
      seen.add(url);

      candidates.push({
        id: candidates.length,
        url,
        origin,
        resultId: result?.id || "",
        resultTitle: result?.title || "",
        source: result?.source || "",
        originalType: typeof image === "string" ? "other" : image?.type || "other",
        width: typeof image === "string" ? null : Number(image?.width || image?.image_width || 0) || null,
        height: typeof image === "string" ? null : Number(image?.height || image?.image_height || 0) || null,
        originalImage: typeof image === "string" ? { url } : { ...image, url },
      });

      if (candidates.length >= maximum) return true;
    }
    return false;
  };

  addResult(bestResult, "selected_result");

  if (candidates.length < maximum) {
    for (const result of searchResults) {
      if (!strictPeer(result, bestResult)) continue;
      if (addResult(result, "strict_peer")) break;
    }
  }

  return candidates.slice(0, maximum);
}

function uniqueImages(images = []) {
  const seen = new Set();
  const output = [];

  for (const image of images) {
    const url = normalizeUrl(typeof image === "string" ? image : image?.url || image?.link);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    output.push(typeof image === "string" ? { url } : { ...image, url });
  }

  return output;
}

function safeFallback(bestResult = {}, searchResults = []) {
  const firstImage = Array.isArray(bestResult?.images)
    ? bestResult.images.find((image) => normalizeUrl(typeof image === "string" ? image : image?.url || image?.link))
    : null;

  const safeBest = {
    ...bestResult,
    images: firstImage ? [firstImage] : [],
    galleryValidation: {
      attempted: true,
      ok: false,
      fallbackUsed: true,
      acceptedCount: firstImage ? 1 : 0,
      rejectedCount: 0,
      recoveredCount: 0,
    },
  };

  return {
    bestResult: safeBest,
    searchResults: searchResults.map((result) =>
      result?.id === bestResult?.id
        ? safeBest
        : { ...result, images: [] }
    ),
    diagnostics: safeBest.galleryValidation,
  };
}

function findRecoveryContext(bestResult = {}, searchResults = []) {
  const desiredFamily = sourceFamily(
    bestResult?.metadata?.resolvedMerchant || bestResult?.source || ""
  );

  const candidates = [bestResult, ...searchResults]
    .filter(Boolean)
    .filter((result) => !(result.semanticConflict || result.metadata?.semanticConflict))
    .map((result) => {
      const resolvedUrl = normalizeUrl(
        result?.metadata?.resolvedProductUrl ||
        result?.productResolution?.directUrl ||
        result?.url ||
        ""
      );
      const resolvedFamily = urlFamily(resolvedUrl);
      const resultFamily = sourceFamily(
        result?.metadata?.resolvedMerchant || result?.source || ""
      );
      const identity = Number(result.identityScore ?? result.metadata?.identityScore ?? 0);
      const title = Number(result.titleHintScore ?? result.metadata?.titleHintScore ?? 0);
      const compatibility = Number(result.productCompatibility || 0);
      const imageCount = Array.isArray(result.images) ? result.images.length : 0;

      let score = 0;
      if (desiredFamily !== "other" && resultFamily === desiredFamily) score += 500;
      if (desiredFamily !== "other" && resolvedFamily === desiredFamily) score += 500;
      if (resolvedFamily !== "google" && resolvedFamily !== "other") score += 220;
      if (resolvedFamily === "google") score -= 900;
      score += identity * 180;
      score += title * 120;
      score += Math.max(0, compatibility) * 80;
      score += Math.min(imageCount, 8) * 5;

      return { result, resolvedUrl, resolvedFamily, resultFamily, score };
    })
    .filter((entry) => entry.resolvedUrl)
    .sort((a, b) => b.score - a.score);

  const winner = candidates[0] || null;
  const fallbackSource =
    bestResult?.metadata?.resolvedMerchant ||
    bestResult?.source ||
    "";

  return {
    preferredSource:
      winner?.result?.metadata?.resolvedMerchant ||
      winner?.result?.source ||
      fallbackSource,
    productUrl:
      winner?.resolvedFamily !== "google"
        ? winner.resolvedUrl
        : normalizeUrl(bestResult?.metadata?.resolvedProductUrl || bestResult?.url || ""),
    sourceResultId: winner?.result?.id || bestResult?.id || "",
  };
}

async function recoverMissingGallery({
  bestResult = {},
  searchResults = [],
  titleHint = "",
  existingImages = [],
} = {}) {
  const existingUrls = uniqueImages(existingImages).map((image) => image.url);
  const recoveryContext = findRecoveryContext(bestResult, searchResults);

  try {
    const response = await fetch("/api/atlas/recover-gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetTitle: bestResult?.title || "",
        titleHint: String(titleHint || "").trim(),
        identity:
          bestResult?.metadata?.productIdentity ||
          bestResult?.productIdentity ||
          null,
        referenceImageUrl:
          bestResult?.metadata?.atlasSourceImageUrl ||
          "",
        preferredSource: recoveryContext.preferredSource,
        productUrl: recoveryContext.productUrl,
        recoverySourceResultId: recoveryContext.sourceResultId,
        existingUrls,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.recovered)) {
      throw new Error(data.error || "No se pudo recuperar la galería.");
    }

    return uniqueImages(data.recovered).map((image) => ({
      ...image,
      atlasValidated: true,
      atlasRecovered: true,
      atlasValidationOrigin: "recovery_search",
    }));
  } catch (error) {
    console.warn("Atlas gallery recovery warning:", error);
    return [];
  }
}

export async function validateProductGallery({
  bestResult = {},
  searchResults = [],
  titleHint = "",
} = {}) {
  const candidates = collectCandidates(bestResult, searchResults, 12);

  if (!candidates.length) {
    return {
      bestResult,
      searchResults,
      diagnostics: {
        attempted: false,
        ok: false,
        fallbackUsed: false,
        acceptedCount: 0,
        rejectedCount: 0,
        recoveredCount: 0,
      },
    };
  }

  try {
    const response = await fetch("/api/atlas/validate-gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetTitle: bestResult?.title || "",
        titleHint: String(titleHint || "").trim(),
        identity:
          bestResult?.metadata?.productIdentity ||
          bestResult?.productIdentity ||
          null,
        referenceImageUrl:
          bestResult?.metadata?.atlasSourceImageUrl ||
          "",
        candidates: candidates.map(({ originalImage, ...candidate }) => candidate),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.accepted)) {
      throw new Error(data.error || "No se pudo validar la galería.");
    }

    const acceptedByKey = new Map();
    for (const item of data.accepted) {
      const candidate = candidates.find((entry) => entry.id === item.index);
      if (!candidate) continue;

      acceptedByKey.set(candidateKey(candidate), {
        ...candidate.originalImage,
        url: candidate.url,
        type: item.type || candidate.originalType || "other",
        atlasValidated: true,
        atlasValidationConfidence: Number(item.confidence || 0),
        atlasValidationOrigin: candidate.origin,
      });
    }

    const rebuildResult = (result) => {
      const resultId = result?.id || "";
      const validatedImages = [];

      for (const candidate of candidates) {
        if (candidate.resultId !== resultId) continue;
        const accepted = acceptedByKey.get(candidateKey(candidate));
        if (accepted) validatedImages.push(accepted);
      }

      return {
        ...result,
        images: uniqueImages(validatedImages),
        galleryValidation: {
          attempted: true,
          ok: true,
          fallbackUsed: false,
          acceptedCount: validatedImages.length,
          rejectedCount:
            candidates.filter((candidate) => candidate.resultId === resultId).length -
            validatedImages.length,
          recoveredCount: 0,
        },
      };
    };

    let rebuilt = searchResults.map(rebuildResult);
    let rebuiltBest = rebuildResult(bestResult);

    const allValidatedImages = uniqueImages([
      ...rebuiltBest.images,
      ...rebuilt.flatMap((result) => result?.images || []),
    ]);

    let recovered = [];
    if (allValidatedImages.length < 4) {
      recovered = await recoverMissingGallery({
        bestResult,
        searchResults,
        titleHint,
        existingImages: allValidatedImages,
      });
    }

    if (recovered.length) {
      rebuiltBest = {
        ...rebuiltBest,
        images: uniqueImages([...rebuiltBest.images, ...recovered]),
        galleryValidation: {
          ...rebuiltBest.galleryValidation,
          acceptedCount: uniqueImages([...rebuiltBest.images, ...recovered]).length,
          recoveredCount: recovered.length,
        },
      };
    }

    const bestInListIndex = rebuilt.findIndex(
      (result) => result?.id && result.id === rebuiltBest?.id
    );
    if (bestInListIndex >= 0) rebuilt[bestInListIndex] = rebuiltBest;

    const finalAcceptedImages = uniqueImages([
      ...rebuiltBest.images,
      ...rebuilt.flatMap((result) => result?.images || []),
    ]);

    const recoveryContext = findRecoveryContext(bestResult, searchResults);
    console.log("Atlas gallery validation", {
      initialCandidates: candidates.length,
      acceptedByValidator: data.accepted.length,
      recovered: recovered.length,
      finalUniqueImages: finalAcceptedImages.length,
      source: bestResult?.source || "",
      resolvedProductUrl: recoveryContext.productUrl,
      recoverySourceResultId: recoveryContext.sourceResultId,
    });

    return {
      bestResult: rebuiltBest,
      searchResults: rebuilt,
      diagnostics: {
        attempted: true,
        ok: true,
        fallbackUsed: false,
        acceptedCount: finalAcceptedImages.length,
        rejectedCount: Array.isArray(data.rejected)
          ? data.rejected.length
          : Math.max(0, candidates.length - data.accepted.length),
        recoveredCount: recovered.length,
        candidateCount: candidates.length,
      },
    };
  } catch (error) {
    console.error("Atlas gallery validation warning:", error);
    return safeFallback(bestResult, searchResults);
  }
}
