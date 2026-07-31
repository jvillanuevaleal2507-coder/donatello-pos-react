/**
 * Sprint 2:
 * Esta capa queda preparada para conectar el proveedor real de búsqueda visual.
 * Nunca coloques claves privadas en el navegador.
 * La llamada real deberá ir a un endpoint seguro del backend.
 */
export async function searchByImage({ photo, onProgress }) {
  if (!photo) throw new Error("No se recibió una fotografía.");

  onProgress?.("analyzingImage");
  await delay(350);
  onProgress?.("searchingMatches");
  await delay(450);
  onProgress?.("checkingAmazon");
  await delay(450);

  return [
    {
      id: "demo-amazon-1",
      source: "Amazon",
      title: "Producto de demostración",
      url: "",
      price: null,
      currency: "USD",
      confidence: 96,
      exactImageMatch: true,
      hasTechnicalData: true,
      images: [],
      metadata: { brand: "", model: "", category: "General" },
    },
  ];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
