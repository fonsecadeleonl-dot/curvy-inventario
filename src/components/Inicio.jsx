import { esHoy, fmt, fmtNum, hoyObj, StatCard, Badge, Icon } from "../utils.jsx";

export default function Inicio({ prendas, ventas, facturas = [] }) {
  const creditosAbiertos = facturas.filter(f => f.formaPago === "Crédito" && f.estadoCredito === "abierto");
  const ticketsCredito = new Set(creditosAbiertos.map(f => f.ticketId));

  const ventasEfectivas = ventas.filter(v => !ticketsCredito.has(v.ticketId));
  const ventasHoy = ventasEfectivas.filter(v => esHoy(v.fecha));

  const gananciasHoy = ventasHoy.reduce((s, v) => s + (Number(v.precioVenta) - Number(v.costoCompra)) * Number(v.cantidad), 0);
  const ventasHoyTotal = ventasHoy.reduce((s, v) => s + Number(v.precioVenta) * Number(v.cantidad), 0);
  const unidadesHoy = ventasHoy.reduce((s, v) => s + Number(v.cantidad), 0);

  const alertas = prendas.filter(p => Number(p.stock) > 0 && Number(p.stock) <= (Number(p.stockMinimo) || 3));
  const agotadas = prendas.filter(p => Number(p.stock) === 0);

  const diasDesde = (fecha) => Math.floor((Date.now() - new Date(fecha)) / (1000 * 60 * 60 * 24));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "linear-gradient(135deg, var(--rosa-deep) 0%, var(--rosa) 100%)", borderRadius: 24, padding: "28px 24px", color: "var(--white)", position: "relative", overflow: "hidden", textAlign: "center" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.07)" }} />
        <p style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 14, opacity: 0.9, marginBottom: 4 }}>¡Hola de nuevo, hermosa!</p>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Llegó la CEO de Curvy 💅🏻</h2>
        <p style={{ fontSize: 13, opacity: 0.8 }}>{hoyObj.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      <div className="stats-grid">
        <StatCard icon="money"    label="Ventas hoy"   value={fmt(ventasHoyTotal)} sub={`${fmtNum(unidadesHoy)} prendas`} color="var(--rosa)" />
        <StatCard icon="trending" label="Ganancia hoy" value={fmt(gananciasHoy)}   sub="Neto del día" color="var(--success)" />
      </div>

      {/* CRÉDITOS ABIERTOS */}
      {creditosAbiertos.length > 0 && (
        <div className="animate" style={{ background: "var(--white)", borderRadius: 20, padding: "18px 20px", border: "1.5px solid #7B1FA2", boxShadow: "0 4px 20px rgba(123,31,162,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>💳</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#7B1FA2" }}>Créditos abiertos</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#7B1FA2", background: "#F3E5F5", padding: "3px 10px", borderRadius: 20 }}>
              {fmt(creditosAbiertos.reduce((s, f) => s + Number(f.total), 0))} por cobrar
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {creditosAbiertos
              .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
              .map(f => {
                const dias = diasDesde(f.fecha);
                const urgente = dias >= 7;
                return (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 12, background: urgente ? "#FFF3E0" : "#F3E5F5" }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)", margin: 0 }}>{f.clienteNombre || f.clienteCredito || "Sin nombre"}</p>
                      <p style={{ fontSize: 11, color: "var(--mid)", margin: "2px 0 0" }}>
                        {new Date(f.fecha).toLocaleDateString("es-CO")} · {f.ticketId?.slice(-6)}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: urgente ? "var(--warn)" : "#7B1FA2", margin: 0 }}>{fmt(f.total)}</p>
                      <p style={{ fontSize: 11, fontWeight: 600, color: urgente ? "var(--warn)" : "var(--mid)", margin: "2px 0 0" }}>
                        {dias === 0 ? "Hoy" : `Hace ${dias} día${dias !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

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
