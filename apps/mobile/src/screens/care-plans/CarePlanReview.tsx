import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { formatMobileDate } from "@/lib/format/date";
import { toQueryErrorMessage } from "@/store/services/appApi";
import {
  useGetCarePlanByIdQuery,
  useSubmitCarePlanReviewMutation,
} from "@/store/services/carePlanApi";
import { AppScreen } from "@/components/app-screen";
import { AppButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-field";
import { Section } from "@/components/ui/section";
import { theme } from "@/constants/theme";
import { styles } from "@/screens/dashboard/styles";
import { NutritionStyles } from "@/screens/nutrition/styles";

const REVIEW_OPTIONS = [
  {
    description: "This care plan helped me understand my diagnosis.",
    id: "understand_diagnosis",
    title: "I understand my diagnosis better",
  },
  {
    description: "I know what I should keep doing next.",
    id: "know_next_steps",
    title: "I know what to do next",
  },
  {
    description: "The tasks and goals feel realistic for me.",
    id: "fits_into_routine",
    title: "This plan fits into my routine",
  },
  {
    description: "I still need extra support or a different plan.",
    id: "need_more_support",
    title: "I need more support",
  },
] as const;

type ReviewOptionId = (typeof REVIEW_OPTIONS)[number]["id"];

export default function CarePlanReview() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const carePlanId = typeof params.id === "string" ? params.id : "";
  const { data, error, isFetching, isLoading, refetch } =
    useGetCarePlanByIdQuery(carePlanId, { skip: !carePlanId });
  const [submitReview, { isLoading: isSubmitting }] = useSubmitCarePlanReviewMutation();
  const [note, setNote] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<ReviewOptionId[]>([]);
  const loading = isLoading && !data;
  const refreshing = isFetching && !!data;
  const errorMessage = toQueryErrorMessage(error, "We couldn't load this review.");

  const canSubmit = useMemo(
    () => Boolean(carePlanId && data?.reviewDue && !isSubmitting),
    [carePlanId, data?.reviewDue, isSubmitting],
  );

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const toggleOption = useCallback((id: ReviewOptionId) => {
    setSelectedOptions((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!carePlanId || !canSubmit) {
      return;
    }

    try {
      await submitReview({
        carePlanId,
        note,
        responses: selectedOptions,
      }).unwrap();

      router.replace(`/(dashboard)/care-plan?id=${carePlanId}` as never);
    } catch (submitError) {
      Alert.alert(
        "Review not saved",
        toQueryErrorMessage(submitError, "We couldn't save your review."),
      );
    }
  }, [canSubmit, carePlanId, note, router, selectedOptions, submitReview]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.helperText}>Loading care plan review...</ThemedText>
      </View>
    );
  }

  return (
    <AppScreen
      keyboardAware
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <AppButton
        label="Back"
        onPress={() =>
          router.replace(
            carePlanId
              ? `/(dashboard)/care-plan?id=${carePlanId}`
              : "/(dashboard)/care-plans",
          )
        }
        variant="secondary"
        size="compact"
      />

      {!carePlanId || !data ? (
        <Section title="Review unavailable">
          <ThemedText style={{ color: theme.colors.copy }}>
            {carePlanId ? errorMessage : "No care plan was selected."}
          </ThemedText>
          <AppButton label="Return to care plans" onPress={() => router.replace("/(dashboard)/care-plans")} variant="outline" size="compact" />
        </Section>
      ) : !data.reviewDue ? (
        <Section title="Review not needed right now">
          <ThemedText style={styles.helperText}>
            This care plan was already reviewed on {formatMobileDate(data.reviewedAt)}.
          </ThemedText>
          <AppButton
            label="Open care plan"
            onPress={() => router.replace(`/(dashboard)/care-plan?id=${carePlanId}` as never)}
            variant="outline"
            size="compact"
          />
        </Section>
      ) : (
        <>
          <View style={{ gap: theme.spacing.xs }}>
            <ThemedText type="title" style={NutritionStyles.screenTitle}>Review care plan</ThemedText>
            <ThemedText style={{ color: theme.colors.copy }}>{data.title}</ThemedText>
          </View>

          <Section title="Quick check-in" style={styles.carePlanReviewCard}>
            <ThemedText style={styles.helperText}>
              Select anything that feels true for you. Your care team will see this at the next review.
            </ThemedText>
            <ThemedText style={styles.helperText}>
              Next review was due {formatMobileDate(data.nextReviewAt)}.
            </ThemedText>
          </Section>

          <Section title="How is this plan going?" description="You can tick more than one answer.">
            {REVIEW_OPTIONS.map((option) => {
              const selected = selectedOptions.includes(option.id);
              return (
                <Pressable
                  key={option.id}
                  onPress={() => toggleOption(option.id)}
                  style={[
                    styles.card,
                    styles.cardLight,
                    styles.selectableRow,
                    selected ? styles.selectedOptionCard : undefined,
                  ]}
                >
                  <View style={[styles.checkbox, selected ? styles.checkboxChecked : undefined]}>
                    {selected ? <ThemedText style={styles.checkboxTick}>✓</ThemedText> : null}
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <ThemedText type="defaultSemiBold">{option.title}</ThemedText>
                    <ThemedText style={styles.helperText}>{option.description}</ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </Section>

          <Section title="Anything else to add?" description="Optional. Tell us what is working well or what is hard to follow.">
            <TextField
              label="Note for your care team"
              hideLabel
              multiline
              placeholder="Add a short note for your care team"
              numberOfLines={4}
              value={note}
              onChangeText={setNote}
            />
          </Section>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <AppButton
              label="Skip for now"
              onPress={() => router.replace(`/(dashboard)/care-plan?id=${carePlanId}` as never)}
              variant="secondary"
              style={{ flex: 1 }}
            />
            <AppButton
              label="Send review"
              disabled={!canSubmit}
              loading={isSubmitting}
              onPress={() => void handleSubmit()}
              style={{ flex: 1 }}
            />
          </View>
        </>
      )}
    </AppScreen>
  );
}
