import { useState } from "react";
import { db } from "../firebase";
import { collection, addDoc } from "firebase/firestore";
import { Icon } from "../utils.jsx";

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const PROMPT = `Eres un extractor de datos para una tienda de ropa plus-size en Colombia.
Analiza esta imagen de factura de compra y extrae TODOS los productos/referencias que aparecen.

Responde ÚNICAMENTE con un JSON array sin texto adicional, con este formato exacto:
[
  {
    "referencia": "código o referencia del producto",
    "descripcion": "nombre o descripción de la prenda",
    "tallas": [
      {"talla": "S", "cantidad": 2},
      {"talla": "XL", "cantidad": 1}
    ],
    "costoUnitario": 45000
  }
]

Reglas importantes:
- costoUnitario debe ser número (sin puntos ni signos de moneda)
- Si una referencia tiene varias tallas listadas por separado, agrúpalas en el array "tallas"
- Si no hay detalle de tallas, usa: [{"talla": "Única", "cantidad": total_unidades}]
- Si no puedes leer un campo con certeza, usa null
- No incluyas NADA fuera del JSON (sin markdown, sin explicaciones)`;

async function imagenABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function pdfPaginaABase64(file) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  const base64 = canvas.toDataURL("image/png").split(",")[1];
  return base64;
}

async function llamarClaude(base64, mediaType = "image/png") {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: PROMPT }
        ]
      }]
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const texto = data.content[0].text.trim();
  const jsonStr = texto.startsWith("[") ? texto : texto.match(/\[[\s\S]*\]/)?.[0];
  if (!jsonStr) throw new Error("La IA no devolvió JSON válido");
  return JSON.parse(jsonStr);
}

export default function ImportarFactura({ onBorradorCreado, onClose }) {
  const [estado, setEstado] = useState("idle"); // idle | procesando | ok | error
  const [progreso, setProgreso] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const procesarArchivo = async (file) => {
    if (!ANTHROPIC_KEY) {
      setEstado("error");
      setErrorMsg("Falta VITE_ANTHROPIC_API_KEY en las variables de entorno.");
      return;
    }

    setEstado("procesando");
    setErrorMsg("");

    try {
      setProgreso("Leyendo archivo…");
      let base64, mediaType;

      if (file.type === "application/pdf") {
        setProgreso("Convirtiendo PDF a imagen…");
        base64 = await pdfPaginaABase64(file);
        mediaType = "image/png";
      } else {
        base64 = await imagenABase64(file);
        mediaType = file.type || "image/png";
      }

      setProgreso("Analizando factura con IA…");
      const productos = await llamarClaude(base64, mediaType);

      if (!productos.length) throw new Error("No se encontraron productos en la imagen");

      setProgreso(`Guardando ${productos.length} borradores…`);
      const fecha = new Date().toISOString();
      const lote = `LOTE-${Date.now()}`;

      for (const p of productos) {
        await addDoc(collection(db, "borradores"), {
          ...p,
          lote,
          fecha,
          estado: "pendiente",
          precioVenta: "",
          categoria: "",
          imagenes: [],
        });
      }

      setEstado("ok");
      setProgreso(`¡${productos.length} prendas listas para revisar!`);
      onBorradorCreado?.();
    } catch (err) {
      setEstado("error");
      setErrorMsg(err.message);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) procesarArchivo(file);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="animate" style={{ background: "#fff", borderRadius: 24, padding: 30, width: "90%", maxWidth: 420, boxShadow: "0 8px 40px rgba(0,0,0,0.15)" }}>

        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: "var(--rosa-deep)", margin: 0 }}>Importar Factura</h3>
            <p style={{ fontSize: 12, color: "var(--mid)", margin: "4px 0 0" }}>PNG, JPG o PDF — la IA extrae todo</p>
          </div>
          <button onClick={onClose} style={{ background: "var(--creme)", border: "none", width: 34, height: 34, borderRadius: "50%", cursor: "pointer", fontSize: 18, color: "var(--mid)" }}>×</button>
        </div>

        {/* ZONA DROP */}
        {estado === "idle" && (
          <label
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, border: "2px dashed var(--rosa-soft)", borderRadius: 16, padding: "32px 20px", cursor: "pointer", background: "var(--rosa-pale)", textAlign: "center" }}
          >
            <div style={{ fontSize: 40 }}>🧾</div>
            <p style={{ fontWeight: 700, color: "var(--rosa-deep)", margin: 0 }}>Arrastra aquí tu factura</p>
            <p style={{ fontSize: 12, color: "var(--mid)", margin: 0 }}>o haz clic para seleccionar</p>
            <span style={{ background: "linear-gradient(135deg, var(--rosa-deep), var(--rosa))", color: "#fff", borderRadius: 10, padding: "10px 24px", fontWeight: 700, fontSize: 13 }}>
              Seleccionar archivo
            </span>
            <input
              type="file"
              accept="image/*,.pdf"
              style={{ display: "none" }}
              onChange={e => e.target.files[0] && procesarArchivo(e.target.files[0])}
            />
          </label>
        )}

        {/* PROCESANDO */}
        {estado === "procesando" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 16, animation: "pulseLoader 1.5s infinite ease-in-out" }}>✨</div>
            <p style={{ fontWeight: 600, color: "var(--rosa-deep)", fontSize: 15 }}>{progreso}</p>
            <p style={{ fontSize: 12, color: "var(--mid)", marginTop: 8 }}>La IA está leyendo tu factura…</p>
          </div>
        )}

        {/* ÉXITO */}
        {estado === "ok" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
            <p style={{ fontWeight: 700, color: "var(--success)", fontSize: 16 }}>{progreso}</p>
            <p style={{ fontSize: 12, color: "var(--mid)", marginTop: 6, marginBottom: 20 }}>Revísalos en la Cola de Revisión</p>
            <button onClick={onClose} style={{ background: "linear-gradient(135deg, var(--success), #43A047)", color: "#fff", border: "none", borderRadius: 12, padding: "12px 28px", fontWeight: 700, cursor: "pointer" }}>
              Ver borradores
            </button>
          </div>
        )}

        {/* ERROR */}
        {estado === "error" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <p style={{ fontWeight: 700, color: "var(--danger)", fontSize: 14, marginBottom: 8 }}>Error al procesar</p>
            <p style={{ fontSize: 12, color: "var(--mid)", background: "#FFEBEE", padding: "10px", borderRadius: 10, marginBottom: 20 }}>{errorMsg}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setEstado("idle"); setErrorMsg(""); }} style={{ flex: 1, background: "var(--creme)", border: "1px solid var(--border)", borderRadius: 12, padding: "11px", fontWeight: 600, cursor: "pointer" }}>Intentar de nuevo</button>
              <button onClick={onClose} style={{ flex: 1, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 12, padding: "11px", fontWeight: 600, cursor: "pointer" }}>Cerrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
