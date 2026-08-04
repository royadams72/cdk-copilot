/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from "react-native";

export const palette = {
  purple: "#8B5CF6",
  purpleDark: "#7C3AED",
  green: "#10B981",
  greenDark: "#047857",
  red: "#FF4545",
  redDark: "#B91C1C",
  yellow: "#FFD600",
  orange: "#F97316",
  blue: "#38BDF8",
  cyan: "#22D3EE",
  ink: "#111827",
  slate: "#475569",
  muted: "#64748B",
  border: "#CBD5E1",
  panel: "#E5E7EB",
  canvas: "#DCE6FF",
  surface: "#FFFFFF",
  black: "#000000",
} as const;

export const theme = {
  colors: {
    background: palette.canvas,
    surface: palette.surface,
    surfaceMuted: "#F8FAFC",
    text: palette.ink,
    textSecondary: palette.slate,
    textMuted: palette.muted,
    border: palette.border,
    borderSubtle: "rgba(148,163,184,0.35)",
    overlay: "rgba(15,23,42,0.55)",
    primary: palette.purple,
    primaryPressed: palette.purpleDark,
    onPrimary: palette.surface,
    success: palette.green,
    successDark: palette.greenDark,
    successSoft: "rgba(16,185,129,0.16)",
    warning: palette.yellow,
    warningDark: "#854D0E",
    warningSoft: "rgba(250,204,21,0.18)",
    danger: palette.red,
    dangerDark: palette.redDark,
    dangerSoft: "rgba(255,69,69,0.14)",
    info: "#2563EB",
    infoDark: "#1E3A8A",
    infoSoft: "rgba(37,99,235,0.14)",
    control: palette.panel,
    controlPressed: "#D1D5DB",
    disabled: "#D1D5DB",
    disabledText: palette.muted,
    chart: {
      calories: palette.green,
      protein: palette.purple,
      phosphorus: palette.orange,
      potassium: palette.blue,
      sodium: palette.cyan,
      target: "#6366F1",
      grid: "rgba(148,163,184,0.28)",
    },
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },
  radii: { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 },
  controls: { compactHeight: 36, height: 48, touchTarget: 44 },
  charts: { compactHeight: 144, radialSize: 172 },
} as const;

const tintColorLight = theme.colors.primary;
const tintColorDark = palette.surface;

export const Colors = {
  light: {
    text: theme.colors.text,
    background: theme.colors.background,
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: "#ECEDEE",
    background: "#151718",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
