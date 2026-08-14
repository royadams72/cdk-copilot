import { Pressable, View } from "react-native";
import Svg, {
  Circle,
  Line,
  Polyline,
  Text as SvgText,
} from "react-native-svg";
import { theme } from "@/constants/theme";

export type TrendLinePadding = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type TrendLinePoint = {
  index: number;
  visible: boolean;
  x: number;
  y: number;
};

export type TrendLineSeries = {
  color: string;
  id: string;
  points: TrendLinePoint[];
};

export type TrendLineTarget = {
  color: string;
  id: string;
  y: number;
};

export type TrendLineLabel = {
  index: number;
  label: string;
  x: number;
};

type Props = {
  gridRatios?: number[];
  height: number;
  labelColor?: string;
  lineColor?: string;
  onSelectIndex?: (index: number) => void;
  padding: TrendLinePadding;
  selectedIndex?: number | null;
  series: TrendLineSeries[];
  targets?: TrendLineTarget[];
  width: number;
  xLabels: TrendLineLabel[];
};

function segmentPoints(points: TrendLinePoint[]) {
  const segments: TrendLinePoint[][] = [];
  let current: TrendLinePoint[] = [];

  for (const point of points) {
    if (!point.visible) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }
  if (current.length) segments.push(current);

  return segments;
}

export function TrendLineChart({
  gridRatios = [],
  height,
  labelColor = theme.colors.textSecondary,
  lineColor = theme.colors.border,
  onSelectIndex,
  padding,
  selectedIndex = null,
  series,
  targets = [],
  width,
  xLabels,
}: Props) {
  const activeSelected = typeof selectedIndex === "number" ? selectedIndex : null;
  const slotWidth =
    xLabels.length > 1 ? Math.max(20, xLabels[1].x - xLabels[0].x) : 28;

  return (
    <View style={{ height, position: "relative", width }}>
      <Svg width={width} height={height}>
        <Line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke={lineColor}
          strokeWidth={1}
        />
        <Line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke={lineColor}
          strokeWidth={1}
        />

        {gridRatios.map((ratio) => {
          const y =
            padding.top + (height - padding.top - padding.bottom) * ratio;
          return (
            <Line
              key={`grid-${ratio}`}
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke={theme.colors.chart.grid}
              strokeWidth={1}
            />
          );
        })}

        {targets.map((line) => (
          <Line
            key={line.id}
            x1={padding.left}
            x2={width - padding.right}
            y1={line.y}
            y2={line.y}
            stroke={line.color}
            strokeDasharray="6 4"
            strokeWidth={1.5}
          />
        ))}

        {series.map((line) =>
          segmentPoints(line.points)
            .filter((segment) => segment.length > 1)
            .map((segment, segmentIndex) => (
              <Polyline
                key={`${line.id}-seg-${segmentIndex}`}
                points={segment.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke={line.color}
                strokeWidth={3}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={activeSelected === null ? 1 : 0.95}
              />
            )),
        )}

        {series.flatMap((line) =>
          line.points
            .filter((point) => point.visible)
            .map((point) => (
              <Circle
                key={`${line.id}-dot-${point.index}`}
                cx={point.x}
                cy={point.y}
                r={4}
                fill={activeSelected === point.index ? line.color : theme.colors.surface}
                stroke={activeSelected === point.index ? theme.colors.surface : line.color}
                strokeWidth={2}
                opacity={
                  activeSelected === null || activeSelected === point.index
                    ? 1
                    : 0.55
                }
              />
            )),
        )}

        {xLabels.map((point) => (
          <SvgText
            key={`x-${point.index}`}
            x={point.x}
            y={height - 8}
            textAnchor="middle"
            fontSize={10}
            fill={labelColor}
          >
            {point.label}
          </SvgText>
        ))}
      </Svg>
      <View
        pointerEvents="box-none"
        style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
      >
        {xLabels.map((point) => (
          <Pressable
            key={`press-${point.index}`}
            onPress={() => onSelectIndex?.(point.index)}
            style={{
              height: height - padding.top - padding.bottom,
              left: point.x - slotWidth / 2,
              position: "absolute",
              top: padding.top,
              width: slotWidth,
            }}
          />
        ))}
      </View>
    </View>
  );
}
