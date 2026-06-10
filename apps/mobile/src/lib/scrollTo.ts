import type { RefObject } from "react";

type ScrollableRef = {
  scrollTo: (options: { animated?: boolean; x?: number; y?: number }) => void;
};

export function scrollToY(
  ref: RefObject<ScrollableRef | null>,
  y = 0,
  animated = true,
) {
  ref.current?.scrollTo({ animated, y });
}

export function scrollToTop(
  ref: RefObject<ScrollableRef | null>,
  animated = true,
) {
  scrollToY(ref, 0, animated);
}
