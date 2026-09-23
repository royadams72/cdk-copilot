import { createContext, PropsWithChildren, useContext } from "react";

export type SurfaceTone = "background" | "surface";

const SurfaceToneContext = createContext<SurfaceTone>("background");
export function SurfaceToneProvider({
  children,
  tone,
}: PropsWithChildren<{ tone: SurfaceTone }>) {
  return (
    <SurfaceToneContext.Provider value={tone}>
      {children}
    </SurfaceToneContext.Provider>
  );
}

export function useSurfaceTone() {
  return useContext(SurfaceToneContext);
}
