import { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase";
import { collection, addDoc, doc, updateDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";
import { Icon, comprimirImagen, nombreDe } from "../utils.jsx";

// ── compresor ancho, para banners (más resolución que las miniaturas normales) ──
function comprimirImagenAncha(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const scale = Math.min(1, 1000 / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
    };
  });
}

const SLIDE_DEFAULT = {
  badge: "🌸 Nueva colección",
  titulo: "Tu cuerpo, tu moda",
  subtitulo: "Tallas OXL al 4XL · Envíos a todo Colombia",
  textoBton: "Ver catálogo →",
  accion: "scroll",
  accionLink: "",
  activo: true,
  imagen: "",
  posicion: { x: 50, y: 50 },
};

function VistaPreviaSlide({ slide }) {
  return (
    <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", aspectRatio: "16/6", background: slide.imagen ? "transparent" : "linear-gradient(135deg, #8B1A4D, #C2185B)", flexShrink: 0 }}>
      {slide.imagen && (
        <img src={slide.imagen} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0, objectPosition: `${slide.posicion?.x ?? 50}% ${slide.posicion?.y ?? 50}%` }} />
      )}
      <div style={{ position: "absolute", inset: 0, background: slide.imagen ? "linear-gradient(to right, rgba(139,26,77,0.78) 0%, rgba(139,26,77,0.35) 60%, rgba(0,0,0,0.05) 100%)" : "rgba(0,0,0,0.08)" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 24px", gap: 5 }}>
        {slide.badge && (
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.85)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, background: "rgba(255,255,255,0.18)", borderRadius: 20, padding: "2px 10px", width: "fit-content" }}>
            {slide.badge}
          </span>
        )}
        <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.2 }}>{slide.titulo || "Título"}</p>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", margin: 0 }}>{slide.subtitulo || "Subtítulo"}</p>
        {slide.textoBton && (
          <span style={{ background: "#fff", color: "#8B1A4D", borderRadius: 20, padding: "4px 12px", fontSize: 10, fontWeight: 800, width: "fit-content", marginTop: 2 }}>
            {slide.textoBton}
          </span>
        )}
      </div>
    </div>
  );
}

const PUNTOS_ANCLA = [
  { label: "↖", x: 20, y: 20 }, { label: "↑", x: 50, y: 20 }, { label: "↗", x: 80, y: 20 },
  { label: "←", x: 20, y: 50 }, { label: "⊙", x: 50, y: 50 }, { label: "→", x: 80, y: 50 },
  { label: "↙", x: 20, y: 80 }, { label: "↓", x: 50, y: 80 }, { label: "↘", x: 80, y: 80 },
];

function PosicionadorImagen({ imagenUrl, posicion, onChange }) {
  const ref = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);

  const calcular = (clientX, clientY) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onChange({
      x: Math.round(Math.min(100, Math.max(0, (clientX - rect.left) / rect.width * 100))),
      y: Math.round(Math.min(100, Math.max(0, (clientY - rect.top) / rect.height * 100))),
    });
  };

  return (
    <div>
      <p style={{ fontSize: 12, color: "#9E7A8E", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
        🖱️ <strong>Arrastra</strong> para reposicionar el encuadre
      </p>
      <div
        ref={ref}
        onMouseDown={(e) => { setArrastrando(true); calcular(e.clientX, e.clientY); e.preventDefault(); }}
        onMouseMove={(e) => arrastrando && calcular(e.clientX, e.clientY)}
        onMouseUp={() => setArrastrando(false)}
        onMouseLeave={() => setArrastrando(false)}
        onTouchMove={(e) => { const t = e.touches[0]; calcular(t.clientX, t.clientY); e.preventDefault(); }}
        onTouchEnd={() => setArrastrando(false)}
        style={{ width: "100%", height: 260, borderRadius: 14, overflow: "hidden", cursor: arrastrando ? "grabbing" : "grab", position: "relative", border: "2px dashed #C2185B", userSelect: "none" }}
      >
        <img src={imagenUrl} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${posicion.x}% ${posicion.y}%`, pointerEvents: "none", transition: arrastrando ? "none" : "object-position 0.15s ease" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(139,26,77,0.5) 0%, transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: `${posicion.x}%`, top: `${posicion.y}%`, transform: "translate(-50%,-50%)", width: 24, height: 24, pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,0.9)", transform: "translateX(-50%)" }} />
          <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.9)", transform: "translateY(-50%)" }} />
        </div>
        <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 10, padding: "3px 8px", borderRadius: 10, pointerEvents: "none" }}>
          📍 {posicion.x}% {posicion.y}%
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginTop: 8 }}>
        {PUNTOS_ANCLA.map((p) => {
          const activo = posicion.x === p.x && posicion.y === p.y;
          return (
            <button key={p.label} onClick={() => onChange({ x: p.x, y: p.y })}
              style={{ padding: "6px 0", borderRadius: 8, border: `1.5px solid ${activo ? "#C2185B" : "#EDD9E8"}`, background: activo ? "#FCE4EC" : "#fff", color: "#8B1A4D", cursor: "pointer", fontSize: 14, fontWeight: activo ? 700 : 400 }}>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CampoTexto({ label, valor, onChange, placeholder }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#7B4F6A", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</label>
      <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1.5px solid #EDD9E8", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", background: "#FAF7F4", boxSizing: "border-box" }} />
    </div>
  );
}

function FormularioSlide({ inicial, onSave, onCancel, guardando }) {
  const [slide, setSlide] = useState({ ...SLIDE_DEFAULT, posicion: { x: 50, y: 50 }, ...inicial });
  const [subiendo, setSubiendo] = useState(false);
  const inputFileRef = useRef();

  const set = (campo, valor) => setSlide((s) => ({ ...s, [campo]: valor }));
  const setPosicion = (pos) => setSlide((s) => ({ ...s, posicion: pos }));

  const onArchivo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    try { set("imagen", await comprimirImagenAncha(file)); }
    finally { setSubiendo(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#7B4F6A", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Vista previa</label>
        <VistaPreviaSlide slide={slide} />
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#7B4F6A", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>📷 Imagen de fondo</label>
        <p style={{ fontSize: 11, color: "#9E7A8E", margin: "0 0 10px" }}>Recomendado: imagen horizontal, mínimo 1200×600px</p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => inputFileRef.current?.click()} disabled={subiendo}
            style={{ padding: "10px 18px", borderRadius: 12, background: "#FDF0F6", border: "1.5px dashed #C2185B", color: "#8B1A4D", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="image" size={15} /> {subiendo ? "Procesando..." : slide.imagen ? "Cambiar imagen" : "Subir imagen"}
          </button>
          {slide.imagen && (
            <button onClick={() => set("imagen", "")} style={{ padding: "10px 14px", borderRadius: 12, background: "#FFEBEE", border: "none", color: "#C62828", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              Quitar imagen
            </button>
          )}
          {!slide.imagen && <span style={{ fontSize: 12, color: "#9E7A8E" }}>Sin imagen → fondo degradado rosa/vino automático</span>}
        </div>
        <input ref={inputFileRef} type="file" accept="image/*" onChange={onArchivo} style={{ display: "none" }} />
      </div>

      {slide.imagen && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#7B4F6A", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>🎯 Posición de encuadre</label>
          <PosicionadorImagen imagenUrl={slide.imagen} posicion={slide.posicion ?? { x: 50, y: 50 }} onChange={setPosicion} />
        </div>
      )}

      <CampoTexto label="📌 Badge superior" valor={slide.badge} onChange={(v) => set("badge", v)} placeholder="ej: 🌸 NUEVA COLECCIÓN" />
      <CampoTexto label="✍️ Título principal" valor={slide.titulo} onChange={(v) => set("titulo", v)} placeholder="ej: Estilo sin límites" />
      <CampoTexto label="💬 Subtítulo" valor={slide.subtitulo} onChange={(v) => set("subtitulo", v)} placeholder="ej: Moda plus size para todas" />
      <CampoTexto label="🔘 Texto del botón" valor={slide.textoBton} onChange={(v) => set("textoBton", v)} placeholder="ej: Ver catálogo →" />

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#7B4F6A", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>🔗 Acción del botón</label>
        <div style={{ display: "flex", gap: 8 }}>
          {[{ val: "scroll", label: "Scroll al catálogo" }, { val: "link", label: "Link externo" }].map((op) => (
            <button key={op.val} onClick={() => set("accion", op.val)}
              style={{ padding: "8px 16px", borderRadius: 20, border: `1.5px solid ${slide.accion === op.val ? "#8B1A4D" : "#EDD9E8"}`, background: slide.accion === op.val ? "#8B1A4D" : "#fff", color: slide.accion === op.val ? "#fff" : "#7B4F6A", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {op.label}
            </button>
          ))}
        </div>
        {slide.accion === "link" && (
          <input value={slide.accionLink} onChange={(e) => set("accionLink", e.target.value)} placeholder="https://..."
            style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1.5px solid #EDD9E8", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", background: "#FAF7F4", boxSizing: "border-box", marginTop: 10 }} />
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FAF7F4", borderRadius: 14, padding: "14px 16px", border: "1px solid #EDD9E8" }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, color: "#1C0F17", margin: 0 }}>Slide activo</p>
          <p style={{ fontSize: 12, color: "#9E7A8E", margin: "2px 0 0" }}>Visible en la página pública</p>
        </div>
        <button onClick={() => set("activo", !slide.activo)}
          style={{ width: 44, height: 26, borderRadius: 13, background: slide.activo ? "#8B1A4D" : "#D1C4CA", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
          <span style={{ position: "absolute", top: 3, left: slide.activo ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => onSave(slide)} disabled={guardando || subiendo}
          style={{ flex: 1, padding: 14, borderRadius: 14, background: guardando || subiendo ? "#ccc" : "linear-gradient(135deg, #8B1A4D, #C2185B)", color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: guardando || subiendo ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {guardando ? "⏳ Guardando..." : "🚀 Guardar y publicar"}
        </button>
        <button onClick={onCancel} style={{ padding: "14px 20px", borderRadius: 14, background: "#FAF7F4", border: "1px solid #EDD9E8", color: "#7B4F6A", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Toast({ msg, error }) {
  if (!msg) return null;
  return (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: error ? "#E53935" : "#43A047", color: "#fff", padding: "12px 24px", borderRadius: 24, fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.22)", zIndex: 9999, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
      {msg}
    </div>
  );
}

function BannerTab() {
  const [slides, setSlides] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [msgOk, setMsgOk] = useState("");
  const [msgError, setMsgError] = useState("");

  const notificar = (msg, error = false) => {
    if (error) { setMsgError(msg); setTimeout(() => setMsgError(""), 4000); }
    else { setMsgOk(msg); setTimeout(() => setMsgOk(""), 3500); }
  };

  const recargar = async () => {
    try {
      const snap = await getDocs(collection(db, "heroSlides"));
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      lista.sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
      setSlides(lista);
    } catch (e) {
      console.error("Error cargando slides:", e);
      setSlides([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    let listo = false;
    const tope = setTimeout(() => { if (!listo) { setSlides([]); setCargando(false); } }, 6000);
    recargar().finally(() => { listo = true; clearTimeout(tope); });
    return () => clearTimeout(tope);
  }, []);

  const activos = slides.filter((s) => s.activo).length;

  const guardar = async (slide) => {
    if (!auth.currentUser) { notificar("❌ Sin sesión activa. Recarga la página e inicia sesión.", true); return; }
    setGuardando(true);
    try {
      const { id, ...datos } = slide;
      if (!datos.posicion) datos.posicion = { x: 50, y: 50 };
      datos.creadoPor = auth.currentUser.uid;
      if (id) {
        await updateDoc(doc(db, "heroSlides", id), { ...datos, actualizadoEn: serverTimestamp() });
      } else {
        const maxOrden = slides.reduce((m, s) => Math.max(m, s.orden ?? 0), -1);
        await addDoc(collection(db, "heroSlides"), { ...datos, orden: maxOrden + 1, creadoEn: serverTimestamp() });
      }
      await recargar();
      setEditando(null);
      notificar("✅ ¡Banner publicado! Ya se ve en la tienda.");
    } catch (e) {
      console.error("Error al guardar slide:", e.code, e.message);
      const mensajes = {
        "permission-denied": "❌ Sin permisos. Actualiza las reglas de Firestore.",
        "not-found": "❌ Documento no encontrado.",
        "unavailable": "❌ Sin conexión. Revisa tu internet.",
        "unauthenticated": "❌ Sesión expirada. Recarga la página.",
      };
      notificar(mensajes[e.code] ?? `❌ Error: ${e.message}`, true);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar este slide?")) return;
    try { await deleteDoc(doc(db, "heroSlides", id)); await recargar(); }
    catch { notificar("❌ Error al eliminar.", true); }
  };

  const alternarActivo = async (slide) => {
    if (!slide.activo && activos >= 5) { alert("Máximo 5 slides activos. Desactiva uno antes de activar otro."); return; }
    await updateDoc(doc(db, "heroSlides", slide.id), { activo: !slide.activo });
    await recargar();
  };

  const mover = async (indice, delta) => {
    const destino = indice + delta;
    if (destino < 0 || destino >= slides.length) return;
    const a = slides[indice], b = slides[destino];
    await Promise.all([
      updateDoc(doc(db, "heroSlides", a.id), { orden: b.orden ?? destino }),
      updateDoc(doc(db, "heroSlides", b.id), { orden: a.orden ?? indice }),
    ]);
    await recargar();
  };

  if (cargando) return <div style={{ textAlign: "center", padding: 60, color: "#9E7A8E" }}>Cargando slides...</div>;

  if (editando !== null) {
    return (
      <>
        <div style={{ paddingBottom: 80 }}>
          <button onClick={() => setEditando(null)} style={{ background: "none", border: "none", color: "#8B1A4D", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 20, padding: 0 }}>
            ← Volver al gestor
          </button>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#1C0F17", marginBottom: 24 }}>{editando.id ? "Editar slide" : "Nuevo slide"}</h2>
          <FormularioSlide inicial={editando} onSave={guardar} onCancel={() => setEditando(null)} guardando={guardando} />
        </div>
        <Toast msg={msgOk} />
        <Toast msg={msgError} error />
      </>
    );
  }

  return (
    <>
      <div style={{ paddingBottom: 80 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 12 }}>
          <div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#1C0F17", margin: 0 }}>🖼️ Banner Principal</h2>
            <p style={{ fontSize: 13, color: "#9E7A8E", marginTop: 4 }}>Gestiona las imágenes del slider · {activos}/5 activos</p>
          </div>
          <button onClick={() => setEditando({ ...SLIDE_DEFAULT })}
            style={{ padding: "10px 16px", borderRadius: 14, background: "linear-gradient(135deg, #8B1A4D, #C2185B)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Icon name="plus" size={15} /> Nuevo slide
          </button>
        </div>

        {slides.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: 20, border: "1px dashed #EDD9E8", marginTop: 20 }}>
            <p style={{ fontSize: 36, marginBottom: 12 }}>🖼️</p>
            <p style={{ fontWeight: 700, color: "#1C0F17", marginBottom: 6 }}>Sin slides configurados</p>
            <p style={{ fontSize: 13, color: "#9E7A8E", marginBottom: 20 }}>La página pública mostrará un fondo degradado rosa/vino por defecto</p>
            <button onClick={() => setEditando({ ...SLIDE_DEFAULT })}
              style={{ padding: "12px 24px", borderRadius: 14, background: "linear-gradient(135deg, #8B1A4D, #C2185B)", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
              Crear primer slide
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {slides.map((s, i) => (
              <div key={s.id} style={{ background: "#fff", borderRadius: 16, padding: "12px 14px", border: `1px solid ${s.activo ? "#F3E4EF" : "#EDD9E8"}`, display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 76, height: 48, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: s.imagen ? "transparent" : "linear-gradient(135deg, #8B1A4D, #C2185B)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {s.imagen ? (
                    <img src={s.imagen} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${s.posicion?.x ?? 50}% ${s.posicion?.y ?? 50}%` }} />
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 600 }}>degradado</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: "#1C0F17", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.titulo || "(sin título)"}</p>
                  <p style={{ fontSize: 11, color: "#9E7A8E", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.badge || "—"}</p>
                </div>
                <button onClick={() => alternarActivo(s)} title={s.activo ? "Activo · click para desactivar" : "Inactivo · click para activar"}
                  style={{ width: 40, height: 24, borderRadius: 12, background: s.activo ? "#8B1A4D" : "#D1C4CA", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
                  <span style={{ position: "absolute", top: 2, left: s.activo ? 18 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.18)" }} />
                </button>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                  <button onClick={() => mover(i, -1)} disabled={i === 0}
                    style={{ width: 26, height: 22, borderRadius: 6, background: i === 0 ? "#F8F8F8" : "#FDF0F6", border: "1px solid #EDD9E8", color: i === 0 ? "#CCC" : "#8B1A4D", cursor: i === 0 ? "default" : "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>▲</button>
                  <button onClick={() => mover(i, 1)} disabled={i === slides.length - 1}
                    style={{ width: 26, height: 22, borderRadius: 6, background: i === slides.length - 1 ? "#F8F8F8" : "#FDF0F6", border: "1px solid #EDD9E8", color: i === slides.length - 1 ? "#CCC" : "#8B1A4D", cursor: i === slides.length - 1 ? "default" : "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>▼</button>
                </div>
                <button onClick={() => setEditando(s)} style={{ padding: "7px 14px", borderRadius: 10, background: "#FDF0F6", border: "1px solid #EDD9E8", color: "#8B1A4D", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Editar</button>
                <button onClick={() => eliminar(s.id)} style={{ width: 32, height: 32, borderRadius: 8, background: "#FFEBEE", border: "none", color: "#C62828", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 12, color: "#9E7A8E", marginTop: 20, padding: "12px 16px", background: "#FFF5F7", borderRadius: 12, border: "1px solid #F3E4EF" }}>
          💡 <strong>Tip:</strong> Usa imágenes horizontales de mínimo 1200×600px. Sin imagen → fondo degradado rosa/vino automático. Máximo 5 slides activos.
        </p>
      </div>
      <Toast msg={msgOk} />
      <Toast msg={msgError} error />
    </>
  );
}

const CATEGORIAS_DEFAULT = [
  { nombre: "Vestido", orden: 1, activa: true, imagen: "" },
  { nombre: "Blusa", orden: 2, activa: true, imagen: "" },
  { nombre: "Falda", orden: 3, activa: true, imagen: "" },
  { nombre: "Conjunto", orden: 4, activa: true, imagen: "" },
  { nombre: "Otro", orden: 5, activa: true, imagen: "" },
];

function CategoriasTab() {
  const [categorias, setCategorias] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [msgOk, setMsgOk] = useState("");
  const [aviso, setAviso] = useState(null);

  const avisar = (msg) => { setAviso(msg); setTimeout(() => setAviso(null), 3000); };

  useEffect(() => {
    getDocs(query(collection(db, "categorias"), orderBy("orden"))).then((snap) => {
      if (snap.empty) {
        setCategorias(CATEGORIAS_DEFAULT.map((c, i) => ({ ...c, id: `nueva-${i}` })));
      } else {
        setCategorias(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    });
  }, []);

  const actualizar = (id, cambios) => setCategorias((cats) => cats.map((c) => (c.id === id ? { ...c, ...cambios } : c)));

  const agregar = () => {
    if (categorias.length >= 8) return avisar("Máximo 8 categorías");
    setCategorias((cats) => [...cats, { id: `nueva-${Date.now()}`, nombre: "Nueva categoría", imagen: "", activa: true, orden: cats.length + 1 }]);
  };

  const eliminar = async (id) => {
    if (!id.startsWith("nueva-")) await deleteDoc(doc(db, "categorias", id));
    setCategorias((cats) => cats.filter((c) => c.id !== id));
  };

  const subirImagen = async (id, file) => {
    if (!file) return;
    try { actualizar(id, { imagen: await comprimirImagen(file) }); }
    catch { avisar("Error procesando imagen"); }
  };

  const guardarTodo = async () => {
    setGuardando(true);
    try {
      for (const [i, cat] of categorias.entries()) {
        const datos = { nombre: cat.nombre, imagen: cat.imagen || "", activa: cat.activa, orden: i + 1 };
        if (cat.id.startsWith("nueva-")) await addDoc(collection(db, "categorias"), datos);
        else await updateDoc(doc(db, "categorias", cat.id), datos);
      }
      setMsgOk("✅ Categorías guardadas y publicadas");
      setTimeout(() => setMsgOk(""), 3000);
    } catch (e) {
      console.error(e);
      avisar("Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 0 40px" }}>
      {aviso && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#FF9800", color: "white", padding: "10px 20px", borderRadius: 12, fontWeight: 700, fontSize: 13, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
          {aviso}
        </div>
      )}
      <p style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>Máximo 8 · Los nombres deben coincidir exactamente con las categorías de tus prendas</p>

      {categorias.map((c) => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "white", borderRadius: 16, marginBottom: 10, border: c.activa ? "1px solid #F5E6EE" : "1px solid #eee", opacity: c.activa ? 1 : 0.5, transition: "all 0.2s ease" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "2px solid #F5E6EE", background: "#FCE4EC", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {c.imagen ? <img src={c.imagen} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} alt="" /> : <span style={{ fontSize: 22 }}>👗</span>}
          </div>
          <input value={c.nombre} onChange={(e) => actualizar(c.id, { nombre: e.target.value })}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1px solid #F5E6EE", fontSize: 14, fontWeight: 600, fontFamily: "inherit", outline: "none", background: "#FAFAFA", minWidth: 0 }} />
          <label style={{ background: "#FCE4EC", color: "#C2185B", borderRadius: 10, padding: "8px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
            📷 Foto
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => subirImagen(c.id, e.target.files[0])} />
          </label>
          <button onClick={() => actualizar(c.id, { activa: !c.activa })}
            style={{ padding: "7px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0, background: c.activa ? "#C2185B" : "#eee", color: c.activa ? "white" : "#999", fontFamily: "inherit" }}>
            {c.activa ? "✓ Visible" : "Oculta"}
          </button>
          <button onClick={() => eliminar(c.id)} style={{ background: "none", border: "none", color: "#ddd", fontSize: 22, cursor: "pointer", flexShrink: 0, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      ))}

      {categorias.length < 8 && (
        <button onClick={agregar} style={{ width: "100%", padding: 16, background: "white", border: "2px dashed #F5E6EE", borderRadius: 16, color: "#C2185B", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 16, fontFamily: "inherit" }}>
          + Agregar categoría <span style={{ fontSize: 11, color: "#bbb", marginLeft: 8, fontWeight: 400 }}>({8 - categorias.length} disponibles)</span>
        </button>
      )}

      {msgOk && (
        <div style={{ background: "#4CAF50", color: "white", borderRadius: 12, padding: "12px 20px", fontSize: 13, fontWeight: 600, marginBottom: 12, textAlign: "center" }}>
          {msgOk}
        </div>
      )}

      <button onClick={guardarTodo} disabled={guardando}
        style={{ width: "100%", padding: 16, background: guardando ? "#ccc" : "linear-gradient(135deg, #8B1A4D, #C2185B)", color: "white", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 800, cursor: guardando ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
        {guardando ? "⏳ Guardando..." : "🚀 Guardar y publicar"}
      </button>
    </div>
  );
}

const LIMITE_STORAGE_BYTES = 1073741824; // 1 GiB, plan gratuito Firestore
const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);
const colorUso = (pct) => (pct < 60 ? "#4CAF50" : pct < 85 ? "#FF9800" : "#D32F2F");

function AlmacenamientoTab() {
  const [uso, setUso] = useState(null);
  const [calculando, setCalculando] = useState(false);

  const calcular = async () => {
    setCalculando(true);
    try {
      const [prendasSnap, categoriasSnap] = await Promise.all([getDocs(collection(db, "prendas")), getDocs(collection(db, "categorias"))]);
      let totalPrendas = 0;
      const desglose = [];
      prendasSnap.docs.forEach((d) => {
        const p = d.data();
        const imagenes = Array.isArray(p.imagenes) ? p.imagenes : p.imagen ? [p.imagen] : [];
        const bytes = imagenes.reduce((acc, img) => acc + (img?.length || 0), 0);
        totalPrendas += bytes;
        desglose.push({ nombre: nombreDe(p) || "Sin nombre", bytes, fotos: imagenes.length });
      });
      desglose.sort((a, b) => b.bytes - a.bytes);

      let totalCategorias = 0;
      categoriasSnap.docs.forEach((d) => { totalCategorias += d.data().imagen?.length || 0; });

      const total = totalPrendas + totalCategorias;
      setUso({ total, totalPrendas, totalCategorias, pct: (total / LIMITE_STORAGE_BYTES) * 100, desglose });
    } finally {
      setCalculando(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <p style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>Las imágenes se guardan en Firestore como base64. Plan gratuito: 1 GiB total.</p>
      <button onClick={calcular} disabled={calculando}
        style={{ width: "100%", padding: 16, background: calculando ? "#ccc" : "linear-gradient(135deg, #8B1A4D, #C2185B)", color: "white", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 800, cursor: calculando ? "not-allowed" : "pointer", marginBottom: 24, fontFamily: "inherit" }}>
        {calculando ? "⏳ Analizando Firestore..." : "🔍 Calcular uso de almacenamiento"}
      </button>

      {uso && (
        <>
          <div style={{ background: "white", borderRadius: 16, padding: 20, border: "1px solid #F5E6EE", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: "#1a1a1a" }}>Uso total en Firestore</span>
              <span style={{ fontWeight: 800, fontSize: 18, color: colorUso(uso.pct) }}>{fmtBytes(uso.total)}</span>
            </div>
            <div style={{ height: 10, background: "#F5F5F5", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${Math.min(uso.pct, 100)}%`, background: colorUso(uso.pct), borderRadius: 10, transition: "width 0.8s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
              <span>{uso.pct.toFixed(3)}% del plan gratuito</span>
              <span>Límite: 1 GiB</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {[{ label: "🛍️ Prendas", bytes: uso.totalPrendas, count: uso.desglose.length }, { label: "🎨 Categorías", bytes: uso.totalCategorias, count: null }].map((b) => (
              <div key={b.label} style={{ background: "white", borderRadius: 14, padding: "14px 16px", border: "1px solid #F5E6EE" }}>
                <p style={{ fontSize: 12, color: "#999", margin: "0 0 4px" }}>{b.label}</p>
                <p style={{ fontSize: 18, fontWeight: 800, color: "#8B1A4D", margin: 0 }}>{fmtBytes(b.bytes)}</p>
                {b.count !== null && <p style={{ fontSize: 11, color: "#bbb", margin: "2px 0 0" }}>{b.count} prendas</p>}
              </div>
            ))}
          </div>

          <div style={{ background: "white", borderRadius: 16, padding: 16, border: "1px solid #F5E6EE" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#8B1A4D", margin: "0 0 12px" }}>Top prendas por uso de espacio</p>
            {uso.desglose.slice(0, 10).map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 9 && i < uso.desglose.length - 1 ? "1px solid #F5F5F5" : "none" }}>
                <span style={{ fontSize: 11, color: "#ccc", width: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</p>
                  <p style={{ fontSize: 11, color: "#bbb", margin: 0 }}>{p.fotos} {p.fotos === 1 ? "foto" : "fotos"}</p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: p.bytes > 500000 ? "#D32F2F" : "#1a1a1a", flexShrink: 0 }}>{fmtBytes(p.bytes)}</span>
              </div>
            ))}
            {uso.desglose.length === 0 && <p style={{ fontSize: 13, color: "#bbb", textAlign: "center" }}>Sin prendas con imágenes</p>}
          </div>

          {uso.pct > 70 && (
            <div style={{ marginTop: 12, background: "#FFF3E0", border: "1px solid #FFE0B2", borderRadius: 14, padding: "12px 16px", fontSize: 13, color: "#E65100", fontWeight: 600 }}>
              ⚠️ Uso elevado. Considera limpiar prendas sin stock o con fotos antiguas.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Configuracion() {
  const [tab, setTab] = useState("banner");
  const botonEstilo = (activo) => ({
    padding: "10px 24px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s ease",
    background: activo ? "white" : "transparent", color: activo ? "#8B1A4D" : "#999",
    boxShadow: activo ? "0 2px 8px rgba(139,26,77,0.12)" : "none",
  });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#8B1A4D", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 10 }}>⚙️ Configuración</h1>
        <p style={{ fontSize: 13, color: "#999", margin: 0 }}>Personaliza cómo se ve tu tienda pública</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 28, background: "#F5F5F5", padding: 4, borderRadius: 14, flexWrap: "wrap" }}>
        <button onClick={() => setTab("banner")} style={botonEstilo(tab === "banner")}>🖼️ Banner</button>
        <button onClick={() => setTab("categorias")} style={botonEstilo(tab === "categorias")}>🎨 Categorías</button>
        <button onClick={() => setTab("almacenamiento")} style={botonEstilo(tab === "almacenamiento")}>📊 Almacenamiento</button>
      </div>

      {tab === "banner" && <BannerTab />}
      {tab === "categorias" && <CategoriasTab />}
      {tab === "almacenamiento" && <AlmacenamientoTab />}
    </div>
  );
}
