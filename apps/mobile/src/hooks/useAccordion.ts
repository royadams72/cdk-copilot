import { useState, useRef, useEffect } from "react";

export default function useAccorion(activeIndex: number) {
  const myRefs = useRef<(any | null)[]>([]);
  useEffect(() => {
    if (myRefs.current[activeIndex]) {
      const topOffset = 300;
      myRefs.current[activeIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      window.scrollBy(0, -topOffset);
    }
  }, [activeIndex]);

  return myRefs;
}
