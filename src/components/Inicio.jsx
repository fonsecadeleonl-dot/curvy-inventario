import { useState, useEffect } from "react";
import { esHoy, fmt, fmtNum, hoyObj, StatCard, Badge, Icon } from "../utils.jsx";

export default function Inicio({ prendas, ventas }) {
  const [hora, setHora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const ventasHoy = ventas.filter(v => esHoy(v.fecha));
  
  const gananciasHoy = ventasHoy.reduce((s, v) => s + (Number(v.precioVenta) - Number(v.costoCompra)) * Number(v.cantidad), 0);
  const ventasHoyTotal = ventasHoy.reduce((s, v) => s + Number(v.precioVenta) * Number(v.cantidad), 0);
  const unidadesHoy = ventasHoy.reduce((s, v) => s + Number(v.cantidad), 0);
  
  const alertas = prendas.filter(p => Number(p.stock) > 0 && Number(p.stock) <= (Number(p.stockMinimo) || 3));
  const agotadas = prendas.filter(p => Number(p.stock) === 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* PUNTO 1: Mensaje de bienvenida */}
      <div style={{ background: "linear-gradient(135deg, var(--rosa-deep) 0%, var(--rosa) 100%)", borderRadius: 24, padding: "28px 24px", color: "var(--white)", position: "relative", overflow: "hidden", textAlign: "center" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.07)" }} />
        <p style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 14, opacity: 0.9, marginBottom: 4 }}>¡Hola de nuevo, hermosa!</p>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Llegó la CEO de Curvy 💅🏻</h2>
        <p style={{ fontSize: 13, opacity: 0.8 }}>{hoyObj.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</p>
        <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, marginTop: 6 }}>{hora.toLocaleTimeString("es-CO")}</p>
      </div>

      <div className="stats-grid">
        <StatCard icon="money"    label="Ventas hoy"     value={fmt(ventasHoyTotal)}  sub={`${fmtNum(unidadesHoy)} prendas`} color="var(--rosa)" />
        <StatCard icon="trending" label="Ganancia hoy"   value={fmt(gananciasHoy)}    sub="Neto del día" color="var(--success)" />
      </div>

      {(alertas.length > 0 || agotadas.length > 0) && (
        <div className="animate" style={{ background: "var(--white)", borderRadius: 20, padding: "18px 20px", border: "1.5px solid #FFB74D", boxShadow: "0 4px 20px rgba(230,81,0,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ color: "var(--warn)" }}><Icon name="alert" size={16} /></span>
            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--warn)" }}>Prendas con stock bajo o agotadas</span>
          </div>
          <div className="desktop-flex">
             <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              {[...agotadas, ...alertas].map(p => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 10, background: Number(p.stock) === 0 ? "#FFEBEE" : "#FFF3E0" }}>
                  <div><p style={{ fontSize: 12, fontWeight: 600, color: "var(--dark)" }}>{p.descripcion}</p><p style={{ fontSize: 11, color: "var(--mid)" }}>{p.codigo}</p></div>
                  <Badge variant={Number(p.stock) === 0 ? "danger" : "warn"}>{Number(p.stock) === 0 ? "🔴 Agotado" : `⚠️ ${fmtNum(p.stock)} uds`}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}