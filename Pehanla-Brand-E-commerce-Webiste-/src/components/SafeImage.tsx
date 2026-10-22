import React, { useState } from 'react';

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackLabel?: string;
}

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt,
  className = '',
  fallbackLabel,
  ...rest
}) => {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#EBEFE8] text-[#173B32] p-4 text-center select-none ${className}`}
        role="img"
        aria-label={alt || fallbackLabel || 'PEHANLY Garment'}
      >
        <span className="material-symbols-outlined text-3xl opacity-60 mb-1">checkroom</span>
        <span className="font-headline text-[10px] uppercase tracking-widest font-semibold opacity-75 line-clamp-2">
          {fallbackLabel || alt || 'PEHANLY Studio'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || 'PEHANLY Garment'}
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setHasError(true)}
      {...rest}
    />
  );
};
