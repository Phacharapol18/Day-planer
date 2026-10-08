import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Thin wrapper over <dialog>: native focus trapping, inert background, Esc to close,
 * and focus returns to whatever opened it. Backdrop clicks close it too.
 *
 * Initial focus: React's autoFocus runs before showModal() and is lost, so the dialog places it
 * itself once open: `initialFocus(el)` if given, else the first `[data-autofocus]`, else the dialog
 * (never the first control, which would ring "Skip" or open the keyboard on a phone).
 */
export function Dialog({
  open,
  onClose,
  label,
  className,
  initialFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  initialFocus?: (el: HTMLDialogElement) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = document.activeElement;
      el.showModal();
      if (initialFocusRef.current) initialFocusRef.current(el);
      else (el.querySelector<HTMLElement>('[data-autofocus]') ?? el).focus();
    } else if (!open && el.open) {
      el.close();
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    el.addEventListener('cancel', cancel);
    return () => el.removeEventListener('cancel', cancel);
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog ${className ?? ''}`}
      aria-label={label}
      tabIndex={-1}
      onPointerDown={(e) => {
        // A press that starts on the backdrop (the dialog element itself, outside its content) closes it.
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
          if (!inside) onCloseRef.current();
        }
      }}
    >
      {open && <div className="dialog-body">{children}</div>}
    </dialog>
  );
}
