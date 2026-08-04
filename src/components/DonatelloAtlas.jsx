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
  const [costUsd, setCostUsd] = useState(defaultCostUsd);
  const [stock, setStock] = useState(defaultStock);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(initialResult);
  const [alternatives, setAlternatives] = useState([]);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState("");
  const [pricingContext, setPricingContext] = useState(null);
  const [searchResults, setSearchResults] = useState([]);

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
      setProgressMessage("Atlas está comenzando la investigación...");

      const response = await runAtlas({
        photo,
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
    setStatus("idle");
    setResult(initialResult);
    setAlternatives([]);
    setPricingContext(null);
    setSearchResults([]);
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
    });

    setProgressMessage(
      "Listo. Ya preparé los datos en el formulario para que los revises."
    );
    setStatus("approved");
  }

  async function showNextAlternative() {
    if (!alternatives.length) {
      setError("No tengo más opciones para mostrar.");
      return;
    }

    const [next, ...rest] = alternatives;

    try {
      setError("");
      setStatus("analyzing");
      setProgressMessage(
        "Estoy preparando la siguiente opción con IA, sin cambiar el precio comercial validado..."
      );

      const prepared = await prepareAtlasAlternative({
        alternative: next,
        pricingContext,
        searchResults,
      });

      setResult(prepared);
      setAlternatives(rest);
      setStatus("result");
      setProgressMessage(
        "Te muestro la siguiente opción. El nombre y la categoría fueron preparados con IA, y el precio se conserva con base en la mejor coincidencia."
      );
    } catch (err) {
      setStatus("result");
      setError(
        err.message || "No pude preparar la siguiente alternativa."
      );
    }
  }

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
            Sube la foto principal de la subasta y captura el costo. Atlas
            preparará la coincidencia, las imágenes, el nombre, la categoría y
            el precio sugerido para que tú lo apruebes.
          </p>
        </div>

        {(photo || status !== "idle") && (
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
          </div>

          <h4 style={{ margin: "0 0 14px", fontSize: "1.25rem" }}>
            Coincidencia propuesta
          </h4>

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
              style={{
                minHeight: 58,
                borderRadius: 18,
                border: "1px solid #bfa45f",
                background: "#fffaf0",
                color: "#3e3022",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              No, mostrar otra opción
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
