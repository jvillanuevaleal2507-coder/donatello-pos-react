const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;

  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}

function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? value : "";
  } catch {
    return "";
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return sendJson(res, 500, {
      error: "Falta configurar OPENAI_API_KEY en Vercel.",
    });
  }

  const {
    rawTitle = "",
    source = "",
    sourceUrl = "",
    imageUrl = "",
    price = null,
    currency = "USD",
  } = req.body || {};

  if (!rawTitle.trim()) {
    return sendJson(res, 400, {
      error: "Atlas necesita el título encontrado para comprender el producto.",
    });
  }

  const prompt = `
Eres Atlas, copiloto comercial de Ventas Donatello en México.

Convierte la ficha encontrada en información clara para un POS y Facebook.

Reglas obligatorias:
- Escribe en español natural de México.
- "name" debe ser corto, comercial y máximo 60 caracteres.
- No incluyas nombres de tiendas.
- Evita poner la marca dentro de "name"; guárdala en "brand".
- No inventes cantidad, material, medidas, capacidad, marca o estilo.
- Categorías permitidas:
  Muebles, Iluminación, Decoración, Cocina, Electrodomésticos,
  Organización, Exterior, Baño, Oficina, Infantil, Otros.
- La descripción corta debe tener máximo 180 caracteres.
- El post de Facebook debe sonar humano y natural; máximo 450 caracteres.
- No menciones IA ni la tienda fuente.
- "needsMeasurements" debe ser true cuando las dimensiones influyen en la compra.
- Si no estás seguro de un dato, usa una cadena vacía.

Datos:
Título: ${rawTitle}
Fuente: ${source}
URL: ${sourceUrl}
Precio mostrado: ${price ?? "No disponible"} ${currency}
`.trim();

  const content = [{ type: "input_text", text: prompt }];
  const validImageUrl = safeImageUrl(imageUrl);

  if (validImageUrl) {
    content.push({
      type: "input_image",
      image_url: validImageUrl,
      detail: "low",
    });
  }

  try {
    const openaiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6",
        reasoning: { effort: "low" },
        max_output_tokens: 650,
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "donatello_product_enrichment",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                category: { type: "string" },
                brand: { type: "string" },
                model: { type: "string" },
                style: { type: "string" },
                material: { type: "string" },
                capacity: { type: "string" },
                shortDescription: { type: "string" },
                facebookPost: { type: "string" },
                keywords: {
                  type: "array",
                  items: { type: "string" },
                },
                needsMeasurements: { type: "boolean" },
              },
              required: [
                "name",
                "category",
                "brand",
                "model",
                "style",
                "material",
                "capacity",
                "shortDescription",
                "facebookPost",
                "keywords",
                "needsMeasurements",
              ],
            },
          },
        },
      }),
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return sendJson(res, openaiResponse.status, {
        error:
          data?.error?.message ||
          "OpenAI no pudo comprender el producto.",
      });
    }

    const text = extractOutputText(data);

    if (!text) {
      return sendJson(res, 502, {
        error: "OpenAI no devolvió una respuesta utilizable.",
      });
    }

    return sendJson(res, 200, {
      ok: true,
      enriched: JSON.parse(text),
      usage: data.usage || null,
    });
  } catch (error) {
    console.error("Atlas enrichment error:", error);

    return sendJson(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado al enriquecer el producto.",
    });
  }
}
