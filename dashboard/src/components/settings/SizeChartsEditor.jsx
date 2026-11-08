import { useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Toggle } from "../common/Toggle";

/*
 * Size charts shown on the storefront product page, one per audience.
 *
 * The merchant owns the content: column headings are free text, so the same editor produces an age chart for kids
 * ("Recommended age": 3-4 years) and a measurement chart for adults ("Chest (in)": 38-40). Nothing is pre-filled
 * except the client's kids age ranges - the storefront never shows measurements the store has not entered.
 */
export const CHART_AUDIENCES = [
  { key: "kids", label: "Kids", hint: "Shown for products in a category whose audience is “kids”." },
  { key: "men", label: "Men", hint: "Shown for products with audience “men”." },
  { key: "women", label: "Women", hint: "Shown for products with audience “women”." },
  { key: "unisex", label: "Unisex", hint: "Shown for unisex products, and used as the fallback when the chart above is empty." },
];

/** The client's kids sizing. Must match the backend default (src/constants/SizeChart.js). */
export const KIDS_AGE_ROWS = [
  { size: "X-Small", values: ["1-2 years"] },
  { size: "Small", values: ["3-4 years"] },
  { size: "Medium", values: ["5-6 years"] },
  { size: "Large", values: ["7-8 years"] },
  { size: "X-Large", values: ["9-10 years"] },
  { size: "2-XL", values: ["11-12 years"] },
];

export const emptyChart = () => ({ enabled: true, note: "", columns: [], rows: [] });

export const toChartForm = (c) => ({
  enabled: c?.enabled !== false,
  note: c?.note || "",
  columns: (c?.columns || []).map((x) => String(x ?? "")),
  rows: (c?.rows || []).map((r) => ({ size: r?.size || "", values: (r?.values || []).map((x) => String(x ?? "")) })),
});

/** Payload for the API: trimmed, blank rows dropped, every row padded to the column count. */
export const chartToBody = (c) => {
  const columns = (c.columns || []).map((x) => x.trim()).filter(Boolean);
  const rows = (c.rows || [])
    .filter((r) => r.size.trim())
    .map((r) => ({
      size: r.size.trim(),
      values: Array.from({ length: columns.length }, (_, i) => (r.values[i] || "").trim()),
    }));

  return { enabled: Boolean(c.enabled), note: (c.note || "").trim(), columns, rows };
};

/** Field-level errors, keyed like the rest of the Settings form. */
export const validateCharts = (charts) => {
  const e = {};

  for (const { key, label } of CHART_AUDIENCES) {
    const c = charts[key];
    const columns = (c.columns || []).map((x) => x.trim());
    const rows = c.rows || [];

    if (columns.some((x) => !x) && rows.some((r) => r.size.trim())) e[`sizeCharts.${key}`] = `${label}: every column needs a heading.`;
    else if (rows.some((r) => !r.size.trim() && r.values.some((v) => v.trim()))) e[`sizeCharts.${key}`] = `${label}: a row with values needs a size name.`;
    else if (rows.filter((r) => r.size.trim()).length && !columns.length) e[`sizeCharts.${key}`] = `${label}: add at least one column before adding sizes.`;
    else {
      const names = rows.map((r) => r.size.trim().toLowerCase()).filter(Boolean);
      if (new Set(names).size !== names.length) e[`sizeCharts.${key}`] = `${label}: the same size is listed twice.`;
    }
  }

  return e;
};

const inp = "w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#00130d] outline-none disabled:bg-slate-50 disabled:text-slate-500";
const smallBtn = "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50";

function ChartEditor({ audience, chart, onChange, disabled }) {
  const { key, label, hint } = audience;
  const patch = (next) => onChange({ ...chart, ...next });
  const setRow = (i, next) => patch({ rows: chart.rows.map((r, idx) => (idx === i ? { ...r, ...next } : r)) });

  const addColumn = () => patch({ columns: [...chart.columns, ""], rows: chart.rows.map((r) => ({ ...r, values: [...r.values, ""] })) });
  const removeColumn = (i) =>
    patch({ columns: chart.columns.filter((_, idx) => idx !== i), rows: chart.rows.map((r) => ({ ...r, values: r.values.filter((_, idx) => idx !== i) })) });
  const addRow = () => patch({ rows: [...chart.rows, { size: "", values: chart.columns.map(() => "") }] });

  return (
    <div className="space-y-4" data-testid={`chart-${key}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{label} size chart</h3>
          <p className="text-[11px] text-slate-500 max-w-xl">{hint}</p>
        </div>
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Toggle checked={chart.enabled} onChange={(v) => patch({ enabled: v })} disabled={disabled} label={`Show the ${label} size chart on the storefront`} />
          Show on storefront
        </span>
      </div>

      <label className="block text-xs font-semibold text-slate-700">
        Note under the table <span className="font-normal text-slate-400">(optional)</span>
        <input
          className={`${inp} mt-1`}
          maxLength={400}
          disabled={disabled}
          data-testid={`chart-${key}-note`}
          placeholder="e.g. Measured flat across the chest. If you are between sizes, take the larger one."
          value={chart.note}
          onChange={(e) => patch({ note: e.target.value })}
        />
      </label>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border border-slate-200 rounded-lg">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-40">Size</th>
              {chart.columns.map((c, i) => (
                <th key={i} className="px-2 py-2 text-left">
                  <div className="flex items-center gap-1">
                    <input
                      className={inp}
                      maxLength={60}
                      disabled={disabled}
                      aria-label={`Column ${i + 1} heading`}
                      data-testid={`chart-${key}-col-${i}`}
                      placeholder={key === "kids" ? "Recommended age" : "Chest (in)"}
                      value={c}
                      onChange={(e) => patch({ columns: chart.columns.map((x, idx) => (idx === i ? e.target.value : x)) })}
                    />
                    <button type="button" disabled={disabled} onClick={() => removeColumn(i)} aria-label={`Remove column ${i + 1}`} className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {chart.rows.length === 0 && (
              <tr>
                <td colSpan={chart.columns.length + 2} className="px-3 py-6 text-center text-[11px] text-slate-500">
                  No sizes yet. This chart is not shown on the storefront until you add one.
                </td>
              </tr>
            )}
            {chart.rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-2 py-1.5">
                  <input className={inp} maxLength={40} disabled={disabled} aria-label={`Size ${i + 1}`} data-testid={`chart-${key}-size-${i}`} placeholder="Small" value={r.size} onChange={(e) => setRow(i, { size: e.target.value })} />
                </td>
                {chart.columns.map((_, ci) => (
                  <td key={ci} className="px-2 py-1.5">
                    <input
                      className={inp}
                      maxLength={60}
                      disabled={disabled}
                      aria-label={`${r.size || `Size ${i + 1}`} ${chart.columns[ci] || `column ${ci + 1}`}`}
                      data-testid={`chart-${key}-cell-${i}-${ci}`}
                      placeholder={key === "kids" ? "3-4 years" : "38-40"}
                      value={r.values[ci] || ""}
                      onChange={(e) => setRow(i, { values: Array.from({ length: chart.columns.length }, (_, x) => (x === ci ? e.target.value : r.values[x] || "")) })}
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <button type="button" disabled={disabled} onClick={() => patch({ rows: chart.rows.filter((_, idx) => idx !== i) })} aria-label={`Remove size row ${i + 1}`} className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={smallBtn} disabled={disabled} onClick={addColumn} data-testid={`chart-${key}-add-col`}><Plus className="w-3 h-3" /> Add column</button>
        <button type="button" className={smallBtn} disabled={disabled} onClick={addRow} data-testid={`chart-${key}-add-row`}><Plus className="w-3 h-3" /> Add size</button>
        {key === "kids" && (
          <button
            type="button"
            className={smallBtn}
            disabled={disabled}
            data-testid="chart-kids-restore"
            onClick={() => patch({ columns: ["Recommended age"], rows: KIDS_AGE_ROWS.map((r) => ({ ...r, values: [...r.values] })) })}
          >
            <RotateCcw className="w-3 h-3" /> Restore client age ranges
          </button>
        )}
      </div>
    </div>
  );
}

/** The whole Size Charts tab: one audience at a time. */
export function SizeChartsEditor({ charts, onChange, errors = {}, disabled }) {
  const [active, setActive] = useState("kids");
  const audience = CHART_AUDIENCES.find((a) => a.key === active);
  const filled = (k) => (charts[k]?.rows || []).filter((r) => r.size.trim()).length;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-slate-900">Size charts</h3>
        <p className="text-xs text-slate-500 max-w-3xl">
          Shown on the product page so customers pick the right size. Column headings are yours to choose - an age range for
          kids, or chest/waist/length for adults. A chart with no sizes is not shown on the storefront.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Size chart audience">
        {CHART_AUDIENCES.map((a) => (
          <button
            key={a.key}
            type="button"
            role="tab"
            aria-selected={active === a.key}
            onClick={() => setActive(a.key)}
            data-testid={`chart-tab-${a.key}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${active === a.key ? "bg-[#00130d] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {a.label}
            <span className={`ml-1.5 font-normal ${active === a.key ? "text-white/60" : "text-slate-400"}`}>{filled(a.key) || "—"}</span>
          </button>
        ))}
      </div>

      {CHART_AUDIENCES.map((a) => errors[`sizeCharts.${a.key}`] && <p key={a.key} className="text-xs text-rose-600">{errors[`sizeCharts.${a.key}`]}</p>)}

      <ChartEditor audience={audience} chart={charts[active]} onChange={(next) => onChange({ ...charts, [active]: next })} disabled={disabled} />
    </div>
  );
}
