import { Maximize2, X } from "lucide-react";
import { useRef } from "react";

export type LandingShot = {
  src: string;
  preview?: string;
  mobile?: string;
  width: number;
  height: number;
  alt: string;
  title: string;
};

export function ProductScreenshot({
  shot,
  priority = false,
  onDialogChange,
}: {
  shot: LandingShot;
  priority?: boolean;
  onDialogChange?: (open: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <div className="route-shot" data-ui>
      <a
        href={shot.src}
        aria-label={`Увеличить скриншот: ${shot.title}`}
        className="route-shot-link"
        onClick={(event) => {
          if (!dialog.current || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          dialog.current.showModal();
          onDialogChange?.(true);
        }}
      >
        <picture key={shot.src}>
          {shot.mobile && <source media="(max-width: 640px)" srcSet={shot.mobile} />}
          <img
            src={shot.preview ?? shot.src}
            width={shot.width}
            height={shot.height}
            alt={shot.alt}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
          />
        </picture>
        <span className="route-zoom" aria-hidden="true"><Maximize2 size={17} /></span>
      </a>
      <dialog ref={dialog} className="route-lightbox" aria-label={shot.title} onClose={() => onDialogChange?.(false)}>
        <div className="route-lightbox-bar">
          <p>{shot.title}</p>
          <button type="button" aria-label="Закрыть скриншот" onClick={() => dialog.current?.close()}>
            <X size={20} />
          </button>
        </div>
        <div className="route-lightbox-image" tabIndex={0} role="region" aria-label="Полноразмерный скриншот">
          <img src={shot.src} width={shot.width} height={shot.height} alt={shot.alt} loading="lazy" />
        </div>
      </dialog>
    </div>
  );
}
