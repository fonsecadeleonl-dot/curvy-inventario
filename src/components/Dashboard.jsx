import { useState, useMemo, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";
import { fmt, fmtNum, StatCard, Badge, Icon } from "../utils.jsx";

const CustomLineChart = ({ data }) => {
  if (!data || data.length === 0) return <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mid)", fontSize: 13 }}>No hay datos en este periodo</div>;
  const chartData = data.length === 1 ? [{ label: "", value: data[0].value }, data[0], { label: "", value: data[0].value }] : data;
  const maxVal = Math.max(...chartData.map(d => d.value), 100);
  const height = 140;
  const paddingY = 10;
  const points = chartData.map((d, i) => {
    const x = chartData.length > 1 ? (i / (chartData.length - 1)) * 100 : 50;
    const y = height - paddingY - ((d.value / maxVal) * (height - paddingY * 2));
    return `${x}%,${y}`;
  }).join(" ");
  return (
    <div style={{ position: "relative", height: 170, width: "100%", marginTop: 20 }}>
      <svg width="100%" height={height} style={{ overflow: "visible" }}>
        <polyline points={points} fill="none" stroke="var(--rosa-deep)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {chartData.map((d, i) => {
          const x = chartData.length > 1 ? `${(i / (chartData.length - 1)) * 100}%` : "50%";
          const y = height - paddingY - ((d.value / maxVal) * (height - paddingY * 2));
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="5" fill="var(--white)" stroke="var(--rosa-deep)" strokeWidth="2" />
              <title>{d.label ? `${d.label}: ` : ""}{fmt(d.value)}</title>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", position: "absolute", bottom: 0, left: 0, right: 0 }}>
        {chartData.map((d, i) => {
          const showLabel = chartData.length <= 7 || i % Math.ceil(chartData.length / 5) === 0 || i === chartData.length - 1;
          return (
            <span key={i} style={{ fontSize: 10, color: "var(--mid)", fontWeight: 600, opacity: showLabel ? 1 : 0, textAlign: "center", width: "30px", marginLeft: "-15px" }}>
              {showLabel ? d.label : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const MiniBar = ({ label, value, max, color = "var(--rosa)" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
    <span style={{ fontSize: 11, color: "var(--mid)", minWidth: 36, textAlign: "right" }}>{label}</span>
    <div style={{ flex: 1, height: 8, background: "var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ width: `${max > 0 ? Math.round((value / max) * 100) : 0}%`, height: "100%", background: color, borderRadius: 8, transition: "width 0.5s ease" }} />
    </div>
    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--dark)", minWidth: 28 }}>{value}</span>
  </div>
);

export default function Dashboard({ prendas, ventas, facturas = [] }) {
  const [filtroTiempo, setFiltroTiempo] = useState("semana");
  const [notas, setNotas] = useState([]);
  const [notaTexto, setNotaTexto] = useState("");
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [notaError, setNotaError] = useState("");

  useEffect(() => {
    getDocs(collection(db, "notas"))
      .then(snap => {
        setNotas(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
      })
      .catch(err => setNotaError("Error cargando notas: " + err.message));
  }, []);

  const guardarNota = async () => {
    const texto = notaTexto.trim();
    if (!texto) return;
    setGuardandoNota(true);
    setNotaError("");
    try {
      const nueva = { texto, fecha: new Date().toISOString() };
      const ref = await addDoc(collection(db, "notas"), nueva);
      setNotas(n => [{ id: ref.id, ...nueva }, ...n]);
      setNotaTexto("");
    } catch (err) {
      setNotaError("Error al guardar: " + err.message);
    } finally { setGuardandoNota(false); }
  };

  const eliminarNota = async (id) => {
    await deleteDoc(doc(db, "notas", id));
    setNotas(n => n.filter(x => x.id !== id));
  };

  const ticketsCredito = new Set(
    facturas.filter(f => f.formaPago === "Crédito" && f.estadoCredito === "abierto").map(f => f.ticketId)
  );
  const ventasSinCredito = ventas.filter(v => !ticketsCredito.has(v.ticketId));

  const hoy = new Date();
  const hace7Dias = new Date(); hace7Dias.setDate(hoy.getDate() - 7);
  const mesAnterior = new Date(); mesAnterior.setMonth(hoy.getMonth() - 1);

  const ventasMesActual = ventasSinCredito.filter(v => {
    if (!v.fecha) return false;
    const d = new Date(v.fecha);
    return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
  });

  const ventasMesAnterior = ventasSinCredito.filter(v => {
    if (!v.fecha) return false;
    const d = new Date(v.fecha);
    return d.getMonth() === mesAnterior.getMonth() && d.getFullYear() === mesAnterior.getFullYear();
  });

  const ventasSemana = ventasSinCredito.filter(v => v.fecha && new Date(v.fecha) >= hace7Dias);

  const ingresosMes = ventasMesActual.reduce((s, v) => s + Number(v.precioVenta) * Number(v.cantidad), 0);
  const costosMes = ventasMesActual.reduce((s, v) => s + Number(v.costoCompra) * Number(v.cantidad), 0);
  const gananciasMes = ingresosMes - costosMes;
  const rentabilidad = ingresosMes > 0 ? Math.round((gananciasMes / ingresosMes) * 100) : 0;
  const ingresosMesAnterior = ventasMesAnterior.reduce((s, v) => s + Number(v.precioVenta) * Number(v.cantidad), 0);
  let crecimiento = 0;
  if (ingresosMesAnterior > 0) crecimiento = Math.round(((ingresosMes - ingresosMesAnterior) / ingresosMesAnterior) * 100);
  else if (ingresosMes > 0) crecimiento = 100;

  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diasTranscurridos = hoy.getDate() || 1;
  const proyeccion = Math.round((ingresosMes / diasTranscurridos) * diasMes);

  // Ticket promedio (por ticket único)
  const ticketsUnicos = new Set(ventasMesActual.map(v => v.ticketId)).size;
  const ticketPromedio = ticketsUnicos > 0 ? Math.round(ingresosMes / ticketsUnicos) : 0;

  // Créditos pendientes
  const creditosPendientes = facturas.filter(f => f.formaPago === "Crédito" && f.estadoCredito === "abierto").reduce((s, f) => s + Number(f.total), 0);
  const numCreditosPendientes = facturas.filter(f => f.formaPago === "Crédito" && f.estadoCredito === "abierto").length;

  // Días activos este mes
  const diasActivos = new Set(ventasMesActual.map(v => new Date(v.fecha).toDateString())).size;

  // Tallas más vendidas este mes
  const tallasCount = ventasMesActual.reduce((acc, v) => {
    if (v.talla) acc[v.talla] = (acc[v.talla] || 0) + Number(v.cantidad);
    return acc;
  }, {});
  const ordenTallas = ["XS", "S", "M", "L", "XL", "0XL", "1XL", "2XL", "3XL", "4XL", "5XL"];
  const tallasOrdenadas = Object.entries(tallasCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxTalla = tallasOrdenadas[0]?.[1] || 1;

  // Categoría más vendida
  const catCount = ventasMesActual.reduce((acc, v) => {
    const p = prendas.find(pr => pr.codigo === v.codigo);
    const cat = p?.categoria || "Sin categoría";
    acc[cat] = (acc[cat] || 0) + Number(v.cantidad);
    return acc;
  }, {});
  const catsOrdenadas = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCat = catsOrdenadas[0]?.[1] || 1;

  // Método de pago más usado (este mes, desde facturas)
  const facMes = facturas.filter(f => {
    if (!f.fecha) return false;
    const d = new Date(f.fecha);
    return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
  });
  const pagoCount = facMes.reduce((acc, f) => {
    acc[f.formaPago] = (acc[f.formaPago] || 0) + 1;
    return acc;
  }, {});
  const pagoTop = Object.entries(pagoCount).sort((a, b) => b[1] - a[1]);
  const maxPago = pagoTop[0]?.[1] || 1;

  // Top ventas mes (ya existía)
  const topSales = ventasMesActual.reduce((acc, v) => { acc[v.codigo] = (acc[v.codigo] || 0) + Number(v.cantidad); return acc; }, {});
  const topList = Object.entries(topSales).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cod, cant]) => {
    const pr = prendas.find(p => p.codigo === cod);
    return { codigo: cod, nombre: pr ? pr.descripcion : cod, cantidad: cant };
  });

  // Sugerencias de descuento
  const sugerencias = prendas
    .map(p => {
      const s = Number(p.stock);
      const min = Number(p.stockMinimo) || 3;
      const ratio = min > 0 ? (s / min) : 0;
      let descuento = 0;
      if (ratio >= 4) descuento = 30;
      else if (ratio >= 3) descuento = 20;
      else if (ratio >= 2) descuento = 10;
      return { ...p, descuento };
    })
    .filter(p => p.descuento > 0 && p.stock > 0)
    .sort((a, b) => b.descuento - a.descuento)
    .slice(0, 4);

  const datosGrafica = useMemo(() => {
    let agrupado = {};
    const vFiltro = ventasSinCredito.filter(v => {
      if (!v.fecha) return false;
      const d = new Date(v.fecha);
      if (filtroTiempo === "hoy") return d.toDateString() === hoy.toDateString();
      if (filtroTiempo === "semana") return d >= hace7Dias;
      if (filtroTiempo === "mes") return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
      return true;
    });
    vFiltro.forEach(v => {
      const d = new Date(v.fecha);
      let key = "";
      if (filtroTiempo === "hoy") key = `${d.getHours()}:00`;
      else if (filtroTiempo === "semana") key = d.toLocaleDateString("es-CO", { weekday: "short" }).charAt(0).toUpperCase() + d.toLocaleDateString("es-CO", { weekday: "short" }).slice(1);
      else if (filtroTiempo === "mes") key = `${d.getDate()}`;
      else key = d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
      if (!agrupado[key]) agrupado[key] = { label: key, value: 0, dateObj: d };
      agrupado[key].value += (Number(v.precioVenta) * Number(v.cantidad));
    });
    return Object.values(agrupado).sort((a, b) => a.dateObj - b.dateObj);
  }, [ventasSinCredito, filtroTiempo]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* BANNER */}
      <div style={{ background: "linear-gradient(135deg, var(--rosa-deep) 0%, var(--rosa) 100%)", borderRadius: 24, padding: "28px 24px", color: "var(--white)", position: "relative", overflow: "hidden", textAlign: "center" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.07)" }} />
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Los números no mienten, Linda 🔥</h2>
        <p style={{ fontSize: 13, opacity: 0.8 }}>Métricas actualizadas en tiempo real</p>
      </div>

      {/* MÉTRICAS PRINCIPALES — fila 1 */}
      <h3 style={{ fontSize: 14, color: "var(--mid)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Este mes</h3>
      <div className="stats-grid">
        <StatCard icon="money"     label="Ingresos del mes"   value={fmt(ingresosMes)}    sub={crecimiento >= 0 ? `▲ +${crecimiento}% vs mes pasado` : `▼ ${crecimiento}% vs mes pasado`} color="var(--rosa)" />
        <StatCard icon="tag"       label="Margen de ganancia" value={`${rentabilidad}%`}  sub={`Utilidad: ${fmt(gananciasMes)}`} color="var(--success)" />
        <StatCard icon="trending"  label="Ticket promedio"    value={fmt(ticketPromedio)} sub={`${ticketsUnicos} ventas cerradas`} color="#7B1FA2" />
        <StatCard icon="dashboard" label="Proyección del mes" value={fmt(proyeccion)}     sub={`${diasActivos} días activos de ${diasTranscurridos}`} color="var(--warn)" />
      </div>

      {/* MÉTRICAS SECUNDARIAS — fila 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>

        {/* Créditos pendientes */}
        <div style={{ background: numCreditosPendientes > 0 ? "#F3E5F5" : "var(--white)", borderRadius: 16, padding: "16px", border: `1.5px solid ${numCreditosPendientes > 0 ? "#CE93D8" : "var(--border)"}`, boxShadow: "var(--shadow)" }}>
          <p style={{ fontSize: 10, color: "#7B1FA2", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>💳 Créditos pendientes</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: numCreditosPendientes > 0 ? "#7B1FA2" : "var(--mid)" }}>{fmt(creditosPendientes)}</p>
          <p style={{ fontSize: 11, color: "var(--mid)", marginTop: 4 }}>{numCreditosPendientes} {numCreditosPendientes === 1 ? "cliente debe" : "clientes deben"}</p>
        </div>

        {/* Prendas sin movimiento */}
        {(() => {
          const codigosVendidos = new Set(ventasMesActual.map(v => v.codigo));
          const sinMovimiento = prendas.filter(p => Number(p.stock) > 0 && !codigosVendidos.has(p.codigo)).length;
          return (
            <div style={{ background: sinMovimiento > 0 ? "#FFF3E0" : "var(--white)", borderRadius: 16, padding: "16px", border: `1.5px solid ${sinMovimiento > 0 ? "#FFB74D" : "var(--border)"}`, boxShadow: "var(--shadow)" }}>
              <p style={{ fontSize: 10, color: "var(--warn)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>🧊 Sin movimiento</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: sinMovimiento > 0 ? "var(--warn)" : "var(--success)" }}>{sinMovimiento}</p>
              <p style={{ fontSize: 11, color: "var(--mid)", marginTop: 4 }}>{sinMovimiento === 0 ? "¡Todo rotando!" : "prendas sin venta este mes"}</p>
            </div>
          );
        })()}

        {/* Talla estrella */}
        <div style={{ background: "var(--white)", borderRadius: 16, padding: "16px", border: "1.5px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <p style={{ fontSize: 10, color: "var(--rosa-deep)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>👑 Talla estrella</p>
          {tallasOrdenadas.length > 0 ? (
            <>
              <p style={{ fontSize: 22, fontWeight: 800, color: "var(--rosa-deep)" }}>{tallasOrdenadas[0][0]}</p>
              <p style={{ fontSize: 11, color: "var(--mid)", marginTop: 4 }}>{tallasOrdenadas[0][1]} unidades vendidas</p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: "var(--mid)", marginTop: 8 }}>Sin datos</p>
          )}
        </div>

        {/* Categoría top */}
        <div style={{ background: "var(--white)", borderRadius: 16, padding: "16px", border: "1.5px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <p style={{ fontSize: 10, color: "var(--rosa-deep)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>🏷️ Categoría top</p>
          {catsOrdenadas.length > 0 ? (
            <>
              <p style={{ fontSize: 15, fontWeight: 800, color: "var(--dark)", lineHeight: 1.2 }}>{catsOrdenadas[0][0]}</p>
              <p style={{ fontSize: 11, color: "var(--mid)", marginTop: 4 }}>{catsOrdenadas[0][1]} uds. vendidas</p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: "var(--mid)", marginTop: 8 }}>Sin datos</p>
          )}
        </div>
      </div>

      {/* GRÁFICA */}
      <div style={{ background: "var(--white)", borderRadius: 20, padding: "24px 20px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "var(--dark)" }}>Gráfica de Rendimiento</p>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
            {[{ id: "hoy", label: "Hoy" }, { id: "semana", label: "7 Días" }, { id: "mes", label: "Este Mes" }, { id: "todo", label: "Todas" }].map(f => (
              <button key={f.id} onClick={() => setFiltroTiempo(f.id)} style={{ background: filtroTiempo === f.id ? "var(--dark)" : "var(--creme)", color: filtroTiempo === f.id ? "white" : "var(--dark)", border: filtroTiempo === f.id ? "1px solid var(--dark)" : "1px solid transparent", padding: "6px 14px", borderRadius: 50, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", transition: "all 0.2s", cursor: "pointer" }}>{f.label}</button>
            ))}
          </div>
        </div>
        <CustomLineChart data={datosGrafica} />
      </div>

      {/* ANÁLISIS POR TALLAS + CATEGORÍAS + MÉTODOS */}
      <div className="desktop-flex">

        {/* Tallas */}
        <div style={{ flex: 1, background: "var(--white)", borderRadius: 20, padding: "18px 20px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "var(--dark)", marginBottom: 16 }}>📐 Ventas por talla (mes)</p>
          {tallasOrdenadas.length === 0
            ? <p style={{ fontSize: 12, color: "var(--mid)" }}>Sin datos este mes.</p>
            : tallasOrdenadas.map(([t, v]) => <MiniBar key={t} label={t} value={v} max={maxTalla} color="var(--rosa-deep)" />)
          }
        </div>

        {/* Categorías */}
        <div style={{ flex: 1, background: "var(--white)", borderRadius: 20, padding: "18px 20px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "var(--dark)", marginBottom: 16 }}>🏷️ Ventas por categoría (mes)</p>
          {catsOrdenadas.length === 0
            ? <p style={{ fontSize: 12, color: "var(--mid)" }}>Sin datos este mes.</p>
            : catsOrdenadas.map(([c, v]) => <MiniBar key={c} label={c.length > 10 ? c.slice(0, 9) + "…" : c} value={v} max={maxCat} color="#7B1FA2" />)
          }
        </div>

        {/* Métodos de pago */}
        <div style={{ flex: 1, background: "var(--white)", borderRadius: 20, padding: "18px 20px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "var(--dark)", marginBottom: 16 }}>💳 Métodos de pago (mes)</p>
          {pagoTop.length === 0
            ? <p style={{ fontSize: 12, color: "var(--mid)" }}>Sin datos este mes.</p>
            : pagoTop.map(([m, v]) => <MiniBar key={m} label={m.length > 10 ? m.slice(0, 9) + "…" : m} value={v} max={maxPago} color="var(--success)" />)
          }
        </div>
      </div>

      {/* TOP PRODUCTOS + SUGERENCIAS */}
      <div className="desktop-flex">
        <div style={{ flex: 1, background: "var(--white)", borderRadius: 20, padding: "18px 20px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ color: "var(--rosa)" }}>🏆</span><span style={{ fontWeight: 600, fontSize: 14 }}>Top Productos del Mes</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topList.length === 0 ? <p style={{ fontSize: 12, color: "var(--mid)" }}>No hay ventas este mes.</p> : null}
            {topList.map((t, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "var(--rosa-pale)", padding: "8px 12px", borderRadius: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{t.nombre}</span>
                <span style={{ fontSize: 12, color: "var(--rosa-deep)", fontWeight: 700 }}>x{t.cantidad} vendidas</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, background: "var(--white)", borderRadius: 20, padding: "18px 20px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ color: "var(--warn)" }}>💡</span><span style={{ fontWeight: 600, fontSize: 14 }}>Stock Estancado</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sugerencias.length === 0 ? <p style={{ fontSize: 12, color: "var(--mid)" }}>¡Tu inventario está rotando perfectamente!</p> : null}
            {sugerencias.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FFF3E0", padding: "8px 12px", borderRadius: 10 }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600 }}>{p.descripcion}</p>
                  <p style={{ fontSize: 10, color: "var(--warn)" }}>{p.stock} uds. · Mínimo: {p.stockMinimo}</p>
                </div>
                <Badge variant="warn">-{p.descuento}%</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BLOQUE DE NOTAS */}
      <div style={{ background: "var(--white)", borderRadius: 20, padding: "20px", border: "1.5px solid var(--rosa-soft)", boxShadow: "var(--shadow)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 18 }}>📝</span>
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 700, color: "var(--rosa-deep)" }}>Mis notas del día</span>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <textarea
            placeholder="Escribe algo para no olvidar… pedir tallas, llamar proveedor, nota de caja..."
            value={notaTexto}
            onChange={e => setNotaTexto(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) guardarNota(); }}
            rows={3}
            style={{ flex: 1, resize: "vertical", fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: "12px 14px", borderRadius: 12, border: "1.5px solid var(--border)", outline: "none", color: "var(--dark)", background: "var(--creme)", lineHeight: 1.5 }}
          />
          <button
            onClick={guardarNota}
            disabled={guardandoNota || !notaTexto.trim()}
            style={{ background: notaTexto.trim() ? "linear-gradient(135deg, var(--rosa-deep), var(--rosa))" : "var(--border)", color: notaTexto.trim() ? "white" : "var(--mid)", border: "none", borderRadius: 12, padding: "0 18px", fontWeight: 700, fontSize: 13, alignSelf: "stretch", minWidth: 72, transition: "all 0.2s" }}
          >
            {guardandoNota ? "..." : "Guardar"}
          </button>
        </div>
        <p style={{ fontSize: 10, color: "var(--mid)", marginTop: 6 }}>Ctrl + Enter para guardar rápido</p>
        {notaError && (
          <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 8, background: "#FFEBEE", padding: "8px 12px", borderRadius: 8 }}>⚠️ {notaError}</p>
        )}

        {notas.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            {notas.map(n => (
              <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "var(--rosa-pale)", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--rosa-soft)" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, color: "var(--dark)", lineHeight: 1.5, whiteSpace: "pre-wrap", margin: 0 }}>{n.texto}</p>
                  <p style={{ fontSize: 10, color: "var(--mid)", marginTop: 6 }}>
                    {new Date(n.fecha).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })} · {new Date(n.fecha).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <button onClick={() => eliminarNota(n.id)} style={{ background: "transparent", border: "none", color: "var(--mid)", fontSize: 16, cursor: "pointer", padding: "0 4px", lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {notas.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--mid)", textAlign: "center", padding: "16px 0 4px", fontStyle: "italic" }}>Aún no hay notas. ¡Escribe la primera!</p>
        )}
      </div>

    </div>
  );
}
