import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function cleanNumber(value) {
  if (value === "" || value === null || value === undefined) return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function saveAtlasIntelligence({
  productId,
  referenceStore = "",
  referenceUrl = "",
  referencePrice = null,
  referenceCurrency = "USD",
  atlasConfidence = null,
  atlasBrand = "",
  atlasModel = "",
  atlasCategory = "",
  atlasDescription = "",
  imageMain = "",
  imageMeasurements = "",
  imageEnvironment = "",
  imageDetail = "",
  suggestedPrice = null,
  approvedPrice = null,
}) {
  if (!productId) {
    throw new Error(
      "Atlas necesita el ID del producto antes de guardar su memoria."
    );
  }

  const payload = {
    product_id: Number(productId),
    reference_store: referenceStore || null,
    reference_url: referenceUrl || null,
    reference_price: cleanNumber(referencePrice),
    reference_currency: referenceCurrency || "USD",
    atlas_confidence: cleanNumber(atlasConfidence),
    atlas_brand: atlasBrand || null,
    atlas_model: atlasModel || null,
    atlas_category: atlasCategory || null,
    atlas_description: atlasDescription || null,
    image_main: imageMain || null,
    image_measurements: imageMeasurements || null,
    image_environment: imageEnvironment || null,
    image_detail: imageDetail || null,
    suggested_price: cleanNumber(suggestedPrice),
    approved_price: cleanNumber(approvedPrice),
  };

  const { data, error } = await supabase
    .from("atlas_product_intelligence")
    .insert([payload])
    .select()
    .single();

  if (error) {
    throw new Error(`No pude guardar la memoria de Atlas: ${error.message}`);
  }

  return data;
}
