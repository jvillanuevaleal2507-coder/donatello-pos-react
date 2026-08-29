import { useMemo, useState } from "react";
import {
  prepareAtlasAlternative,
  runAtlas,
} from "../atlas/atlasEngine";

const initialResult = {
  name: "",
  category: "",
  suggestedPrice: "",
  image_url: "",
  image_url_2: "",
  image_url_3: "",
  image_url_4: "",
  source: "",
  sourceUrl: "",
  confidence: 0,
};

function Field({ label, children }) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontSize: "1rem",
        fontWeight: 800,
      }}
    >
      {label}
      {children}
    </label>
  );
}

export default function DonatelloAtlas({
  defaultCostUsd = "",
  defaultStock = "1",
  onCostChange,
  onStockChange,
  onComplete,
}) {
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [titleHint, setTitleHint] = useState("");
  const [costUsd, setCostUsd] = useState(defaultCostUsd);
  const [stock, setStock] = useState(defaultStock);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(initialResult);
  const [alternatives, setAlternatives] = useState([]);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState("");
  const [pricingContext, setPricingContext] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [currentOption, setCurrentOption] = useState(1);
  const [totalOptions, setTotalOptions] = useState(1);
  const [decisionContext, setDecisionContext] = useState(null);
  const [rejectedCount, setRejectedCount] = useState(0);

  const canAnalyze = useMemo(
    () => Boolean(photo) && Number(costUsd) > 0 && status !== "analyzing",
    [photo, costUsd, status]
  );

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen válida.");
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setError("La imagen no debe superar 12 MB.");
      return;
    }

    if (photoPreview) URL.revokeObjectURL(photoPreview);

    setError("");
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setStatus("idle");
    setResult(initialResult);
    setAlternatives([]);
    setPricingContext(null);
    setSearchResults([]);
    setCurrentOption(1);
    setTotalOptions(1);
    setDecisionContext(null);
    setRejectedCount(0);
    setProgressMessage("");
  }

  function handleCostChange(value) {
    setCostUsd(value);
    onCostChange?.(value);
  }

  function handleStockChange(value) {
    setStock(value);
    onStockChange?.(value);
  }

  async function analyzeProduct() {
    if (!canAnalyze) return;

    try {
      setError("");
      setStatus("analyzing");
      setProgressMessage(
        titleHint.trim()
          ? "Atlas está cruzando la foto con el título de la subasta..."
          : "Atlas está comenzando la investigación..."
      );

      const response = await runAtlas({
        photo,
        titleHint,
        costUsd,
        stock,
        onProgress: ({ message }) => {
          setProgressMessage(message);
        },
      });

      if (response.status === "no_results") {
        setStatus("no_results");
        setProgressMessage(response.message);
        return;
      }

      setResult(response.best || initialResult);
      setAlternatives(response.alternatives || []);
      setPricingContext(response.pricingContext || null);
      setSearchResults(response.searchResults || []);
      setCurrentOption(1);
      setTotalOptions(1 + (response.alternatives?.length || 0));
      setDecisionContext(response.decisionContext || null);
      setRejectedCount(response.rejected?.length || 0);
      setStatus("result");
      setProgressMessage(response.message || "");
    } catch (err) {
      setStatus("error");
      setError(err.message || "No pude analizar el producto.");
    }
  }

  function resetAtlas() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview("");
    setTitleHint("");
    setStatus("idle");
    setResult(initialResult);
    setAlternatives([]);
    setPricingContext(null);
    setSearchResults([]);
    setCurrentOption(1);
    setTotalOptions(1);
    setDecisionContext(null);
    setRejectedCount(0);
    setProgressMessage("");
    setError("");
  }

  function approveResult() {
    if (!result.name.trim()) {
      setError("Falta el nombre del producto.");
      return;
    }

    onComplete?.({
      ...result,
      costUsd,
      stock,
      sourcePhoto: photo,
      auctionTitle: titleHint.trim(),
    });

    setProgressMessage(
      "Listo. Ya preparé los datos en el formulario para que los revises."
    );
    setStatus("approved");
  }

  async function showNextAlternative() {
    if (!alternatives.length) {
      setError("Ya revisaste todas las opciones encontradas.");
      return;
    }

    const [next, ...rest] = alternatives;

    try {
      setError("");
      setStatus("analyzing");
      setProgressMessage(
        "Estoy preparando la siguiente opción con IA, conservando el precio y el valor de mercado validados..."
      );

      const prepared = await prepareAtlasAlternative({
        alternative: next,
        pricingContext,
        searchResults,
      });

      setResult(prepared);
      setAlternatives(rest);
      setCurrentOption((value) => Math.min(value + 1, totalOptions));
      setStatus("result");
      setProgressMessage(
        "Te muestro la siguiente opción. La IA limpió el nombre y la categoría; el precio y el valor de mercado se mantienen bloqueados."
      );
    } catch (err) {
      setStatus("result");
      setError(
        err.message || "No pude preparar la siguiente alternativa."
      );
    }
  }

  const pricingSummary = useMemo(() => {
    const pricing = result?.pricing;

    if (!pricing) return null;

    return {
      margin: Number(pricing.marginPercent || 0),
      marketValue: Number(pricing.marketValueMxn || 0),
      totalCost: Number(pricing.costBreakdown?.totalCostMxn || 0),
      strategy: pricing.strategyLabel || "",
      guaranteed: Boolean(pricing.marginGuaranteed),
      priceLocked: Boolean(pricing.priceLocked),
      marketLocked: Boolean(pricing.marketValueLocked),
      explanation: pricing.explanation || "",
    };
  }, [result]);

  const sourceAudit = useMemo(() => {
    return {
      confidence: Number(
        decisionContext?.confidence ??
          result?.confidence ??
          0
      ),
      exact: Boolean(
        decisionContext?.exactImageMatch ??
          result?.exactImageMatch
      ),
      compatibility:
        decisionContext?.productCompatibility ??
        result?.productCompatibility ??
        null,
      titleHintScore: Number(
        decisionContext?.titleHintScore ??
          result?.titleHintScore ??
          0
      ),
      photosMixed: Boolean(result?.photoSourcesMixed),
    };
  }, [decisionContext, result]);

  const inputStyle = {
    width: "100%",
    minHeight: 54,
    border: "1px solid #dacda9",
    borderRadius: 16,
    padding: "12px 14px",
    fontSize: "1.05rem",
    background: "#fff",
    color: "#20170f",
    boxSizing: "border-box",
  };

  const primaryButton = {
    width: "100%",
    minHeight: 58,
    border: 0,
    borderRadius: 18,
    padding: "14px 18px",
    fontSize: "1.05rem",
    fontWeight: 900,
    cursor: canAnalyze ? "pointer" : "not-allowed",
    background: canAnalyze ? "#244c3d" : "#a9b7b0",
    color: "#fff",
    boxShadow: canAnalyze ? "0 10px 22px rgba(36,76,61,.20)" : "none",
  };

  return (
    <section
      style={{
        border: "1px solid #cfb97a",
        borderRadius: 26,
        padding: 22,
        background:
          "linear-gradient(145deg, rgba(255,252,242,.98), rgba(248,240,216,.96))",
        boxShadow: "0 18px 38px rgba(54,42,20,.10)",
        marginBottom: 28,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#244c3d",
              color: "#fff7df",
              borderRadius: 999,
              padding: "8px 12px",
              fontWeight: 900,
              fontSize: ".85rem",
              letterSpacing: ".02em",
            }}
          >
            🤖 PROYECTO DONATELLO–ATLAS
          </span>

          <h3
            style={{
              margin: "14px 0 6px",
              fontSize: "1.75rem",
              lineHeight: 1.05,
              color: "#24170e",
            }}
          >
            Registrar producto con IA
          </h3>

          <p style={{ margin: 0, color: "#685b4b", maxWidth: 650 }}>
            Sube la foto principal, captura el costo y, si lo tienes, pega el
            título de la subasta. Atlas cruzará ambas pistas para elegir una
            coincidencia más precisa antes de preparar imágenes y precio.
          </p>
        </div>

        {(photo || status !== "idle" || titleHint) && (
          <button
            type="button"
            onClick={resetAtlas}
            style={{
              border: "1px solid #cbbd97",
              borderRadius: 14,
              padding: "10px 14px",
              background: "#fffaf0",
              color: "#473b2d",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      <div
        className="atlas-entry-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.25fr) minmax(240px, .75fr)",
          gap: 18,
          marginTop: 22,
        }}
      >
        <div>
          <label
            style={{
              minHeight: 235,
              border: "2px dashed #bfa45f",
              borderRadius: 22,
              background: "#fffdf7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 18,
              cursor: "pointer",
              overflow: "hidden",
            }}
          >
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Foto seleccionada para análisis"
                style={{
                  width: "100%",
                  maxHeight: 310,
                  objectFit: "contain",
                  borderRadius: 16,
                }}
              />
            ) : (
              <div>
                <div style={{ fontSize: "2.2rem" }}>📷</div>
                <strong
                  style={{
                    display: "block",
                    marginTop: 8,
                    fontSize: "1.15rem",
                    color: "#2b2118",
                  }}
                >
                  Seleccionar foto principal
                </strong>
                <span style={{ color: "#786a57", fontSize: ".92rem" }}>
                  JPG, PNG o WEBP · máximo 12 MB
                </span>
              </div>
            )}

            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              hidden
            />
          </label>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Título de subasta (opcional)">
            <input
              style={inputStyle}
              type="text"
              value={titleHint}
              onChange={(e) => setTitleHint(e.target.value)}
              placeholder="Ej. GARVEE 9 Drawer Dresser with Charging Station"
              maxLength={300}
            />
          </Field>

          <Field label="Costo USD">
            <input
              style={inputStyle}
              type="number"
              min="0"
              step="0.01"
              value={costUsd}
              onChange={(e) => handleCostChange(e.target.value)}
              placeholder="Ej. 41.00"
            />
          </Field>

          <Field label="Stock">
            <input
              style={inputStyle}
              type="number"
              min="1"
              step="1"
              value={stock}
              onChange={(e) => handleStockChange(e.target.value)}
            />
          </Field>

          <button
            type="button"
            disabled={!canAnalyze}
            onClick={analyzeProduct}
            style={primaryButton}
          >
            {status === "analyzing"
              ? "Atlas está trabajando..."
              : "Analizar producto"}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 16,
            borderRadius: 14,
            background: "#fff0ed",
            color: "#922f23",
            padding: "12px 14px",
            fontWeight: 800,
          }}
        >
          {error}
        </div>
      )}

      {status === "analyzing" && (
        <div
          style={{
            marginTop: 18,
            borderRadius: 18,
            padding: 18,
            background: "#fff",
            border: "1px solid #e3d9bb",
          }}
        >
          <strong>🧠 Atlas está contigo</strong>
          <p style={{ margin: "10px 0 0", color: "#5d5041" }}>
            {progressMessage}
          </p>
        </div>
      )}

      {status === "no_results" && (
        <div
          style={{
            marginTop: 18,
            borderRadius: 18,
            padding: 18,
            background: "#fff8e8",
            border: "1px solid #d5b86a",
          }}
        >
          <strong>No encontré una coincidencia clara.</strong>
          <p style={{ margin: "8px 0 0", color: "#675a47" }}>
            {progressMessage}
          </p>
        </div>
      )}

      {status === "result" && (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              borderRadius: 18,
              padding: 16,
              background: "#f4fbf7",
              border: "1px solid #9dc4ad",
              marginBottom: 16,
            }}
          >
            <strong style={{ color: "#244c3d" }}>
              Creo que encontré tu producto.
            </strong>
            <p style={{ margin: "8px 0 0", color: "#4f6559" }}>
              {progressMessage}
            </p>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              <span
                style={{
                  borderRadius: 999,
                  padding: "6px 10px",
                  background: "#ffffff",
                  border: "1px solid #bdd8c7",
                  color: "#315b49",
                  fontWeight: 900,
                  fontSize: ".82rem",
                }}
              >
                Coincidencia {sourceAudit.confidence.toFixed(0)}%
              </span>

              {titleHint.trim() && sourceAudit.titleHintScore > 0 && (
                <span
                  style={{
                    borderRadius: 999,
                    padding: "6px 10px",
                    background: "#fff7df",
                    border: "1px solid #d8bd72",
                    color: "#665326",
                    fontWeight: 900,
                    fontSize: ".82rem",
                  }}
                >
                  Título {Math.round(sourceAudit.titleHintScore * 100)}%
                </span>
              )}

              {sourceAudit.exact && (
                <span
                  style={{
                    borderRadius: 999,
                    padding: "6px 10px",
                    background: "#e4f5ea",
                    border: "1px solid #9dc4ad",
                    color: "#244c3d",
                    fontWeight: 900,
                    fontSize: ".82rem",
                  }}
                >
                  Imagen exacta
                </span>
              )}

              {rejectedCount > 0 && (
                <span
                  style={{
                    borderRadius: 999,
                    padding: "6px 10px",
                    background: "#fff8e8",
                    border: "1px solid #d5b86a",
                    color: "#6a5521",
                    fontWeight: 900,
                    fontSize: ".82rem",
                  }}
                >
                  {rejectedCount} resultado(s) descartado(s)
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            <h4 style={{ margin: 0, fontSize: "1.25rem" }}>
              Coincidencia propuesta
            </h4>

            <span
              style={{
                borderRadius: 999,
                padding: "7px 11px",
                background: "#fffaf0",
                border: "1px solid #cfb97a",
                color: "#59482f",
                fontWeight: 900,
                fontSize: ".9rem",
              }}
            >
              Opción {currentOption} de {totalOptions}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 14,
            }}
          >
            <Field label="Nombre">
              <input
                style={inputStyle}
                value={result.name}
                onChange={(e) =>
                  setResult((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </Field>

            <Field label="Categoría">
              <input
                style={inputStyle}
                value={result.category}
                onChange={(e) =>
                  setResult((prev) => ({
                    ...prev,
                    category: e.target.value,
                  }))
                }
              />
            </Field>

            <Field label="Precio sugerido MXN">
              <input
                style={inputStyle}
                type="number"
                value={result.suggestedPrice}
                onChange={(e) =>
                  setResult((prev) => ({
                    ...prev,
                    suggestedPrice: e.target.value,
                  }))
                }
              />
            </Field>

            <Field label="Fuente">
              <input
                style={inputStyle}
                value={result.source}
                readOnly
              />
            </Field>
          </div>

          {pricingSummary && (
            <div
              style={{
                marginTop: 16,
                borderRadius: 16,
                padding: 14,
                background: "#fffdf7",
                border: "1px solid #dfd2ac",
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
                color: "#514331",
              }}
            >
              <div>
                <strong>Costo total:</strong>{" "}
                ${pricingSummary.totalCost.toLocaleString("es-MX")} MXN
              </div>
              <div>
                <strong>Margen:</strong>{" "}
                {pricingSummary.margin.toFixed(2)}%
                {pricingSummary.guaranteed ? " ✓" : ""}
              </div>
              {pricingSummary.marketValue > 0 && (
                <div>
                  <strong>Valor de mercado:</strong>{" "}
                  ${pricingSummary.marketValue.toLocaleString("es-MX")} MXN
                </div>
              )}
              <div>
                <strong>Estrategia:</strong>{" "}
                {pricingSummary.strategy || "Precio comercial Atlas"}
              </div>

              {(pricingSummary.priceLocked ||
                pricingSummary.marketLocked) && (
                <div>
                  <strong>Protección:</strong>{" "}
                  {pricingSummary.priceLocked
                    ? "precio bloqueado"
                    : ""}
                  {pricingSummary.priceLocked &&
                  pricingSummary.marketLocked
                    ? " · "
                    : ""}
                  {pricingSummary.marketLocked
                    ? "valor de mercado bloqueado"
                    : ""}
                </div>
              )}

              {pricingSummary.explanation && (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    color: "#6a5b46",
                    fontSize: ".92rem",
                    lineHeight: 1.45,
                  }}
                >
                  {pricingSummary.explanation}
                </div>
              )}
            </div>
          )}

          {sourceAudit.photosMixed && (
            <div
              style={{
                marginTop: 14,
                borderRadius: 14,
                padding: "11px 13px",
                background: "#fff8e8",
                border: "1px solid #d5b86a",
                color: "#665326",
                fontWeight: 800,
                fontSize: ".9rem",
              }}
            >
              Atlas utilizó una imagen externa únicamente para mostrar medidas.
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
              marginTop: 16,
            }}
          >
            <button
              type="button"
              onClick={approveResult}
              style={{
                ...primaryButton,
                cursor: "pointer",
                background: "#244c3d",
              }}
            >
              Sí, usar esta opción
            </button>

            <button
              type="button"
              onClick={showNextAlternative}
              disabled={!alternatives.length}
              style={{
                minHeight: 58,
                borderRadius: 18,
                border: "1px solid #bfa45f",
                background: alternatives.length ? "#fffaf0" : "#eee8dc",
                color: alternatives.length ? "#3e3022" : "#8c8375",
                fontWeight: 900,
                cursor: alternatives.length ? "pointer" : "not-allowed",
              }}
            >
              {alternatives.length
                ? "No, mostrar otra opción"
                : "No hay más opciones"}
            </button>
          </div>
        </div>
      )}

      {status === "approved" && (
        <div
          style={{
            marginTop: 18,
            borderRadius: 18,
            padding: 18,
            background: "#f4fbf7",
            border: "1px solid #9dc4ad",
          }}
        >
          <strong style={{ color: "#244c3d" }}>
            ✅ Ya preparé el formulario.
          </strong>
          <p style={{ margin: "8px 0 0", color: "#4f6559" }}>
            Revisa los datos de abajo. Nada se guardará hasta que tú presiones
            “Guardar producto”.
          </p>
        </div>
      )}

      <style>{`
        @media (max-width: 760px) {
          .atlas-entry-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
