const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

function normalizeText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values = [], limit = 8) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const clean = normalizeText(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }

  return output;
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;

  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}

function fallbackIdentity(titleHint = "") {
  const cleanTitle = normalizeText(titleHint).slice(0, 300);
  return {
    targetProduct: cleanTitle,
    productType: "",
    aliases: [],
    brand: "",
    model: "",
    distinctiveTerms: [],
    excludedObjects: [],
    searchQueries: cleanTitle ? [cleanTitle] : [],
    titleTrust: cleanTitle ? 0.75 : 0,
    visualConfidence: 0,
    overallConfidence: cleanTitle ? 0.55 : 0,
    aiUsed: false,
  };
}

export async function buildProductIdentity({ imageUrl = "", titleHint = "" } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = fallbackIdentity(titleHint);

  if (!apiKey || !imageUrl) return fallback;

  const cleanTitle = normalizeText(titleHint).slice(0, 300);
  const prompt = `
Eres el módulo de identificación de producto de Atlas para Ventas Donatello.
Tu trabajo NO es redactar una ficha comercial: debes identificar con precisión qué producto se está buscando para después localizarlo en tiendas de Estados Unidos.

Recibirás una fotografía de subasta que puede contener varios objetos y, a veces, un título de subasta.

Reglas críticas:
- Si hay título de subasta y describe un objeto plausible visible en la foto, ese título define el OBJETO OBJETIVO aunque otro objeto sea más grande, esté centrado o llame más la atención.
- Usa la imagen para validar forma, color, cantidad, estructura y rasgos visibles del objeto objetivo.
- Si el título es incompleto o ruidoso, límpialo mentalmente y conserva marca/modelo/medidas/capacidad cuando realmente estén presentes.
- Nunca inventes marca ni modelo.
- "excludedObjects" debe contener objetos competidores visibles en la misma foto que podrían confundir una búsqueda visual (por ejemplo: lamp, sofa, rug), pero NO atributos del producto objetivo.
- Genera búsquedas cortas para e-commerce de EE. UU.; evita palabras de subasta como lot, open box, return, pallet, item.
- Si existe marca o modelo, consérvalos exactamente en al menos una búsqueda.
- Las búsquedas deben apuntar al mismo producto objetivo, no a categorías distintas.
- Devuelve máximo 3 searchQueries, 5 aliases, 8 distinctiveTerms y 6 excludedObjects.

Título de subasta: ${cleanTitle || "No proporcionado"}
`.trim();

  const content = [
    { type: "input_text", text: prompt },
    { type: "input_image", image_url: imageUrl, detail: "low" },
  ];

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6",
        reasoning: { effort: "low" },
        max_output_tokens: 520,
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "donatello_product_identity",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                targetProduct: { type: "string" },
                productType: { type: "string" },
                aliases: { type: "array", items: { type: "string" } },
                brand: { type: "string" },
                model: { type: "string" },
                distinctiveTerms: { type: "array", items: { type: "string" } },
                excludedObjects: { type: "array", items: { type: "string" } },
                searchQueries: { type: "array", items: { type: "string" } },
                titleTrust: { type: "number" },
                visualConfidence: { type: "number" },
                overallConfidence: { type: "number" },
              },
              required: [
                "targetProduct",
                "productType",
                "aliases",
                "brand",
                "model",
                "distinctiveTerms",
                "excludedObjects",
                "searchQueries",
                "titleTrust",
                "visualConfidence",
                "overallConfidence"
              ],
            },
          },
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.warn("Atlas identity warning:", data?.error?.message || response.status);
      return fallback;
    }

    const text = extractOutputText(data);
    if (!text) return fallback;

    const parsed = JSON.parse(text);
    const targetProduct = normalizeText(parsed.targetProduct).slice(0, 180);
    const productType = normalizeText(parsed.productType).slice(0, 100);
    const brand = normalizeText(parsed.brand).slice(0, 80);
    const model = normalizeText(parsed.model).slice(0, 100);

    const searchQueries = uniqueStrings([
      ...(Array.isArray(parsed.searchQueries) ? parsed.searchQueries : []),
      brand && model ? `${brand} ${model}` : "",
      targetProduct,
    ], 3);

    return {
      targetProduct: targetProduct || fallback.targetProduct,
      productType,
      aliases: uniqueStrings(parsed.aliases, 5),
      brand,
      model,
      distinctiveTerms: uniqueStrings(parsed.distinctiveTerms, 8),
      excludedObjects: uniqueStrings(parsed.excludedObjects, 6),
      searchQueries: searchQueries.length ? searchQueries : fallback.searchQueries,
      titleTrust: Math.max(0, Math.min(1, Number(parsed.titleTrust) || 0)),
      visualConfidence: Math.max(0, Math.min(1, Number(parsed.visualConfidence) || 0)),
      overallConfidence: Math.max(0, Math.min(1, Number(parsed.overallConfidence) || 0)),
      aiUsed: true,
    };
  } catch (error) {
    console.warn("Atlas identity warning:", error);
    return fallback;
  }
}
