import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function safeExtension(file) {
  const extension = file.name?.split(".").pop()?.toLowerCase();

  if (["jpg", "jpeg", "png", "webp"].includes(extension)) {
    return extension;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";

  return "jpg";
}

async function uploadAtlasSourcePhoto(photo) {
  const extension = safeExtension(photo);
  const filename = `${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}.${extension}`;
  const filePath = `atlas-source/${filename}`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(filePath, photo, {
      cacheControl: "3600",
      upsert: false,
      contentType: photo.type || undefined,
    });

  if (error) {
    throw new Error(`No pude subir la foto para investigarla: ${error.message}`);
  }

  const { data } = supabase.storage
    .from("product-images")
    .getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new Error("No pude obtener la URL pública de la fotografía.");
  }

  return data.publicUrl;
}

export async function searchByImage({ photo, titleHint = "", onProgress }) {
  if (!photo) {
    throw new Error("No se recibió una fotografía.");
  }

  onProgress?.("analyzingImage");

  const imageUrl = await uploadAtlasSourcePhoto(photo);

  onProgress?.("searchingMatches");
  onProgress?.("checkingAmazon");

  const response = await fetch("/api/atlas/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imageUrl,
      titleHint: String(titleHint || "").trim(),
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || "Atlas API no pudo completar la búsqueda visual."
    );
  }

  if (!Array.isArray(data.results)) {
    throw new Error("Atlas API devolvió una respuesta inesperada.");
  }

  // Conservamos la fotografía original como ancla visual. De esta forma,
  // el motor de galerías puede comprobar que cada foto recuperada pertenece
  // realmente al mismo producto y no depender únicamente del título.
  return data.results.map((result) => ({
    ...result,
    metadata: {
      ...(result.metadata || {}),
      atlasSourceImageUrl: imageUrl,
      productIdentity:
        result.metadata?.productIdentity ||
        data.identity ||
        null,
    },
  }));
}
