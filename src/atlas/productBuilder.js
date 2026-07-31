import { IMAGE_SLOT_PRIORITY, MAX_PRODUCT_IMAGES } from "./constants";

function imagePriority(type = "") {
  const index = IMAGE_SLOT_PRIORITY.indexOf(type);
  return index === -1 ? IMAGE_SLOT_PRIORITY.length : index;
}

export function selectProductImages(images = []) {
  return [...images]
    .filter((image) => image?.url)
    .sort((a, b) => imagePriority(a.type) - imagePriority(b.type))
    .slice(0, MAX_PRODUCT_IMAGES);
}

export function buildProductCandidate(result, context = {}) {
  if (!result) return null;
  const selectedImages = selectProductImages(result.images || []);

  return {
    name: result.title || "",
    category: result.metadata?.category || "General",
    suggestedPrice: "",
    image_url: selectedImages[0]?.url || "",
    image_url_2: selectedImages[1]?.url || "",
    image_url_3: selectedImages[2]?.url || "",
    image_url_4: selectedImages[3]?.url || "",
    source: result.source || "",
    sourceUrl: result.url || "",
    confidence: Number(result.confidence || 0),
    exactImageMatch: Boolean(result.exactImageMatch),
    costUsd: context.costUsd || "",
    stock: context.stock || "1",
    atlasScore: Number(result.atlasScore || 0),
    rawResult: result,
  };
}
