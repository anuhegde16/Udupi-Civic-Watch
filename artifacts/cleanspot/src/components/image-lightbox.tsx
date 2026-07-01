import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageLightboxProps {
  images: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export function ImageLightbox({ images, index, onClose, onIndexChange }: ImageLightboxProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && images.length > 1) onIndexChange((index + 1) % images.length);
      else if (e.key === "ArrowLeft" && images.length > 1) onIndexChange((index - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, images.length, onClose, onIndexChange]);

  if (images.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center animate-in fade-in duration-200 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Full screen image viewer"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center text-white z-10 transition-colors"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIndexChange((index - 1 + images.length) % images.length); }}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center text-white z-10 transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIndexChange((index + 1) % images.length); }}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center text-white z-10 transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      <img
        src={images[index]}
        alt={`Full screen view ${index + 1} of ${images.length}`}
        className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg shadow-2xl select-none"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-full">
          {index + 1} / {images.length}
        </div>
      )}
    </div>,
    document.body
  );
}

interface LightboxState {
  images: string[];
  index: number;
}

/**
 * Hook that manages a full-screen image lightbox. Render the returned
 * `lightbox` element anywhere in the tree, and call `open(images, index)`
 * from any click handler to display it.
 */
export function useImageLightbox() {
  const [state, setState] = useState<LightboxState | null>(null);

  const open = useCallback((images: string[], index = 0) => {
    if (images.length === 0) return;
    setState({ images, index });
  }, []);

  const close = useCallback(() => setState(null), []);

  const setIndex = useCallback((index: number) => {
    setState((s) => (s ? { ...s, index } : s));
  }, []);

  const lightbox = state ? (
    <ImageLightbox images={state.images} index={state.index} onClose={close} onIndexChange={setIndex} />
  ) : null;

  return { lightbox, open };
}
