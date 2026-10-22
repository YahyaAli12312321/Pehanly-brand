import React from 'react';

/** Shared loading / empty / error states, styled with the existing tokens. */

export function LoadingBlock({ label = 'Loading…', className = 'py-24' }) {
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-3 text-muted ${className}`}>
      <span className="material-symbols-outlined animate-spin text-3xl text-primary" aria-hidden="true">progress_activity</span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBlock({ error, onRetry, title = 'We could not load this', className = 'py-20' }) {
  return (
    <div role="alert" className={`flex flex-col items-center text-center gap-3 px-6 ${className}`}>
      <span className="material-symbols-outlined text-4xl text-error" aria-hidden="true">error</span>
      <h2 className="font-headline text-lg font-bold text-primary">{title}</h2>
      <p className="text-sm text-muted max-w-md">{error?.message || 'Please try again in a moment.'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold cursor-pointer">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({ icon = 'inventory_2', title, text, action, className = 'py-20' }) {
  return (
    <div className={`flex flex-col items-center text-center gap-3 px-6 ${className}`}>
      <span className="material-symbols-outlined text-5xl text-muted" aria-hidden="true">{icon}</span>
      <h2 className="font-headline text-lg font-bold text-primary">{title}</h2>
      {text && <p className="text-sm text-muted max-w-md">{text}</p>}
      {action}
    </div>
  );
}

/** Inline field error: pair with aria-describedby on the input. */
export function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[11px] font-medium text-error">
      {message}
    </p>
  );
}
