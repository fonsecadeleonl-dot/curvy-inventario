import { useState, useMemo } from "react";
import { db } from "../firebase";
import { collection, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { fmt, fmtNum, parseNum, comprimirImagen, Icon, fmtFecha } from "../utils.jsx";
import ImportarFactura from "./ImportarFactura.jsx";
import ColaBorradores from "./ColaBorradores.jsx";

export default function Inventario({ prendas, setPrendas }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroTiempo, setFiltroTiempo] = useState("todo");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [toast, setToast] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [prendaAEliminar, setPrendaAEliminar] = useState(null);
  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [mostrarBorradores, setMostrarBorradores] = useState(false); 
  
  // 1. Agregamos las nuevas tallas al estado inicial
  const formBase = { 
    codigo: "", descripcion: "", stockMinimo: "1", 
    costoCompra: "", precioVenta: "", categoria: "Blusa", imagen: "", imagenes: [],
    tallas: { "XS": "", "S": "", "M": "", "L": "", "XL": "", "0XL": "", "1XL": "", "2XL": "", "3XL": "", "4XL": "", "5XL": "" }
  };
  const [form, setForm] = useState(formBase);

  // Array maestro para mantener siempre el orden lógico de las tallas
  const ordenTallas = ["XS", "S", "M", "L", "XL", "0XL", "1XL", "2XL", "3XL", "4XL", "5XL"];

  const filtradas = useMemo(() => {
    const hoy = new Date();
    const hace7Dias = new Date(); hace7Dias.setDate(hoy.getDate() - 7);

    return prendas.filter(p => {
      const q = busqueda.toLowerCase();
      const coincideTexto = (p.descripcion || "").toLowerCase().includes(q) || (p.codigo || "").toLowerCase().includes(q);

      let coincideFecha = true;
      if (filtroTiempo !== "todo") {
        const fechaRef = p.fechaEdicion || p.fechaIngreso;
        if (!fechaRef) coincideFecha = false; 
        else {
          const d = new Date(fechaRef);
          if (filtroTiempo === "hoy") coincideFecha = d.toDateString() === hoy.toDateString();
          else if (filtroTiempo === "semana") coincideFecha = d >= hace7Dias;
          else if (filtroTiempo === "mes") coincideFecha = d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
        }
      }
      return coincideTexto && coincideFecha;
    });
  }, [prendas, busqueda, filtroTiempo]);

  const showToast = (msg, tipo = "ok") => { setToast({msg, tipo}); setTimeout(() => setToast(null), 3000); };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    if (form.imagenes.length + files.length > 4) return showToast("⚠️ Máximo 4 fotos por prenda", "warn");

    const nuevasImagenes = [];
    for (let file of files) {
      if (file.size > 2 * 1024 * 1024) {
        showToast(`⚠️ Una imagen supera los 2MB, fue omitida.`, "warn");
        continue;
      }
      try {
        const base64Img = await comprimirImagen(file);
        nuevasImagenes.push(base64Img);
      } catch (err) { showToast("Error procesando imagen", "danger"); }
    }
    setForm({ ...form, imagenes: [...form.imagenes, ...nuevasImagenes] });
  };

  const eliminarFoto = (index) => {
    const nuevas = [...form.imagenes];
    nuevas.splice(index, 1);
    setForm({ ...form, imagenes: nuevas });
  };

  const generarCodigo = (categoria) => {
    const prefijo = `${categoria.substring(0,3).toUpperCase()}`;
    let maxNum = 0;
    prendas.forEach(p => {
      if (p.codigo && p.codigo.startsWith(prefijo)) {
        const parts = p.codigo.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    return `${prefijo}-${String(maxNum + 1).padStart(3, '0')}`;
  };

  const guardar = async () => {
    if (!form.descripcion || !form.precioVenta || !form.costoCompra) return showToast("⚠️ Llena todos los campos clave", "warn");
    
    const stockPorTallaObj = {};
    let totalStockForm = 0;
    let tieneTallas = false;

    Object.keys(form.tallas).forEach(k => {
      if (form.tallas[k] !== "") {
        const val = Number(form.tallas[k]);
        stockPorTallaObj[k] = val;
        totalStockForm += val;
        tieneTallas = true;
      }
    });

    if (!tieneTallas) return showToast("⚠️ Ingresa el stock de al menos una talla", "warn");

    const codigoFinal = editandoId ? form.codigo : generarCodigo(form.categoria);
    
    const cNum = Number(form.costoCompra) || 0;
    const pNum = Number(form.precioVenta) || 0;
    let porcGananciaFinal = 0;
    if (cNum > 0) {
      porcGananciaFinal = ((pNum - cNum) / cNum) * 100;
    } else if (pNum > 0) {
      porcGananciaFinal = 100;
    }

    const datosGuardar = {
      codigo: codigoFinal, 
      descripcion: form.descripcion, 
      stockPorTalla: stockPorTallaObj,
      stock: totalStockForm, 
      stockMinimo: Number(form.stockMinimo) || 1,
      costoCompra: cNum, 
      precioVenta: pNum,
      porcentajeGanancia: porcGananciaFinal, 
      categoria: form.categoria, 
      imagen: form.imagenes.length > 0 ? form.imagenes[0] : "", 
      imagenes: form.imagenes, 
      talla: "Varias" 
    };

    try {
      if (editandoId) {
        datosGuardar.fechaEdicion = new Date().toISOString();
        if (form.fechaIngreso) datosGuardar.fechaIngreso = form.fechaIngreso;
        await updateDoc(doc(db, "prendas", editandoId), datosGuardar);
        setPrendas(p => p.map(pr => pr.id === editandoId ? { id: editandoId, ...datosGuardar } : pr));
        showToast("✅ Prenda actualizada");
      } else {
        datosGuardar.fechaIngreso = new Date().toISOString();
        const docRef = await addDoc(collection(db, "prendas"), datosGuardar);
        setPrendas(p => [{ id: docRef.id, ...datosGuardar }, ...p]);
        showToast(`✅ Prenda guardada: ${codigoFinal}`);
      }
      setForm(formBase); setEditandoId(null); setMostrarForm(false);
    } catch (error) { showToast("❌ Error al guardar", "danger"); }
  };

  const confirmarEliminar = async () => {
    if (!prendaAEliminar) return;
    try {
      await deleteDoc(doc(db, "prendas", prendaAEliminar.id));
      setPrendas(p => p.filter(pr => pr.id !== prendaAEliminar.id));
      setPrendaAEliminar(null); showToast("🗑️ Prenda eliminada");
    } catch (error) { showToast("❌ Error al eliminar", "danger"); }
  };

  const abrirEdicion = (p) => {
    // Inicializamos con el nuevo set de tallas
    let tallasForm = { "XS": "", "S": "", "M": "", "L": "", "XL": "", "0XL": "", "1XL": "", "2XL": "", "3XL": "", "4XL": "", "5XL": "" };
    if (p.stockPorTalla) {
      Object.keys(p.stockPorTalla).forEach(k => {
        // Asegurarse de mapear solo si la talla existe en el nuevo formato
        if(tallasForm[k] !== undefined) tallasForm[k] = String(p.stockPorTalla[k]);
      });
    } else if (p.talla && tallasForm[p.talla] !== undefined) {
      tallasForm[p.talla] = String(p.stock);
    }

    const imgsRecuperadas = p.imagenes ? [...p.imagenes] : (p.imagen ? [p.imagen] : []);

    setForm({ 
      ...p, 
      stockMinimo: String(p.stockMinimo || 1), 
      costoCompra: String(p.costoCompra),
      precioVenta: String(p.precioVenta),  
      tallas: tallasForm,
      imagenes: imgsRecuperadas
    });
    setEditandoId(p.id); setMostrarForm(true); window.scrollTo(0,0);
  };

  const cForm = Number(form.costoCompra) || 0;
  const pForm = Number(form.precioVenta) || 0;
  let gananciaCalculada = 0;
  if (cForm > 0) gananciaCalculada = ((pForm - cForm) / cForm) * 100;
  else if (pForm > 0) gananciaCalculada = 100;
  const gananciaDinero = pForm - cForm;

  return (
    <div className="inv-wrapper" style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%", maxWidth: "100%", boxSizing: "border-box", overflowX: "hidden" }}>
      
      <style>{`
        .inv-wrapper * { box-sizing: border-box !important; }
        
        .grid-prendas { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; width: 100%; } 
        @media (min-width: 768px) { .grid-prendas { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); } }
        
        .grid-tallas { display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap: 8px; width: 100%; }
        .grid-precios { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; }

        .img-zoom-container {
          transition: all 0.35s cubic-bezier(0.165, 0.84, 0.44, 1); 
          transform-origin: center left; 
          position: relative;
          z-index: 10; 
          cursor: pointer;
          overflow: visible !important; 
        }
        .img-zoom-container img { transition: transform 0.35s ease; backface-visibility: hidden; }
        .img-zoom-container:hover {
          transform: scale(1.04) translateY(-1px);
          z-index: 9999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.12);
          border-radius: 10px !important;
          border: 1px solid rgba(0,0,0,0.05);
        }
        @media (min-width: 768px) {
          .img-zoom-container:hover {
            transform: scale(1.08) translateY(-2px);
          }
        }
        
        .upload-mini-btn {
          width: 60px; height: 60px; border-radius: 12px; background: var(--creme); border: 2px dashed var(--border);
          display: flex; align-items: center; justify-content: center; color: var(--mid); cursor: pointer; flex-shrink: 0;
        }
      `}</style>
      
      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: toast.tipo === "ok" ? "var(--dark)" : toast.tipo === "warn" ? "var(--warn)" : "var(--danger)", color: "var(--white)", padding: "10px 20px", borderRadius: 100, fontSize: 13, zIndex: 9999, boxShadow: "var(--shadow-lg)" }}>{toast.msg}</div>}

      {mostrarImportar && (
        <ImportarFactura
          onBorradorCreado={() => { setMostrarImportar(false); setMostrarBorradores(true); }}
          onClose={() => setMostrarImportar(false)}
        />
      )}

      {prendaAEliminar && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="animate" style={{ background: "white", padding: 30, borderRadius: 24, width: "90%", maxWidth: 340, textAlign: "center", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ background: "#FFEBEE", width: 60, height: 60, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "var(--danger)" }}><Icon name="trash" size={28} /></div>
            <h3 style={{ fontSize: 18, fontFamily: "'Fraunces', serif", color: "var(--dark)", marginBottom: 8 }}>¿Eliminar Prenda?</h3>
            <p style={{ fontSize: 13, color: "var(--mid)", marginBottom: 24 }}>Borrarás permanentemente <strong>{prendaAEliminar.codigo}</strong> y todo su stock por tallas.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setPrendaAEliminar(null)} style={{ flex: 1, background: "var(--border)", color: "var(--dark)", border: "none", padding: "12px", borderRadius: 12, fontWeight: 600 }}>Cancelar</button>
              <button onClick={confirmarEliminar} style={{ flex: 1, background: "var(--danger)", color: "white", border: "none", padding: "12px", borderRadius: 12, fontWeight: 600 }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* BARRA SUPERIOR */}
      <div className="no-print" style={{ background: "var(--white)", borderRadius: 20, padding: "20px", border: "1px solid var(--border)", boxShadow: "var(--shadow)", width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          
          <div style={{ position: "relative", flex: "1 1 200px", minWidth: 0 }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--mid)" }}><Icon name="search" size={16} /></span>
            <input placeholder="Buscar prenda o código..." value={busqueda} onChange={e => setBusqueda(e.target.value)} disabled={mostrarForm} style={{ paddingLeft: 40, width: "100%", background: "var(--creme)", border: "none" }} />
          </div>

          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none", opacity: mostrarForm ? 0.4 : 1, pointerEvents: mostrarForm ? "none" : "auto", flex: "1 1 auto", minWidth: 0 }}>
            {[ { id: "hoy", label: "Hoy" }, { id: "semana", label: "7 Días" }, { id: "mes", label: "Este Mes" }, { id: "todo", label: "Todas" } ].map(f => (
              <button 
                key={f.id} 
                onClick={() => setFiltroTiempo(f.id)} 
                style={{ 
                  background: filtroTiempo === f.id ? "var(--dark)" : "var(--creme)", 
                  color: filtroTiempo === f.id ? "white" : "var(--dark)", 
                  border: filtroTiempo === f.id ? "1px solid var(--dark)" : "1px solid transparent", 
                  padding: "6px 14px", 
                  borderRadius: 50, 
                  fontSize: 12, 
                  fontWeight: 600, 
                  whiteSpace: "nowrap", 
                  transition: "all 0.2s", 
                  cursor: "pointer" 
                }}>
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={() => setMostrarImportar(true)} style={{ background: "var(--creme)", color: "var(--rosa-deep)", border: "1.5px solid var(--rosa-soft)", borderRadius: 50, padding: "8px 16px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
              🧾 Importar Factura
            </button>
            <button onClick={() => { setMostrarForm(!mostrarForm); if(mostrarForm) { setEditandoId(null); setForm(formBase); } }} style={{ background: mostrarForm ? "var(--mid)" : "linear-gradient(135deg, var(--rosa-deep), var(--rosa))", color: "var(--white)", border: "none", borderRadius: 50, padding: "8px 20px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap" }}>
              {mostrarForm ? <><Icon name="close" size={16} /> Cancelar</> : <><Icon name="plus" size={16} /> Agregar Prenda</>}
            </button>
          </div>
        </div>
      </div>

      {/* COLA DE BORRADORES */}
      {mostrarBorradores && (
        <div className="animate" style={{ background: "var(--white)", borderRadius: 20, padding: 20, border: "1.5px solid var(--warn)", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 12, background: "#FFF3E0", color: "var(--warn)", padding: "4px 12px", borderRadius: 20, fontWeight: 700 }}>🧾 Cola de Revisión IA</span>
            <button onClick={() => setMostrarBorradores(false)} style={{ background: "transparent", border: "none", color: "var(--mid)", fontSize: 18, cursor: "pointer" }}>×</button>
          </div>
          <ColaBorradores setPrendas={setPrendas} onCerrar={() => setMostrarBorradores(false)} />
        </div>
      )}

      {/* FORMULARIO DE INVENTARIO */}
      {mostrarForm && (
        <div className="animate" style={{ background: "var(--white)", borderRadius: 20, padding: "20px", boxShadow: "var(--shadow)", border: "1.5px solid var(--rosa-soft)", width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 700, color: "var(--rosa-deep)", margin: 0 }}>{editandoId ? `Editando: ${form.codigo}` : "Nueva prenda"}</p>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--mid)", background: "var(--creme)", padding: "4px 10px", borderRadius: 50, whiteSpace: "nowrap" }}>{form.imagenes.length} / 4 fotos</span>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", minWidth: 0 }}>
            
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "none", width: "100%", maxWidth: "100%" }}>
              {form.imagenes.map((img, idx) => (
                <div key={idx} style={{ position: "relative", width: 60, height: 60, borderRadius: 12, overflow: "hidden", flexShrink: 0, border: "1px solid var(--border)" }}>
                  <img src={img} alt={`foto ${idx}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button onClick={() => eliminarFoto(idx)} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", color: "white", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>✕</button>
                  {idx === 0 && <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "var(--rosa-deep)", color: "white", fontSize: 8, textAlign: "center", padding: "2px 0", fontWeight: "bold" }}>Principal</span>}
                </div>
              ))}
              
              {form.imagenes.length < 4 && (
                <label className="upload-mini-btn">
                  <Icon name="plus" size={20} />
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: "none" }} />
                </label>
              )}
            </div>

            <div style={{ width: "100%" }}>
              <label style={{fontSize: 11, color: 'var(--mid)', paddingLeft: 4}}>Descripción de la Prenda</label>
              <input value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} style={{width: "100%"}} />
            </div>
            
            <div className="grid-precios">
              <div style={{ width: "100%" }}>
                <label style={{fontSize: 11, color: 'var(--mid)', paddingLeft: 4}}>Categoría</label>
                {/* 2. Añadido "Camiseta" al listado de categorías */}
                <select value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} style={{width: "100%"}}>
                  {["Blusa", "Camiseta", "Pantalón", "Vestido", "Conjunto", "Falda", "Cardigan", "Short", "Otro"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ width: "100%" }}>
                <label style={{fontSize: 11, color: 'var(--mid)', paddingLeft: 4}}>Alerta Mínimos</label>
                <input type="number" value={form.stockMinimo} onChange={e => setForm({...form, stockMinimo: e.target.value})} style={{width: "100%"}} />
              </div>
            </div>

            <div style={{ background: "var(--creme)", padding: "16px", borderRadius: 12, width: "100%" }}>
              <label style={{fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 12, display: "block"}}>Ingresa el Stock por Talla</label>
              <div className="grid-tallas">
                 {/* 3. Mapeo de inputs con el nuevo orden de tallas */}
                 {ordenTallas.map(t => (
                    <div key={t} style={{display: "flex", flexDirection: "column", gap: 4, width: "100%"}}>
                      <label style={{fontSize: 11, color: "var(--mid)", textAlign: "center", fontWeight: 600}}>{t}</label>
                      <input type="number" min="0" placeholder="0" value={form.tallas[t]} onChange={e => setForm({...form, tallas: {...form.tallas, [t]: e.target.value}})} style={{textAlign: "center", padding: "8px 0", width: "100%"}} />
                    </div>
                 ))}
              </div>
            </div>

            <div style={{ background: "#FDF5F6", padding: 16, borderRadius: 12, width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="grid-precios">
                <div style={{ width: "100%" }}>
                  <label style={{fontSize: 11, color: 'var(--mid)', paddingLeft: 4}}>Costo ($)</label>
                  <input type="text" value={form.costoCompra ? fmtNum(form.costoCompra) : ""} style={{width: "100%", background: "white"}} onChange={e => setForm({...form, costoCompra: parseNum(e.target.value)})} />
                </div>

                <div style={{ width: "100%" }}>
                  <label style={{fontSize: 11, color: 'var(--rosa-deep)', fontWeight: 600, paddingLeft: 4}}>Precio Venta ($)</label>
                  <input type="text" value={form.precioVenta ? fmtNum(form.precioVenta) : ""} style={{width: "100%", background: "white", borderColor: "var(--rosa-soft)"}} onChange={e => setForm({...form, precioVenta: parseNum(e.target.value)})} />
                </div>
              </div>

              <div style={{ width: "100%", background: "white", padding: "12px", borderRadius: 10, border: `1px dashed ${gananciaCalculada > 0 ? "var(--success)" : "var(--mid)"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{fontSize: 11, color: "var(--mid)", fontWeight: 600}}>Ganancia calculada:</span>
                <div style={{textAlign: "right"}}>
                   <p style={{margin: 0, fontSize: 14, fontWeight: 800, color: gananciaCalculada > 0 ? "var(--success)" : "var(--dark)"}}>
                     {gananciaCalculada.toFixed(0)}%
                   </p>
                   <p style={{margin: 0, fontSize: 10, color: "var(--mid)"}}>Neto: {fmt(gananciaDinero)}</p>
                </div>
              </div>
            </div>

          </div>
          <button onClick={guardar} style={{ marginTop: 20, width: "100%", background: "linear-gradient(135deg, var(--success), #43A047)", color: "var(--white)", border: "none", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 600, display: "flex", justifyContent: "center", gap: 8 }}>
            <Icon name="check" size={16} /> {editandoId ? "Actualizar Inventario" : "Guardar Producto"}
          </button>
        </div>
      )}

      {/* RESULTADOS */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 8px", width: "100%" }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--mid)", margin: 0 }}>{filtradas.length} {filtradas.length === 1 ? 'referencia' : 'referencias'}</p>
      </div>

      <div className="grid-prendas">
        {filtradas.length === 0 && <p style={{ fontSize: 13, color: "var(--mid)", padding: "10px" }}>No hay prendas en este rango.</p>}
        {filtradas.map(p => {
          // 4. Ordenamos las tallas de la tarjeta para que sigan la misma lógica
          const tallasArray = p.stockPorTalla 
            ? Object.entries(p.stockPorTalla).sort((a, b) => ordenTallas.indexOf(a[0]) - ordenTallas.indexOf(b[0]))
            : (p.talla ? [[p.talla, Number(p.stock)]] : []);
            
          const totalStock = tallasArray.reduce((acc, [_, cant]) => acc + Number(cant), 0);
          const fechaMostrar = p.fechaEdicion ? `Act: ${fmtFecha(p.fechaEdicion)}` : p.fechaIngreso ? `Ing: ${fmtFecha(p.fechaIngreso)}` : "Registro antiguo";
          
          const imgMostrar = (p.imagenes && p.imagenes.length > 0) ? p.imagenes[0] : p.imagen;

          return (
            <div key={p.id} className="animate" style={{ background: "var(--white)", borderRadius: 20, padding: "20px", border: "1px solid var(--border)", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column", gap: 16, width: "100%", position: "relative" }}>
              
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", width: "100%" }}>
                
                <div className="img-zoom-container" style={{ width: 64, height: 64, borderRadius: 12, background: "var(--rosa-pale)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  {imgMostrar ? <img src={imgMostrar} alt="Prenda" style={{width:"100%", height:"100%", objectFit:"cover", borderRadius: 12}}/> : <Icon name="image" size={24} color="var(--rosa-deep)"/>}
                  
                  {p.imagenes && p.imagenes.length > 1 && (
                    <div style={{ position: "absolute", bottom: -4, right: -4, background: "var(--dark)", color: "white", padding: "2px 6px", borderRadius: 8, fontSize: 9, fontWeight: 800, border: "2px solid white" }}>
                      +{p.imagenes.length - 1}
                    </div>
                  )}
                </div>
                
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                   <p style={{ 
                     fontSize: 14, fontWeight: 700, color: "var(--dark)", margin: "0 0 4px 0", 
                     display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" 
                   }}>
                     {p.descripcion}
                   </p>
                   <p style={{ fontSize: 11, color: "var(--mid)", margin: "0 0 6px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.categoria} · {p.codigo}</p>
                   <p style={{ fontSize: 18, fontWeight: 800, color: "var(--rosa-deep)", margin: 0 }}>{fmt(p.precioVenta)}</p>
                </div>
              </div>

              <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "var(--mid)", letterSpacing: 1, textTransform: "uppercase", margin: 0 }}>Stock por talla</p>
                  <p style={{ fontSize: 9, color: "var(--mid)", margin: 0, whiteSpace: "nowrap" }}><Icon name="calendar" size={10} /> {fechaMostrar}</p>
                </div>
                
                <div className="grid-tallas">
                   {tallasArray.map(([t, cant]) => {
                      const num = Number(cant);
                      const isAgotada = num === 0;
                      const isWarn = num > 0 && num <= (Number(p.stockMinimo) || 1);
                      
                      const bg = isAgotada ? "#FFEBEE" : (isWarn ? "#FFF8E1" : "#E8F5E9");
                      const col = isAgotada ? "#C62828" : (isWarn ? "#E65100" : "#2E7D32");
                      const brd = isAgotada ? "#FFCDD2" : (isWarn ? "#FFECB3" : "#C8E6C9");
                      const dot = isAgotada ? "#E53935" : (isWarn ? "#FB8C00" : "#43A047");

                      return (
                        <div key={t} style={{ background: bg, border: `1px solid ${brd}`, color: col, padding: "8px 4px", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, position: "relative", width: "100%" }}>
                           <div style={{ width: 6, height: 6, borderRadius: "50%", background: dot, position: "absolute", top: 4, right: 4 }}></div>
                           <span style={{ fontSize: 13, fontWeight: 700 }}>{t}</span>
                           <span style={{ fontSize: 9, fontWeight: 600 }}>{isAgotada ? "Agotada" : `${num} uds`}</span>
                        </div>
                      )
                   })}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "#F9FAFB", borderRadius: 12, width: "100%" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 10, color: "var(--mid)" }}>Total stock</span>
                  <span style={{ fontSize: 13, color: "var(--dark)", fontWeight: 700 }}>{totalStock} uds</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "right", minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: "var(--mid)" }}>Valor inventario</span>
                  <span style={{ fontSize: 13, color: "var(--rosa-deep)", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmt(totalStock * Number(p.precioVenta))}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 16, width: "100%" }}>
                <button onClick={() => abrirEdicion(p)} style={{ flex: 1, background: "var(--white)", color: "var(--rosa-deep)", border: "1px solid var(--rosa-soft)", borderRadius: 12, padding: "10px", fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "center", gap: 6 }}>✏️ Editar</button>
                <button onClick={() => setPrendaAEliminar(p)} style={{ flex: 1, background: "#FFEBEE", color: "var(--danger)", border: "none", borderRadius: 12, padding: "10px", fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "center", gap: 6 }}>🗑️ Eliminar</button>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}