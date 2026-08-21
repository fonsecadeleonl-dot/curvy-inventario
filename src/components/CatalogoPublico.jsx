import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../firebase";
import { collection, getDocs, addDoc, doc, getDoc, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { fmt, Icon, nombreDe, ofertaVigente, precioEfectivo, diasParaVencer, porcentajeDescuento } from "../utils.jsx";

const NUMERO_WA = "573017886206";
const ORDEN_TALLAS = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
const TALLAS_FILTRO = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
const TALLAS_PLUS = ["XL", "2XL", "3XL", "4XL"];
const CATEGORIAS_BASE = ["Vestido", "Blusa", "Falda", "Conjunto"];
const IG_URL = "https://www.instagram.com/curvy.vup/";
const IG_HANDLE = "@curvy.vup";
const TICKER_MENSAJES = ["Nueva colección disponible", "Envíos a toda Colombia", "Tallas S a 4XL", "Pide por WhatsApp"];

const tieneImagen = (p) => !!(p.imagenes?.[0]?.trim() || p.imagen?.trim());
const fechaCreacion = (p) => (p.creadoEn?.toDate ? p.creadoEn.toDate() : new Date(p.fechaIngreso || p.creadoEn || 0));
const waLink = (texto) => `https://api.whatsapp.com/send?phone=${NUMERO_WA}&text=${encodeURIComponent(texto)}`;

/* ── PRECIO CON OFERTA (oferta grande + badge -X% + tachado) ─ */
function PrecioConOferta({ p, fontSize = 15, fontWeight = 800, colorBase = "var(--c-vino)", oscuro = false, compacto = false, etiqueta = null, mostrarContador = true }) {
  const colorEtiqueta = oscuro ? "rgba(255,255,255,0.85)" : "#888";
  if (!ofertaVigente(p)) return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
      {etiqueta && <span style={{ fontSize: 13, color: colorEtiqueta, fontWeight: 600 }}>{etiqueta}</span>}
      <span style={{ fontSize, fontWeight, color: oscuro ? "#fff" : colorBase }}>{fmt(p.precioVenta)}</span>
    </span>
  );
  const pct = porcentajeDescuento(p);
  const dias = diasParaVencer(p);
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span className={compacto ? "precio-oferta-linea" : undefined} style={{ display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: compacto ? "wrap" : "nowrap" }}>
        {etiqueta && <span style={{ fontSize: 13, color: colorEtiqueta, fontWeight: 600 }}>{etiqueta}</span>}
        <span className={compacto ? "po-num" : undefined} style={{ fontSize, fontWeight, color: oscuro ? "#fff" : "#8B1A4A" }}>{fmt(p.precioOferta)}</span>
        <span className={compacto ? "po-badge" : undefined} style={{ fontSize: Math.max(9, Math.round(fontSize * 0.5)), fontWeight: 700, color: oscuro ? "#fff" : "#8B1A4A", background: oscuro ? "rgba(255,255,255,0.2)" : "#FCE8EF", padding: "2px 7px", borderRadius: 10, whiteSpace: "nowrap" }}>-{pct}%</span>
        <span className={compacto ? "po-tachado" : undefined} style={{ fontSize: Math.round(fontSize * 0.65), fontWeight: 500, color: oscuro ? "rgba(255,255,255,0.65)" : "#9CA3AF", textDecoration: "line-through", whiteSpace: "nowrap" }}>{fmt(p.precioVenta)}</span>
      </span>
      {mostrarContador && dias !== null && (
        <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: oscuro ? "rgba(255,255,255,0.75)" : "#B0455E" }}>
          {dias === 0 ? "Termina hoy" : dias === 1 ? "Termina en 1 día" : `Termina en ${dias} días`}
        </span>
      )}
    </span>
  );
}

/* ── DOTS DE FOTOS (indicador de cantidad, interactivo o solo visual) ─── */
function DotsFotos({ cantidad, activo = 0, arriba = false }) {
  if (cantidad <= 1) return null;
  return (
    <div className={arriba ? "dots-fotos dots-arriba" : "dots-fotos"}>
      {Array.from({ length: cantidad }).map((_, i) => (
        <span key={i} className={i === activo ? "dot-activo" : ""} />
      ))}
    </div>
  );
}

/* ── IMAGEN DE TARJETA CON FADE AL HOVER (desktop, 2+ fotos) ───
   El contenedor padre necesita className="img-hover-wrap" para que
   el :hover se detecte sobre él, no sobre las imágenes superpuestas. */
function ImagenTarjetaHover({ imagenes, alt, imgStyle }) {
  const principal = imagenes?.[0];
  const segunda = imagenes?.[1];
  return (
    <>
      <img src={principal} alt={alt} loading="lazy" decoding="async" className={segunda ? "img-a" : undefined} style={imgStyle} />
      {segunda && <img src={segunda} alt={alt} loading="lazy" decoding="async" className="img-b" style={imgStyle} />}
    </>
  );
}

/* ── ICONOS ─────────────────────────────────────────── */
const CartIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);
const SearchIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const InstagramIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const WhatsappIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);
const HeartIcon = ({ filled, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "#C2185B" : "none"} stroke={filled ? "#C2185B" : "#fff"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

/* ── PANTALLA DE CARGA — reloj de arena ─────────────── */
const FRASES_CARGA_CORTAS = "💄 Aplicando el labial...,👁️ Delineando los ojos...,💅 Secando el esmalte...,🌸 Hidratando la piel...,💋 Poniendo el gloss...,✨ Echando el perfume...,🪞 Mirándome al espejo...,💗 Eligiendo el blush...,👄 Retocando el maquillaje...,🎀 Rizando el flequillo...,☕ Haciendo el cafecito...,🍊 Exprimiendo la naranja...,🥐 Desayunando rico...,⏰ Poniendo el snooze...,🔑 Buscando las llaves...,👗 Eligiendo el outfit...,👠 Buscando el otro zapato...,👜 Ordenando el bolso...,🪥 Lavándome los dientes...,🛏️ Haciendo la camita...,💐 Cortando flores...,🌱 Regando las plantas...,🕯️ Prendiendo velitas...,🎵 Poniendo música...,🛁 En el baño de burbujas...,💆 Aplicando la mascarilla...,🧴 Poniendo la crema...,🩷 Escogiendo el pijama...,👒 Probándome el sombrero...,🧸 Abrazando el peluche...,🕺 Bailando sola...,🎤 Cantando en la ducha...,🤳 Tomándome el selfie...,📸 Eligiendo el filtro...,😂 Mandando el meme...,📱 Viendo los reels...,🎶 Cantando la canción...,💬 Respondiendo el chat...,🎬 Eligiendo la serie...,🎮 Jugando un ratico...,🛍️ Organizando favoritos...,📏 Revisando las tallas...,🎨 Combinando colores...,👗 Eligiendo la prenda...,💭 Probándome el look...,🛒 Llenando el carrito...,🧮 Calculando el presupuesto...,💸 Convenciéndome...,📦 Esperando el pedido...,🎁 Abriendo el paquete...,☁️ Mirando las nubes...,🐦 Escuchando pajaritos...,☀️ Tomando el solcito...,📖 Leyendo una página...,📝 Escribiendo el diario...,🧘 Meditando poquito...,🌬️ Respirando profundo...,🙆 Estirándome...,😴 Descansando los ojos...,🌙 Soñando despierta...,🍕 Esperando el domicilio...,🍫 Buscando el chocolate...,🍿 Haciendo palomitas...,🧁 Pidiendo el postre...,🍓 Comiendo fruticas...,🧇 Haciendo el desayuno...,🍦 Eligiendo el sabor...,🥤 Preparando el jugo...,🧃 Tomando el tinto...,🍰 Cortando el pastel...,👑 Poniéndome la corona...,💪 Activando el modo jefa...,🌟 Brillando con todo...,🦋 Siendo mi mejor yo...,❤️ Amándome sin filtros...,🔥 Encendiendo el día...,⚡ Cargando energía...,🌈 Eligiendo ser feliz...,✨ Soltando lo negativo...,🫶 Dándome un abrazo...,🌸 Colgando prendas nuevas...,💕 Eligiendo lo mejor...,✨ Revisando los colores...,🎀 Poniendo el moñito...,💗 Preparando sorpresas...,🪡 Revisando las telas...,👗 Organizando el catálogo...,💌 Con amor para ti...,🌺 Casi lista para ti...,💝 Preparando lo mejor...,🪴 Hablándole a la planta...,📺 Buscando el control...,🔍 Buscando mis gafas...,⭐ Revisando el horóscopo...,🌙 Preguntándole a las estrellas...,🤔 Acordándome de algo...,😅 Olvidándome qué era...,🛒 Escribiendo el mercado...,🌀 Mandando buena vibra...,🪄 Haciendo la magia...".split(",");

function LoaderReloj() {
  const [mensaje] = useState(() => FRASES_CARGA_CORTAS[Math.floor(Math.random() * FRASES_CARGA_CORTAS.length)]);
  const [t, setT] = useState(0);

  useEffect(() => {
    const ciclo = setInterval(() => setT((v) => (v >= 100 ? 0 : v + 1)), 50);
    return () => clearInterval(ciclo);
  }, []);

  const arriba = Math.max(0, 100 - t);
  const abajo = Math.min(100, t);

  return (
    <div style={{ position: "fixed", inset: 0, background: "linear-gradient(160deg, #FFF5F7 0%, #FCE4EC 50%, #F8BBD0 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999, fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>
      <style>{`
        @keyframes flotar { 0% { transform: translateY(0px) rotate(0deg); } 25% { transform: translateY(-6px) rotate(0deg); } 50% { transform: translateY(-4px) rotate(180deg); } 75% { transform: translateY(-8px) rotate(180deg); } 100% { transform: translateY(0px) rotate(360deg); } }
        @keyframes puntito { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.5); opacity: 1; } }
      `}</style>
      <div style={{ position: "absolute", top: -100, right: -100, width: 350, height: 350, borderRadius: "50%", background: "rgba(194,24,91,0.05)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -80, left: -80, width: 280, height: 280, borderRadius: "50%", background: "rgba(139,26,77,0.04)", pointerEvents: "none" }} />

      <div style={{ marginBottom: 40, textAlign: "center" }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 42, fontStyle: "italic", fontWeight: 700, color: "var(--c-vino)", margin: "0 0 2px", letterSpacing: -1 }}>Curvy</h1>
        <p style={{ fontSize: 10, letterSpacing: 5, color: "#C2185B", fontWeight: 700, textTransform: "uppercase", margin: 0 }}>VUP</p>
      </div>

      <div style={{ marginBottom: 32, filter: "drop-shadow(0 8px 20px rgba(194,24,91,0.25))", animation: "flotar 4s ease-in-out infinite" }}>
        <svg width={80} height={120} viewBox="0 0 80 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="clipArriba"><path d="M14 12 L66 12 L40 60 Z" /></clipPath>
            <clipPath id="clipAbajo"><path d="M14 108 L66 108 L40 60 Z" /></clipPath>
            <linearGradient id="gradArena" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C2185B" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--c-vino)" stopOpacity="1" />
            </linearGradient>
          </defs>
          <rect x="8" y="4" width="64" height="8" rx="4" fill="var(--c-vino)" />
          <rect x="8" y="108" width="64" height="8" rx="4" fill="var(--c-vino)" />
          <line x1="14" y1="8" x2="14" y2="116" stroke="var(--c-vino)" strokeWidth="4" strokeLinecap="round" />
          <line x1="66" y1="8" x2="66" y2="116" stroke="var(--c-vino)" strokeWidth="4" strokeLinecap="round" />
          <path d="M14 12 L66 12 L40 60 Z" fill="rgba(194,24,91,0.08)" />
          <path d="M14 108 L66 108 L40 60 Z" fill="rgba(194,24,91,0.08)" />
          {arriba > 0 && <g clipPath="url(#clipArriba)"><rect x="14" y={12 + 48 * (100 - arriba) / 100} width="52" height={48 * arriba / 100 + 10} fill="url(#gradArena)" /></g>}
          {abajo > 0 && <g clipPath="url(#clipAbajo)"><rect x="14" y={108 - 48 * abajo / 100} width="52" height={48 * abajo / 100 + 10} fill="url(#gradArena)" /></g>}
          {t > 5 && t < 95 && <line x1="40" y1="60" x2="40" y2={65 + t * 0.1} stroke="#C2185B" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />}
          <path d="M22 18 L30 30" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" />
          <path d="M22 90 L30 100" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      <p style={{ fontSize: 17, fontWeight: 700, color: "var(--c-vino)", textAlign: "center", padding: "0 40px", maxWidth: 320, lineHeight: 1.4, margin: "0 0 32px", minHeight: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>{mensaje}</p>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ width: i === 2 ? 10 : 6, height: i === 2 ? 10 : 6, borderRadius: "50%", background: i === 2 ? "var(--c-vino)" : "#F48FB1", animation: `puntito 1.6s ease-in-out ${i * 0.15}s infinite` }} />
        ))}
      </div>
    </div>
  );
}

/* ── NAVBAR ─────────────────────────────────────────── */
function Navbar({ cartCount, onCartClick, busqueda, onBusqueda, prendas = [], onProductoClick, categoriasFS = [], onFiltrarCategoria }) {
  const [conSombra, setConSombra] = useState(false);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(false);

  useEffect(() => {
    const onScroll = () => setConSombra(window.scrollY > 0);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const resultados = busqueda.trim().length > 0
    ? prendas.filter((p) => tieneImagen(p) && (nombreDe(p) || "").toLowerCase().includes(busqueda.toLowerCase()))
    : [];

  const irAProducto = (p) => { onProductoClick(p); onBusqueda(""); setMostrarResultados(false); setBuscadorAbierto(false); };

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 600, boxShadow: conSombra ? "0 2px 12px rgba(0,0,0,0.08)" : "none", transition: "box-shadow 0.3s ease" }}>
      <div className="topbar">
        <div style={{ display: "flex", animation: "ticker 45s linear infinite", width: "max-content" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", whiteSpace: "nowrap" }}>
              {TICKER_MENSAJES.map((m, j) => (
                <span key={j} className="topbar__item">
                  {m}<span className="topbar__sep"> ·</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="header" style={{ position: "static" }}>
        <div className="header-inner" style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px", height: "100%", width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 24 }}>
          <button className="hamburguesa" onClick={() => setMenuAbierto(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", flexDirection: "column", gap: 5 }}>
            {[0, 1, 2].map((i) => <div key={i} style={{ width: 22, height: 2, background: "#1a1a1a", borderRadius: 1 }} />)}
          </button>

          <div className="header-logo header__logo" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ display: "flex", alignItems: "center", fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: 26, fontWeight: 700, color: "var(--c-vino)", cursor: "pointer", flexShrink: 0, letterSpacing: -0.5 }}>
            Curvy Vup
          </div>

          <nav className="nav-desktop header__nav" style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); onFiltrarCategoria("todas"); }} style={{ paddingInline: 14, borderRadius: 8, whiteSpace: "nowrap" }}>
              Nuevo
            </a>
            {categoriasFS.filter((c) => c.activa !== false).slice(0, 6).map((c) => (
              <a key={c.id} href="#" onClick={(e) => { e.preventDefault(); onFiltrarCategoria(c.nombre); }} style={{ paddingInline: 14, borderRadius: 8, whiteSpace: "nowrap" }}>
                {c.nombre}
              </a>
            ))}
            <a href="#" onClick={(e) => { e.preventDefault(); onFiltrarCategoria("ofertas"); }} style={{ paddingInline: 14, borderRadius: 8, whiteSpace: "nowrap", color: "var(--action)", fontWeight: 800 }}>
              Ofertas
            </a>
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 20, marginLeft: "auto", flexShrink: 0 }}>
            <button onClick={() => setBuscadorAbierto((v) => !v)}
              style={{ width: 40, height: 40, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.15s", color: "var(--text)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#FFF5F7"} onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
              <SearchIcon size={20} />
            </button>
            <a href={waLink("")} target="_blank" rel="noopener noreferrer"
              style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", transition: "background 0.15s", color: "var(--text)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#FFF5F7"} onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
              <WhatsappIcon size={20} />
            </a>
            <button onClick={onCartClick}
              style={{ position: "relative", width: 40, height: 40, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.15s", color: "var(--text)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#FFF5F7"} onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
              <CartIcon size={20} />
              {cartCount > 0 && <span style={{ position: "absolute", top: 4, right: 4, background: "var(--action)", color: "white", fontSize: 9, fontWeight: 800, width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>}
            </button>
          </div>
        </div>

        {buscadorAbierto && (
          <div onClick={() => { setBuscadorAbierto(false); onBusqueda(""); setMostrarResultados(false); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 690, animation: "fadeIn 0.2s ease" }} />
        )}
        {buscadorAbierto && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 700, borderTop: "1px solid #f5f5f5", padding: "12px 24px", background: "white", boxShadow: "0 16px 40px rgba(0,0,0,0.18)", animation: "slideDown 0.2s ease" }}>
            <div style={{ maxWidth: 600, margin: "0 auto", position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#FAFAFA", border: "1.5px solid #F5E6EE", borderRadius: 50, padding: "12px 20px" }}>
                <SearchIcon size={16} />
                <input autoFocus type="text" placeholder="¿Qué estás buscando hoy?" value={busqueda}
                  onChange={(e) => { onBusqueda(e.target.value); setMostrarResultados(true); }}
                  onFocus={() => setMostrarResultados(true)}
                  onBlur={() => setTimeout(() => setMostrarResultados(false), 160)}
                  style={{ border: "none", background: "transparent", fontSize: 15, color: "#1a1a1a", width: "100%", outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
                <button onClick={() => { setBuscadorAbierto(false); onBusqueda(""); setMostrarResultados(false); }} style={{ background: "none", border: "none", color: "#999", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
              </div>
              {mostrarResultados && resultados.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#fff", borderRadius: 16, border: "1.5px solid #EDD9E8", boxShadow: "0 8px 32px rgba(139,26,77,0.13)", zIndex: 700, overflow: "hidden" }}>
                  {resultados.slice(0, 6).map((p) => {
                    const img = p.imagenes?.[0] || p.imagen;
                    return (
                      <div key={p.id} onMouseDown={() => irAProducto(p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", background: "#fff" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#FFF5F7"} onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}>
                        {img && <img src={img} alt="" style={{ width: 42, height: 42, borderRadius: 8, objectFit: "cover", objectPosition: "top", flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#1C0F17", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombreDe(p)}</p>
                          <p style={{ margin: 0, fontSize: 11, color: "#C2185B", fontWeight: 700 }}>{fmt(p.precioVenta)} · {p.categoria}</p>
                        </div>
                      </div>
                    );
                  })}
                  {resultados.length > 6 && (
                    <div onMouseDown={() => setMostrarResultados(false)} style={{ padding: "10px 14px", borderTop: "1px solid #F5E6EE", fontSize: 12, fontWeight: 700, color: "#C2185B", cursor: "pointer", textAlign: "center", background: "#fff" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#FFF5F7"} onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}>
                      Ver los {resultados.length} resultados →
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {menuAbierto && (
        <>
          <div onClick={() => setMenuAbierto(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 998 }} />
          <div style={{ position: "fixed", top: 0, left: 0, width: 280, height: "100vh", background: "white", zIndex: 999, padding: 24, overflowY: "auto", animation: "slideRight 0.25s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
              <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: 22, fontWeight: 700, color: "var(--c-vino)" }}>Curvy Vup</span>
              <button onClick={() => setMenuAbierto(false)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#999" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button onClick={() => { onFiltrarCategoria("todas"); setMenuAbierto(false); }}
                style={{ background: "none", border: "none", textAlign: "left", padding: "14px 16px", fontSize: 15, fontWeight: 700, color: "#1a1a1a", cursor: "pointer", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.5px", textTransform: "uppercase" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#FFF5F7"} onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                Nuevo
              </button>
              {categoriasFS.filter((c) => c.activa !== false).map((c) => (
                <button key={c.id} onClick={() => { onFiltrarCategoria(c.nombre); setMenuAbierto(false); }}
                  style={{ background: "none", border: "none", textAlign: "left", padding: "14px 16px", fontSize: 15, fontWeight: 600, color: "#444", cursor: "pointer", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.5px", textTransform: "uppercase" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#FFF5F7"} onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                  {c.nombre}
                </button>
              ))}
              <div style={{ height: 1, background: "#f5f5f5", margin: "8px 0" }} />
              <button onClick={() => { onFiltrarCategoria("ofertas"); setMenuAbierto(false); }}
                style={{ background: "none", border: "none", textAlign: "left", padding: "14px 16px", fontSize: 15, fontWeight: 800, color: "var(--action)", cursor: "pointer", borderRadius: 12, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                Ofertas
              </button>
            </div>
            <div style={{ marginTop: 32, padding: 16, background: "#FFF5F7", borderRadius: 16 }}>
              <p style={{ fontSize: 12, color: "#999", margin: "0 0 8px", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "1px" }}>Contáctanos</p>
              <a href={waLink("")} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, color: "#25D366", fontWeight: 700, fontSize: 14, textDecoration: "none", fontFamily: "'DM Sans', sans-serif" }}>
                <WhatsappIcon size={18} /> WhatsApp
              </a>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-25%); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideRight { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @media (min-width: 1024px) { .hamburguesa { display: none !important; } .nav-desktop { display: flex !important; } }
        @media (max-width: 1023px) {
          .nav-desktop { display: none !important; }
          .hamburguesa { display: flex !important; }
          .header { height: 64px; }
          .header-inner { position: relative; }
          .header-logo { position: absolute; left: 50%; transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

/* ── HERO CARRUSEL ──────────────────────────────────── */
const HERO_DEFAULT = { id: "_default", imagen: "", badge: "🌸 Nueva colección", titulo: "Moda para resaltar tu belleza real", subtitulo: "Tallas S a 4XL · Envíos a toda Colombia", textoBton: "Ver catálogo →", accion: "scroll" };

// Mismo corte de 768px que usa .hero__caja-texto para el resto del hero en mobile.
const MEDIA_MOBILE = "(max-width: 768px)";

function HeroCarousel({ slides, onVerCatalogo }) {
  const lista = slides.length > 0 ? slides : [HERO_DEFAULT];
  const [i, setI] = useState(0);
  const [esMobile, setEsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(MEDIA_MOBILE).matches);

  useEffect(() => {
    const mq = window.matchMedia(MEDIA_MOBILE);
    const onChange = (e) => setEsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % lista.length), 6000);
    return () => clearInterval(t);
  }, [lista.length]);

  return (
    <div className="hero" style={{ overflow: "hidden" }}>
      {lista.map((s, idx) => {
        // La imagen mobile es opcional — si no la subieron, cae a la de
        // desktop (misma imagen que hoy) sin romper slides ya existentes.
        const imagenActual = esMobile ? (s.imagenMobile || s.imagen) : s.imagen;
        const posicionActual = esMobile ? (s.imagenMobile ? s.posicionMobile : s.posicion) : s.posicion;
        const conImagen = !!imagenActual;
        return (
          <div key={s.id || idx} style={{ position: "absolute", inset: 0, opacity: idx === i ? 1 : 0, transition: "opacity 0.8s ease-in-out", zIndex: idx === i ? 1 : 0, background: conImagen ? "transparent" : "linear-gradient(135deg, var(--c-vino), #C2185B)" }}>
            {conImagen && <img className="hero__media" src={imagenActual} alt={s.titulo} style={{ objectPosition: `${posicionActual?.x ?? 50}% ${posicionActual?.y ?? 50}%` }} />}
            <div className="hero__velo" />
            <div className="hero__caja-texto" style={{ position: "absolute", left: 64, bottom: 64, right: 80, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: "min(560px, 60%)" }}>
              {s.badge && <span style={{ display: "inline-flex", alignItems: "center", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 20, padding: "5px 14px", fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: 1, textTransform: "uppercase", marginBottom: 16, width: "fit-content" }}>{s.badge}</span>}
              <h2 className="hero__titulo" style={{ margin: "0 0 8px", textShadow: "0 2px 12px rgba(0,0,0,0.25)" }}>{s.titulo}</h2>
              <p className="hero__sub" style={{ margin: "0 0 20px" }}>{s.subtitulo}</p>
              {s.textoBton && (
                <button onClick={() => (s.accion === "link" && s.accionLink ? window.open(s.accionLink, "_blank") : onVerCatalogo())} className="btn btn--claro"
                  style={{ width: "fit-content", boxShadow: "0 4px 20px rgba(0,0,0,0.18)" }}>
                  {s.textoBton}
                </button>
              )}
            </div>
          </div>
        );
      })}
      <button onClick={() => setI((v) => (v - 1 + lista.length) % lista.length)}
        style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", zIndex: 10, background: "rgba(255,255,255,0.25)", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", width: 36, height: 36, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, lineHeight: 1 }}>‹</button>
      <button onClick={() => setI((v) => (v + 1) % lista.length)}
        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", zIndex: 10, background: "rgba(255,255,255,0.25)", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", width: 36, height: 36, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, lineHeight: 1 }}>›</button>
      <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", gap: 8 }}>
        {lista.map((_, idx) => (
          <button key={idx} onClick={() => setI(idx)} style={{ width: 8, height: 8, borderRadius: "50%", background: idx === i ? "var(--brand)" : "var(--c-arena)", opacity: idx === i ? 1 : 0.5, border: "none", cursor: "pointer", transition: "all 0.3s", padding: 0 }} />
        ))}
      </div>
      <style>{`
        /* Las fotos de banner suelen traer texto propio horneado en la imagen
           (ej. "Nueva colección · Luz natural"). El .hero__velo horizontal ya
           oscurece la izquierda, pero en mobile el recorte "cover" cambia dónde
           cae ese texto y puede chocar con el bloque HTML. En vez de una capa
           pareja sobre toda la foto (prohibido en los tokens), este fondo va
           SOLO detrás del texto, ajustado a su propio tamaño. */
        @media (max-width: 768px) {
          .hero__caja-texto {
            left: 20px !important;
            right: 20px !important;
            bottom: 28px !important;
            max-width: none !important;
            background: rgba(28,22,20,0.42);
            backdrop-filter: blur(6px);
            border-radius: 16px;
            padding: 16px 18px;
          }
        }
      `}</style>
    </div>
  );
}

/* ── SECCIÓN CATEGORÍAS ─────────────────────────────── */
function SeccionCategorias({ prendas, onSelect, onVerCatalogo, categoriasFS }) {
  const imagenPara = (cat) => {
    const p = prendas.find((p) => p.categoria === cat && (p.imagenes?.[0] || p.imagen));
    return p?.imagenes?.[0] || p?.imagen;
  };

  const items = categoriasFS.length > 0
    ? categoriasFS.filter((c) => c.activa !== false).sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)).map((c) => ({ label: c.nombre, cat: c.nombre, img: c.imagen || imagenPara(c.nombre) }))
    : [
        { label: "Vestidos", cat: "Vestido", img: imagenPara("Vestido") },
        { label: "Blusas", cat: "Blusa", img: imagenPara("Blusa") },
        { label: "Faldas", cat: "Falda", img: imagenPara("Falda") },
        { label: "Conjuntos", cat: "Conjunto", img: imagenPara("Conjunto") },
        { label: "Otros", cat: "Otras", img: prendas.find((p) => !CATEGORIAS_BASE.includes(p.categoria) && (p.imagenes?.[0] || p.imagen))?.imagen },
      ];

  const seleccionar = (cat) => { onSelect(cat); onVerCatalogo?.(); };

  return (
    <section style={{ padding: "56px 0", background: "linear-gradient(135deg, #F8E8F0 0%, #F3D5E8 100%)", textAlign: "center" }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(22px,4vw,28px)", fontWeight: 800, color: "#1a1a1a", margin: "0 0 8px", padding: "0 24px" }}>Elige tu estilo</h2>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 40px", letterSpacing: "1px", textTransform: "uppercase", padding: "0 24px" }}>TOCA UNA CATEGORÍA PARA EXPLORAR</p>
      <div className="categorias-grid">
        {items.map(({ label, cat, img }) => (
          <div key={cat} onClick={() => seleccionar(cat)} className="categoria-item">
            <div className="categoria-circulo" style={{ background: "#FDF0F6" }}>
              {img ? <img src={img} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", borderRadius: "50%" }} />
                : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #FCE4EC, #F8BBD0)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>👗</div>}
            </div>
            <p className="categoria-nombre">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── SECCIÓN MÁS PEDIDAS ────────────────────────────── */
function abrirWhatsappProducto(p) {
  const texto = `Hola Curvy! 💕 Me interesa: ${nombreDe(p)} - Código: ${p.id}`;
  window.open(waLink(texto), "_blank");
}

function SeccionMasPedidas({ prendas, onCardClick }) {
  if (!prendas.length) return null;
  return (
    <section style={{ padding: "52px 20px", background: "#fff" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(22px,4vw,32px)", fontWeight: 700, color: "#1C0F17", margin: "0 0 8px", textAlign: "center" }}>Las más pedidas</h2>
        <p style={{ color: "#7B4F6A", fontSize: 14, textAlign: "center", margin: "0 0 36px" }}>Las favoritas de nuestra comunidad</p>
        <div className="mas-pedidas-grid">
          {prendas.slice(0, 3).map((p) => {
            const img = p.imagenes?.[0] || p.imagen;
            return (
              <div key={p.id} onClick={() => onCardClick(p)} className="producto tarjeta-hover" style={{ cursor: "pointer", minWidth: 0 }}>
                <div className="producto__figura img-hover-wrap" style={{ position: "relative" }}>
                  {img ? <ImagenTarjetaHover imagenes={p.imagenes} alt={nombreDe(p)} imgStyle={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, var(--c-vino), #C2185B)" }} />}
                  <DotsFotos cantidad={p.imagenes?.length || 0} arriba />
                </div>
                <p className="producto__categoria">{p.categoria}</p>
                <p className="producto__nombre">{nombreDe(p)}</p>
                <p className="producto__precio" style={{ margin: 0 }}><PrecioConOferta p={p} fontSize={16} compacto /></p>
                <button onClick={(e) => { e.stopPropagation(); abrirWhatsappProducto(p); }} className="btn btn--primario" style={{ width: "100%", padding: "10px 0", fontSize: 12, marginTop: 10 }}>Pedir</button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── SECCIÓN CTA MEDIO ──────────────────────────────── */
function SeccionCTA({ onVerCatalogo }) {
  return (
    <section style={{ background: "linear-gradient(135deg, var(--c-vino) 0%, #C2185B 100%)", padding: "52px 20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 40, alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#fff", flex: "1 1 240px" }}>
          <p style={{ fontSize: 16, margin: "0 0 12px", fontWeight: 500 }}>Moda que abraza cada curva</p>
          <p style={{ fontSize: 16, margin: "0 0 12px", fontWeight: 500 }}>Tallas S a 4XL</p>
          <p style={{ fontSize: 16, margin: 0, fontWeight: 500 }}>Envíos a toda Colombia</p>
        </div>
        <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "rgba(255,255,255,0.88)", margin: 0, fontSize: 14 }}>100% seleccionado para ti</p>
          <p style={{ color: "rgba(255,255,255,0.88)", margin: 0, fontSize: 14 }}>Envíos a toda Colombia</p>
          <button onClick={onVerCatalogo} className="btn btn--claro" style={{ width: "fit-content", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
            Ver todo el catálogo →
          </button>
        </div>
      </div>
    </section>
  );
}

/* ── SECCIÓN INSTAGRAM ──────────────────────────────── */
function SeccionInstagram({ fotos }) {
  return (
    <section style={{ background: "#FFF5F7", padding: "52px 20px", textAlign: "center" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px,4vw,30px)", fontWeight: 700, color: "#1C0F17", margin: "0 0 8px" }}>Síguenos en Instagram</h2>
        <a href={IG_URL} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--c-vino)", fontWeight: 700, fontSize: 16, textDecoration: "none", marginBottom: 32 }}>
          <InstagramIcon size={18} /> {IG_HANDLE}
        </a>
        <div className="ig-grid">
          {fotos.slice(0, 6).map((p) => {
            const img = p.imagenes?.[0] || p.imagen;
            return (
              <a key={p.id} href={IG_URL} target="_blank" rel="noopener noreferrer" style={{ aspectRatio: "1/1", display: "block", borderRadius: 12, overflow: "hidden", background: "#FDF0F6" }}>
                {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#C2185B" }}><InstagramIcon size={32} /></div>}
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── FOOTER ──────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ background: "#1C0F17", color: "#fff", padding: "52px 20px 0" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="footer-grid">
          <div>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 800, color: "#C2185B", margin: "0 0 18px" }}>Curvy Vup</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <a href={waLink("")} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 9, color: "#E0B8D0", textDecoration: "none", fontSize: 14 }}><WhatsappIcon size={16} /> WhatsApp</a>
              <a href={IG_URL} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 9, color: "#E0B8D0", textDecoration: "none", fontSize: 14 }}><InstagramIcon size={16} /> {IG_HANDLE}</a>
            </div>
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: "#C2185B", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1 }}>Información</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[{ titulo: "Política de cambios", desc: "5 días para cambios por talla" }, { titulo: "Guía de tallas", desc: "Encuentra tu talla, de la S a la 4XL" }, { titulo: "Envíos a Colombia", desc: "Despachamos a todo el país" }].map((it) => (
                <div key={it.titulo} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#FCE4EC", margin: "0 0 2px" }}>{it.titulo}</p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", margin: 0 }}>{it.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: "#C2185B", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1 }}>Síguenos en</p>
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <a href={IG_URL} target="_blank" rel="noopener noreferrer" style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#C2185B", textDecoration: "none" }}><InstagramIcon size={18} /></a>
              <a href={waLink("")} target="_blank" rel="noopener noreferrer" style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#25D366", textDecoration: "none" }}><WhatsappIcon size={18} /></a>
            </div>
            <p style={{ fontSize: 13, color: "#7B4F6A", margin: 0 }}>Hecho para mujeres reales</p>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 44, padding: "20px 0" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["Nequi", "Bancolombia", "Efecty", "PSE"].map((m) => (
                <span key={m} style={{ background: "rgba(255,255,255,0.07)", color: "#E0B8D0", fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)" }}>{m}</span>
              ))}
            </div>
            <p style={{ color: "#7B4F6A", fontSize: 12, margin: 0 }}>Copyright {new Date().getFullYear()} © Curvy Vup</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ── TARJETA DE PRODUCTO (grid principal) ───────────── */
/* ── TARJETA DE CATÁLOGO — sin overlays, precio compacto, sin acento de marca ─ */
function TarjetaCatalogo({ p, onClick }) {
  const imagenes = p.imagenes?.length ? p.imagenes : (p.imagen ? [p.imagen] : []);
  const [indiceImg, setIndiceImg] = useState(0);
  const [hoverActivo, setHoverActivo] = useState(false);
  const touchRef = useRef({ x: 0 });
  const indiceMostrado = hoverActivo && indiceImg === 0 && imagenes.length > 1 ? 1 : indiceImg;
  const enOferta = ofertaVigente(p);

  const onTouchStart = (e) => { touchRef.current.x = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    const delta = touchRef.current.x - e.changedTouches[0].clientX;
    if (Math.abs(delta) < 35) return;
    setIndiceImg((i) => Math.min(imagenes.length - 1, Math.max(0, i + (delta > 0 ? 1 : -1))));
  };

  return (
    // min-width: 0 es obligatorio en items de grid: sin esto, un nombre largo con whiteSpace:"nowrap"
    // (ej. productos sin campo "nombre" que caen a "descripcion") expande la columna por su ancho
    // mínimo intrínseco y rompe el grid, sin importar cuántos caracteres tenga.
    <div onClick={onClick} className="producto tarjeta-hover" style={{ cursor: "pointer", minWidth: 0 }}>
      <div className="producto__figura" style={{ position: "relative", touchAction: "pan-y" }}
        onMouseEnter={() => setHoverActivo(true)} onMouseLeave={() => setHoverActivo(false)}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {imagenes.length > 0 ? imagenes.map((src, i) => (
          <img key={i} src={src} alt={nombreDe(p)} loading="lazy" decoding="async" className="producto__img"
            style={{ position: "absolute", inset: 0, objectPosition: "top", opacity: i === indiceMostrado ? 1 : 0, transition: "opacity 250ms ease", pointerEvents: "none" }} />
        )) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🪡</div>
        )}
      </div>
      <p className="producto__categoria">{p.categoria}</p>
      <p className="producto__nombre">{nombreDe(p)}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
        {enOferta && <span className="producto__precio--antes">{fmt(p.precioVenta)}</span>}
        <span className={enOferta ? "producto__precio producto__precio--oferta" : "producto__precio"}>{fmt(enOferta ? p.precioOferta : p.precioVenta)}</span>
        {enOferta && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--action)", background: "var(--bg-alt)", padding: "2px 6px", borderRadius: "var(--r-chip)" }}>-{porcentajeDescuento(p)}%</span>}
      </div>
    </div>
  );
}

/* ── TARJETA EDITORIAL — SOLO "Ofertas de la Semana" (home + ver todas) ─ */
function BarraProgresoFotos({ cantidad, activo = 0 }) {
  if (cantidad <= 1) return null;
  return (
    <div style={{ display: "flex", gap: 3, padding: "6px 1px 0" }}>
      {Array.from({ length: cantidad }).map((_, i) => (
        <span key={i} style={{ flex: 1, height: 2.5, borderRadius: 2, background: i === activo ? "var(--brand)" : "var(--bg-alt)", transition: "background 200ms ease" }} />
      ))}
    </div>
  );
}

function TarjetaEditorial({ p, onClick, mostrarNombre = false, mostrarContador = true }) {
  const imagenes = p.imagenes?.length ? p.imagenes : (p.imagen ? [p.imagen] : []);
  const [indiceImg, setIndiceImg] = useState(0);
  const [hoverActivo, setHoverActivo] = useState(false);
  const touchRef = useRef({ x: 0 });
  // Hover en desktop asoma la 2da foto, swipe en mobile recorre todas.
  const indiceMostrado = hoverActivo && indiceImg === 0 && imagenes.length > 1 ? 1 : indiceImg;

  const onTouchStart = (e) => { touchRef.current.x = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    const delta = touchRef.current.x - e.changedTouches[0].clientX;
    if (Math.abs(delta) < 35) return;
    setIndiceImg((i) => Math.min(imagenes.length - 1, Math.max(0, i + (delta > 0 ? 1 : -1))));
  };

  return (
    <div onClick={onClick} className="producto tarjeta-hover" style={{ cursor: "pointer", minWidth: 0 }}>
      <div className="producto__figura" style={{ position: "relative", touchAction: "pan-y" }}
        onMouseEnter={() => setHoverActivo(true)} onMouseLeave={() => setHoverActivo(false)}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {imagenes.length > 0 ? imagenes.map((src, i) => (
          <img key={i} src={src} alt={p.categoria || nombreDe(p)} loading="lazy" decoding="async" className="producto__img"
            style={{ position: "absolute", top: 0, left: 0, objectPosition: "top", opacity: i === indiceMostrado ? 1 : 0, transition: "opacity 250ms ease", pointerEvents: "none" }} />
        )) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🪡</div>
        )}
      </div>
      <BarraProgresoFotos cantidad={imagenes.length} activo={indiceMostrado} />
      <p className="producto__categoria">{p.categoria}</p>
      {mostrarNombre && (
        <p className="producto__nombre" style={{ lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{nombreDe(p)}</p>
      )}
      <p className="producto__precio" style={{ margin: "var(--sp-1) 0 0" }}><PrecioConOferta p={p} fontSize={15} colorBase="var(--c-vino)" compacto mostrarContador={mostrarContador} /></p>
    </div>
  );
}

function useEsMovil(breakpoint = 767) {
  const [esMovil, setEsMovil] = useState(() => window.matchMedia(`(max-width: ${breakpoint}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = (e) => setEsMovil(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return esMovil;
}

// Mide el archivo real (no un valor fijo) para poder poner width/height en el <img>
// y que el navegador reserve el alto correcto desde el primer render, sin salto de layout.
function useDimensionesImagen(src) {
  const [dim, setDim] = useState(null);
  useEffect(() => {
    setDim(null);
    if (!src) return undefined;
    let vigente = true;
    const img = new Image();
    img.onload = () => { if (vigente) setDim({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = src;
    return () => { vigente = false; };
  }, [src]);
  return dim;
}

function BannerOfertas({ banner }) {
  const esMovil = useEsMovil(767);
  const src = (esMovil && banner?.imagenBannerMovil) || banner?.imagenBanner;
  const dim = useDimensionesImagen(src);
  if (!src) return null;

  const contenido = (
    <img src={src} alt={banner.altBanner || ""} loading="lazy" width={dim?.w} height={dim?.h}
      style={{ width: "100%", height: "auto", display: "block" }} />
  );
  return banner.enlaceBanner
    ? <a href={banner.enlaceBanner} className="of-banner">{contenido}</a>
    : <div className="of-banner">{contenido}</div>;
}

function SeccionGridEditorial({ titulo, prendas, banner, bg = "#FAF7F4", onCardClick, onVerTodas, verTodasTexto = "Ver todas →", mostrarNombre = false, mostrarContador = true }) {
  if (!prendas.length) return null;
  const hayBanner = !!banner?.imagenBanner;
  return (
    <section style={{ padding: "0 0 28px", background: bg }}>
      <BannerOfertas banner={banner} />
      <div className="of-gutter" style={{ paddingTop: hayBanner ? 28 : 40, paddingBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px,4vw,28px)", fontWeight: 700, color: "#1C0F17", margin: 0 }}>{titulo}</h2>
        {onVerTodas && <button onClick={onVerTodas} className="btn btn--texto" style={{ flexShrink: 0, marginTop: 4 }}>{verTodasTexto}</button>}
      </div>
      <div className="grilla of-gutter">
        {prendas.map((p) => <TarjetaEditorial key={p.id} p={p} onClick={() => onCardClick(p)} mostrarNombre={mostrarNombre} mostrarContador={mostrarContador} />)}
      </div>
    </section>
  );
}

/* ── BOTÓN WHATSAPP FLOTANTE ─────────────────────────── */
function BotonWhatsappFlotante() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 2000); return () => clearTimeout(t); }, []);
  return (
    <div onClick={() => window.open(waLink("Hola Curvy Vup! 💕 Quiero ver el catálogo de ropa plus size"), "_blank")}
      style={{ position: "fixed", bottom: 24, right: 20, zIndex: 9998, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: visible ? 1 : 0, transform: visible ? "scale(1)" : "scale(0)", transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
      <div style={{ background: "#fff", borderRadius: "12px 12px 4px 12px", padding: "6px 12px", fontSize: 11, fontWeight: 600, color: "#1a1a1a", boxShadow: "0 2px 12px rgba(0,0,0,0.15)", whiteSpace: "nowrap", animation: "bounce-wa 2s infinite" }}>💬 ¿Necesitas ayuda?</div>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(37,211,102,0.3)", animation: "pulse-wa 2s infinite" }} />
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(37,211,102,0.4)", position: "relative" }}>
          <WhatsappIcon size={28} />
        </div>
      </div>
    </div>
  );
}

/* ── PANEL DE FILTROS DEL CATÁLOGO — secciones colapsables, sidebar (desktop) o drawer (móvil) ─ */
function SeccionColapsable({ id, titulo, abierta, onToggle, children }) {
  return (
    <div style={{ borderBottom: "1px solid #EEE", padding: "18px 0" }}>
      <button onClick={() => onToggle(id)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#1a1a1a", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif" }}>
        {titulo}
        <span style={{ fontSize: 16, fontWeight: 400, color: "#999" }}>{abierta ? "−" : "+"}</span>
      </button>
      {abierta && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}

function PanelFiltros({ categoriasFS, categoriaActiva, setCategoriaActiva, tallasActivas, toggleTalla, precioMin, setPrecioMin, precioMax, setPrecioMax, hayFiltrosActivos, limpiarFiltros }) {
  const [abiertas, setAbiertas] = useState({ talla: true, precio: true, categoria: true });
  const onToggle = (id) => setAbiertas((a) => ({ ...a, [id]: !a[id] }));
  const categorias = [{ id: "todas", label: "Todas" }, ...categoriasFS.filter((c) => c.activa !== false).map((c) => ({ id: c.nombre, label: c.nombre }))];

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SeccionColapsable id="talla" titulo="Talla" abierta={abiertas.talla} onToggle={onToggle}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TALLAS_FILTRO.map((t) => {
            const activo = tallasActivas.includes(t);
            return <button key={t} onClick={() => toggleTalla(t)} style={{ padding: "6px 12px", borderRadius: 4, border: activo ? "1px solid #1a1a1a" : "1px solid #DDD", background: activo ? "#1a1a1a" : "#fff", color: activo ? "#fff" : "#333", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>{t}</button>;
          })}
        </div>
      </SeccionColapsable>

      <SeccionColapsable id="precio" titulo="Precio" abierta={abiertas.precio} onToggle={onToggle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="number" min="0" placeholder="Mín" value={precioMin} onChange={(e) => setPrecioMin(e.target.value)}
            style={{ width: 0, flex: 1, padding: "7px 8px", border: "1px solid #DDD", borderRadius: 4, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
          <span style={{ color: "#999" }}>–</span>
          <input type="number" min="0" placeholder="Máx" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)}
            style={{ width: 0, flex: 1, padding: "7px 8px", border: "1px solid #DDD", borderRadius: 4, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
        </div>
      </SeccionColapsable>

      <SeccionColapsable id="categoria" titulo="Categoría" abierta={abiertas.categoria} onToggle={onToggle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {categorias.map((c) => {
            const activo = c.id === "todas" ? categoriaActiva === "todas" : categoriaActiva.toLowerCase() === c.id.toLowerCase();
            return <button key={c.id} onClick={() => setCategoriaActiva(c.id)} style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: activo ? 700 : 400, color: activo ? "#C2185B" : "#333", fontFamily: "'DM Sans', sans-serif" }}>{c.label}</button>;
          })}
        </div>
      </SeccionColapsable>

      {hayFiltrosActivos && (
        <button onClick={limpiarFiltros} style={{ marginTop: 16, background: "none", border: "none", padding: 0, color: "#C2185B", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          × Limpiar filtros
        </button>
      )}
    </div>
  );
}

/* ── GUÍA DE TALLAS ──────────────────────────────────── */
function GuiaTallas({ tallasDisp, prenda, onCerrar }) {
  const textoAyudaTalla = prenda
    ? `Hola Curvy Vup! Necesito ayuda para encontrar mi talla 📏 en esta prenda:\n🛍️ ${nombreDe(prenda)}\n🔖 Código: ${prenda.codigo}\n\n¿Qué talla me recomiendan?`
    : "Hola Curvy Vup! Necesito ayuda para encontrar mi talla 📏";
  const esPlus = tallasDisp.some((t) => TALLAS_PLUS.includes(t));
  const tabla = esPlus
    ? { headers: ["XL", "2XL", "3XL", "4XL"], filas: [
        { medida: "👗 Busto (cm)", valores: ["96-107", "108-113", "114-119", "120-125"] },
        { medida: "⬛ Cintura (cm)", valores: ["82-93", "94-99", "100-105", "106-111"] },
        { medida: "🍑 Cadera (cm)", valores: ["106-117", "118-123", "124-129", "130-135"] },
      ], extra: { medida: "⚖️ Peso aprox.", valores: ["70-90kg", "90-100kg", "100-110kg", "110-120kg"] } }
    : { headers: ["XS", "S", "M", "L", "XL"], filas: [
        { medida: "👗 Busto (cm)", valores: ["76-81", "82-87", "88-93", "94-99", "100-105"] },
        { medida: "⬛ Cintura (cm)", valores: ["58-63", "64-69", "70-75", "76-81", "82-87"] },
        { medida: "🍑 Cadera (cm)", valores: ["84-89", "90-95", "96-101", "102-107", "108-113"] },
      ], extra: { medida: "🔢 Talla numérica", valores: ["32-34", "34-36", "36-38", "38-40", "40-42"] } };

  return (
    <div className="guia-tallas-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onCerrar}>
      <div className="guia-tallas-panel" onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxHeight: "90vh", borderRadius: "24px 24px 0 0", overflowY: "auto", padding: "0 0 32px" }}>
        <div style={{ width: 40, height: 4, background: "#E0E0E0", borderRadius: 2, margin: "12px auto 20px" }} />
        <div style={{ textAlign: "center", padding: "0 24px 20px", borderBottom: "2px solid #FCE4EC" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--c-vino)", margin: "0 0 4px" }}>Guía de Tallas</h2>
          <p style={{ fontSize: 12, color: "#999", margin: 0 }}>{esPlus ? "Tallas Plus Size · XL al 4XL" : "Tallas Estándar · XS al XL"}</p>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <p style={{ fontSize: 13, color: "#555", marginBottom: 16, lineHeight: 1.5, background: "#FFF5F7", padding: "12px 16px", borderRadius: 12, borderLeft: "3px solid #C2185B" }}>
            💡 {esPlus ? "Mide el contorno de tu busto, cintura y cadera con una cinta métrica. Elige la talla donde más de tus medidas coincidan." : "Mide el contorno de tu busto, cintura y cadera. Si estás entre dos tallas, elige la talla mayor."}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="guia-tallas-tabla" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg, var(--c-vino), #C2185B)", color: "white" }}>
                  <th style={{ padding: "12px 8px 12px 16px", textAlign: "left", borderRadius: "12px 0 0 0" }}>Medida</th>
                  {tabla.headers.map((h) => <th key={h} style={{ padding: "12px 8px", textAlign: "center", fontWeight: 800 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {tabla.filas.map((f, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#FFF5F7" : "white" }}>
                    <td style={{ padding: "12px 8px 12px 16px", fontWeight: 700, color: "var(--c-vino)", fontSize: 12 }}>{f.medida}</td>
                    {f.valores.map((v, j) => <td key={j} style={{ padding: "12px 8px", textAlign: "center", color: "#444" }}>{v}</td>)}
                  </tr>
                ))}
                <tr style={{ background: "#FCE4EC" }}>
                  <td style={{ padding: "12px 8px 12px 16px", fontWeight: 700, color: "var(--c-vino)", fontSize: 12 }}>{tabla.extra.medida}</td>
                  {tabla.extra.valores.map((v, j) => <td key={j} style={{ padding: "12px 8px", textAlign: "center", color: "var(--c-vino)", fontWeight: 600, fontSize: 11 }}>{v}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: "#999", margin: "12px 0 0", lineHeight: 1.5 }}>
            El peso es referencial — dos personas con el mismo peso pueden usar tallas distintas según su contextura. Prioriza las medidas de busto, cintura y cadera.
          </p>
          <div style={{ marginTop: 20, background: "linear-gradient(135deg, var(--c-vino), #C2185B)", borderRadius: 14, padding: 16, color: "white", textAlign: "center" }}>
            <p style={{ fontSize: 13, margin: "0 0 8px", fontWeight: 700 }}>¿Dudas con tu talla? 💕</p>
            <a href={waLink(textoAyudaTalla)} target="_blank" rel="noopener noreferrer" style={{ color: "white", fontSize: 12, fontWeight: 600, textDecoration: "underline" }}>Escríbenos y te ayudamos a elegir ✨</a>
          </div>
          <button onClick={onCerrar} style={{ width: "100%", marginTop: 16, padding: 14, background: "#F5F5F5", border: "none", borderRadius: 16, fontSize: 14, fontWeight: 700, color: "#666", cursor: "pointer" }}>Cerrar</button>
        </div>
      </div>
      <style>{`
        @media (min-width: 768px) {
          .guia-tallas-overlay { align-items: center !important; }
          .guia-tallas-panel { max-width: 750px !important; max-height: 85vh !important; border-radius: 24px !important; }
          .guia-tallas-tabla th:not(:first-child), .guia-tallas-tabla td:not(:first-child) { padding-left: 6px !important; padding-right: 6px !important; }
        }
      `}</style>
    </div>
  );
}

/* ── SOBRE ESTA PRENDA ──────────────────────────────── */
function SobreEstaPrenda({ prenda }) {
  const [verTodas, setVerTodas] = useState(false);
  const lista = Array.isArray(prenda.caracteristicas)
    ? prenda.caracteristicas.filter((l) => l && l.trim())
    : (prenda.caracteristicas || "").split("\n").filter((l) => l.trim());
  const visibles = verTodas ? lista : lista.slice(0, 3);
  const hayMas = lista.length > 3;

  return (
    <div style={{ background: "white", borderRadius: 20, padding: 28, marginTop: 32, border: "1px solid #F5E6EE", boxShadow: "0 2px 16px rgba(139,26,77,0.05)" }}>
      <style>{`@keyframes aparecer2 { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "2px solid #FCE4EC" }}>
        <span style={{ fontSize: 20 }}>✨</span>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#1a1a1a", margin: 0 }}>Sobre esta prenda</h2>
      </div>
      {lista.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#999", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "1.5px" }}>🏷️ Características destacadas</p>
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {visibles.map((linea, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0", borderBottom: i < visibles.length - 1 ? "1px solid #FFF5F7" : "none", animation: "aparecer2 0.3s ease forwards", animationDelay: `${i * 0.05}s`, opacity: 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "linear-gradient(135deg, var(--c-vino), #C2185B)", flexShrink: 0, marginTop: 5, boxShadow: "0 2px 6px rgba(194,24,91,0.3)" }} />
                <span style={{ fontSize: 14, color: "#444", lineHeight: 1.6 }}>{linea.trim()}</span>
              </div>
            ))}
          </div>
          {!verTodas && hayMas && <div style={{ height: 40, marginTop: -40, background: "linear-gradient(to bottom, transparent, white)", pointerEvents: "none", position: "relative", zIndex: 1 }} />}
          {hayMas && (
            <button onClick={() => setVerTodas((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#C2185B", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "8px 0 0", marginTop: 4, fontFamily: "inherit" }}>
              {verTodas ? "Ver menos" : `Ver las ${lista.length - 3} características restantes`}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C2185B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={verTodas ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
              </svg>
            </button>
          )}
        </div>
      )}
      {prenda.nombre && prenda.descripcion && lista.length > 0 && <hr style={{ border: "none", borderTop: "1px solid #F5E6EE", margin: "20px 0" }} />}
      {prenda.nombre && prenda.descripcion && (
        <div style={{ background: "#FFF5F7", borderRadius: 14, padding: "16px 20px", borderLeft: "3px solid #C2185B" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--c-vino)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 6 }}>📝 Descripción</p>
          <p style={{ fontSize: 14, color: "#555", lineHeight: 1.8, margin: 0, whiteSpace: "pre-line" }}>{prenda.descripcion}</p>
        </div>
      )}
    </div>
  );
}

/* ── ESTRELLAS (input y display) ─────────────────────── */
function Estrellas({ valor, onChange, size = 16 }) {
  const interactivo = !!onChange;
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} onClick={interactivo ? () => onChange(n) : undefined}
          style={{ fontSize: size, color: n <= valor ? "#F5A623" : "#E0D5DB", cursor: interactivo ? "pointer" : "default", lineHeight: 1 }}>★</span>
      ))}
    </div>
  );
}

/* ── RESEÑAS DE CLIENTAS ──────────────────────────────── */
function ResenasProducto({ prendaId }) {
  const [resenas, setResenas] = useState(null); // null = cargando
  const [formAbierto, setFormAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [estrellas, setEstrellas] = useState(0);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setResenas(null);
    getDocs(query(collection(db, "resenas"), where("prendaId", "==", prendaId)))
      .then((snap) => {
        const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        lista.sort((a, b) => (b.fecha?.toMillis?.() || 0) - (a.fecha?.toMillis?.() || 0));
        setResenas(lista);
      })
      .catch(() => setResenas([]));
  }, [prendaId]);

  const enviar = async (e) => {
    e.preventDefault();
    if (!nombre.trim() || !texto.trim() || estrellas === 0) return;
    setEnviando(true);
    try {
      await addDoc(collection(db, "resenas"), {
        prendaId, nombre: nombre.trim(), estrellas, texto: texto.trim(), fecha: serverTimestamp(),
      });
      setFormAbierto(false);
      setResenas((prev) => [{ id: "temp", prendaId, nombre: nombre.trim(), estrellas, texto: texto.trim() }, ...(prev || [])]);
    } catch {
      // si falla el envío, dejamos el form abierto para reintentar
    } finally {
      setEnviando(false);
    }
  };

  if (resenas === null) return null; // evita parpadeo de caja vacía mientras carga

  const promedio = resenas.length > 0 ? (resenas.reduce((s, r) => s + Number(r.estrellas || 0), 0) / resenas.length) : 0;

  return (
    <div style={{ background: "white", borderRadius: 20, padding: 28, marginTop: 32, border: "1px solid #F5E6EE", boxShadow: "0 2px 16px rgba(139,26,77,0.05)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "2px solid #FCE4EC" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>💬</span>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#1a1a1a", margin: 0 }}>Reseñas de clientas</h2>
          {resenas.length > 0 && <span style={{ fontSize: 13, color: "#999", fontWeight: 600 }}>({resenas.length})</span>}
        </div>
        {resenas.length > 0 && !formAbierto && (
          <button onClick={() => setFormAbierto(true)} style={{ background: "#FCE4EC", border: "1px solid #F48FB1", color: "var(--c-vino)", fontSize: 12, fontWeight: 700, padding: "8px 16px", borderRadius: 20, cursor: "pointer" }}>Escribir reseña</button>
        )}
      </div>

      {resenas.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <Estrellas valor={Math.round(promedio)} />
          <span style={{ fontSize: 13, color: "#666", fontWeight: 600 }}>{promedio.toFixed(1)} de 5</span>
        </div>
      )}

      {resenas.length === 0 && !formAbierto && (
        <div style={{ textAlign: "center", padding: "24px 12px" }}>
          <p style={{ fontSize: 32, margin: "0 0 8px" }}>🌸</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#333", margin: "0 0 4px" }}>Aún no hay reseñas para esta prenda</p>
          <p style={{ fontSize: 13, color: "#999", margin: "0 0 18px" }}>Sé la primera en dejar tu reseña</p>
          <button onClick={() => setFormAbierto(true)} style={{ background: "#C2185B", border: "none", color: "white", fontSize: 13, fontWeight: 700, padding: "10px 22px", borderRadius: 20, cursor: "pointer" }}>Escribir reseña</button>
        </div>
      )}

      {formAbierto && (
        <form onSubmit={enviar} style={{ background: "#FFF5F7", borderRadius: 14, padding: 20, marginBottom: resenas.length > 0 ? 20 : 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--c-vino)", margin: "0 0 6px" }}>Tu calificación</p>
            <Estrellas valor={estrellas} onChange={setEstrellas} size={24} />
          </div>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" maxLength={40}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #F3C9DC", fontSize: 14, fontFamily: "inherit" }} />
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cuéntanos qué te pareció la prenda" maxLength={500} rows={3}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #F3C9DC", fontSize: 14, fontFamily: "inherit", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={enviando || !nombre.trim() || !texto.trim() || estrellas === 0}
              style={{ background: "#C2185B", border: "none", color: "white", fontSize: 13, fontWeight: 700, padding: "10px 22px", borderRadius: 20, cursor: enviando ? "default" : "pointer", opacity: enviando || !nombre.trim() || !texto.trim() || estrellas === 0 ? 0.5 : 1 }}>
              {enviando ? "Enviando..." : "Publicar reseña"}
            </button>
            <button type="button" onClick={() => setFormAbierto(false)} style={{ background: "none", border: "none", color: "#999", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
          </div>
        </form>
      )}

      {resenas.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {resenas.map((r) => (
            <div key={r.id} style={{ borderBottom: "1px solid #FFF5F7", paddingBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{r.nombre}</span>
                <Estrellas valor={Number(r.estrellas) || 0} />
              </div>
              <p style={{ fontSize: 14, color: "#555", lineHeight: 1.6, margin: 0 }}>{r.texto}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── HELPER: PRODUCTOS RELACIONADOS ─────────────────── */
function calcularRelacionados(prenda, todas) {
  const disponibles = (todas || []).filter((p) => p.id !== prenda?.id && (p.imagenes?.[0]?.trim() || p.imagen?.trim()));
  const precio = Number(prenda?.precioVenta || 0);
  const mismaCategoria = disponibles.filter((p) => p.categoria === prenda?.categoria).slice(0, 4);
  const precioSimilar = disponibles.filter((p) => p.categoria !== prenda?.categoria && precio > 0 && Math.abs(Number(p.precioVenta || 0) - precio) / precio < 0.3).slice(0, 4);
  const yaElegidos = new Set([...mismaCategoria, ...precioSimilar].map((p) => p.id));
  const resto = disponibles.filter((p) => !yaElegidos.has(p.id)).sort(() => Math.random() - 0.5).slice(0, 4);
  return [...mismaCategoria, ...precioSimilar, ...resto].slice(0, 10);
}

/* ── IMAGEN PRINCIPAL CON ZOOM (hover en desktop) ─────── */
function ImagenPrincipalZoom({ src, alt, onClick }) {
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [activo, setActivo] = useState(false);
  const soportaHover = useRef(typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches);
  const ref = useRef(null);

  const mover = (e) => {
    if (!soportaHover.current || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
  };

  return (
    <div ref={ref} onClick={onClick} onMouseEnter={() => soportaHover.current && setActivo(true)} onMouseLeave={() => setActivo(false)} onMouseMove={mover}
      style={{ position: "relative", width: "100%", overflow: "hidden", cursor: "zoom-in" }}>
      <img src={src} alt={alt} style={{ width: "100%", height: "auto", maxHeight: "72vh", objectFit: "contain", objectPosition: "center top", display: "block", transform: activo ? "scale(2.2)" : "scale(1)", transformOrigin: `${pos.x}% ${pos.y}%`, transition: activo ? "none" : "transform 0.2s ease" }} />
      {soportaHover.current && !activo && (
        <span style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 20, display: "flex", alignItems: "center", gap: 5, pointerEvents: "none" }}>🔍 Pasa el mouse para ver de cerca</span>
      )}
    </div>
  );
}

/* ── META TAGS DINÁMICOS POR PRODUCTO (SEO/Google) ────── */
function useMetaTagsProducto(prenda) {
  useEffect(() => {
    if (!prenda) return;
    const selectores = ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]'];
    const originales = selectores.map((sel) => document.querySelector(sel)?.getAttribute("content"));
    const tituloOriginal = document.title;

    const tallas = ORDEN_TALLAS.filter((t) => Number(prenda.stockPorTalla?.[t] || 0) > 0).join(", ");
    const titulo = `${nombreDe(prenda) || prenda.codigo} | Curvy Vup`;
    const descripcion = `${prenda.descripcion || nombreDe(prenda) || prenda.categoria || "Ropa plus size"}${tallas ? ` · Tallas: ${tallas}` : ""} · Envíos a toda Colombia.`.slice(0, 160);

    document.title = titulo;
    selectores.forEach((sel) => document.querySelector(sel)?.setAttribute("content",
      sel.includes("og:url") ? `https://curvyvup.web.app/producto/${prenda.id}` : sel.includes("title") ? titulo : descripcion));

    return () => {
      document.title = tituloOriginal;
      selectores.forEach((sel, i) => { if (originales[i] != null) document.querySelector(sel)?.setAttribute("content", originales[i]); });
    };
  }, [prenda?.id]);
}

/* ── PÁGINA DE DETALLE DE PRODUCTO ──────────────────── */
function DetalleProducto({ prenda, onVolver, onCargarProducto, todasLasPrendas }) {
  const tallasDisp = ORDEN_TALLAS.filter((t) => Number(prenda?.stockPorTalla?.[t] || 0) > 0);
  const [indiceImg, setIndiceImg] = useState(0);
  const [tallaSel, setTallaSel] = useState(tallasDisp[0] || "");
  const [zoomAbierto, setZoomAbierto] = useState(false);
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  useMetaTagsProducto(prenda);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTallaSel(ORDEN_TALLAS.filter((t) => Number(prenda?.stockPorTalla?.[t] || 0) > 0)[0] || "");
    setIndiceImg(0);
  }, [prenda?.id]);

  const relacionados = calcularRelacionados(prenda, todasLasPrendas);
  const textoPedido = encodeURIComponent(
    `Hola Curvy Vup! 😍 Quiero pedir esta prenda:\n🛍️ ${nombreDe(prenda)}${tallaSel ? `\n📏 Talla: ${tallaSel}` : ""}\n💰 Precio: ${fmt(precioEfectivo(prenda))}\n🔖 Código: ${prenda?.codigo}`
  );
  const textoAyuda = encodeURIComponent(
    `Hola Curvy Vup! 🙋‍♀️ Tengo una duda sobre esta prenda:\n🛍️ ${nombreDe(prenda)}\n🔖 Código: ${prenda?.codigo}\n\n¿Me pueden ayudar? 💕`
  );
  const base = `https://api.whatsapp.com/send?phone=${NUMERO_WA}`;

  if (!prenda) return null;
  const imagenes = prenda.imagenes?.filter(Boolean) || (prenda.imagen ? [prenda.imagen] : []);
  const stock = Number(prenda.stock || 0);

  return (
    <div style={{ minHeight: "100vh", background: "#FFFBFC", fontFamily: "'DM Sans', sans-serif" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "white", borderBottom: "1px solid #F5E6EE", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 8px rgba(139,26,77,0.06)" }}>
        <button onClick={onVolver} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "var(--c-vino)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>← Volver</button>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "var(--c-vino)", fontStyle: "italic", fontWeight: 700 }}>Curvy Vup</span>
        <div style={{ width: 80 }} />
      </header>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 16px" }}>
        <div className="detalle-layout">
          <div className="miniaturas-vertical">
            {imagenes.map((img, i) => (
              <div key={i} onClick={() => setIndiceImg(i)} style={{ width: 88, height: 88, borderRadius: 12, overflow: "hidden", cursor: "pointer", flexShrink: 0, border: indiceImg === i ? "3px solid #C2185B" : "3px solid #F0E0E8", boxShadow: indiceImg === i ? "0 2px 12px rgba(194,24,91,0.25)" : "none", transition: "all 0.2s ease" }}>
                <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
              </div>
            ))}
          </div>

          <div className="imagen-principal-container">
            <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", background: "#FAFAFA", boxShadow: "0 4px 24px rgba(139,26,77,0.08)" }}>
              {imagenes[indiceImg] ? (
                <ImagenPrincipalZoom src={imagenes[indiceImg]} alt={nombreDe(prenda)} onClick={() => setZoomAbierto(true)} />
              ) : <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>🪡</div>}
              {imagenes.length > 1 && (
                <>
                  <button className="flecha-mobile" onClick={() => setIndiceImg((i) => (i === 0 ? imagenes.length - 1 : i - 1))} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.92)", border: "none", fontSize: 18, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
                  <button className="flecha-mobile" onClick={() => setIndiceImg((i) => (i === imagenes.length - 1 ? 0 : i + 1))} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.92)", border: "none", fontSize: 18, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
                  <div className="contador-mobile" style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.5)", color: "white", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 12 }}>{indiceImg + 1} / {imagenes.length}</div>
                </>
              )}
            </div>
            {imagenes.length > 1 && (
              <div className="miniaturas-horizontal no-scrollbar">
                {imagenes.map((img, i) => (
                  <div key={i} onClick={() => setIndiceImg(i)} style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden", cursor: "pointer", flexShrink: 0, border: indiceImg === i ? "2px solid #C2185B" : "2px solid #F0E0E8" }}>
                    <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="info-producto">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{ color: "#C2185B", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px" }}>{prenda.categoria}</span>
              <span style={{ color: "#ddd", fontSize: 16 }}>|</span>
              <span style={{ color: "#aaa", fontSize: 12 }}>Ref: {prenda.codigo}</span>
              {stock <= 2 && stock > 0 && <span style={{ background: "#FCE4EC", color: "#C2185B", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20, border: "1px solid #F48FB1" }}>⚠️ ÚLTIMA(S) UNIDAD(ES)</span>}
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a1a", lineHeight: 1.25, margin: "0 0 20px" }}>{nombreDe(prenda)}</h1>
            <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: "1px solid #F5E6EE" }}>
              <PrecioConOferta p={prenda} fontSize={30} fontWeight={900} colorBase="#C2185B" etiqueta="Precio:" />
            </div>

            {tallasDisp.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Talla: <span style={{ color: "#C2185B", fontWeight: 800 }}>{tallaSel}</span></p>
                  <button onClick={() => setGuiaAbierta(true)} style={{ background: "none", border: "1px solid #F5E6EE", borderRadius: 20, padding: "5px 12px", fontSize: 11, color: "#C2185B", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>📏 Guía de tallas</button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {tallasDisp.map((t) => (
                    <button key={t} onClick={() => setTallaSel(t)} style={{ minWidth: 56, padding: "10px 16px", borderRadius: 50, border: tallaSel === t ? "2px solid #C2185B" : "2px solid #E0E0E0", background: tallaSel === t ? "#FCE4EC" : "white", color: tallaSel === t ? "#C2185B" : "#555", fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.2s ease", fontFamily: "inherit" }}>{t}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
              <a href={`${base}&text=${textoPedido}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, background: "linear-gradient(135deg, var(--c-vino), #C2185B)", color: "white", borderRadius: 16, fontSize: 16, fontWeight: 800, textDecoration: "none", boxShadow: "0 6px 20px rgba(194,24,91,0.3)" }}>
                <WhatsappIcon size={20} /> Realizar Pedido
              </a>
              <a href={`${base}&text=${textoAyuda}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, background: "white", color: "#128C7E", border: "2px solid #25D366", borderRadius: 16, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
                NECESITO AYUDA CON MI COMPRA
              </a>
            </div>

            <style>{`
              .garantias-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
              @media (max-width: 480px) {
                .garantias-grid { gap: 8px; }
                .garantias-item { padding: 10px !important; gap: 8px !important; }
                .garantias-icono { width: 30px !important; height: 30px !important; font-size: 15px !important; }
                .garantias-titulo { font-size: 11px !important; }
                .garantias-desc { font-size: 10px !important; }
              }
            `}</style>
            <div className="garantias-grid">
              {[
                { icono: "🚚", titulo: "Envíos", desc: "A toda Colombia" },
                { icono: "🔄", titulo: "Cambios", desc: "5 días hábiles" },
                { icono: "📏", titulo: "Tallas", desc: "S a 4XL", onClick: () => setGuiaAbierta(true) },
                { icono: "🎧", titulo: "Atención", desc: "Personalizada 24/7" },
              ].map((it) => (
                <div key={it.titulo} onClick={it.onClick} className="garantias-item" style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "#FFFBFC", border: "1px solid #F5E6EE", borderRadius: 14, padding: 14, cursor: it.onClick ? "pointer" : "default" }}>
                  <div className="garantias-icono" style={{ width: 36, height: 36, background: "linear-gradient(135deg, #FCE4EC, #F8BBD0)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{it.icono}</div>
                  <div>
                    <p className="garantias-titulo" style={{ fontSize: 12, fontWeight: 800, color: "#1a1a1a", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{it.titulo}</p>
                    <p className="garantias-desc" style={{ fontSize: 11, color: "#666", margin: 0, lineHeight: 1.4 }}>{it.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <SobreEstaPrenda prenda={prenda} />

        <ResenasProducto prendaId={prenda?.id} />

        <div style={{ background: "linear-gradient(135deg, var(--c-vino), #C2185B)", borderRadius: 20, padding: "24px 32px", marginTop: 32, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 6px" }}>¿TE GUSTÓ ESTA PRENDA?</p>
            <p style={{ color: "white", fontSize: 20, fontWeight: 800, margin: 0, fontFamily: "'Playfair Display', serif" }}>¡Pídela antes de que se agote! 💕</p>
          </div>
          <a href={`${base}&text=${textoPedido}`} target="_blank" rel="noopener noreferrer" style={{ background: "white", color: "#C2185B", borderRadius: 14, padding: "12px 24px", fontSize: 14, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>Pedir ahora →</a>
        </div>

        {relacionados.length > 0 && (
          <div style={{ marginTop: 48 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a1a1a", margin: "0 0 4px", fontFamily: "'Playfair Display', serif" }}>También te puede gustar</h2>
                <p style={{ fontSize: 11, color: "#999", margin: 0, letterSpacing: 1, textTransform: "uppercase" }}>PRENDAS SELECCIONADAS PARA TI</p>
              </div>
              <button onClick={onVolver} className="btn btn--secundario" style={{ padding: "8px 20px", fontSize: 13 }}>Ver todo →</button>
            </div>
            <div className="relacionadas-grid">
              {relacionados.map((p) => {
                const img = p.imagenes?.[0] || p.imagen;
                return (
                  <div key={p.id} onClick={() => { onCargarProducto?.(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="producto tarjeta-hover" style={{ cursor: "pointer" }}>
                    <div className="producto__figura img-hover-wrap" style={{ position: "relative" }}>
                      {img && <ImagenTarjetaHover imagenes={p.imagenes} alt={nombreDe(p)} imgStyle={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />}
                      <DotsFotos cantidad={p.imagenes?.length || 0} />
                    </div>
                    <p className="producto__categoria">{p.categoria}</p>
                    <p className="producto__nombre" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.35, minHeight: 32 }}>{nombreDe(p)}</p>
                    <p className="producto__precio" style={{ margin: "var(--sp-1) 0 0" }}><PrecioConOferta p={p} fontSize={15} colorBase="var(--c-vino)" compacto /></p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {guiaAbierta && <GuiaTallas tallasDisp={tallasDisp} prenda={prenda} onCerrar={() => setGuiaAbierta(false)} />}

      {zoomAbierto && (
        <div onClick={() => setZoomAbierto(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
          <img src={imagenes[indiceImg]} style={{ maxWidth: "95vw", maxHeight: "95vh", objectFit: "contain", borderRadius: 8 }} />
          {imagenes.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setIndiceImg((i) => (i === 0 ? imagenes.length - 1 : i - 1)); }} style={{ position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", color: "white", fontSize: 32, width: 48, height: 48, borderRadius: "50%", cursor: "pointer" }}>‹</button>
              <button onClick={(e) => { e.stopPropagation(); setIndiceImg((i) => (i === imagenes.length - 1 ? 0 : i + 1)); }} style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", color: "white", fontSize: 32, width: 48, height: 48, borderRadius: "50%", cursor: "pointer" }}>›</button>
            </>
          )}
          <button onClick={() => setZoomAbierto(false)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 44, height: 44, color: "white", fontSize: 20, cursor: "pointer" }}>✕</button>
          <div className="hint-pellizcar" style={{ position: "absolute", top: 20, left: 20, color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.1)", padding: "6px 12px", borderRadius: 20 }}>🤏 Pellizca para acercar</div>
          <div style={{ position: "absolute", bottom: 20, color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600 }}>{indiceImg + 1} / {imagenes.length}</div>
        </div>
      )}

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @media (min-width: 1024px) {
          .detalle-layout { display: grid; grid-template-columns: 96px 1fr 460px; gap: 28px; align-items: start; }
          .miniaturas-vertical { display: flex !important; flex-direction: column; gap: 10px; }
          .miniaturas-horizontal { display: none !important; }
          .flecha-mobile { display: none !important; }
          .contador-mobile { display: none !important; }
          .hint-pellizcar { display: none !important; }
        }
        @media (max-width: 1023px) {
          .detalle-layout { display: flex; flex-direction: column; gap: 0; }
          .miniaturas-vertical { display: none !important; }
          .miniaturas-horizontal { display: flex !important; gap: 8px; overflow-x: auto; padding: 12px 0 4px; }
          .info-producto { padding: 20px 0; }
        }
        @media (min-width: 1024px) { .relacionadas-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; } }
        @media (min-width: 640px) and (max-width: 1023px) { .relacionadas-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; } }
        @media (max-width: 639px) {
          .relacionadas-grid { display: flex; overflow-x: auto; gap: 12px; padding-bottom: 12px; scrollbar-width: none; scroll-snap-type: x mandatory; }
          .relacionadas-grid::-webkit-scrollbar { display: none; }
          .relacionadas-grid > div { flex: 0 0 160px; width: 160px; scroll-snap-align: start; }
        }
      `}</style>
    </div>
  );
}

/* ── CARRITO (drawer) ───────────────────────────────── */
function CarritoDrawer({ carrito, setCarrito, onCerrar, onEnviar }) {
  const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9000, display: "flex", justifyContent: "flex-end", backdropFilter: "blur(6px)" }} onClick={onCerrar}>
      <div className="animate" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 420, height: "100%", display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.12)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #EDD9E8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontFamily: "'Fraunces', serif", margin: 0, fontSize: 22, color: "#1C0F17" }}>Tu Pedido</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9E7A8E" }}>{carrito.reduce((s, i) => s + i.cantidad, 0)} prendas seleccionadas</p>
          </div>
          <button onClick={onCerrar} style={{ background: "#FAF7F4", border: "none", width: 36, height: 36, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#7B4F6A" }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {carrito.length === 0 ? <p style={{ textAlign: "center", color: "#9E7A8E", marginTop: 40 }}>Tu carrito está vacío.</p> : carrito.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 12, background: "#FAF7F4", borderRadius: 16, padding: 12, alignItems: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, overflow: "hidden", background: "#FDF0F6", flexShrink: 0 }}>
                {item.imagen ? <img src={item.imagen} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="image" size={20} color="#E0B8D0" /></div>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#1C0F17", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion}</p>
                <p style={{ margin: "3px 0 0", fontSize: 11, color: "#9E7A8E" }}>Talla {item.talla} · {item.cantidad} {item.cantidad === 1 ? "ud" : "uds"}</p>
                <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 800, color: "var(--c-vino)" }}>{fmt(item.precio * item.cantidad)}</p>
              </div>
              <button onClick={() => setCarrito((c) => c.filter((_, j) => j !== i))} style={{ background: "#FFEBEE", color: "#C62828", border: "none", width: 32, height: 32, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ padding: "20px 24px", borderTop: "1px solid #EDD9E8" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 17, fontWeight: 800, color: "#1C0F17" }}>
            <span>Total estimado</span><span style={{ color: "var(--c-vino)" }}>{fmt(total)}</span>
          </div>
          <button onClick={onEnviar} disabled={!carrito.length} style={{ width: "100%", padding: 16, borderRadius: 14, background: "#25D366", color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            📱 Enviar pedido por WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── COMPONENTE PRINCIPAL ────────────────────────────── */
export default function CatalogoPublico() {
  const [prendas, setPrendas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("todas");
  const [tallasActivas, setTallasActivas] = useState([]);
  const [precioMin, setPrecioMin] = useState("");
  const [precioMax, setPrecioMax] = useState("");
  const [carrito, setCarrito] = useState([]);
  const [verCarrito, setVerCarrito] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [categoriasFS, setCategoriasFS] = useState([]);
  const [heroSlides, setHeroSlides] = useState([]);
  const [configOfertas, setConfigOfertas] = useState(null);
  const [ordenActivo, setOrdenActivo] = useState("recientes");
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false);
  const [mostrarFiltrosMovil, setMostrarFiltrosMovil] = useState(false);
  const [cantidadVisible, setCantidadVisible] = useState(12);
  const [cargandoMas, setCargandoMas] = useState(false);
  const pagRef = useRef({ hayMas: false, cargandoMas: false });

  const abrirProducto = (p) => {
    setDetalle(p);
    window.history.pushState({}, "", `/producto/${p.id}`);
  };
  const cerrarProducto = () => {
    setDetalle(null);
    window.history.pushState({}, "", "/");
  };

  // Deep-link: si la URL ya trae /producto/:id (link compartido), abrir ese producto en cuanto cargue
  useEffect(() => {
    if (detalle || prendas.length === 0) return;
    const m = window.location.pathname.match(/^\/producto\/([^/]+)$/);
    if (m) {
      const p = prendas.find((x) => x.id === m[1]);
      if (p) setDetalle(p);
    }
  }, [prendas]);

  // Deep-link: ?categoria=ofertas (o cualquier otra) abre el catálogo ya filtrado
  useEffect(() => {
    const cat = new URLSearchParams(window.location.search).get("categoria");
    if (cat) irACatalogo(cat);
  }, []);

  // Sincroniza con el botón atrás/adelante del navegador
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/^\/producto\/([^/]+)$/);
      setDetalle(m ? prendas.find((x) => x.id === m[1]) || null : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [prendas]);

  useEffect(() => {
    getDocs(collection(db, "categorias")).then((snap) => {
      setCategoriasFS(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)));
    });
  }, []);

  // Banner editable de "Ofertas de la Semana"; si el doc no existe o no tiene imagen, la sección no lo muestra.
  useEffect(() => {
    getDoc(doc(db, "config", "ofertas")).then((snap) => {
      if (snap.exists()) setConfigOfertas(snap.data());
    }).catch((error) => console.error("No se pudo leer config/ofertas:", error));
  }, []);

  useEffect(() => {
    getDocs(collection(db, "heroSlides")).then((snap) => {
      setHeroSlides(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.activo).sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)));
    });
  }, []);

  useEffect(() => {
    const minimo = new Promise((r) => setTimeout(r, 2500));
    const carga = getDocs(collection(db, "prendas")).then((snap) => {
      setPrendas(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => Number(p.stock) > 0));
    });
    Promise.all([minimo, carga]).finally(() => setCargando(false));
  }, []);

  useEffect(() => { setCantidadVisible(12); }, [categoriaActiva, tallasActivas, busqueda, ordenActivo]);

  useEffect(() => {
    const onScroll = () => {
      const { hayMas, cargandoMas } = pagRef.current;
      if (!hayMas || cargandoMas) return;
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      if (scrollHeight - scrollTop - clientHeight < 300) {
        setCargandoMas(true);
        setTimeout(() => { setCantidadVisible((v) => v + 12); setCargandoMas(false); }, 400);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleTalla = (t) => setTallasActivas((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const limpiarFiltros = () => { setCategoriaActiva("todas"); setTallasActivas([]); setOrdenActivo("recientes"); setPrecioMin(""); setPrecioMax(""); };
  const hayFiltrosActivos = categoriaActiva !== "todas" || tallasActivas.length > 0 || precioMin !== "" || precioMax !== "";

  const conFoto = useMemo(() => prendas.filter(tieneImagen), [prendas]);

  const filtradas = useMemo(() => prendas.filter((p) => {
    if (!tieneImagen(p)) return false;
    const coincideCat = categoriaActiva === "todas" ? true
      : categoriaActiva === "ofertas" ? ofertaVigente(p)
      : categoriaActiva === "otras" ? !CATEGORIAS_BASE.includes(p.categoria)
      : p.categoria?.toLowerCase() === categoriaActiva.toLowerCase();
    const coincideBusq = (nombreDe(p) || "").toLowerCase().includes(busqueda.toLowerCase());
    const coincideTalla = tallasActivas.length === 0 || tallasActivas.some((t) => p.stockPorTalla ? (Number(p.stockPorTalla[t]) || 0) > 0 : p.talla === t);
    const precio = precioEfectivo(p);
    const coincidePrecio = (precioMin === "" || precio >= Number(precioMin)) && (precioMax === "" || precio <= Number(precioMax));
    return coincideCat && coincideTalla && coincideBusq && coincidePrecio;
  }), [prendas, categoriaActiva, tallasActivas, busqueda, precioMin, precioMax]);

  const ordenadas = useMemo(() => {
    const copia = [...filtradas];
    if (ordenActivo === "menor") return copia.sort((a, b) => Number(a.precioVenta) - Number(b.precioVenta));
    if (ordenActivo === "mayor") return copia.sort((a, b) => Number(b.precioVenta) - Number(a.precioVenta));
    return copia.sort((a, b) => fechaCreacion(b) - fechaCreacion(a));
  }, [filtradas, ordenActivo]);

  const hayMasParaCargar = ordenadas.length > cantidadVisible;
  pagRef.current = { hayMas: hayMasParaCargar, cargandoMas };

  const totalCarrito = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const cantidadCarrito = carrito.reduce((s, i) => s + i.cantidad, 0);

  const agregarAlCarrito = (prenda, talla) => {
    if (!talla) return;
    setCarrito((prev) => {
      const existe = prev.find((i) => i.id === prenda.id && i.talla === talla);
      if (existe) return prev.map((i) => (i.id === prenda.id && i.talla === talla ? { ...i, cantidad: i.cantidad + 1 } : i));
      return [...prev, { id: prenda.id, descripcion: nombreDe(prenda), precio: precioEfectivo(prenda), talla, cantidad: 1, imagen: prenda.imagenes?.[0] || prenda.imagen }];
    });
    setVerCarrito(true);
  };

  const enviarWA = () => {
    if (!carrito.length) return;
    const lineas = carrito.map((i) => `*${i.descripcion}*\n- Talla: ${i.talla} | x${i.cantidad} | ${fmt(i.precio * i.cantidad)}`).join("\n\n");
    const texto = `¡Hola *Curvy Vup*! Quiero hacer este pedido:\n\n${lineas}\n\n*TOTAL: ${fmt(totalCarrito)}*\n\n¡Quedo atenta! 💕`;
    window.open(waLink(texto), "_blank");
  };

  const todasConFoto = useMemo(() => prendas.filter(tieneImagen), [prendas]);
  const recientes = useMemo(() => [...todasConFoto].sort((a, b) => fechaCreacion(b) - fechaCreacion(a)).slice(0, 4), [todasConFoto]);
  const masPedidas = todasConFoto.slice(0, 3);
  // Home: solo las 4 prendas de mayor descuento (el catálogo filtrado "ofertas" sí muestra todas)
  const enOfertas = useMemo(() => todasConFoto.filter(ofertaVigente)
    .sort((a, b) => (1 - Number(a.precioOferta) / Number(a.precioVenta)) < (1 - Number(b.precioOferta) / Number(b.precioVenta)) ? 1 : -1)
    .slice(0, 4), [todasConFoto]);
  const paraInstagram = todasConFoto.slice(0, 6);

  const irACatalogo = (cat) => {
    // cat solo si es un string real: evita que un SyntheticEvent (cuando esta función
    // se pasa directo a onClick sin envolver) se cuele como categoría.
    if (typeof cat === "string" && cat) {
      setCategoriaActiva(cat);
      setOrdenActivo("recientes");
      setTallasActivas([]);
    }
    setMostrarCatalogo(true);
    setTimeout(() => document.getElementById("catalogo-section")?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const filtrarDesdeNavbar = (cat) => {
    if (cat === "todas") { setCategoriaActiva("todas"); setOrdenActivo("recientes"); }
    else if (cat === "ofertas") { setCategoriaActiva("ofertas"); setOrdenActivo("recientes"); }
    else { setCategoriaActiva(cat); setOrdenActivo("recientes"); }
    setTallasActivas([]);
    irACatalogo();
  };

  if (detalle) return <DetalleProducto prenda={detalle} onVolver={cerrarProducto} onCargarProducto={abrirProducto} todasLasPrendas={prendas} />;
  if (cargando) return <LoaderReloj />;

  return (
    <div style={{ minHeight: "100vh", background: "#FAF7F4", fontFamily: "'DM Sans', sans-serif" }}>
      {cantidadCarrito > 0 && !verCarrito && (
        <button onClick={() => setVerCarrito(true)} className="animate" style={{ position: "fixed", bottom: 28, right: 20, zIndex: 800, background: "linear-gradient(135deg, var(--c-vino), #C2185B)", color: "#fff", border: "none", borderRadius: 50, padding: "14px 22px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 28px rgba(139,26,77,0.4)", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
          <CartIcon size={20} /> Mi pedido
          <span style={{ background: "#fff", color: "var(--c-vino)", borderRadius: 20, padding: "2px 8px", fontSize: 13, fontWeight: 800 }}>{cantidadCarrito}</span>
        </button>
      )}

      {verCarrito && <CarritoDrawer carrito={carrito} setCarrito={setCarrito} onCerrar={() => setVerCarrito(false)} onEnviar={enviarWA} />}

      <Navbar cartCount={cantidadCarrito} onCartClick={() => setVerCarrito(true)} busqueda={busqueda} onBusqueda={(v) => { setBusqueda(v); if (v) setMostrarCatalogo(true); }}
        prendas={prendas} onProductoClick={abrirProducto} categoriasFS={categoriasFS} onFiltrarCategoria={filtrarDesdeNavbar} />

      <HeroCarousel slides={heroSlides} onVerCatalogo={irACatalogo} />

      <SeccionGridEditorial titulo="Lo Más Nuevo" prendas={recientes} onCardClick={abrirProducto} onVerTodas={() => irACatalogo()} mostrarNombre mostrarContador={false} />

      <SeccionGridEditorial titulo="Ofertas de la Semana" prendas={enOfertas} banner={configOfertas} bg="linear-gradient(135deg, #FCE8EF 0%, #FBEFF3 100%)" onCardClick={abrirProducto} onVerTodas={() => irACatalogo("ofertas")} verTodasTexto="Ver todas las ofertas →" />

      <SeccionCategorias prendas={prendas} categoriaSel={categoriaActiva} onSelect={(c) => { setCategoriaActiva(c); setTallasActivas([]); }} onVerCatalogo={irACatalogo} categoriasFS={categoriasFS} />

      {mostrarCatalogo && (
        <div id="catalogo-section" style={{ background: "#fff", animation: "fadeInUp 0.4s ease" }}>
          <div className="catalogo-container" style={{ padding: "20px 16px 0" }}>
            <nav style={{ fontSize: 12, color: "#999", fontFamily: "'DM Sans', sans-serif" }}>
              <button onClick={() => { setMostrarCatalogo(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ background: "none", border: "none", padding: 0, color: "#999", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>Inicio</button>
              {" / "}
              <span style={{ color: categoriaActiva === "todas" ? "#1a1a1a" : "#999" }}>Catálogo</span>
              {categoriaActiva !== "todas" && (
                <>
                  {" / "}
                  <span style={{ color: "#1a1a1a", fontWeight: 600 }}>{categoriaActiva === "ofertas" ? "Ofertas" : categoriaActiva === "otras" ? "Otras" : categoriaActiva}</span>
                </>
              )}
            </nav>
          </div>

          <div className="catalogo-layout catalogo-container">
            <aside className="catalogo-sidebar-desktop">
              <PanelFiltros categoriasFS={categoriasFS} categoriaActiva={categoriaActiva} setCategoriaActiva={setCategoriaActiva} tallasActivas={tallasActivas} toggleTalla={toggleTalla}
                precioMin={precioMin} setPrecioMin={setPrecioMin} precioMax={precioMax} setPrecioMax={setPrecioMax} hayFiltrosActivos={hayFiltrosActivos} limpiarFiltros={limpiarFiltros} />
            </aside>

            <div className="catalogo-main">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <button onClick={() => setMostrarFiltrosMovil(true)} className="catalogo-btn-filtrar" style={{ padding: "8px 16px", borderRadius: 4, border: "1px solid #DDD", background: "#fff", color: "#1a1a1a", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    Filtrar{hayFiltrosActivos ? " •" : ""}
                  </button>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "#333", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    Ordenar por
                    <select value={ordenActivo} onChange={(e) => setOrdenActivo(e.target.value)}
                      style={{ width: "auto", border: "none", background: "transparent", fontSize: 13, color: "#1a1a1a", fontWeight: 600, cursor: "pointer", outline: "none", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", padding: 0, fontFamily: "'DM Sans', sans-serif" }}>
                      <option value="recientes">Recientes</option>
                      <option value="menor">Menor precio</option>
                      <option value="mayor">Mayor precio</option>
                    </select>
                    <span style={{ fontSize: 10 }}>⌄</span>
                  </label>
                </div>
                <span style={{ fontSize: 12, color: "#999", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}>{ordenadas.length} prenda{ordenadas.length === 1 ? "" : "s"}</span>
              </div>

              {ordenadas.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", background: "#FAFAFA", border: "1px dashed #DDD" }}>
                  <p style={{ fontSize: 40, margin: "0 0 12px" }}>💕</p>
                  <p style={{ fontWeight: 700, fontSize: 16, color: "#1C0F17" }}>No encontramos prendas</p>
                  <p style={{ fontSize: 13, color: "#9E7A8E", marginTop: 4 }}>Intenta con otros filtros</p>
                </div>
              ) : (
                <>
                  <div className="grilla">
                    {ordenadas.slice(0, cantidadVisible).map((p) => (
                      <TarjetaCatalogo key={p.id} p={p} onClick={() => abrirProducto(p)} />
                    ))}
                  </div>
                  {cargandoMas && (
                    <div style={{ textAlign: "center", padding: 24, color: "#C2185B", fontSize: 14, fontWeight: 600 }}>
                      <div style={{ width: 32, height: 32, border: "3px solid #FCE4EC", borderTop: "3px solid #C2185B", borderRadius: "50%", margin: "0 auto 8px", animation: "spin 0.8s linear infinite" }} />
                      Cargando más prendas...
                    </div>
                  )}
                  {!hayMasParaCargar && ordenadas.length > 12 && !cargandoMas && (
                    <div style={{ textAlign: "center", padding: 24, color: "#999", fontSize: 13 }}>✨ Has visto todas las prendas</div>
                  )}
                </>
              )}
            </div>
          </div>

          {mostrarFiltrosMovil && (
            <div className="catalogo-filtros-overlay" onClick={() => setMostrarFiltrosMovil(false)}>
              <div className="catalogo-filtros-panel" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }}>Filtrar</h3>
                  <button onClick={() => setMostrarFiltrosMovil(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#999", padding: 4 }}>✕</button>
                </div>
                <PanelFiltros categoriasFS={categoriasFS} categoriaActiva={categoriaActiva} setCategoriaActiva={setCategoriaActiva} tallasActivas={tallasActivas} toggleTalla={toggleTalla}
                  precioMin={precioMin} setPrecioMin={setPrecioMin} precioMax={precioMax} setPrecioMax={setPrecioMax} hayFiltrosActivos={hayFiltrosActivos} limpiarFiltros={limpiarFiltros} />
                <button onClick={() => setMostrarFiltrosMovil(false)} style={{ width: "100%", marginTop: 20, padding: 14, background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 4, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Ver {ordenadas.length} resultado{ordenadas.length === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <SeccionMasPedidas prendas={masPedidas} onCardClick={abrirProducto} />
      <SeccionCTA onVerCatalogo={() => irACatalogo()} />
      <SeccionInstagram fotos={paraInstagram} />
      <Footer />
      <BotonWhatsappFlotante />

      <style>{`
        @keyframes pulse-wa { 0% { transform: scale(1); opacity: 0.7; } 70% { transform: scale(1.5); opacity: 0; } 100% { transform: scale(1.5); opacity: 0; } }
        @keyframes bounce-wa { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Contenedor del catálogo: más ancho en pantallas grandes para no dejar tanto margen muerto a los costados */
        .catalogo-container { max-width: 1400px; margin: 0 auto; }
        @media (min-width: 1440px) { .catalogo-container { max-width: 1680px; } }

        /* Layout del catálogo: sidebar fija a la izquierda (desktop) + columna principal */
        .catalogo-layout { display: flex; flex-direction: column; gap: 0; padding: 16px 16px 60px; }
        .catalogo-sidebar-desktop { display: none; }
        .catalogo-btn-filtrar { display: inline-flex; }
        .catalogo-main { flex: 1; min-width: 0; }
        @media (min-width: 768px) {
          .catalogo-layout { flex-direction: row; align-items: flex-start; gap: 40px; padding: 24px 32px 60px; }
          .catalogo-sidebar-desktop { display: block; width: 220px; flex-shrink: 0; position: sticky; top: 100px; }
          .catalogo-btn-filtrar { display: none; }
        }

        .catalogo-filtros-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 9000; }
        .catalogo-filtros-panel { position: fixed; top: 0; left: 0; bottom: 0; width: 85%; max-width: 340px; background: #fff; z-index: 9001; overflow-y: auto; padding: 20px; animation: catalogoPanelIn 0.25s ease; }
        @keyframes catalogoPanelIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @media (min-width: 768px) { .catalogo-filtros-overlay, .catalogo-filtros-panel { display: none; } }

        /* Padding lateral compartido entre encabezado y grilla de ofertas, para que queden alineados entre sí */
        .of-gutter { padding-left: 16px; padding-right: 16px; }
        @media (min-width: 768px) { .of-gutter { padding-left: 32px; padding-right: 32px; } }

        .of-banner { display: block; width: 100%; text-decoration: none; }

        .skeleton { background: linear-gradient(90deg, #F5E6EE 25%, #FCE4EC 37%, #F5E6EE 63%); background-size: 400% 100%; animation: skeleton-loading 1.4s ease infinite; }
        @keyframes skeleton-loading { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }

        .categorias-grid { display: flex; gap: 20px; overflow-x: auto; padding: 0 24px; scrollbar-width: none; justify-content: flex-start; }
        .categorias-grid::-webkit-scrollbar { display: none; }
        @media (min-width: 768px) { .categorias-grid { justify-content: center; flex-wrap: wrap; gap: 36px; } }
        .categoria-item { display: flex; flex-direction: column; align-items: center; gap: 10px; cursor: pointer; flex-shrink: 0; width: 100px; }
        .categoria-circulo { width: 88px; height: 88px; border-radius: 50%; overflow: hidden; box-shadow: 0 4px 16px rgba(139,26,77,0.15); transition: transform 0.2s ease; }
        .categoria-item:hover .categoria-circulo { transform: scale(1.06); }
        .categoria-nombre { font-size: 13px; font-weight: 700; color: #1a1a1a; margin: 0; }
        @media (min-width: 768px) {
          .categoria-item { width: 190px; gap: 16px; }
          .categoria-circulo { width: 175px; height: 175px; box-shadow: 0 6px 22px rgba(139,26,77,0.18); }
          .categoria-nombre { font-size: 17px; }
        }

        .mas-pedidas-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @media (max-width: 600px) { .mas-pedidas-grid { display: flex; overflow-x: auto; gap: 14px; scrollbar-width: none; } .mas-pedidas-grid::-webkit-scrollbar { display: none; } .mas-pedidas-grid > * { flex-shrink: 0; width: 220px; } }

        .ig-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
        @media (max-width: 600px) { .ig-grid { grid-template-columns: repeat(3, 1fr); gap: 6px; } }

        .footer-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 40px; }
        @media (max-width: 700px) { .footer-grid { grid-template-columns: 1fr; gap: 32px; } }

        @media (hover: hover) and (pointer: fine) {
          .tarjeta-hover { transition: transform 0.25s ease-out, box-shadow 0.25s ease-out; }
          .tarjeta-hover img { transition: transform 0.25s ease-out; }
          .tarjeta-hover:hover { transform: translateY(-6px); box-shadow: 0 14px 28px rgba(139,26,77,0.18) !important; }
          .tarjeta-hover:hover img { transform: scale(1.04); }
        }

        @media (max-width: 480px) {
          .precio-oferta-linea { gap: 5px !important; }
          .po-num { font-size: 13px !important; }
          .po-badge { font-size: 9px !important; padding: 1px 5px !important; }
          .po-tachado { font-size: 10px !important; }
        }

        .img-hover-wrap .img-b { position: absolute; inset: 0; opacity: 0; pointer-events: none; transition: opacity 250ms ease; }
        .img-hover-wrap .img-a { pointer-events: none; transition: opacity 250ms ease; }
        @media (hover: hover) and (pointer: fine) {
          .img-hover-wrap:hover .img-a { opacity: 0; }
          .img-hover-wrap:hover .img-b { opacity: 1; }
        }

        .dots-fotos { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); z-index: 2; display: flex; gap: 4px; pointer-events: none; }
        .dots-fotos.dots-arriba { bottom: auto; top: 12px; }
        .dots-fotos span { width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,0.6); box-shadow: 0 0 0 1px rgba(0,0,0,0.2); transition: all 0.2s ease; }
        .dots-fotos span.dot-activo { background: #fff; width: 6px; height: 6px; box-shadow: 0 0 0 1px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.2); }
      `}</style>
    </div>
  );
}
