import { useState, useMemo } from "react";
import { fmt, fmtNum, StatCard, Badge } from "../utils.jsx";

// ── Gráfica nativa de LÍNEAS sin librerías ──
const CustomLineChart = ({ data }) => {
  if (!data || data.length === 0) return <div style={{height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mid)', fontSize: 13}}>No hay datos en este periodo</div>;
  
  // Si solo hay un dato (ej. Hoy solo hay 1 venta), agregamos puntos imaginarios para que la línea se dibuje centrada
  const chartData = data.length === 1 ? [{label: '', value: data[0].value}, data[0], {label: '', value: data[0].value}] : data;
  
  const maxVal = Math.max(...chartData.map(d => d.value), 100);
  const height = 140;
  const paddingY = 10;

  // Calculamos las coordenadas (X, Y) para dibujar la línea
  const points = chartData.map((d, i) => {
    const x = chartData.length > 1 ? (i / (chartData.length - 1)) * 100 : 50;
    const y = height - paddingY - ((d.value / maxVal) * (height - paddingY * 2));
    return `${x}%,${y}`;
  }).join(" ");

  return (
    <div style={{ position: 'relative', height: 170, width: '100%', marginTop: 20 }}>
      <svg width="100%" height={height} style={{ overflow: "visible" }}>
        
        {/* Línea principal */}
        <polyline points={points} fill="none" stroke="var(--rosa-deep)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        
        {/* Puntos sobre la línea */}
        {chartData.map((d, i) => {
          const x = chartData.length > 1 ? `${(i / (chartData.length - 1)) * 100}%` : "50%";
          const y = height - paddingY - ((d.value / maxVal) * (height - paddingY * 2));
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="5" fill="var(--white)" stroke="var(--rosa-deep)" strokeWidth="2" />
              {/* Tooltip nativo al pasar el mouse por el punto */}
              <title>{d.label ? `${d.label}: ` : ''}{fmt(d.value)}</title>
            </g>
          );
        })}
      </svg>

      {/* Etiquetas del Eje X (Fechas) */}
      <div style={{ display: "flex", justifyContent: "space-between", position: "absolute", bottom: 0, left: 0, right: 0 }}>
        {chartData.map((d, i) => {
          // Mostrar etiquetas de forma inteligente para no amontonarlas
          const showLabel = chartData.length <= 7 || i % Math.ceil(chartData.length / 5) === 0 || i === chartData.length - 1;
          return (
            <span key={i} style={{ fontSize: 10, color: "var(--mid)", fontWeight: 600, opacity: showLabel ? 1 : 0, textAlign: "center", width: "30px", marginLeft: "-15px" }}>
              {showLabel ? d.label : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default function Dashboard({ prendas, ventas, facturas = [] }) {
  const [filtroTiempo, setFiltroTiempo] = useState('semana');

  const ticketsCredito = new Set(
    facturas.filter(f => f.formaPago === "Crédito" && f.estadoCredito === "abierto").map(f => f.ticketId)
  );
  ventas = ventas.filter(v => !ticketsCredito.has(v.ticketId));

  const hoy = new Date();
  const hace7Dias = new Date(); hace7Dias.setDate(hoy.getDate() - 7);
  const mesAnterior = new Date(); mesAnterior.setMonth(hoy.getMonth() - 1);

  // --- FILTROS DE VENTAS (Tus métricas de tarjetas se mantienen intactas) ---
  const ventasMesActual = ventas.filter(v => {
    if(!v.fecha) return false;
    const d = new Date(v.fecha);
    return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
  });
  
  const ventasMesAnterior = ventas.filter(v => {
    if(!v.fecha) return false;
    const d = new Date(v.fecha);
    return d.getMonth() === mesAnterior.getMonth() && d.getFullYear() === mesAnterior.getFullYear();
  });
  
  const ventasSemana = ventas.filter(v => v.fecha && new Date(v.fecha) >= hace7Dias);

  const ingresosMes = ventasMesActual.reduce((s, v) => s + Number(v.precioVenta) * Number(v.cantidad), 0);
  const costosMes = ventasMesActual.reduce((s, v) => s + Number(v.costoCompra) * Number(v.cantidad), 0);
  const gananciasMes = ingresosMes - costosMes;
  const rentabilidad = ingresosMes > 0 ? Math.round((gananciasMes / ingresosMes) * 100) : 0;

  const ingresosSemana = ventasSemana.reduce((s, v) => s + Number(v.precioVenta) * Number(v.cantidad), 0);

  const ingresosMesAnterior = ventasMesAnterior.reduce((s, v) => s + Number(v.precioVenta) * Number(v.cantidad), 0);
  let crecimiento = 0;
  if (ingresosMesAnterior > 0) crecimiento = Math.round(((ingresosMes - ingresosMesAnterior) / ingresosMesAnterior) * 100);
  else if (ingresosMes > 0) crecimiento = 100;

  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diasTranscurridos = hoy.getDate() || 1;
  const proyeccion = Math.round((ingresosMes / diasTranscurridos) * diasMes);

  // --- GRÁFICA FIX (Se adapta al botón seleccionado) ---
  const datosGrafica = useMemo(() => {
    let agrupado = {};
    
    // 1. Filtrar las ventas según el botón seleccionado
    const vFiltro = ventas.filter(v => {
       if(!v.fecha) return false;
       const d = new Date(v.fecha);
       if(filtroTiempo === 'hoy') return d.toDateString() === hoy.toDateString();
       if(filtroTiempo === 'semana') return d >= hace7Dias;
       if(filtroTiempo === 'mes') return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
       return true; // 'todo'
    });

    // 2. Agrupar el dinero según el periodo para pintar la línea
    vFiltro.forEach(v => {
      const d = new Date(v.fecha);
      let key = "";
      
      if (filtroTiempo === 'hoy') key = `${d.getHours()}:00`; // Agrupa por hora
      else if (filtroTiempo === 'semana') key = d.toLocaleDateString('es-CO', { weekday: 'short' }).charAt(0).toUpperCase() + d.toLocaleDateString('es-CO', { weekday: 'short' }).slice(1); // Lun, Mar...
      else if (filtroTiempo === 'mes') key = `${d.getDate()}`; // Día del mes
      else key = d.toLocaleDateString('es-CO', { month: 'short', year:'2-digit' }); // Ene 26, Feb 26...
      
      if(!agrupado[key]) agrupado[key] = { label: key, value: 0, dateObj: d };
      agrupado[key].value += (Number(v.precioVenta) * Number(v.cantidad));
    });

    // Ordenar cronológicamente
    let result = Object.values(agrupado).sort((a, b) => a.dateObj - b.dateObj);
    return result;
  }, [ventas, filtroTiempo, hace7Dias, hoy]);

  // --- TOP VENTAS ---
  const topSales = ventasMesActual.reduce((acc, v) => { acc[v.codigo] = (acc[v.codigo] || 0) + Number(v.cantidad); return acc; }, {});
  const topList = Object.entries(topSales).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cod, cant]) => {
    const pr = prendas.find(p => p.codigo === cod);
    return { codigo: cod, nombre: pr ? pr.descripcion : cod, cantidad: cant };
  });

  // --- SUGERENCIAS DE DESCUENTO ---
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      
      {/* Cabecera Intacta */}
      <div style={{ background: "linear-gradient(135deg, var(--rosa-deep) 0%, var(--rosa) 100%)", borderRadius: 24, padding: "28px 24px", color: "var(--white)", position: "relative", overflow: "hidden", textAlign: "center" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.07)" }} />
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Los números no mienten, Linda 🔥</h2>
        <p style={{ fontSize: 13, opacity: 0.8 }}>Métricas actualizadas en tiempo real</p>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--rosa-deep)", marginTop: 10, fontFamily: "'Fraunces', serif" }}>Rendimiento Financiero</h3>
      <div className="stats-grid">
        <StatCard icon="money"    label="Ingresos Mensuales" value={fmt(ingresosMes)} sub={crecimiento >= 0 ? `▲ +${crecimiento}% vs mes pasado` : `▼ ${crecimiento}% vs mes pasado`} color="var(--rosa)" />
        <StatCard icon="trending" label="Ventas Semanales"   value={fmt(ingresosSemana)} sub="Últimos 7 días" color="#7B1FA2" />
        <StatCard icon="tag"      label="Margen de Ganancia" value={`${rentabilidad}%`} sub={`Utilidad neta: ${fmt(gananciasMes)}`} color="var(--success)" />
        <StatCard icon="dashboard"label="Proyección Fin de Mes" value={fmt(proyeccion)} sub="Estimado si mantienes el ritmo" color="var(--warn)" />
      </div>

      {/* Gráfica de Líneas Modificada con Botones */}
      <div style={{ background: "var(--white)", borderRadius: 20, padding: "24px 20px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
        
        {/* ENCABEZADO Y BOTONES SLICER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "var(--dark)" }}>Gráfica de Rendimiento</p>
          
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
            {[
              { id: "hoy", label: "Hoy" },
              { id: "semana", label: "7 Días" },
              { id: "mes", label: "Este Mes" },
              { id: "todo", label: "Todas" }
            ].map(f => (
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
        </div>

        {/* LÍNEA */}
        <CustomLineChart data={datosGrafica} />
      </div>

      <div className="desktop-flex">
        {/* Top Ventas Intacto */}
        <div style={{ flex: 1, background: "var(--white)", borderRadius: 20, padding: "18px 20px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ color: "var(--rosa)" }}>🏆</span><span style={{ fontWeight: 600, fontSize: 14 }}>Top Productos del Mes</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topList.length === 0 ? <p style={{fontSize:12, color:'var(--mid)'}}>No hay ventas este mes.</p> : null}
            {topList.map((t, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "var(--rosa-pale)", padding: "8px 12px", borderRadius: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{t.nombre}</span><span style={{ fontSize: 12, color: "var(--rosa-deep)", fontWeight: 700 }}>x{t.cantidad} vendidas</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sugerencias Intacto */}
        <div style={{ flex: 1, background: "var(--white)", borderRadius: 20, padding: "18px 20px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ color: "var(--warn)" }}>💡</span><span style={{ fontWeight: 600, fontSize: 14 }}>Stock Estancado (Promociones sugeridas)</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sugerencias.length === 0 ? <p style={{fontSize:12, color:'var(--mid)'}}>¡Tu inventario está rotando perfectamente!</p> : null}
            {sugerencias.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FFF3E0", padding: "8px 12px", borderRadius: 10 }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600 }}>{p.descripcion}</p>
                  <p style={{ fontSize: 10, color: "var(--warn)" }}>Tienes {p.stock} uds. (Mínimo: {p.stockMinimo})</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <Badge variant="warn">Descuento -{p.descuento}%</Badge>
                  <span style={{fontSize: 10, color: "var(--mid)", fontWeight: 600}}>Sugerido: {fmt(Number(p.precioVenta) * (1 - p.descuento/100))}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}