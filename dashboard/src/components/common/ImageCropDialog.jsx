import { useEffect, useMemo, useRef, useState } from 'react';
import { Crop, X } from 'lucide-react';
import { CROP_PRESETS, cropRect, exportCrop, previewStyle } from '../../lib/imageCrop';

/**
 * Adjust-before-upload dialog. The admin picks a frame (Original / 1:1 / 4:5 / 3:2), drags to
 * reposition and zooms; the preview is the exact crop that is exported, so nothing is stretched.
 * "Original" uploads the file untouched.
 *
 * props: file (File), index/total (queue position), onDone(File), onSkip() (upload the original), onCancel()
 */
export const ImageCropDialog = ({ file, index = 1, total = 1, onDone, onSkip, onCancel }) => {
  const [url, setUrl] = useState('');
  const [nat, setNat] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [presetId, setPresetId] = useState('original');
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const imgRef = useRef(null);
  const frameRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const preset = CROP_PRESETS.find((p) => p.id === presetId);
  const ratio = preset.ratio;
  const rect = useMemo(
    () => (nat && ratio ? cropRect(nat.w, nat.h, ratio, zoom, center.x, center.y) : null),
    [nat, ratio, zoom, center],
  );

  const choose = (id) => { setPresetId(id); setZoom(1); setCenter({ x: 0.5, y: 0.5 }); setError(''); };

  const onPointerDown = (e) => {
    if (!rect) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, cx: center.x, cy: center.y };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || !rect || !frameRef.current) return;
    const box = frameRef.current.getBoundingClientRect();
    // moving the pointer right drags the picture right, i.e. the crop window moves left over the source
    const dx = ((e.clientX - d.sx) / box.width) * rect.w;
    const dy = ((e.clientY - d.sy) / box.height) * rect.h;
    setCenter({
      x: Math.min(1, Math.max(0, d.cx - dx / nat.w)),
      y: Math.min(1, Math.max(0, d.cy - dy / nat.h)),
    });
  };
  const endDrag = () => { drag.current = null; };

  const onKey = (e) => {
    if (!rect) return;
    const step = 0.02;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setCenter((c) => ({ x: Math.min(1, Math.max(0, c.x + m[0])), y: Math.min(1, Math.max(0, c.y + m[1])) }));
  };

  const apply = async () => {
    if (!ratio) return onSkip();
    setSaving(true);
    setError('');
    try {
      onDone(await exportCrop(imgRef.current, rect, file));
    } catch (err) {
      setError(err?.message || 'Could not adjust this image.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Adjust image">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 min-w-0">
            <Crop className="w-4 h-4 shrink-0" />
            <span className="truncate">Adjust image{total > 1 ? ` (${index} of ${total})` : ''} · {file.name}</span>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel this image" className="p-1 text-slate-500 hover:text-slate-800"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Frame shape">
            {CROP_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={p.id === presetId}
                onClick={() => choose(p.id)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${p.id === presetId ? 'bg-[#00130d] text-white border-[#00130d]' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
              >
                {p.label}
                <span className={`block text-[10px] font-normal ${p.id === presetId ? 'text-white/70' : 'text-slate-500'}`}>{p.hint}</span>
              </button>
            ))}
          </div>

          {loadError ? (
            <p className="text-xs text-rose-600 font-medium" role="alert">{loadError}</p>
          ) : (
            <div className="flex justify-center bg-slate-100 rounded-xl p-3">
              {ratio ? (
                <div
                  ref={frameRef}
                  data-testid="crop-frame"
                  tabIndex={0}
                  onKeyDown={onKey}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className="relative overflow-hidden bg-white cursor-grab active:cursor-grabbing touch-none outline-none focus:ring-2 focus:ring-[#00130d] select-none"
                  style={{ aspectRatio: String(ratio), width: ratio >= 1 ? 'min(100%, 420px)' : `min(100%, ${Math.round(380 * ratio)}px)` }}
                >
                  {rect && nat && <img ref={imgRef} src={url} alt="" draggable={false} style={previewStyle(nat.w, nat.h, rect)} />}
                  {!nat && <img ref={imgRef} src={url} alt="" className="hidden" onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} onError={() => setLoadError('This image could not be read. Choose a different file.')} />}
                </div>
              ) : (
                <img
                  ref={imgRef}
                  src={url}
                  alt="Preview"
                  data-testid="crop-original"
                  onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  onError={() => setLoadError('This image could not be read. Choose a different file.')}
                  className="max-h-[380px] max-w-full object-contain"
                />
              )}
            </div>
          )}

          {ratio && nat && (
            <label className="flex items-center gap-3 text-xs text-slate-600">
              <span className="w-12 shrink-0 font-semibold">Zoom</span>
              <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" aria-label="Zoom" />
              <span className="w-10 text-right tabular-nums">{zoom.toFixed(1)}×</span>
            </label>
          )}
          <p className="text-[11px] text-slate-500">
            {ratio
              ? 'Drag the picture (or use the arrow keys) to reposition. The preview is exactly what will be saved — the image is cropped, never stretched.'
              : 'The file is uploaded exactly as chosen. The storefront shows non-standard shapes whole, without cropping.'}
            {nat ? ` Source: ${nat.w}×${nat.h}px.` : ''}
          </p>
          {error && <p className="text-xs text-rose-600 font-medium" role="alert">{error}</p>}
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900">Skip this image</button>
          {ratio && <button type="button" onClick={onSkip} className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50">Use original</button>}
          <button type="button" disabled={saving || !!loadError || !nat} onClick={apply} className="px-4 py-2 text-xs font-semibold bg-[#00130d] text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">
            {ratio ? (saving ? 'Processing…' : 'Apply & upload') : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};
