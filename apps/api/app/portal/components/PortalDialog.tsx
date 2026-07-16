"use client";

import { type MouseEvent, type ReactNode, useEffect, useRef } from "react";

import styles from "@/apps/api/app/portal/portal.module.css";

type PortalDialogProps = {
  children: ReactNode;
  className?: string;
  labelledBy: string;
  onClose?: () => void;
};

export function PortalDialog({
  children,
  className = "",
  labelledBy,
  onClose,
}: PortalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }

    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget && onClose) onClose();
  }

  return (
    <dialog
      aria-labelledby={labelledBy}
      className={styles.portalDialog}
      onCancel={(event) => {
        if (!onClose) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
      ref={dialogRef}
    >
      <div className={`${styles.modalCard} ${className}`.trim()}>{children}</div>
    </dialog>
  );
}
