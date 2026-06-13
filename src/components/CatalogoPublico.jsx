import { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { fmt, Icon, LoaderInteractivo } from "../utils.jsx";

const NUMERO_WA = "573017886206";
const ORDEN_TALLAS = ["XS","S","M","L","XL","0XL","1XL","2XL","3XL","4XL","5XL"];

/* ── SVG ICONS ─────────────────────────────────────────── */
const HeartIcon = ({ filled, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "#C2185B" : "none"} stroke={filled ? "#C2185B" : "#fff"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);

const CartIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
);

const SearchIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

/* ── CATEGORY ICON MAPPING ──────────────────────────────── */
const CatIcon = ({ cat, size = 22 }) => {
  const icons = {
    "Todas":    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
    "Blusa":    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7l4-3h2c0 2 2 3 3 3s3-1 3-3h2l4 3-2 4h-3v9H8v-9H5z"/></svg>,
    "Camisa":   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7l4-3h2c0 2 2 3 3 3s3-1 3-3h2l4 3-2 4h-3v9H8v-9H5z"/></svg>,
    "Vestido":  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2h8l2 6-4 2v12H10V10L6 8z"/></svg>,
    "Falda":    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 4h10l3 16H4L7 4z"/><line x1="6" y1="9" x2="18" y2="9"/></svg>,
    "Pantalón": <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 3h16l-2 10-4 8h-4l-4-8z"/><line x1="12" y1="13" x2="12" y2="3"/></svg>,
    "Legging":  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3h14l-2 10-3 8h-4l-3-8z"/><line x1="12" y1="13" x2="12" y2="3"/></svg>,
    "Conjunto": <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="12" width="12" height="10" rx="2"/><path d="M6 4h12l1 8H5z"/></svg>,
    "Chaqueta": <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 7l4-3 3 4v12H5V12H2zm20 0l-4-3-3 4v12h4V12h3z"/><rect x="9" y="4" width="6" height="8" rx="1"/></svg>,
  };
  return icons[cat] || (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
  );
};

/* ── PRODUCT CARD (GRID) ───────────────────────────────── */
const ProductCard = ({ p, liked, onToggleLike, onClick }) => {
  const imgSrc = p.imagenes?.[0] || p.imagen;
  const stockTotal = Number(p.stock) || 0;
  const ultimaUnidad = stockTotal > 0 && stockTotal <= 3;
  const tallasDisp = ORDEN_TALLAS.filter(t => Number(p.stockPorTalla?.[t] || 0) > 0);

  return (
    <div
      onClick={onClick}
      style={{ background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 16px rgba(136,14,79,0.08)", border: "1px solid #F3E4EF", cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s", display: "flex", flexDirection: "column" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(136,14,79,0.15)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 16px rgba(136,14,79,0.08)"; }}
    >
      {/* IMAGE */}
      <div style={{ position: "relative", aspectRatio: "3/4", background: "#FDF0F6", flexShrink: 0 }}>
        {imgSrc
          ? <img src={imgSrc} alt={p.descripcion} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="image" size={32} color="#E0B8D0" /></div>
        }
        {/* HEART */}
        <button
          onClick={e => { e.stopPropagation(); onToggleLike(p.id); }}
          style={{ position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: "50%", background: "rgba(0,0,0,0.28)", backdropFilter: "blur(4px)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "transform 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.15)"}
          onMouseLeave={e => e.currentTarget.style.transform = ""}
        >
          <HeartIcon filled={liked} size={17} />
        </button>
        {/* BADGE */}
        {ultimaUnidad && (
          <div style={{ position: "absolute", top: 10, left: 10, background: "#E65100", color: "#fff", fontSize: 9, fontWeight: 800, padding: "4px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5 }}>
            ¡Última unidad!
          </div>
        )}
        {/* TALLA CHIPS mini */}
        {tallasDisp.length > 0 && (
          <div style={{ position: "absolute", bottom: 8, left: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
            {tallasDisp.slice(0, 4).map(t => (
              <span key={t} style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(4px)", color: "#8B1A4D", fontSize: 9, fontWeight: 800, padding: "3px 6px", borderRadius: 6, letterSpacing: 0.3 }}>{t}</span>
            ))}
            {tallasDisp.length > 4 && (
              <span style={{ background: "rgba(255,255,255,0.7)", color: "#8B1A4D", fontSize: 9, fontWeight: 700, padding: "3px 6px", borderRadius: 6 }}>+{tallasDisp.length - 4}</span>
            )}
          </div>
        )}
      </div>

      {/* INFO */}
      <div style={{ padding: "12px 12px 14px" }}>
        <p style={{ fontSize: 11, color: "#9E7A8E", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 4px" }}>{p.categoria}</p>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#1C0F17", margin: "0 0 8px", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.descripcion}</p>
        <p style={{ fontSize: 16, fontWeight: 800, color: "#8B1A4D", margin: 0 }}>{fmt(p.precioVenta)}</p>
      </div>
    </div>
  );
};

/* ── PRODUCT DETAIL MODAL ──────────────────────────────── */
const DetalleModal = ({ p, liked, onToggleLike, onAdd, onClose }) => {
  const imgSrc = p.imagenes?.[0] || p.imagen;
  const tallasDisp = ORDEN_TALLAS.filter(t => Number(p.stockPorTalla?.[t] || 0) > 0);
  const [tallaSel, setTallaSel] = useState(tallasDisp[0] || "");
  const stockTalla = tallaSel ? Number(p.stockPorTalla?.[tallaSel] || 0) : Number(p.stock);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="animate"
        onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: "28px 28px 0 0", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.18)" }}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "#E8D5E4" }} />
        </div>

        {/* Imagen */}
        <div style={{ position: "relative", margin: "12px 16px 0", borderRadius: 20, overflow: "hidden", aspectRatio: "4/3", background: "#FDF0F6" }}>
          {imgSrc
            ? <img src={imgSrc} alt={p.descripcion} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="image" size={48} color="#E0B8D0" /></div>
          }
          <button onClick={onClose} style={{ position: "absolute", top: 12, left: 12, width: 34, height: 34, borderRadius: "50%", background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          <button
            onClick={() => onToggleLike(p.id)}
            style={{ position: "absolute", top: 12, right: 12, width: 34, height: 34, borderRadius: "50%", background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <HeartIcon filled={liked} size={17} />
          </button>
        </div>

        {/* Info */}
        <div style={{ padding: "20px 20px 32px" }}>
          <p style={{ fontSize: 11, color: "#9E7A8E", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>{p.categoria}</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: "#1C0F17", margin: 0, lineHeight: 1.2, flex: 1, paddingRight: 16 }}>{p.descripcion}</h2>
            <span style={{ fontSize: 24, fontWeight: 800, color: "#8B1A4D", flexShrink: 0 }}>{fmt(p.precioVenta)}</span>
          </div>

          {/* Selector tallas */}
          {tallasDisp.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#7B4F6A", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Selecciona tu talla {tallaSel && <span style={{ color: "#C2185B" }}>— {tallaSel}</span>}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {tallasDisp.map(t => {
                  const stock = Number(p.stockPorTalla?.[t] || 0);
                  const sel = tallaSel === t;
                  return (
                    <button key={t} onClick={() => setTallaSel(t)} style={{ minWidth: 48, padding: "8px 14px", borderRadius: 12, border: sel ? "2px solid #C2185B" : "1.5px solid #EDD9E8", background: sel ? "#FDF0F6" : "#fff", color: sel ? "#8B1A4D" : "#7B4F6A", fontWeight: sel ? 800 : 600, fontSize: 13, cursor: "pointer", transition: "all 0.15s", position: "relative" }}>
                      {t}
                      {stock <= 2 && <span style={{ position: "absolute", top: -5, right: -5, width: 8, height: 8, borderRadius: "50%", background: "#E65100", border: "1.5px solid #fff" }} />}
                    </button>
                  );
                })}
              </div>
              {tallaSel && stockTalla <= 3 && (
                <p style={{ fontSize: 11, color: "#E65100", marginTop: 8, fontWeight: 600 }}>⚠️ Solo {stockTalla} {stockTalla === 1 ? "unidad" : "unidades"} disponibles</p>
              )}
            </div>
          )}

          {/* CTA buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => { if (tallaSel || tallasDisp.length === 0) { onAdd(p, tallaSel || p.talla); onClose(); } }}
              disabled={tallasDisp.length > 0 && !tallaSel}
              style={{ width: "100%", padding: "16px", borderRadius: 16, background: (tallasDisp.length === 0 || tallaSel) ? "linear-gradient(135deg, #8B1A4D, #C2185B)" : "#E8D5E4", color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: (tallasDisp.length === 0 || tallaSel) ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "opacity 0.2s" }}
            >
              <CartIcon size={18} /> Agregar al pedido
            </button>
            <button
              onClick={() => {
                const txt = `Hola! Me interesa: *${p.descripcion}*${tallaSel ? ` - Talla ${tallaSel}` : ""}\nPrecio: ${fmt(p.precioVenta)} 💕`;
                window.open(`https://wa.me/${NUMERO_WA}?text=${encodeURIComponent(txt)}`, "_blank");
              }}
              style={{ width: "100%", padding: "14px", borderRadius: 16, background: "#E8F5E9", color: "#2E7D32", border: "1.5px solid #A5D6A7", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              📱 Preguntar por WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── MAIN COMPONENT ────────────────────────────────────── */
export default function CatalogoPublico({ onLoginClick }) {
  const [prendas, setPrendas]       = useState([]);
  const [cargando, setCargando]     = useState(true);
  const [busqueda, setBusqueda]     = useState("");
  const [categoriaSel, setCategoriaSel] = useState("Todas");
  const [tallaSel, setTallaSel]     = useState("Todas");
  const [carrito, setCarrito]       = useState([]);
  const [verCarrito, setVerCarrito] = useState(false);
  const [detalle, setDetalle]       = useState(null);
  const [liked, setLiked]           = useState(new Set());

  useEffect(() => {
    getDocs(collection(db, "prendas"))
      .then(snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPrendas(data.filter(p => Number(p.stock) > 0));
      })
      .finally(() => setCargando(false));
  }, []);

  const toggleLike = (id) => setLiked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const categorias = useMemo(() => ["Todas", ...new Set(prendas.map(p => p.categoria).filter(Boolean))], [prendas]);

  const tallasDisponibles = useMemo(() => {
    const s = new Set();
    prendas.forEach(p => {
      if (p.stockPorTalla) Object.entries(p.stockPorTalla).forEach(([t, c]) => { if (Number(c) > 0) s.add(t); });
      else if (p.talla && Number(p.stock) > 0) s.add(p.talla);
    });
    return ["Todas", ...ORDEN_TALLAS.filter(t => s.has(t))];
  }, [prendas]);

  const filtradas = useMemo(() => prendas.filter(p => {
    const coincideCat  = categoriaSel === "Todas" || p.categoria === categoriaSel;
    const coincideBusq = (p.descripcion || "").toLowerCase().includes(busqueda.toLowerCase());
    const coincideTalla = tallaSel === "Todas" || (p.stockPorTalla ? Number(p.stockPorTalla[tallaSel]) > 0 : p.talla === tallaSel);
    return coincideCat && coincideTalla && coincideBusq;
  }), [prendas, categoriaSel, tallaSel, busqueda]);

  const agregarAlCarrito = (prenda, talla) => {
    if (!talla) return;
    setCarrito(prev => {
      const existe = prev.find(i => i.id === prenda.id && i.talla === talla);
      if (existe) return prev.map(i => i.id === prenda.id && i.talla === talla ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { id: prenda.id, descripcion: prenda.descripcion, precio: Number(prenda.precioVenta), talla, cantidad: 1, imagen: prenda.imagenes?.[0] || prenda.imagen }];
    });
    setVerCarrito(true);
  };

  const totalCarrito = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);

  const enviarWA = () => {
    if (!carrito.length) return;
    const lineas = carrito.map(i => `*${i.descripcion}*\n- Talla: ${i.talla} | x${i.cantidad} | ${fmt(i.precio * i.cantidad)}`).join("\n\n");
    const txt = `¡Hola *Curvy Vup*! Quiero hacer este pedido:\n\n${lineas}\n\n*TOTAL: ${fmt(totalCarrito)}*\n\n¡Quedo atenta! 💕`;
    window.open(`https://wa.me/${NUMERO_WA}?text=${encodeURIComponent(txt)}`, "_blank");
  };

  if (cargando) return <LoaderInteractivo />;

  return (
    <div style={{ minHeight: "100vh", background: "#FAF7F4", fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── CARRITO FLOTANTE ── */}
      {carrito.length > 0 && !verCarrito && (
        <button onClick={() => setVerCarrito(true)} className="animate" style={{ position: "fixed", bottom: 28, right: 20, zIndex: 800, background: "linear-gradient(135deg, #8B1A4D, #C2185B)", color: "#fff", border: "none", borderRadius: 50, padding: "14px 22px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 28px rgba(139,26,77,0.4)", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
          <CartIcon size={20} />
          Mi pedido
          <span style={{ background: "#fff", color: "#8B1A4D", borderRadius: 20, padding: "2px 8px", fontSize: 13, fontWeight: 800 }}>{carrito.reduce((s, i) => s + i.cantidad, 0)}</span>
        </button>
      )}

      {/* ── MODAL CARRITO ── */}
      {verCarrito && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9000, display: "flex", justifyContent: "flex-end", backdropFilter: "blur(6px)" }} onClick={() => setVerCarrito(false)}>
          <div className="animate" onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 420, height: "100%", display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.12)" }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #EDD9E8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontFamily: "'Fraunces', serif", margin: 0, fontSize: 22, color: "#1C0F17" }}>Tu Pedido</h2>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9E7A8E" }}>{carrito.reduce((s,i)=>s+i.cantidad,0)} prendas seleccionadas</p>
              </div>
              <button onClick={() => setVerCarrito(false)} style={{ background: "#FAF7F4", border: "none", width: 36, height: 36, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#7B4F6A" }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              {carrito.length === 0
                ? <p style={{ textAlign: "center", color: "#9E7A8E", marginTop: 40 }}>Tu carrito está vacío.</p>
                : carrito.map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, background: "#FAF7F4", borderRadius: 16, padding: 12, alignItems: "center" }}>
                    <div style={{ width: 56, height: 56, borderRadius: 12, overflow: "hidden", background: "#FDF0F6", flexShrink: 0 }}>
                      {item.imagen ? <img src={item.imagen} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="image" size={20} color="#E0B8D0" /></div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#1C0F17", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion}</p>
                      <p style={{ margin: "3px 0 0", fontSize: 11, color: "#9E7A8E" }}>Talla {item.talla} · {item.cantidad} {item.cantidad === 1 ? "ud" : "uds"}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 800, color: "#8B1A4D" }}>{fmt(item.precio * item.cantidad)}</p>
                    </div>
                    <button onClick={() => setCarrito(c => c.filter((_,j)=>j!==i))} style={{ background: "#FFEBEE", color: "#C62828", border: "none", width: 32, height: 32, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
                  </div>
                ))
              }
            </div>
            <div style={{ padding: "20px 24px", borderTop: "1px solid #EDD9E8" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 17, fontWeight: 800, color: "#1C0F17" }}>
                <span>Total estimado</span><span style={{ color: "#8B1A4D" }}>{fmt(totalCarrito)}</span>
              </div>
              <button onClick={enviarWA} disabled={!carrito.length} style={{ width: "100%", padding: 16, borderRadius: 14, background: "#25D366", color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                📱 Enviar pedido por WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DETALLE PRODUCTO ── */}
      {detalle && (
        <DetalleModal
          p={detalle}
          liked={liked.has(detalle.id)}
          onToggleLike={toggleLike}
          onAdd={agregarAlCarrito}
          onClose={() => setDetalle(null)}
        />
      )}

      {/* ── HERO — compact ── */}
      <div style={{ background: "linear-gradient(135deg, #8B1A4D 0%, #C2185B 100%)", padding: "32px 20px 28px", color: "#fff", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        <div style={{ position: "absolute", bottom: -60, left: -30, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20, padding: "5px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
            ✨ {prendas.length}+ prendas disponibles
          </div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(34px, 7vw, 52px)", fontWeight: 800, margin: "0 0 8px", lineHeight: 1.1 }}>Curvy Vup</h1>
          <p style={{ fontSize: 14, opacity: 0.85, margin: 0, fontWeight: 400 }}>Moda plus size · Encuentra tu estilo en todas las tallas</p>
        </div>
      </div>

      {/* ── FILTROS STICKY ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 500, background: "rgba(250,247,244,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #EDD9E8", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Búsqueda */}
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#C2185B" }}><SearchIcon size={17} /></span>
          <input
            placeholder="Buscar prenda..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ width: "100%", paddingLeft: 42, paddingRight: 16, borderRadius: 50, border: "1.5px solid #EDD9E8", background: "#fff", padding: "11px 16px 11px 42px", fontSize: 14, fontFamily: "'DM Sans', sans-serif", color: "#1C0F17", outline: "none" }}
          />
        </div>

        {/* Categorías con iconos */}
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
          {categorias.map(cat => {
            const sel = categoriaSel === cat;
            return (
              <button key={cat} onClick={() => setCategoriaSel(cat)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: "2px 4px" }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: sel ? "linear-gradient(135deg, #8B1A4D, #C2185B)" : "#fff", border: sel ? "none" : "1.5px solid #EDD9E8", display: "flex", alignItems: "center", justifyContent: "center", color: sel ? "#fff" : "#8B1A4D", transition: "all 0.2s", boxShadow: sel ? "0 4px 14px rgba(139,26,77,0.3)" : "none" }}>
                  <CatIcon cat={cat} size={22} />
                </div>
                <span style={{ fontSize: 10, fontWeight: sel ? 700 : 500, color: sel ? "#8B1A4D" : "#9E7A8E", whiteSpace: "nowrap" }}>{cat}</span>
              </button>
            );
          })}
        </div>

        {/* Filtro tallas */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
          {tallasDisponibles.map(t => {
            const sel = tallaSel === t;
            return (
              <button key={t} onClick={() => setTallaSel(t)} style={{ padding: "6px 14px", borderRadius: 20, border: sel ? "1.5px solid #8B1A4D" : "1.5px solid #EDD9E8", background: sel ? "#8B1A4D" : "#fff", color: sel ? "#fff" : "#7B4F6A", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}>
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── GRID DE PRODUCTOS ── */}
      <div style={{ padding: "20px 14px 100px", maxWidth: 1200, margin: "0 auto" }}>
        <p style={{ fontSize: 12, color: "#9E7A8E", fontWeight: 600, marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.8 }}>
          {filtradas.length} {filtradas.length === 1 ? "prenda" : "prendas"}
        </p>

        {filtradas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: 24, border: "1px dashed #EDD9E8" }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: 40, color: "#EDD9E8", margin: "0 0 12px" }}>💕</p>
            <p style={{ fontWeight: 700, fontSize: 16, color: "#1C0F17" }}>No encontramos prendas</p>
            <p style={{ fontSize: 13, color: "#9E7A8E", marginTop: 4 }}>Intenta con otros filtros</p>
          </div>
        ) : (
          <div className="curvy-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {filtradas.map(p => (
              <ProductCard
                key={p.id}
                p={p}
                liked={liked.has(p.id)}
                onToggleLike={toggleLike}
                onClick={() => setDetalle(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ textAlign: "center", padding: "36px 20px 24px", borderTop: "1px solid #EDD9E8", background: "#fff" }}>
        <p style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: "#8B1A4D", margin: "0 0 6px" }}>Curvy Vup</p>
        <p style={{ fontSize: 12, color: "#9E7A8E", margin: "0 0 20px" }}>Tu cuerpo, tus reglas. © {new Date().getFullYear()}</p>
        <button onClick={onLoginClick} style={{ background: "none", border: "1px solid #EDD9E8", color: "#C8A8C0", fontSize: 10, padding: "5px 12px", borderRadius: 20, cursor: "pointer" }}>
          Acceso Administrativo
        </button>
      </div>

      <style>{`
        @media (min-width: 500px) {
          .curvy-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (min-width: 768px) {
          .curvy-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (min-width: 1100px) {
          .curvy-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
