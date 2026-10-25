import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Star, X } from 'lucide-react';
import { mediaApi, MEDIA_PURPOSES, toImageRef } from '../../services/mediaApi';
import { errorMessage } from '../../lib/apiError';
import { ImageCropDialog } from './ImageCropDialog';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Multi-image field backed by POST /media. value: [{ url, publicId, alt }]; first image = primary.
 * Files upload one by one; failures are listed without losing the ones that succeeded.
 */
export const ImageGalleryUpload = ({ value = [], onChange, purpose, max = 10, adjust = false, disabled = false, columns = 'grid-cols-3 sm:grid-cols-5', aspect = 'aspect-[3/4]' }) => {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(null); // { done, total, percent }
  const [problems, setProblems] = useState([]);
  const [crop, setCrop] = useState(null); // { file, index, total, resolve }
  const maxMb = MEDIA_PURPOSES[purpose]?.maxMb ?? 8;
  const room = Math.max(0, max - value.length);

  const pick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const issues = [];
    const accepted = [];
    for (const f of files) {
      if (!ACCEPT.split(',').includes(f.type)) issues.push(`${f.name}: use JPEG, PNG or WebP`);
      else if (f.size > maxMb * 1024 * 1024) issues.push(`${f.name}: larger than ${maxMb} MB`);
      else accepted.push(f);
    }
    if (accepted.length > room) {
      issues.push(`Only ${room} more image${room === 1 ? '' : 's'} allowed (max ${max}).`);
      accepted.length = room;
    }
    setProblems(issues);
    if (!accepted.length) return;
    let current = [...value];
    for (let i = 0; i < accepted.length; i += 1) {
      let file = accepted[i];
      if (adjust) {
        // Optional crop step: resolves to the adjusted file, the untouched original, or null (skip this image).
        file = await new Promise((resolve) => setCrop({ file, index: i + 1, total: accepted.length, resolve }));
        setCrop(null);
        if (!file) { issues.push(`${accepted[i].name}: skipped`); setProblems([...issues]); continue; }
        if (file.size > maxMb * 1024 * 1024) {
          issues.push(`${accepted[i].name}: adjusted image is larger than ${maxMb} MB — choose Use original or a smaller image`);
          setProblems([...issues]);
          continue;
        }
      }
      setBusy({ done: i, total: accepted.length, percent: 0 });
      try {
        const media = await mediaApi.upload(file, purpose, {
          onProgress: (percent) => setBusy({ done: i, total: accepted.length, percent }),
        });
        current = [...current, toImageRef(media)];
        onChange(current);
      } catch (err) {
        issues.push(`${accepted[i].name}: ${errorMessage(err, 'Upload failed')}`);
        setProblems([...issues]);
      }
    }
    setBusy(null);
  };

  const remove = (idx) => onChange(value.filter((_, i) => i !== idx));
  const makePrimary = (idx) => onChange([value[idx], ...value.filter((_, i) => i !== idx)]);

  return (
    <div className="space-y-3">
      {crop && (
        <ImageCropDialog
          file={crop.file}
          index={crop.index}
          total={crop.total}
          onDone={(f) => crop.resolve(f)}
          onSkip={() => crop.resolve(crop.file)}
          onCancel={() => crop.resolve(null)}
        />
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || !!busy || room === 0}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          {busy ? `Uploading ${busy.done + 1}/${busy.total} · ${busy.percent}%` : 'Upload images'}
        </button>
        <span className="text-[11px] text-slate-500">
          {value.length}/{max} · JPEG, PNG or WebP · up to {maxMb} MB each
        </span>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={pick} />
      </div>
      {problems.length > 0 && (
        <ul className="text-xs text-rose-600 font-medium space-y-0.5" role="alert">
          {problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      {value.length > 0 && (
        <div className={`grid ${columns} gap-3`}>
          {value.map((img, idx) => (
            <div key={img.publicId || img.url} className={`relative group rounded-lg overflow-hidden border border-slate-200 ${aspect} bg-slate-100`}>
              <img src={img.url} alt={img.alt || `Image ${idx + 1}`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex flex-col justify-between p-2">
                <span className="text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded self-start">{idx === 0 ? 'Primary' : `#${idx + 1}`}</span>
                <div className="flex items-center justify-between gap-1">
                  {idx !== 0 ? (
                    <button type="button" disabled={disabled} onClick={() => makePrimary(idx)} className="p-1 bg-white/90 text-slate-800 rounded hover:bg-white" title="Make primary">
                      <Star className="w-3 h-3" />
                    </button>
                  ) : <span />}
                  <button type="button" disabled={disabled} onClick={() => remove(idx)} className="p-1 bg-rose-600 text-white rounded hover:bg-rose-700" title="Remove from this product">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
