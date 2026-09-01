/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from "react-native";

export const palette = {
  black: "#000000",
  blue: "#0876D1",
  blueDark: "#075FA8",
  border: "#CBD5E1",
  canvas: "#DCE6FF",
  cyan: "#22D3EE",
  green: "#10B981",
  greenDark: "#047857",
  ink: "#111827",
  muted: "#64748B",
  orange: "#F97316",
  panel: "#E5E7EB",
  purple: "#8B5CF6",
  purpleDark: "#7C3AED",
  red: "#FF4545",
  redDark: "#B91C1C",
  slate: "#475569",
  surface: "#FFFFFF",
  yellow: "#f7cf00",
} as const;

export const theme = {
  charts: { compactHeight: 144, radialSize: 152 },
  colors: {
    background: palette.canvas,
    surface: palette.surface,
    surfaceMuted: "#F8FAFC",
    text: palette.ink,
    copy: palette.muted,
    panelHeader: "#5B5B5B",
    textSecondary: palette.slate,
    textMuted: palette.muted,
    border: palette.border,
    borderSubtle: "rgba(148,163,184,0.35)",
    overlay: "rgba(15,23,42,0.55)",
    primary: palette.blue,
    primaryPressed: palette.blueDark,
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
    quinary: "#4C0A91",
    quinaryPressed: palette.purple,
    disabled: "#D1D5DB",
    disabledText: palette.muted,
    chart: {
      calories: palette.green,
      protein: palette.purple,
      phosphorus: palette.orange,
      potassium: palette.blue,
      sodium: palette.cyan,
      ratio: palette.yellow,
      target: "#6366F1",
      grid: "rgba(148,163,184,0.28)",
    },
  },
  controls: { compactHeight: 36, height: 48, touchTarget: 44 },
  radii: { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },
} as const;

const tintColorLight = theme.colors.primary;
const tintColorDark = palette.surface;

export const Colors = {
  dark: {
    text: "#ECEDEE",
    background: "#151718",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
  },
  light: {
    text: theme.colors.text,
    background: theme.colors.background,
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
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
    mono: "monospace",
    rounded: "normal",
    sans: "normal",
    serif: "serif",
  },
  web: {
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
  },
});
