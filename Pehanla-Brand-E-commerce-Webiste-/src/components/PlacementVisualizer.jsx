import React from 'react';

/** Zones per view, with hot-spot positions on a 300x340 garment drawing. Names are "wearer's" left/right. */
export const PLACEMENT_ZONES = {
  front: [
    { name: 'Left Chest', x: 190, y: 112 },
    { name: 'Right Chest', x: 110, y: 112 },
    { name: 'Center Front', x: 150, y: 178 },
    { name: 'Left Sleeve', x: 262, y: 92 },
  ],
  back: [
    { name: 'Back Collar / Nape', x: 150, y: 66 },
    { name: 'Center Back', x: 150, y: 160 },
  ],
};
export const SIZE_OPTIONS = ['Small (up to 3 in)', 'Medium (up to 6 in)', 'Large (up to 10 in)', 'Oversized / all-over'];

const SHIRT = 'M100 30 L60 45 L15 95 L50 120 L75 100 L75 310 L225 310 L225 100 L250 120 L285 95 L240 45 L200 30 Q150 62 100 30 Z';

/**
 * Interactive placement picker: click a hot spot on the garment (or use the list - both are real buttons)
 * to toggle a placement. `value` = { [zoneName]: { view, size, note } }.
 */
export default function PlacementVisualizer({ view, onView, value, onToggle, onChange }) {
  const zones = PLACEMENT_ZONES[view];
  const selected = Object.keys(value);
  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] gap-8 items-start" data-testid="placement-visualizer">
      <div>
        <div className="flex gap-2 mb-4" role="group" aria-label="Garment view">
          {['front', 'back'].map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => onView(v)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase cursor-pointer ${view === v ? 'bg-primary text-white' : 'bg-surface-container text-muted'}`}>{v}</button>
          ))}
        </div>
        <svg viewBox="0 0 300 340" role="group" aria-label={`Garment ${view} view`} className="w-full max-w-[320px] bg-surface-container-low rounded-2xl border border-border-subtle">
          <path d={SHIRT} fill="#fff" stroke="#173B32" strokeWidth="2" strokeLinejoin="round" />
          {view === 'front' && <path d="M100 30 Q150 70 200 30" fill="none" stroke="#173B32" strokeWidth="2" />}
          {zones.map((z) => {
            const on = Boolean(value[z.name]);
            return (
              <g key={z.name}>
                <circle cx={z.x} cy={z.y} r={on ? 17 : 14} fill={on ? '#A8BD24' : 'rgba(23,59,50,0.08)'} stroke="#173B32" strokeWidth="2" strokeDasharray={on ? '0' : '4 3'} />
                <text x={z.x} y={z.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#173B32" aria-hidden="true">{on ? '✓' : '+'}</text>
                <circle cx={z.x} cy={z.y} r="20" fill="transparent" role="button" tabIndex={0} aria-pressed={on} aria-label={`${z.name} placement`} className="cursor-pointer focus:outline-none focus-visible:stroke-[#173B32] focus-visible:stroke-2" onClick={() => onToggle(z.name, view)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(z.name, view); } }} />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-col gap-3">
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {zones.map((z) => {
            const on = Boolean(value[z.name]);
            return (
              <li key={z.name}>
                <button type="button" aria-pressed={on} onClick={() => onToggle(z.name, view)} className={`w-full p-3 rounded-xl text-left flex items-center justify-between text-sm font-semibold cursor-pointer border ${on ? 'bg-primary text-white border-primary' : 'bg-white border-border-subtle'}`}>
                  <span>{z.name}</span><span className="text-[10px] uppercase">{on ? 'Selected' : 'Select'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {selected.length > 0 && (
          <div className="bg-white border border-border-subtle rounded-xl p-4 flex flex-col gap-3" data-testid="placement-details">
            <h3 className="font-headline font-bold text-sm text-primary">Placement details</h3>
            {selected.map((name) => (
              <div key={name} className="grid sm:grid-cols-[140px_1fr_1fr] gap-2 items-end">
                <p className="text-sm font-semibold">{name}<span className="block text-[11px] font-normal text-muted capitalize">{value[name].view} view</span></p>
                <div>
                  <label htmlFor={`sz-${name}`} className="block text-[11px] font-semibold text-muted mb-1">Size</label>
                  <select id={`sz-${name}`} value={value[name].size} onChange={(e) => onChange(name, { size: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-sm">{SIZE_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select>
                </div>
                <div>
                  <label htmlFor={`nt-${name}`} className="block text-[11px] font-semibold text-muted mb-1">Note (optional)</label>
                  <input id={`nt-${name}`} maxLength={200} value={value[name].note} onChange={(e) => onChange(name, { note: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-sm" placeholder="e.g. 2 colours" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
