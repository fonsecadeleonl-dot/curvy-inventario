import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { fmtNum } from "../utils.jsx";

// ── DOMINIO: mismas categorías y tallas reales del proyecto (Inventario.jsx) ──
const CATEGORIAS = ["Blusa", "Camiseta", "Pantalón", "Vestido", "Conjunto", "Falda", "Cardigan", "Short", "Otro"];
const TALLAS_PLUS = ["XL", "2XL", "3XL", "4XL"];
const TALLAS_ESTANDAR = ["S", "M", "L"];

function calcularBloqueTalla(talla) {
  const t = String(talla || "").trim().toUpperCase();
  if (TALLAS_PLUS.includes(t)) return "plus";
  if (TALLAS_ESTANDAR.includes(t)) return "estandar";
  return "unica";
}

// Una prenda guarda todas sus tallas en un solo documento (stockPorTalla);
// legado sin ese campo cae a { talla, stock } de nivel raíz.
const entradasTalla = (p) => {
  if (p.stockPorTalla) return Object.entries(p.stockPorTalla).map(([t, c]) => [t, Number(c) || 0]);
  if (p.talla && p.talla !== "Varias") return [[p.talla, Number(p.stock) || 0]];
  return [];
};

const diasDesde = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

// Pesos por defecto: derivados donde había correspondencia directa con el
// margen histórico que trae la especificación; el resto (Pantalón, Cardigan,
// Short, sin dato de margen propio) se repartió el remanente. Son editables
// desde "Ajustar surtido objetivo" — no están pensados para quedar fijos.
const CONFIG_DEFAULT = {
  totalReferenciasObjetivo: 34,
  proporcionBloque: { plus: 0.60, estandar: 0.40 },
  pesosCategoria: {
    Vestido: 0.30, Blusa: 0.25, Conjunto: 0.15, Falda: 0.12,
    Camiseta: 0.04, Otro: 0.04, "Pantalón": 0.04, Cardigan: 0.03, Short: 0.03,
  },
  curvaTallas: {
    plus: { XL: 2, "2XL": 2, "3XL": 1, "4XL": 1 },
    estandar: { S: 1, M: 2, L: 2 },
  },
  umbralAntiguedadDias: 60,
};

const BLOQUE_LABEL = { plus: "Plus size", estandar: "Tallas estándar" };
const ESTADO_STYLE = {
  faltante:    { bg: "#FFEBEE", color: "var(--danger)" },
  vencido:     { bg: "#FFEBEE", color: "var(--danger)" },
  excedente:   { bg: "#FFF8E1", color: "var(--warn)" },
  equilibrado: { bg: "#E8F5E9", color: "var(--success)" },
};

const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;

// ── MODAL: AJUSTAR SURTIDO OBJETIVO ──
function ModalConfig({ config, onClose, onGuardado }) {
  const [form, setForm] = useState(() => ({
    totalReferenciasObjetivo: config.totalReferenciasObjetivo,
    proporcionPlus: Math.round(config.proporcionBloque.plus * 100),
    proporcionEstandar: Math.round(config.proporcionBloque.estandar * 100),
    pesos: Object.fromEntries(CATEGORIAS.map(c => [c, Math.round((config.pesosCategoria[c] || 0) * 100)])),
    curvaPlus: { ...config.curvaTallas.plus },
    curvaEstandar: { ...config.curvaTallas.estandar },
    umbralAntiguedadDias: config.umbralAntiguedadDias,
  }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const sumaPesos = Object.values(form.pesos).reduce((s, v) => s + (Number(v) || 0), 0);
  const sumaProporcion = (Number(form.proporcionPlus) || 0) + (Number(form.proporcionEstandar) || 0);
  const pesosOk = Math.abs(sumaPesos - 100) <= 1;
  const proporcionOk = Math.abs(sumaProporcion - 100) <= 1;

  const guardar = async () => {
    if (!auth.currentUser) { setError("Sin sesión activa. Recarga la página e inicia sesión."); return; }
    if (!pesosOk) { setError("Los pesos por categoría deben sumar 100%."); return; }
    if (!proporcionOk) { setError("La proporción plus/estándar debe sumar 100%."); return; }
    setGuardando(true); setError("");
    try {
      const nuevaConfig = {
        totalReferenciasObjetivo: Number(form.totalReferenciasObjetivo) || 0,
        proporcionBloque: { plus: (Number(form.proporcionPlus) || 0) / 100, estandar: (Number(form.proporcionEstandar) || 0) / 100 },
        pesosCategoria: Object.fromEntries(CATEGORIAS.map(c => [c, (Number(form.pesos[c]) || 0) / 100])),
        curvaTallas: {
          plus: Object.fromEntries(TALLAS_PLUS.map(t => [t, Number(form.curvaPlus[t]) || 0])),
          estandar: Object.fromEntries(TALLAS_ESTANDAR.map(t => [t, Number(form.curvaEstandar[t]) || 0])),
        },
        umbralAntiguedadDias: Number(form.umbralAntiguedadDias) || 0,
        actualizadoEn: serverTimestamp(),
      };
      await setDoc(doc(db, "config", "surtidoObjetivo"), nuevaConfig, { merge: true });
      onGuardado(nuevaConfig);
      onClose();
    } catch (e) {
      setError("Error al guardar: " + e.message);
    } finally {
      setGuardando(false);
    }
  };

  const inputStyle = { width: 64, textAlign: "center", padding: "6px 4px" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div className="animate" style={{ background: "var(--white)", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 640, maxHeight: "88vh", overflowY: "auto", padding: "24px 20px 32px", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 700, color: "var(--dark)", margin: 0 }}>Ajustar surtido objetivo</p>
          <button onClick={onClose} style={{ background: "var(--creme)", border: "none", borderRadius: 50, width: 34, height: 34, fontSize: 20, cursor: "pointer", color: "var(--mid)" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--mid)", display: "block", marginBottom: 4 }}>Total de referencias objetivo</label>
              <input type="number" min="0" value={form.totalReferenciasObjetivo} onChange={e => setForm(f => ({ ...f, totalReferenciasObjetivo: e.target.value }))} style={{ width: 90, textAlign: "center", padding: "8px 4px" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--mid)", display: "block", marginBottom: 4 }}>Umbral antigüedad (días)</label>
              <input type="number" min="0" value={form.umbralAntiguedadDias} onChange={e => setForm(f => ({ ...f, umbralAntiguedadDias: e.target.value }))} style={{ width: 90, textAlign: "center", padding: "8px 4px" }} />
            </div>
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 8 }}>
              Proporción plus / estándar — <span style={{ color: proporcionOk ? "var(--success)" : "var(--danger)" }}>{sumaProporcion}%</span>
            </p>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--mid)" }}>Plus %</span>
                <input type="number" min="0" max="100" value={form.proporcionPlus} onChange={e => setForm(f => ({ ...f, proporcionPlus: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--mid)" }}>Estándar %</span>
                <input type="number" min="0" max="100" value={form.proporcionEstandar} onChange={e => setForm(f => ({ ...f, proporcionEstandar: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            {!proporcionOk && <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>Debe sumar 100% para poder guardar.</p>}
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 8 }}>
              Peso por categoría — <span style={{ color: pesosOk ? "var(--success)" : "var(--danger)" }}>{sumaPesos}%</span>
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {CATEGORIAS.map(c => (
                <div key={c} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "var(--creme)", borderRadius: 10, padding: "6px 10px" }}>
                  <span style={{ fontSize: 12, color: "var(--dark)" }}>{c}</span>
                  <input type="number" min="0" max="100" value={form.pesos[c]} onChange={e => setForm(f => ({ ...f, pesos: { ...f.pesos, [c]: e.target.value } }))} style={{ width: 50, textAlign: "center", padding: "4px 2px" }} />
                </div>
              ))}
            </div>
            {!pesosOk && <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>Debe sumar 100% para poder guardar.</p>}
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 8 }}>Curva de tallas sugerida — plus</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {TALLAS_PLUS.map(t => (
                <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "var(--mid)", fontWeight: 600 }}>{t}</label>
                  <input type="number" min="0" value={form.curvaPlus[t]} onChange={e => setForm(f => ({ ...f, curvaPlus: { ...f.curvaPlus, [t]: e.target.value } }))} style={inputStyle} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", marginBottom: 8 }}>Curva de tallas sugerida — estándar</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {TALLAS_ESTANDAR.map(t => (
                <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "var(--mid)", fontWeight: 600 }}>{t}</label>
                  <input type="number" min="0" value={form.curvaEstandar[t]} onChange={e => setForm(f => ({ ...f, curvaEstandar: { ...f.curvaEstandar, [t]: e.target.value } }))} style={inputStyle} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 16, background: "#FFEBEE", padding: "8px 12px", borderRadius: 8 }}>⚠️ {error}</p>}

        <button onClick={guardar} disabled={guardando || !pesosOk || !proporcionOk}
          style={{ marginTop: 20, width: "100%", background: (guardando || !pesosOk || !proporcionOk) ? "var(--border)" : "linear-gradient(135deg, var(--rosa-deep), var(--rosa))", color: (guardando || !pesosOk || !proporcionOk) ? "var(--mid)" : "white", border: "none", borderRadius: 14, padding: "14px", fontSize: 14, fontWeight: 700, cursor: (guardando || !pesosOk || !proporcionOk) ? "not-allowed" : "pointer" }}>
          {guardando ? "Guardando..." : "Guardar surtido objetivo"}
        </button>
      </div>
    </div>
  );
}

// ── MODAL: LISTA DE COMPRA ──
function ModalListaCompra({ filas, onClose }) {
  const totalUnidades = filas.reduce((s, f) => s + f.unidadesTotales, 0);

  const descargarCSV = () => {
    const encabezado = ["Categoría", "Bloque", "Referencias a pedir", "Curva de tallas sugerida", "Unidades totales"];
    const lineas = filas.map(f => [f.categoria, BLOQUE_LABEL[f.bloque], f.referenciasAPedir, f.curvaTexto, f.unidadesTotales].map(csvEscape).join(","));
    const csv = [encabezado.map(csvEscape).join(","), ...lineas].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `lista-compra-curvy-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #lista-compra-imprimible, #lista-compra-imprimible * { visibility: visible; }
          #lista-compra-imprimible { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
        }
      `}</style>
      <div className="animate" style={{ background: "var(--white)", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 680, maxHeight: "88vh", overflowY: "auto", padding: "24px 20px 32px", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }} className="no-print">
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 700, color: "var(--dark)", margin: 0 }}>Lista de compra sugerida</p>
          <button onClick={onClose} style={{ background: "var(--creme)", border: "none", borderRadius: 50, width: 34, height: 34, fontSize: 20, cursor: "pointer", color: "var(--mid)" }}>×</button>
        </div>

        <div id="lista-compra-imprimible">
          {filas.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--mid)", padding: "20px 0" }}>No hay categorías con referencias faltantes ahora mismo — el surtido está equilibrado o en excedente.</p>
          ) : (
            <>
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", fontSize: 11, color: "var(--mid)", padding: "6px 8px" }}>Categoría</th>
                      <th style={{ textAlign: "left", fontSize: 11, color: "var(--mid)", padding: "6px 8px" }}>Bloque</th>
                      <th style={{ fontSize: 11, color: "var(--mid)", padding: "6px 8px" }}>Refs a pedir</th>
                      <th style={{ textAlign: "left", fontSize: 11, color: "var(--mid)", padding: "6px 8px" }}>Curva sugerida</th>
                      <th style={{ fontSize: 11, color: "var(--mid)", padding: "6px 8px" }}>Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", padding: "8px" }}>{f.categoria}</td>
                        <td style={{ fontSize: 12, color: "var(--mid)", padding: "8px" }}>{BLOQUE_LABEL[f.bloque]}</td>
                        <td style={{ fontSize: 12, textAlign: "center", padding: "8px" }}>{f.referenciasAPedir}</td>
                        <td style={{ fontSize: 12, color: "var(--mid)", padding: "8px" }}>{f.curvaTexto}</td>
                        <td style={{ fontSize: 12, fontWeight: 700, textAlign: "center", padding: "8px" }}>{f.unidadesTotales}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)", marginTop: 16 }}>Total del pedido: {fmtNum(totalUnidades)} unidades</p>
            </>
          )}
        </div>

        {filas.length > 0 && (
          <div className="no-print" style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={descargarCSV} style={{ flex: 1, background: "linear-gradient(135deg, var(--rosa-deep), var(--rosa))", color: "white", border: "none", borderRadius: 14, padding: "14px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              ⬇️ Descargar CSV
            </button>
            <button onClick={() => window.print()} style={{ flex: 1, background: "var(--creme)", color: "var(--dark)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              🖨️ Imprimir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function PanelEquilibrioInventario({ prendas, ventas = [], onIrAInventario }) {
  const [config, setConfig] = useState(CONFIG_DEFAULT);
  const [usandoDefault, setUsandoDefault] = useState(true);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [modalConfigAbierto, setModalConfigAbierto] = useState(false);
  const [modalCompraAbierto, setModalCompraAbierto] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "config", "surtidoObjetivo"))
      .then(snap => {
        if (snap.exists()) { setConfig({ ...CONFIG_DEFAULT, ...snap.data() }); setUsandoDefault(false); }
      })
      .catch(err => console.error("Error cargando config/surtidoObjetivo:", err))
      .finally(() => setCargandoConfig(false));
  }, []);

  // ── AGREGACIÓN: unidades y referencias por bloque y categoría ──
  const agregado = useMemo(() => {
    const matriz = { plus: {}, estandar: {} };
    ["plus", "estandar"].forEach(b => CATEGORIAS.forEach(c => { matriz[b][c] = { tallas: {}, refs: new Set(), vencida: false }; }));

    let totalUnidades = 0, unidadesPlus = 0, unidadesEstandar = 0;
    const umbral = config.umbralAntiguedadDias;

    prendas.forEach(p => {
      const categoria = CATEGORIAS.includes(p.categoria) ? p.categoria : "Otro";
      const refId = p.codigo || p.id;
      const edad = diasDesde(p.fechaIngreso);
      entradasTalla(p).forEach(([talla, cantidad]) => {
        if (!cantidad) return;
        totalUnidades += cantidad;
        const bloque = calcularBloqueTalla(talla);
        if (bloque !== "plus" && bloque !== "estandar") return;
        if (bloque === "plus") unidadesPlus += cantidad; else unidadesEstandar += cantidad;
        const cell = matriz[bloque][categoria];
        cell.tallas[talla] = (cell.tallas[talla] || 0) + cantidad;
        cell.refs.add(refId);
        if (edad !== null && edad > umbral) cell.vencida = true;
      });
    });

    const totalReferencias = new Set(prendas.filter(p => Number(p.stock) > 0).map(p => p.codigo || p.id)).size;

    // Rotación 90 días — indicador informativo, no ajusta la meta automáticamente.
    const hace90 = new Date(); hace90.setDate(hace90.getDate() - 90);
    let vendidasPlus = 0, vendidasEstandar = 0;
    ventas.forEach(v => {
      if (!v.fecha || new Date(v.fecha) < hace90) return;
      const bloque = calcularBloqueTalla(v.talla);
      if (bloque === "plus") vendidasPlus += Number(v.cantidad) || 0;
      else if (bloque === "estandar") vendidasEstandar += Number(v.cantidad) || 0;
    });
    const rotacion = {
      plus: unidadesPlus > 0 ? vendidasPlus / unidadesPlus : null,
      estandar: unidadesEstandar > 0 ? vendidasEstandar / unidadesEstandar : null,
    };

    return { matriz, totalUnidades, unidadesPlus, unidadesEstandar, totalReferencias, rotacion };
  }, [prendas, ventas, config.umbralAntiguedadDias]);

  // ── FILAS POR BLOQUE ──
  const construirFilas = (bloque) => CATEGORIAS.map(categoria => {
    const cell = agregado.matriz[bloque][categoria];
    const peso = config.pesosCategoria[categoria] || 0;
    const meta = peso > 0 ? Math.max(1, Math.round(config.totalReferenciasObjetivo * peso * config.proporcionBloque[bloque])) : 0;
    const actuales = cell.refs.size;
    const brecha = meta - actuales;

    let estado, etiqueta;
    if (brecha > 0) { estado = "faltante"; etiqueta = `pedir ${brecha}`; }
    else if (cell.vencida) { estado = "vencido"; etiqueta = "liquidar"; }
    else if (brecha < 0) { estado = "excedente"; etiqueta = "frenar"; }
    else { estado = "equilibrado"; etiqueta = "ok"; }

    return { categoria, bloque, meta, actuales, brecha, estado, etiqueta, tallas: cell.tallas };
  });

  const filasPlus = useMemo(() => construirFilas("plus"), [agregado, config]);
  const filasEstandar = useMemo(() => construirFilas("estandar"), [agregado, config]);

  const faltanPlus = filasPlus.reduce((s, f) => s + Math.max(0, f.brecha), 0);
  const sobranEstandar = filasEstandar.reduce((s, f) => s + Math.max(0, -f.brecha), 0);

  const pctPlus = agregado.totalUnidades > 0 ? agregado.unidadesPlus / agregado.totalUnidades : 0;
  const pctEstandar = agregado.totalUnidades > 0 ? agregado.unidadesEstandar / agregado.totalUnidades : 0;
  const colorDesvio = (pctReal, pctMeta) => {
    const diff = Math.abs(pctReal - pctMeta) * 100;
    return diff < 10 ? "var(--success)" : diff < 20 ? "var(--warn)" : "var(--danger)";
  };

  const avisoRotacion = agregado.rotacion.plus !== null && agregado.rotacion.estandar !== null
    && agregado.rotacion.plus > 0 && agregado.rotacion.estandar >= agregado.rotacion.plus * 1.5;

  // ── LISTA DE COMPRA ──
  const filasCompra = useMemo(() => {
    const todas = [...filasPlus, ...filasEstandar].filter(f => f.estado === "faltante");
    return todas.map(f => {
      const curva = config.curvaTallas[f.bloque];
      const sumaCurva = Object.values(curva).reduce((s, v) => s + Number(v), 0);
      return {
        categoria: f.categoria, bloque: f.bloque, referenciasAPedir: f.brecha,
        curvaTexto: Object.entries(curva).map(([t, c]) => `${t}·${c}`).join(" "),
        unidadesTotales: f.brecha * sumaCurva,
      };
    });
  }, [filasPlus, filasEstandar, config.curvaTallas]);

  const FilaCategoria = ({ f, tallasBloque }) => {
    const st = ESTADO_STYLE[f.estado];
    return (
      <div onClick={() => onIrAInventario?.(f.categoria)}
        style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: 12, background: "var(--creme)", cursor: onIrAInventario ? "pointer" : "default" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)" }}>{f.categoria}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "var(--mid)" }}>{f.actuales}/{f.meta} ref</span>
            <span style={{ background: st.bg, color: st.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{f.etiqueta}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tallasBloque.map(t => {
            const cant = f.tallas[t] || 0;
            return (
              <span key={t} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 8, background: cant === 0 ? "#FFEBEE" : "var(--white)", color: cant === 0 ? "var(--danger)" : "var(--dark)", border: "1px solid var(--border)" }}>
                {t}·{cant}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  const BloqueSection = ({ bloque, filas, resumenBrecha, resumenLabel }) => (
    <div style={{ background: "var(--white)", borderRadius: 20, padding: "18px 20px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <p style={{ fontWeight: 700, fontSize: 14, color: "var(--rosa-deep)", margin: 0 }}>{BLOQUE_LABEL[bloque]}</p>
        {resumenBrecha > 0 && <span style={{ fontSize: 12, color: "var(--mid)" }}>{resumenLabel} {resumenBrecha} referencia{resumenBrecha !== 1 ? "s" : ""}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filas.map(f => <FilaCategoria key={f.categoria} f={f} tallasBloque={bloque === "plus" ? TALLAS_PLUS : TALLAS_ESTANDAR} />)}
      </div>
    </div>
  );

  if (!prendas || prendas.length === 0) {
    return (
      <div style={{ background: "var(--white)", borderRadius: 20, padding: "24px", border: "1px solid var(--border)", boxShadow: "var(--shadow)", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--mid)" }}>Aún no hay productos en stock. Agrega tu primer producto para ver el equilibrio del catálogo.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {modalConfigAbierto && <ModalConfig config={config} onClose={() => setModalConfigAbierto(false)} onGuardado={(c) => { setConfig(c); setUsandoDefault(false); }} />}
      {modalCompraAbierto && <ModalListaCompra filas={filasCompra} onClose={() => setModalCompraAbierto(false)} />}

      <h3 style={{ fontSize: 12, color: "var(--mid)", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", margin: "0 0 -8px" }}>
        Equilibrio de inventario
      </h3>

      {!cargandoConfig && usandoDefault && (
        <p style={{ fontSize: 12, color: "var(--warn)", background: "#FFF8E1", padding: "8px 14px", borderRadius: 10, margin: 0 }}>
          Estás usando el surtido objetivo sugerido. Ajústalo cuando cierres la colección.
        </p>
      )}

      {/* ── ENCABEZADO ── */}
      <div className="stats-grid">
        <div style={{ background: "var(--white)", borderRadius: 16, padding: "16px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--mid)", marginBottom: 6 }}>Total en stock</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: "var(--dark)" }}>{fmtNum(agregado.totalUnidades)} uds</p>
          <p style={{ fontSize: 11, color: "var(--mid)" }}>{fmtNum(agregado.totalReferencias)} referencias</p>
        </div>
        <div style={{ background: "var(--white)", borderRadius: 16, padding: "16px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#7B1FA2", marginBottom: 6 }}>Plus size</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: colorDesvio(pctPlus, config.proporcionBloque.plus) }}>{fmtNum(agregado.unidadesPlus)} · {Math.round(pctPlus * 100)}%</p>
          <p style={{ fontSize: 11, color: "var(--mid)" }}>meta {Math.round(config.proporcionBloque.plus * 100)}%</p>
        </div>
        <div style={{ background: "var(--white)", borderRadius: 16, padding: "16px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--rosa-deep)", marginBottom: 6 }}>Estándar</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: colorDesvio(pctEstandar, config.proporcionBloque.estandar) }}>{fmtNum(agregado.unidadesEstandar)} · {Math.round(pctEstandar * 100)}%</p>
          <p style={{ fontSize: 11, color: "var(--mid)" }}>meta {Math.round(config.proporcionBloque.estandar * 100)}%</p>
        </div>
      </div>

      <p style={{ fontSize: 11, color: "var(--mid)", margin: 0 }}>
        Rotación 90d — plus {agregado.rotacion.plus !== null ? `${agregado.rotacion.plus.toFixed(1)}×` : "—"} · estándar {agregado.rotacion.estandar !== null ? `${agregado.rotacion.estandar.toFixed(1)}×` : "—"}
        {avisoRotacion && <span style={{ color: "var(--warn)", fontWeight: 600 }}> · el bloque estándar rota bastante más rápido que el plus — vale la pena revisar la proporción 60/40</span>}
      </p>

      <BloqueSection bloque="plus" filas={filasPlus} resumenBrecha={faltanPlus} resumenLabel="faltan" />
      <BloqueSection bloque="estandar" filas={filasEstandar} resumenBrecha={sobranEstandar} resumenLabel="sobran" />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setModalCompraAbierto(true)} style={{ flex: "1 1 200px", background: "linear-gradient(135deg, var(--rosa-deep), var(--rosa))", color: "white", border: "none", borderRadius: 50, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Generar lista de compra
        </button>
        <button onClick={() => setModalConfigAbierto(true)} style={{ flex: "1 1 200px", background: "var(--rosa-pale)", color: "var(--rosa-deep)", border: "1px solid var(--rosa-soft)", borderRadius: 50, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Ajustar surtido objetivo
        </button>
      </div>
    </div>
  );
}
