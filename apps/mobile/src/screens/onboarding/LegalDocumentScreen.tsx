import { Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/components/app-screen";
import { AppButton } from "@/components/ui/Button";
import type { LegalSection } from "@/constants/legal";
import { styles } from "./styles";

export function LegalDocumentScreen({
  sections,
  title,
  version,
}: {
  sections: LegalSection[];
  title: string;
  version: string;
}) {
  const router = useRouter();
  return (
    <AppScreen
      contentContainerStyle={[styles.screenContent, { gap: 20 }]}
      padded={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Version: {version}</Text>
      </View>
      <Text style={styles.errorText}>
        Draft for information-governance and legal approval before production
        use.
      </Text>
      {sections.map((section) => (
        <View key={section.heading} style={{ gap: 8 }}>
          <Text style={styles.label}>{section.heading}</Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={styles.bodyText}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
      <AppButton
        fullWidth
        label="Back"
        onPress={() => router.back()}
        variant="secondary"
      />
    </AppScreen>
  );
}
