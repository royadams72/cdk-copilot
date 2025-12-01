declare module "victory-native" {
  import { ComponentType } from "react";

  export interface VictoryPieProps {
    data?: Array<{ x?: string | number; y?: number }>;
    width?: number;
    height?: number;
    innerRadius?: number;
    colorScale?: string[] | string;
    startAngle?: number;
    endAngle?: number;
    cornerRadius?: number;
    animate?: boolean | object;
    labels?: (props: any) => string | null;
    standalone?: boolean;
  }

  export const VictoryPie: ComponentType<VictoryPieProps>;
}
