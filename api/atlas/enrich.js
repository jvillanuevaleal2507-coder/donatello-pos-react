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

Tu tarea es convertir una ficha comercial en inglés en información clara para un POS y una publicación de Facebook.

Reglas:
- Escribe en español natural de México.
- El nombre para POS debe ser corto, claro y comercial, máximo 60 caracteres.
- No incluyas Amazon, Lowe's, Walmart, Home Depot, Wayfair ni otra tienda en el nombre.
- No inventes cantidad, material, medidas, marca o características.
- Conserva la marca solamente cuando sea útil y esté claramente presente.
- Categorías permitidas:
  Muebles, Iluminación, Decoración, Cocina, Electrodomésticos,
  Organización, Exterior, Baño, Oficina, Infantil, Otros.
- La descripción corta debe tener máximo 180 caracteres.
- El post de Facebook debe sonar humano, directo y natural; máximo 450 caracteres.
- No menciones que el producto fue encontrado con IA.
- No menciones la tienda fuente en el post.
- "needs_measurements" debe ser true para muebles, comedores, burós,
  sillones, sillas, bancos, mecedoras, espejos, estantes y productos
  donde las dimensiones influyen en la compra.
- Si no estás seguro de un dato, déjalo vacío.

Datos encontrados:
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
        max_output_tokens: 500,
        input: [
          {
            role: "user",
            content,
          },
        ],
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

    const enriched = JSON.parse(text);

    return sendJson(res, 200, {
      ok: true,
      enriched,
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

