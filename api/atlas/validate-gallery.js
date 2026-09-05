const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_CANDIDATES = 12;

function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
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

function publicHttps(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function clamp01(value) {
  const number = Number(value || 0);
  return Math.max(0, Math.min(1, Number.isFinite(number) ? number : 0));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, { error: "Falta configurar OPENAI_API_KEY en Vercel." });
  }

  const {
    targetTitle = "",
    titleHint = "",
    identity = null,
    candidates = [],
  } = req.body || {};

  const usable = (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => ({
      ...candidate,
      index: Number.isInteger(candidate?.id) ? candidate.id : index,
      url: publicHttps(candidate?.url),
    }))
    .filter((candidate) => candidate.url)
    .slice(0, MAX_CANDIDATES);

  if (!usable.length) {
    return sendJson(res, 400, { error: "No hay imágenes candidatas válidas." });
  }

  const identityText = identity && typeof identity === "object"
    ? JSON.stringify({
        targetProduct: identity.targetProduct || "",
        productType: identity.productType || "",
        brand: identity.brand || "",
        model: identity.model || "",
        distinctiveTerms: Array.isArray(identity.distinctiveTerms) ? identity.distinctiveTerms : [],
      })
    : "No disponible";

  const prompt = `
Eres el validador visual de catálogo de Ventas Donatello.

Debes decidir, imagen por imagen, si cada candidata muestra EL MISMO PRODUCTO OBJETIVO que estamos registrando. Esta tarea es de control de calidad: es preferible rechazar una imagen dudosa antes que contaminar la galería con otro producto.

Producto objetivo:
- Título elegido: ${String(targetTitle || "").slice(0, 300)}
- Título de subasta: ${String(titleHint || "").slice(0, 300) || "No proporcionado"}
- Identidad Atlas: ${identityText}

Reglas obligatorias:
- Acepta solo imágenes del mismo producto o de la misma variante exacta cuando sea visualmente consistente.
- Rechaza productos de otra categoría, accesorios distintos, muebles diferentes, espejos, lámparas, sombrillas, comederos, decoración u otros objetos aunque aparezcan en resultados relacionados.
- Una escena de ambiente se acepta solo si el producto objetivo está claramente presente y coincide.
- Una imagen de medidas se acepta solo si corresponde al mismo producto.
- Si marca, forma, color, número de cajones/patas/puertas, tamaño aparente o estructura contradicen el producto objetivo, rechaza.
- Si no puedes verificar con suficiente seguridad que es el mismo producto, rechaza.
- No aceptes una imagen únicamente porque el texto asociado diga que coincide: manda la evidencia visual.
- Clasifica cada imagen aceptada como main, measurements, environment, detail u other.
- Para "confidence", 1 significa certeza visual muy alta. Usa menos de 0.72 cuando exista duda real.
`.trim();

  const content = [{ type: "input_text", text: prompt }];

  for (const candidate of usable) {
    content.push({
      type: "input_text",
      text: `CANDIDATA #${candidate.index}\nFuente: ${candidate.source || ""}\nResultado: ${candidate.resultTitle || ""}\nTipo previo: ${candidate.originalType || ""}`,
    });
    content.push({
      type: "input_image",
      image_url: candidate.url,
      detail: "low",
    });
  }

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
        max_output_tokens: 1000,
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "donatello_gallery_validation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      index: { type: "integer" },
                      matchesTarget: { type: "boolean" },
                      confidence: { type: "number" },
                      type: {
                        type: "string",
                        enum: ["main", "measurements", "environment", "detail", "other"],
                      },
                      reason: { type: "string" },
                    },
                    required: ["index", "matchesTarget", "confidence", "type", "reason"],
                  },
                },
              },
              required: ["items"],
            },
          },
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return sendJson(res, response.status, {
        error: data?.error?.message || "OpenAI no pudo validar la galería.",
      });
    }

    const text = extractOutputText(data);
    if (!text) {
      return sendJson(res, 502, { error: "El validador no devolvió una respuesta utilizable." });
    }

    const parsed = JSON.parse(text);
    const validIndexes = new Set(usable.map((candidate) => candidate.index));
    const normalized = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((item) => validIndexes.has(Number(item.index)))
      .map((item) => ({
        index: Number(item.index),
        matchesTarget: Boolean(item.matchesTarget),
        confidence: clamp01(item.confidence),
        type: item.type || "other",
        reason: String(item.reason || "").slice(0, 220),
      }));

    const accepted = normalized.filter(
      (item) => item.matchesTarget && item.confidence >= 0.72
    );
    const acceptedIndexes = new Set(accepted.map((item) => item.index));
    const rejected = normalized
      .filter((item) => !acceptedIndexes.has(item.index));

    return sendJson(res, 200, {
      ok: true,
      accepted,
      rejected,
      candidateCount: usable.length,
      usage: data.usage || null,
    });
  } catch (error) {
    console.error("Atlas gallery validator error:", error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Error inesperado validando la galería.",
    });
  }
}
