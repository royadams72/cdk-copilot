import { createContext, useContext, type PropsWithChildren } from "react";
import { StyleSheet, Text, type TextProps } from "react-native";

import { useThemeColor } from "@/hooks/use-theme-color";

export type ThemedTextProps = TextProps & {
  type?: "default" | "title" | "defaultSemiBold" | "subtitle" | "link";
  darkColor?: string;
  lightColor?: string;
};

const ThemedTextColorContext = createContext<string | undefined>(undefined);

export function ThemedTextColorProvider({
  children,
  color,
}: PropsWithChildren<{ color: string }>) {
  return (
    <ThemedTextColorContext.Provider value={color}>
      {children}
    </ThemedTextColorContext.Provider>
  );
}

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "default",
  ...rest
}: ThemedTextProps) {
  const inheritedColor = useContext(ThemedTextColorContext);
  const color = useThemeColor(
    {
      dark: darkColor ?? inheritedColor,
      light: lightColor ?? inheritedColor,
    },
    "text",
  );

  return (
    <Text
      style={[
        { color },
        type === "default" ? styles.default : undefined,
        type === "title" ? styles.title : undefined,
        type === "defaultSemiBold" ? styles.defaultSemiBold : undefined,
        type === "subtitle" ? styles.subtitle : undefined,
        type === "link" ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: "#0a7ea4",
  },
  subtitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    lineHeight: 28,
  },
});
