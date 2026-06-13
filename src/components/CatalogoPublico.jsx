import { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { fmt, Icon, LoaderInteractivo } from "../utils.jsx";

// --- ICONO DE CARRITO NATIVO ---
const CartIcon = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"></circle>
    <circle cx="20" cy="21" r="1"></circle>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
  </svg>
);

// --- COMPONENTE TARJETA DE PRODUCTO ---
const ProductoCard = ({ p, onAdd }) => {
  const tallasDisponibles = Object.entries(p.stockPorTalla || {})
    .filter(([talla, cant]) => Number(cant) > 0)
    .map(([talla]) => talla);

  const [tallaSel, setTallaSel] = useState(tallasDisponibles[0] || "");
  const imgMostrar = (p.imagenes && p.imagenes.length > 0) ? p.imagenes[0] : p.imagen;

  return (
    <div className="animate" style={{ background: "var(--white)", borderRadius: 20, overflow: "hidden", boxShadow: "var(--shadow)", border: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
      <div style={{ width: "100%", aspectRatio: "1/1", background: "var(--rosa-pale)", position: "relative" }}>
        {imgMostrar ? (
          <img src={imgMostrar} alt={p.descripcion} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mid)" }}><Icon name="image" size={32}/></div>
        )}
      </div>

      <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 12 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--dark)", lineHeight: 1.2, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.descripcion}</p>
          <p style={{ fontSize: 12, color: "var(--mid)" }}>{p.categoria}</p>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 18, color: "var(--rosa-deep)", fontWeight: 800 }}>{fmt(p.precioVenta)}</span>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <select 
            value={tallaSel} 
            onChange={(e) => setTallaSel(e.target.value)}
            style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--creme)", fontSize: 13, fontWeight: 600, color: "var(--dark)" }}
          >
            {tallasDisponibles.map(t => <option key={t} value={t}>Talla {t}</option>)}
          </select>
          <button 
            onClick={() => onAdd(p, tallaSel)}
            style={{ background: "var(--dark)", color: "white", border: "none", borderRadius: 10, width: 44, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "transform 0.1s" }}
            onMouseDown={e => e.currentTarget.style.transform = "scale(0.95)"}
            onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
          >
            <CartIcon size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};


export default function CatalogoPublico({ onLoginClick }) {
  // Número de WhatsApp configurado para Colombia
  const NUMERO_WHATSAPP = "573017886206"; 

  const [prendas, setPrendas] = useState([]);
  const [cargando, setCargando] = useState(true);
  
  const [busqueda, setBusqueda] = useState("");
  const [categoriaSel, setCategoriaSel] = useState("Todas");
  const [tallaSel, setTallaSel] = useState("Todas");
  
  const [carrito, setCarrito] = useState([]);
  const [verCarrito, setVerCarrito] = useState(false);

  useEffect(() => {
    const fetchPublico = async () => {
      try {
        const snap = await getDocs(collection(db, "prendas"));
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPrendas(data.filter(p => Number(p.stock) > 0));
      } catch (error) {
        console.error("Error cargando catálogo", error);
      } finally {
        setCargando(false);
      }
    };
    fetchPublico();
  }, []);

  const tallasDisponibles = useMemo(() => {
    const tallasSet = new Set();
    prendas.forEach(p => {
      if (p.stockPorTalla) {
        Object.entries(p.stockPorTalla).forEach(([t, cant]) => {
          if (Number(cant) > 0) tallasSet.add(t);
        });
      } else if (p.talla && Number(p.stock) > 0) {
        tallasSet.add(p.talla); 
      }
    });
    return ["Todas", ...Array.from(tallasSet)].sort();
  }, [prendas]);

  const categorias = ["Todas", ...new Set(prendas.map(p => p.categoria).filter(Boolean))];

  const filtradas = useMemo(() => {
    return prendas.filter(p => {
      const coincideCat = categoriaSel === "Todas" || p.categoria === categoriaSel;
      const coincideBusq = (p.descripcion || "").toLowerCase().includes(busqueda.toLowerCase());
      
      let coincideTalla = false;
      if (tallaSel === "Todas") {
        coincideTalla = true;
      } else if (p.stockPorTalla) {
        coincideTalla = Number(p.stockPorTalla[tallaSel]) > 0;
      } else if (p.talla) {
        coincideTalla = p.talla === tallaSel;
      }

      return coincideCat && coincideTalla && coincideBusq;
    });
  }, [prendas, categoriaSel, tallaSel, busqueda]);

  const agregarAlCarrito = (prenda, tallaSeleccionada) => {
    if (!tallaSeleccionada) return;
    setCarrito(prev => {
      const existe = prev.find(i => i.id === prenda.id && i.talla === tallaSeleccionada);
      if (existe) {
        return prev.map(i => i.id === prenda.id && i.talla === tallaSeleccionada ? { ...i, cantidad: i.cantidad + 1 } : i);
      }
      return [...prev, { 
        id: prenda.id, 
        descripcion: prenda.descripcion, 
        precio: Number(prenda.precioVenta), 
        talla: tallaSeleccionada, 
        cantidad: 1,
        imagen: (prenda.imagenes && prenda.imagenes.length > 0) ? prenda.imagenes[0] : prenda.imagen
      }];
    });
    setVerCarrito(true); 
  };

  const quitarDelCarrito = (index) => {
    setCarrito(prev => prev.filter((_, i) => i !== index));
  };

  const totalCarrito = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);

  // FIX DE ENCODING: Texto limpio y sin emojis para evitar símbolos raros.
  const enviarPedidoWhatsApp = () => {
    if (carrito.length === 0) return;
    
    // Armamos el texto usando un formato limpio con guiones y asteriscos
    const lineasPedido = carrito.map(item => 
      `*${item.descripcion}*\n- Talla: ${item.talla} | Cantidad: ${item.cantidad} | Valor: ${fmt(item.precio * item.cantidad)}`
    ).join("\n\n");

    const textoFinal = `¡Hola *Curvy Vup*!\nQuiero hacer el siguiente pedido:\n\n${lineasPedido}\n\n*TOTAL ESTIMADO: ${fmt(totalCarrito)}*\n\n¡Quedo atenta para coordinar el pago y envío!`;
    
    // encodeURIComponent protege los espacios y los saltos de línea (\n)
    const url = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(textoFinal)}`;
    window.open(url, "_blank");
  };

  if (cargando) return <LoaderInteractivo />;

  return (
    <div style={{ minHeight: "100vh", background: "var(--creme)", display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 80 }}>
      
      {/* BOTÓN FLOTANTE DEL CARRITO */}
      {carrito.length > 0 && (
        <button 
          className="animate"
          onClick={() => setVerCarrito(true)}
          style={{ position: "fixed", bottom: 30, right: 20, zIndex: 900, background: "var(--rosa-deep)", color: "white", border: "none", borderRadius: 50, padding: "16px 24px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 10px 25px rgba(216, 27, 96, 0.4)", cursor: "pointer", fontWeight: 700, fontSize: 16 }}
        >
          <CartIcon size={22} />
          Ver mi pedido ({carrito.length})
        </button>
      )}

      {/* MODAL DEL CARRITO */}
      {verCarrito && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", justifyContent: "flex-end", backdropFilter: "blur(4px)" }}>
          <div className="animate" style={{ background: "white", width: "100%", maxWidth: 400, height: "100%", display: "flex", flexDirection: "column", boxShadow: "-5px 0 30px rgba(0,0,0,0.1)" }}>
            
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontFamily: "'Fraunces', serif", margin: 0, fontSize: 22, color: "var(--dark)" }}>Tu Pedido</h2>
              <button onClick={() => setVerCarrito(false)} style={{ background: "var(--creme)", border: "none", width: 36, height: 36, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dark)" }}><Icon name="close" size={20}/></button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              {carrito.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--mid)", marginTop: 40 }}>Tu carrito está vacío.</div>
              ) : (
                carrito.map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", background: "var(--creme)", padding: 12, borderRadius: 16 }}>
                    <div style={{ width: 60, height: 60, borderRadius: 10, overflow: "hidden", background: "white", flexShrink: 0 }}>
                      {item.imagen ? <img src={item.imagen} alt="" style={{width: "100%", height: "100%", objectFit: "cover"}}/> : <div style={{width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mid)"}}><Icon name="image" size={20}/></div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 4px 0", fontSize: 13, fontWeight: 700, color: "var(--dark)", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.descripcion}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--mid)" }}>Talla: <strong>{item.talla}</strong> | Cant: {item.cantidad}</p>
                      <p style={{ margin: "4px 0 0 0", fontSize: 14, fontWeight: 800, color: "var(--rosa-deep)" }}>{fmt(item.precio * item.cantidad)}</p>
                    </div>
                    <button onClick={() => quitarDelCarrito(i)} style={{ background: "#FFEBEE", color: "var(--danger)", border: "none", width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                      <Icon name="trash" size={16}/>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: 24, borderTop: "1px solid var(--border)", background: "var(--white)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 18, fontWeight: 800, color: "var(--dark)" }}>
                <span>Total Estimado:</span>
                <span>{fmt(totalCarrito)}</span>
              </div>
              <button 
                onClick={enviarPedidoWhatsApp}
                disabled={carrito.length === 0}
                style={{ width: "100%", padding: 16, borderRadius: 14, background: carrito.length === 0 ? "var(--border)" : "#25D366", color: "white", border: "none", fontSize: 16, fontWeight: 700, cursor: carrito.length === 0 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
              >
                Enviar pedido por WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HERO BANNER ESTILO E-COMMERCE */}
      <div style={{ width: "100%", background: "linear-gradient(135deg, var(--rosa-deep) 0%, var(--rosa) 100%)", padding: "60px 20px", display: "flex", justifyContent: "center", color: "white", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -50, right: -50, width: 250, height: 250, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        <div style={{ position: "absolute", bottom: -80, left: -20, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        
        <div style={{ maxWidth: 800, width: "100%", textAlign: "center", zIndex: 1 }}>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(40px, 8vw, 64px)", fontWeight: 800, margin: 0, lineHeight: 1.1, textShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>Curvy Vup</h1>
          <p style={{ fontSize: "clamp(16px, 4vw, 20px)", fontWeight: 500, margin: "16px 0 0 0", opacity: 0.9 }}>Ropa espectacular diseñada para resaltar tu belleza real. Encuentra tu estilo en todas las tallas.</p>
        </div>
      </div>

      {/* ZONA DE BÚSQUEDA Y FILTROS */}
      <div style={{ background: "var(--white)", width: "100%", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "center", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 10px 20px rgba(0,0,0,0.03)" }}>
        <div style={{ width: "100%", maxWidth: 1200, padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
          
          <div style={{ position: "relative", width: "100%" }}>
            <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--mid)" }}><Icon name="search" size={18} /></span>
            <input placeholder="¿Qué estás buscando hoy?" value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ width: "100%", paddingLeft: 44, borderRadius: 50, background: "var(--creme)", padding: "14px 14px 14px 44px", border: "1px solid var(--border)", fontSize: 15 }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", minWidth: 65, textTransform: "uppercase", letterSpacing: 0.5 }}>Categoría</span>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", flex: 1 }}>
                {categorias.map(cat => (
                  <button key={cat} onClick={() => setCategoriaSel(cat)} style={{ background: categoriaSel === cat ? "var(--rosa-deep)" : "var(--white)", color: categoriaSel === cat ? "white" : "var(--dark)", border: categoriaSel === cat ? "1px solid var(--rosa-deep)" : "1px solid var(--border)", padding: "6px 16px", borderRadius: 50, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", transition: "all 0.2s", cursor: "pointer" }}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", minWidth: 65, textTransform: "uppercase", letterSpacing: 0.5 }}>Talla</span>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", flex: 1 }}>
                {tallasDisponibles.map(talla => (
                  <button key={talla} onClick={() => setTallaSel(talla)} style={{ background: tallaSel === talla ? "var(--dark)" : "var(--white)", color: tallaSel === talla ? "white" : "var(--dark)", border: tallaSel === talla ? "1px solid var(--dark)" : "1px solid var(--border)", padding: "6px 16px", borderRadius: 50, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", transition: "all 0.2s", cursor: "pointer" }}>
                    {talla}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* GALERÍA DE PRODUCTOS */}
      <div style={{ width: "100%", maxWidth: 1200, padding: "30px 20px", flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--mid)", marginBottom: 20 }}>
          Mostrando {filtradas.length} {filtradas.length === 1 ? "prenda" : "prendas"}
        </p>
        
        {filtradas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--mid)", background: "var(--white)", borderRadius: 24, border: "1px dashed var(--border)" }}>
            <h2 style={{ fontSize: 48, margin: 0, opacity: 0.5, fontFamily: "'Fraunces', serif" }}>Oh!</h2>
            <p style={{ fontWeight: 700, fontSize: 18, color: "var(--dark)" }}>No encontramos prendas con esos filtros.</p>
            <p style={{ fontSize: 14, marginTop: 4 }}>Intenta borrar tu búsqueda o seleccionar "Todas".</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 24 }}>
            {filtradas.map(p => (
              <ProductoCard key={p.id} p={p} onAdd={agregarAlCarrito} />
            ))}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={{ textAlign: "center", padding: "40px 20px", borderTop: "1px solid var(--border)", color: "var(--mid)", width: "100%", maxWidth: 1200 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, color: "var(--rosa-deep)", margin: "0 0 10px 0" }}>Curvy Vup</h2>
        <p style={{ fontSize: 13, marginBottom: 20 }}>Tu cuerpo, tus reglas. © {new Date().getFullYear()} Todos los derechos reservados.</p>
        <button onClick={onLoginClick} style={{ background: "var(--creme)", border: "1px solid var(--border)", color: "var(--mid)", fontSize: 11, padding: "6px 12px", borderRadius: 50, cursor: "pointer", fontWeight: 600 }}>
          Acceso Administrativo
        </button>
      </div>
    </div>
  );
}