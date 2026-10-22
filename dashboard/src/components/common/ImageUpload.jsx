import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { mediaApi, MEDIA_PURPOSES, toImageRef } from '../../services/mediaApi';
import { errorMessage } from '../../lib/apiError';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Upload-through-backend image field.
 * value: { url, publicId?, alt? } | null      onChange(value | null)
 * The file is uploaded to POST /media immediately; the form then stores the returned
 * Cloudinary reference. Removing an image only detaches it from the form — the stored
 * file is cleaned up by the backend (it refuses to delete files that are still in use).
 */
export const ImageUpload = ({ value, onChange, purpose, label = 'Image', disabled = false, error }) => {
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [problem, setProblem] = useState('');
  const maxMb = MEDIA_PURPOSES[purpose]?.maxMb ?? 5;
  const busy = progress !== null;

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProblem('');
    if (!ACCEPT.split(',').includes(file.type)) return setProblem('Use a JPEG, PNG or WebP image.');
    if (file.size > maxMb * 1024 * 1024) return setProblem(`Image is too large (max ${maxMb} MB).`);
    setProgress(0);
    try {
      const media = await mediaApi.upload(file, purpose, { onProgress: setProgress });
      onChange(toImageRef(media, value?.alt));
    } catch (err) {
      setProblem(errorMessage(err, 'Upload failed'));
    } finally {
      setProgress(null);
    }
  };

  const shown = error || problem;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden relative shrink-0">
          {value?.url ? (
            <img src={value.url} alt={value.alt || label} className="w-full h-full object-cover" />
          ) : (
            <ImagePlus className="w-5 h-5 text-slate-400" />
          )}
          {busy && (
            <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center text-[11px] font-semibold text-slate-700">
              <Loader2 className="w-4 h-4 animate-spin mb-0.5" />
              {progress}%
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {value?.url ? 'Replace' : 'Upload'} {label.toLowerCase()}
            </button>
            {value?.url && (
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => onChange(null)}
                className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 disabled:opacity-50"
                aria-label={`Remove ${label.toLowerCase()}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-[11px] text-slate-500">JPEG, PNG or WebP · up to {maxMb} MB</span>
        </div>
        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={pick} />
      </div>
      {shown && <span className="text-xs text-rose-600 font-medium">{shown}</span>}
    </div>
  );
};
