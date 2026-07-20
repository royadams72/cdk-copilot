export type InvalidFieldTarget = HTMLElement | null | undefined;

type FocusFirstInvalidFieldOptions = {
  block?: ScrollLogicalPosition;
  inline?: ScrollLogicalPosition;
};

/**
 * Scrolls to and focuses the first available target in form order.
 * Pass only currently invalid fields; after one is corrected, the next call
 * naturally advances to the next remaining invalid field.
 */
export function focusFirstInvalidField(
  targets: InvalidFieldTarget[],
  options: FocusFirstInvalidFieldOptions = {},
) {
  if (typeof window === "undefined") {
    return false;
  }

  const target = targets.find(
    (candidate): candidate is HTMLElement =>
      candidate instanceof HTMLElement && !candidate.hidden,
  );

  if (!target) {
    return false;
  }

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  target.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: options.block ?? "center",
    inline: options.inline ?? "nearest",
  });

  window.requestAnimationFrame(() => {
    target.focus({ preventScroll: true });
  });

  return true;
}
