import { useState, useMemo } from "react";
import { db } from "../firebase";
import { collection, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { fmt, fmtNum, parseNum, Icon, Badge, fmtFecha } from "../utils.jsx";

export default function Ventas({ prendas, setPrendas, ventas, setVentas, facturas, setFacturas }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [carrito, setCarrito] = useState([]);
  const [codigoSel, setCodigoSel] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [precioFinal, setPrecioFinal] = useState(""); 
  const [formaPago, setFormaPago] = useState("Efectivo");
  
  const [busqueda, setBusqueda] = useState("");
  const [filtroTiempo, setFiltroTiempo] = useState("todo"); 

  const [toast, setToast] = useState(null);
  const [ultimaVentaPdf, setUltimaVentaPdf] = useState(null);
  const [facturaAEliminar, setFacturaAEliminar] = useState(null);
  const [itemAEliminar, setItemAEliminar] = useState(null); // NUEVO: Para anular una sola prenda

  const prendaSel = prendas.find(p => p.codigo === codigoSel);
  const showToast = (msg, tipo = "ok") => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3000); };

  const facturasCompletas = useMemo(() => {
    const lista = [...facturas];
    const ticketsOficiales = new Set(facturas.map(f => f.ticketId));
    
    const ventasViejas = ventas.filter(v => !ticketsOficiales.has(v.ticketId) && !ticketsOficiales.has(v.id));
    const agrupadas = ventasViejas.reduce((acc, v) => {
      const tId = v.ticketId || v.id;
      if (!acc[tId]) acc[tId] = { id: tId, ticketId: tId, fecha: v.fecha || new Date().toISOString(), formaPago: v.formaPago || "Prueba", total: 0, items: [], esVieja: true };
      acc[tId].items.push({ cantidad: v.cantidad, descripcion: v.descripcion, talla: v.talla, precioFinal: v.precioVenta, codigo: v.codigo });
      acc[tId].total += (Number(v.precioVenta) * Number(v.cantidad));
      return acc;
    }, {});

    return [...lista, ...Object.values(agrupadas)];
  }, [facturas, ventas]);

  const facturasFiltradas = useMemo(() => {
    const hoy = new Date();
    const hace7Dias = new Date(); hace7Dias.setDate(hoy.getDate() - 7);

    return facturasCompletas.filter(f => {
      const q = busqueda.toLowerCase();
      const coincideTexto = (f.ticketId || "").toLowerCase().includes(q) || (f.formaPago || "").toLowerCase().includes(q) || (f.items || []).some(i => (i.descripcion || "").toLowerCase().includes(q));

      let coincideFecha = true;
      if (f.fecha && filtroTiempo !== "todo") {
        const d = new Date(f.fecha);
        if (filtroTiempo === "hoy") coincideFecha = d.toDateString() === hoy.toDateString();
        else if (filtroTiempo === "semana") coincideFecha = d >= hace7Dias;
        else if (filtroTiempo === "mes") coincideFecha = d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
      }
      return coincideTexto && coincideFecha;
    }).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
  }, [facturasCompletas, busqueda, filtroTiempo]);

  const totalFiltrado = facturasFiltradas.reduce((s, f) => s + Number(f.total), 0);

  const handleSelectPrenda = (codigo) => {
    setCodigoSel(codigo);
    const p = prendas.find(pr => pr.codigo === codigo);
    if (p) setPrecioFinal(String(p.precioVenta));
  };

  const agregarAlCarrito = () => {
    if (!prendaSel || cantidad < 1 || precioFinal === "") return showToast("⚠️ Revisa los datos", "warn");
    const yaEnCarrito = carrito.find(item => item.id === prendaSel.id);
    const cantTotal = yaEnCarrito ? yaEnCarrito.cantidad + cantidad : cantidad;
    if (Number(prendaSel.stock) < cantTotal) return showToast("🔴 No hay stock suficiente", "danger");

    if (yaEnCarrito) setCarrito(carrito.map(item => item.id === prendaSel.id ? { ...item, cantidad: cantTotal } : item));
    else setCarrito([...carrito, { ...prendaSel, cantidad, precioFinal: Number(precioFinal) }]);
    
    setCodigoSel(""); setCantidad(1); setPrecioFinal("");
  };

  const totalCarrito = carrito.reduce((sum, item) => sum + (item.precioFinal * item.cantidad), 0);

  const procesarVentaMultiple = async () => {
    if (carrito.length === 0) return;
    const ticketId = `TK-${Date.now()}`;
    const fechaActual = new Date().toISOString();
    let nuevasVentasLocal = [];

    try {
      for (const item of carrito) {
        const nuevaVenta = { ticketId, fecha: fechaActual, formaPago, codigo: item.codigo, descripcion: item.descripcion, talla: item.talla, cantidad: item.cantidad, precioVenta: item.precioFinal, costoCompra: item.costoCompra };
        const ventaRef = await addDoc(collection(db, "ventas"), nuevaVenta);
        nuevasVentasLocal.push({ id: ventaRef.id, ...nuevaVenta });
        
        const prendaRef = doc(db, "prendas", item.id);
        const stockRestante = Number(item.stock) - item.cantidad;
        await updateDoc(prendaRef, { stock: stockRestante });
        setPrendas(p => p.map(pr => pr.id === item.id ? { ...pr, stock: stockRestante } : pr));
      }

      const nuevaFactura = { ticketId, fecha: fechaActual, formaPago, total: totalCarrito, items: carrito.map(i => ({ cantidad: i.cantidad, descripcion: i.descripcion, talla: i.talla, precioFinal: i.precioFinal, codigo: i.codigo })) };
      const facRef = await addDoc(collection(db, "facturas"), nuevaFactura);
      
      setFacturas(f => [{ id: facRef.id, ...nuevaFactura }, ...f]);
      setVentas(v => [...nuevasVentasLocal, ...v]);
      setUltimaVentaPdf({ ...nuevaFactura }); 
      setCarrito([]); setMostrarForm(false);
      showToast(`✅ Venta procesada`);
      setTimeout(() => window.print(), 300); 

    } catch (error) { showToast("❌ Error al procesar", "danger"); }
  };

  const reImprimir = (factura) => {
    setUltimaVentaPdf(factura);
    setTimeout(() => window.print(), 100); 
  };

  const confirmarEliminarVenta = async () => {
    if (!facturaAEliminar) return;
    try {
      const prendasRestauradas = [...prendas];
      for (const item of facturaAEliminar.items) {
        const p = prendasRestauradas.find(pr => pr.codigo === item.codigo || pr.descripcion === item.descripcion);
        if (p && item.cantidad) {
          const nuevoStock = Number(p.stock) + Number(item.cantidad);
          await updateDoc(doc(db, "prendas", p.id), { stock: nuevoStock });
          p.stock = nuevoStock; 
        }
      }
      setPrendas(prendasRestauradas);

      if (!facturaAEliminar.esVieja) {
        await deleteDoc(doc(db, "facturas", facturaAEliminar.id));
        setFacturas(f => f.filter(x => x.id !== facturaAEliminar.id));
      }

      const ventasABorrar = ventas.filter(v => v.ticketId === facturaAEliminar.ticketId || v.id === facturaAEliminar.ticketId);
      for (const v of ventasABorrar) {
        await deleteDoc(doc(db, "ventas", v.id));
      }
      setVentas(v => v.filter(x => x.ticketId !== facturaAEliminar.ticketId && x.id !== facturaAEliminar.ticketId));

      setFacturaAEliminar(null);
      showToast("🗑️ Venta eliminada y stock restaurado");
    } catch (err) { showToast("❌ Error al eliminar", "danger"); }
  };

  // NUEVO: Lógica de anulación parcial
  const confirmarEliminarItem = async () => {
    if (!itemAEliminar) return;
    const { factura, index, item } = itemAEliminar;

    try {
      // 1. Restaurar stock de esa prenda
      const p = prendas.find(pr => pr.codigo === item.codigo || pr.descripcion === item.descripcion);
      if (p) {
        const nuevoStock = Number(p.stock) + Number(item.cantidad);
        await updateDoc(doc(db, "prendas", p.id), { stock: nuevoStock });
        setPrendas(prev => prev.map(x => x.id === p.id ? { ...x, stock: nuevoStock } : x));
      }

      // 2. Eliminar el registro individual de "ventas"
      const ventaDoc = ventas.find(v => (v.ticketId === factura.ticketId || v.id === factura.ticketId) && (v.codigo === item.codigo || v.descripcion === item.descripcion));
      if (ventaDoc) {
        await deleteDoc(doc(db, "ventas", ventaDoc.id));
        setVentas(prev => prev.filter(v => v.id !== ventaDoc.id));
      }

      // 3. Recalcular la Factura Oficial
      if (!factura.esVieja) {
        const nuevosItems = factura.items.filter((_, i) => i !== index);
        if (nuevosItems.length === 0) {
          // Si quitó la última prenda, borramos la factura completa
          await deleteDoc(doc(db, "facturas", factura.id));
          setFacturas(prev => prev.filter(f => f.id !== factura.id));
        } else {
          // Si aún quedan prendas, actualizamos el nuevo total
          const nuevoTotal = nuevosItems.reduce((acc, i) => acc + (i.cantidad * i.precioFinal), 0);
          await updateDoc(doc(db, "facturas", factura.id), { items: nuevosItems, total: nuevoTotal });
          setFacturas(prev => prev.map(f => f.id === factura.id ? { ...f, items: nuevosItems, total: nuevoTotal } : f));
        }
      }

      setItemAEliminar(null);
      showToast("✅ Prenda anulada y stock devuelto");
    } catch (err) { showToast("❌ Error al anular prenda", "danger"); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: toast.tipo === "ok" ? "var(--dark)" : toast.tipo === "warn" ? "var(--warn)" : "var(--danger)", color: "var(--white)", padding: "10px 20px", borderRadius: 100, fontSize: 13, zIndex: 9999, boxShadow: "var(--shadow-lg)" }}>{toast.msg}</div>}

      {/* MODAL ELIMINAR FACTURA COMPLETA */}
      {facturaAEliminar && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="animate" style={{ background: "white", padding: 30, borderRadius: 24, width: "90%", maxWidth: 360, textAlign: "center", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ background: "#FFEBEE", width: 60, height: 60, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "var(--danger)" }}><Icon name="trash" size={28} /></div>
            <h3 style={{ fontSize: 18, fontFamily: "'Fraunces', serif", color: "var(--dark)", marginBottom: 8 }}>¿Anular Venta Completa?</h3>
            <p style={{ fontSize: 13, color: "var(--mid)", marginBottom: 24 }}>Se eliminará todo el recibo <strong>{facturaAEliminar.ticketId.substring(facturaAEliminar.ticketId.length - 6)}</strong> y el stock volverá automáticamente.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setFacturaAEliminar(null)} style={{ flex: 1, background: "var(--border)", color: "var(--dark)", border: "none", padding: "12px", borderRadius: 12, fontWeight: 600 }}>Cancelar</button>
              <button onClick={confirmarEliminarVenta} style={{ flex: 1, background: "var(--danger)", color: "white", border: "none", padding: "12px", borderRadius: 12, fontWeight: 600 }}>Anular Todo</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ANULAR ITEM ESPECÍFICO */}
      {itemAEliminar && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="animate" style={{ background: "white", padding: 30, borderRadius: 24, width: "90%", maxWidth: 360, textAlign: "center", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ background: "#FFF3E0", width: 60, height: 60, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "var(--warn)" }}><Icon name="alert" size={28} /></div>
            <h3 style={{ fontSize: 18, fontFamily: "'Fraunces', serif", color: "var(--dark)", marginBottom: 8 }}>¿Anular solo esta prenda?</h3>
            <p style={{ fontSize: 13, color: "var(--mid)", marginBottom: 24 }}>Se quitará <strong>{itemAEliminar.item.descripcion}</strong> de la factura y su stock regresará al inventario. La factura se recalculará.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setItemAEliminar(null)} style={{ flex: 1, background: "var(--border)", color: "var(--dark)", border: "none", padding: "12px", borderRadius: 12, fontWeight: 600 }}>Cancelar</button>
              <button onClick={confirmarEliminarItem} style={{ flex: 1, background: "var(--warn)", color: "white", border: "none", padding: "12px", borderRadius: 12, fontWeight: 600 }}>Quitar Prenda</button>
            </div>
          </div>
        </div>
      )}

      {/* BLOQUE IMPRIMIR */}
      {ultimaVentaPdf && (
        <div id="recibo-imprimible" className="print-only">
          <h2 style={{ textAlign: "center", borderBottom: "1px dashed black", paddingBottom: 10 }}>CURVY.VUP</h2>
          <p><strong>Recibo:</strong> {ultimaVentaPdf.ticketId}</p>
          <p><strong>Fecha:</strong> {new Date(ultimaVentaPdf.fecha).toLocaleString('es-CO')}</p>
          <p><strong>Método:</strong> {ultimaVentaPdf.formaPago}</p>
          <table style={{ width: "100%", marginTop: 20, textAlign: "left", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid black" }}><th>Cant</th><th>Descripción</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>
              {ultimaVentaPdf.items.map((i, idx) => (
                <tr key={idx}><td style={{padding:"8px 0"}}>{i.cantidad}</td><td>{i.descripcion} {i.talla ? `(${i.talla})` : ''}</td><td style={{ textAlign: "right" }}>{fmt(i.precioFinal * i.cantidad)}</td></tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ textAlign: "right", marginTop: 20, borderTop: "1px dashed black", paddingTop: 10 }}>TOTAL: {fmt(ultimaVentaPdf.total)}</h3>
          <p style={{ textAlign: "center", marginTop: 40 }}>¡Gracias por tu compra, hermosa! 💕</p>
        </div>
      )}

      {/* BARRA SUPERIOR ELEGANTE */}
      <div className="no-print" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: 'center', background: "var(--white)", padding: "16px 20px", borderRadius: 20, boxShadow: "var(--shadow)" }}>
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--mid)" }}><Icon name="search" size={16} /></span>
          <input placeholder="Buscar factura o prenda..." value={busqueda} onChange={e => setBusqueda(e.target.value)} disabled={mostrarForm} style={{ paddingLeft: 40 }} />
        </div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none", opacity: mostrarForm ? 0.4 : 1, pointerEvents: mostrarForm ? "none" : "auto" }}>
          {[{ id: "hoy", label: "Hoy" }, { id: "semana", label: "7 Días" }, { id: "mes", label: "Este Mes" }, { id: "todo", label: "Todas" }].map(f => (
            <button key={f.id} onClick={() => setFiltroTiempo(f.id)} style={{ background: filtroTiempo === f.id ? "var(--dark)" : "var(--creme)", color: filtroTiempo === f.id ? "white" : "var(--mid)", border: filtroTiempo === f.id ? "1px solid var(--dark)" : "1px solid var(--border)", padding: "8px 16px", borderRadius: 50, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", transition: "all 0.2s" }}>{f.label}</button>
          ))}
        </div>
        <button onClick={() => { setMostrarForm(!mostrarForm); setCarrito([]); }} style={{ background: mostrarForm ? "var(--mid)" : "linear-gradient(135deg, var(--rosa-deep), var(--rosa))", color: "var(--white)", border: "none", borderRadius: 14, padding: "13px 20px", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flex: "0 1 auto", whiteSpace: "nowrap", marginLeft: "auto" }}>
          {mostrarForm ? <><Icon name="close" size={16} /> Cancelar</> : <><Icon name="plus" size={16} /> Nueva Venta</>}
        </button>
      </div>

      {!mostrarForm ? (
        <div className="animate no-print" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 8px" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--mid)" }}>{facturasFiltradas.length} {facturasFiltradas.length === 1 ? 'registro' : 'registros'}</p>
            <Badge variant="success">Total: {fmt(totalFiltrado)}</Badge>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {facturasFiltradas.length === 0 && <p style={{ fontSize: 13, color: "var(--mid)", padding: "10px" }}>No hay ventas en este filtro.</p>}
            
            {facturasFiltradas.map(f => (
              <div key={f.id} style={{ background: "var(--white)", borderRadius: 16, padding: "18px", boxShadow: "var(--shadow)", border: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px dashed var(--border)", paddingBottom: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)" }}>Factura {f.ticketId.substring(f.ticketId.length - 6)}</p>
                      {f.esVieja && <span style={{fontSize: 9, background: "#FFF3E0", color: "var(--warn)", padding: "2px 6px", borderRadius: 4, fontWeight: 700}}>PRUEBA/ANTIGUA</span>}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>{fmtFecha(f.fecha)} · {new Date(f.fecha).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'})}</p>
                  </div>
                  <Badge variant="default">{f.formaPago}</Badge>
                </div>
                
                <div style={{ fontSize: 12, color: "var(--mid)", flex: 1 }}>
                  {f.items.map((item, idx) => (
                    <div key={idx} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
                      <span>{item.cantidad}x {item.descripcion} {item.talla ? `(${item.talla})` : ''}</span>
                      {/* BOTÓN CRUZ PARA ANULAR UNA SOLA PRENDA */}
                      <button onClick={() => setItemAEliminar({ factura: f, index: idx, item })} style={{ background: "transparent", border: "none", color: "var(--danger)", padding: "2px 6px", cursor: "pointer", fontSize: 16, fontWeight: "bold" }}>×</button>
                    </div>
                  ))}
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "var(--rosa-deep)" }}>{fmt(f.total)}</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setFacturaAEliminar(f)} style={{ background: "#FFEBEE", color: "var(--danger)", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      🗑️ Anular Todo
                    </button>
                    <button onClick={() => reImprimir(f)} style={{ background: "var(--creme)", color: "var(--dark)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      📄 Imprimir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      ) : (
        <div className="animate no-print" style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 600, background: "var(--white)", borderRadius: 20, padding: "24px", boxShadow: "var(--shadow)", border: "1.5px solid var(--rosa-soft)" }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 700, color: "var(--rosa-deep)", marginBottom: 20 }}>Facturar Productos</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <select value={codigoSel} onChange={e => handleSelectPrenda(e.target.value)}>
                <option value="">— Selecciona prenda para el carrito —</option>
                {prendas.filter(p => Number(p.stock) > 0).map(p => (
                  <option key={p.id} value={p.codigo}>{p.descripcion} · Talla: {p.talla} · Stock: {fmtNum(p.stock)}</option>
                ))}
              </select>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div><label style={{ fontSize: 11, color: "var(--mid)", marginLeft: 4 }}>Cantidad</label><input type="number" min="1" value={cantidad} onChange={e => setCantidad(parseInt(e.target.value) || 1)} /></div>
                <div><label style={{ fontSize: 11, color: "var(--mid)", marginLeft: 4 }}>Precio Final c/u ($)</label><input type="text" value={precioFinal ? fmtNum(precioFinal) : ""} onChange={e => setPrecioFinal(parseNum(e.target.value))} /></div>
              </div>
              
              <button onClick={agregarAlCarrito} style={{ background: "var(--rosa-pale)", color: "var(--rosa-deep)", border: "1px dashed var(--rosa)", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 600 }}>+ Añadir al carrito</button>
            </div>

            {carrito.length > 0 && (
              <div className="animate" style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🛒 Carrito de Compras</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {carrito.map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--creme)", padding: "12px", borderRadius: 12 }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{item.descripcion} ({item.talla})</p>
                        <p style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>{item.cantidad} x {fmt(item.precioFinal)}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <strong style={{ fontSize: 14, color: "var(--dark)" }}>{fmt(item.cantidad * item.precioFinal)}</strong> 
                        <button onClick={()=>setCarrito(carrito.filter(c => c.id !== item.id))} style={{background:"transparent", border:"none", color:"var(--danger)", padding: 4}}>❌</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20 }}>
                  <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: "var(--mid)", marginLeft: 4 }}>Método de pago</label><select value={formaPago} onChange={e => setFormaPago(e.target.value)} style={{ marginTop: 2 }}>{["Efectivo","Nequi","Daviplata","Transfiya","Tarjeta"].map(f => <option key={f}>{f}</option>)}</select></div>
                  <button onClick={procesarVentaMultiple} style={{ flex: 1.5, background: "linear-gradient(135deg, var(--success), #43A047)", color: "white", border: "none", borderRadius: 12, padding: "14px", fontWeight: 700, fontSize: 15, alignSelf: "flex-end" }}>Cobrar {fmt(totalCarrito)}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}