import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
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
import { Card } from "@/screens/dashboard/components/Card";
import { styles } from "@/screens/dashboard/styles";

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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <TouchableOpacity onPress={() => router.back()}>
        <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
      </TouchableOpacity>

      {!carePlanId || !data ? (
        <Card>
          <ThemedText type="defaultSemiBold">Review unavailable</ThemedText>
          <ThemedText style={styles.helperText}>
            {carePlanId ? errorMessage : "No care plan was selected."}
          </ThemedText>
        </Card>
      ) : !data.reviewDue ? (
        <Card>
          <ThemedText type="defaultSemiBold">Review not needed right now</ThemedText>
          <ThemedText style={styles.helperText}>
            This care plan was already reviewed on {formatMobileDate(data.reviewedAt)}.
          </ThemedText>
          <Pressable
            style={[styles.secondaryActionButton, styles.carePlanViewButton]}
            onPress={() => router.replace(`/(dashboard)/care-plan?id=${carePlanId}` as never)}
          >
            <ThemedText style={styles.secondaryActionText}>Open care plan</ThemedText>
          </Pressable>
        </Card>
      ) : (
        <>
          <View style={styles.header}>
            <ThemedText type="title">Review care plan</ThemedText>
            <ThemedText style={styles.subtleText}>{data.title}</ThemedText>
          </View>

          <Card style={styles.carePlanReviewCard}>
            <ThemedText type="defaultSemiBold">Quick check-in</ThemedText>
            <ThemedText style={styles.helperText}>
              Select anything that feels true for you. Your care team will see this at the next review.
            </ThemedText>
            <ThemedText style={styles.helperText}>
              Next review was due {formatMobileDate(data.nextReviewAt)}.
            </ThemedText>
          </Card>

          <Card>
            <ThemedText type="defaultSemiBold">How is this plan going?</ThemedText>
            <ThemedText style={styles.helperText}>
              You can tick more than one answer.
            </ThemedText>
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
          </Card>

          <Card>
            <ThemedText type="defaultSemiBold">Anything else to add?</ThemedText>
            <ThemedText style={styles.helperText}>
              Optional. Tell us what is working well or what is hard to follow.
            </ThemedText>
            <TextInput
              multiline
              placeholder="Add a short note for your care team"
              placeholderTextColor="#94A3B8"
              style={styles.multilineInput}
              textAlignVertical="top"
              value={note}
              onChangeText={setNote}
            />
          </Card>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              style={[styles.secondaryActionButton, styles.carePlanViewButton]}
              onPress={() => router.replace(`/(dashboard)/care-plan?id=${carePlanId}` as never)}
            >
              <ThemedText style={styles.secondaryActionText}>Skip for now</ThemedText>
            </Pressable>
            <Pressable
              disabled={!canSubmit}
              style={[
                styles.primaryActionButton,
                styles.carePlanViewButton,
                !canSubmit ? { opacity: 0.5 } : undefined,
              ]}
              onPress={() => void handleSubmit()}
            >
              <ThemedText style={styles.primaryActionText}>
                {isSubmitting ? "Saving..." : "Send review"}
              </ThemedText>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}
