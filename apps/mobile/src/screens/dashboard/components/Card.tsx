import { PropsWithChildren } from "react";
import { ViewStyle, View } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { styles } from "../styles";

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: ViewStyle | ViewStyle[] }>) {
  const theme = useColorScheme() ?? "light";
  return (
    <View
      style={[
        styles.card,
        theme === "light" ? styles.cardLight : styles.cardDark,
        style,
      ]}
    >
      {children}
    </View>
  );
}
