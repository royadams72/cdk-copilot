import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";

import type {
  ExerciseRefCategory,
  ExerciseRefItem,
  MeasurementKind,
} from "./metricTrendTypes";
import {
  addLabel,
  formatDateLabel,
  formatTimeLabel,
  type WeightUnit,
} from "./metricTrendUtils";

type Props = {
  bpDiastolic: number;
  bpSystolic: number;
  diastolicOptions: number[];
  exerciseCatalog: ExerciseRefCategory[];
  exerciseCatalogError: string | null;
  exerciseCatalogLoading: boolean;
  exerciseMinutes: string;
  exerciseDurationOptions: number[];
  heartRateBpm: number;
  heartRateOptions: number[];
  kind: MeasurementKind;
  measuredDate: Date;
  modalOpen: boolean;
  onSave: () => void;
  openCategories: Record<string, boolean>;
  saving: boolean;
  selectedExercise: ExerciseRefItem | null;
  selectedExerciseId: string;
  setBpDiastolic: (value: number) => void;
  setBpSystolic: (value: number) => void;
  setExerciseMinutes: (value: string) => void;
  setHeartRateBpm: (value: number) => void;
  setMeasuredDate: (value: Date) => void;
  setModalOpen: (value: boolean) => void;
  setOpenCategories: (
    updater: (value: Record<string, boolean>) => Record<string, boolean>,
  ) => void;
  setSelectedExerciseId: (value: string) => void;
  setShowDatePicker: (value: boolean) => void;
  setShowSleepFromPicker: (value: boolean) => void;
  setShowSleepToPicker: (value: boolean) => void;
  setSleepFromTime: (value: Date) => void;
  setSleepToTime: (value: Date) => void;
  setWeightDecimal: (value: number) => void;
  setWeightValue: (value: number) => void;
  showDatePicker: boolean;
  showSleepFromPicker: boolean;
  showSleepToPicker: boolean;
  sleepFromTime: Date;
  sleepToTime: Date;
  systolicOptions: number[];
  weightDecimal: number;
  weightDecimalOptions: number[];
  weightOptions: number[];
  weightUnit: WeightUnit;
  weightValue: number;
};

export function AddMeasurementModal({
  bpDiastolic,
  bpSystolic,
  diastolicOptions,
  exerciseCatalog,
  exerciseCatalogError,
  exerciseCatalogLoading,
  exerciseMinutes,
  exerciseDurationOptions,
  heartRateBpm,
  heartRateOptions,
  kind,
  measuredDate,
  modalOpen,
  onSave,
  openCategories,
  saving,
  selectedExercise,
  selectedExerciseId,
  setBpDiastolic,
  setBpSystolic,
  setExerciseMinutes,
  setHeartRateBpm,
  setMeasuredDate,
  setModalOpen,
  setOpenCategories,
  setSelectedExerciseId,
  setShowDatePicker,
  setShowSleepFromPicker,
  setShowSleepToPicker,
  setSleepFromTime,
  setSleepToTime,
  setWeightDecimal,
  setWeightValue,
  showDatePicker,
  showSleepFromPicker,
  showSleepToPicker,
  sleepFromTime,
  sleepToTime,
  systolicOptions,
  weightDecimal,
  weightDecimalOptions,
  weightOptions,
  weightUnit,
  weightValue,
}: Props) {
  return (
    <>
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: "rgba(15,23,42,0.45)",
            flex: 1,
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 12,
              gap: 10,
              maxHeight: kind === "exercise" ? "88%" : undefined,
              maxWidth: 360,
              minHeight: kind === "exercise" ? 520 : undefined,
              padding: 16,
              width: "100%",
            }}
          >
            <ThemedText type="defaultSemiBold">{addLabel(kind)}</ThemedText>

            {kind === "exercise" ? (
              <>
                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Exercise type
                </ThemedText>
                {exerciseCatalogLoading ? (
                  <View style={{ alignItems: "center", paddingVertical: 10 }}>
                    <ActivityIndicator />
                  </View>
                ) : null}
                {exerciseCatalogError ? (
                  <ThemedText style={{ color: "#b91c1c", fontSize: 12 }}>
                    {exerciseCatalogError}
                  </ThemedText>
                ) : null}

                <ScrollView style={{ maxHeight: 220 }}>
                  {exerciseCatalog.map((category) => {
                    const isOpen = !!openCategories[category.category];
                    return (
                      <View key={category.category} style={{ marginBottom: 8 }}>
                        <TouchableOpacity
                          onPress={() =>
                            setOpenCategories((prev) => ({
                              ...prev,
                              [category.category]: !isOpen,
                            }))
                          }
                          style={{
                            backgroundColor: "#F1F5F9",
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                          }}
                        >
                          <ThemedText style={{ fontWeight: "700" }}>
                            {isOpen ? "v" : ">"} {category.category}
                          </ThemedText>
                        </TouchableOpacity>
                        {isOpen ? (
                          <View style={{ gap: 6, marginTop: 6 }}>
                            {category.items.map((item) => {
                              const isSelected =
                                selectedExerciseId === item.exerciseId;
                              return (
                                <TouchableOpacity
                                  key={item.exerciseId}
                                  onPress={() =>
                                    setSelectedExerciseId(item.exerciseId)
                                  }
                                  style={{
                                    borderColor: isSelected
                                      ? "#2563EB"
                                      : "#CBD5E1",
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    paddingHorizontal: 10,
                                    paddingVertical: 8,
                                  }}
                                >
                                  <ThemedText style={{ fontWeight: "600" }}>
                                    {item.name}
                                  </ThemedText>
                                  <ThemedText
                                    style={{ fontSize: 12, opacity: 0.7 }}
                                  >
                                    {item.met.toFixed(1)} MET - {item.intensity}
                                  </ThemedText>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </ScrollView>

                {selectedExercise ? (
                  <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                    Selected: {selectedExercise.name} (
                    {selectedExercise.met.toFixed(1)} MET)
                  </ThemedText>
                ) : null}

                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Duration (minutes)
                </ThemedText>
                <View
                  style={{
                    borderColor: "#CBD5E1",
                    borderRadius: 8,
                    borderWidth: 1,
                  }}
                >
                  <Picker
                    selectedValue={exerciseMinutes}
                    onValueChange={(value) => setExerciseMinutes(String(value))}
                  >
                    {exerciseDurationOptions.map((value) => (
                      <Picker.Item
                        key={`exercise-minutes-${value}`}
                        label={`${value}`}
                        value={String(value)}
                      />
                    ))}
                  </Picker>
                </View>
              </>
            ) : null}

            {kind === "blood_pressure" ? (
              <>
                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Systolic (mmHg)
                </ThemedText>
                <View
                  style={{
                    borderColor: "#CBD5E1",
                    borderRadius: 8,
                    borderWidth: 1,
                  }}
                >
                  <Picker
                    selectedValue={bpSystolic}
                    onValueChange={(value) => setBpSystolic(Number(value))}
                  >
                    {systolicOptions.map((value) => (
                      <Picker.Item
                        key={`sys-${value}`}
                        label={`${value}`}
                        value={value}
                      />
                    ))}
                  </Picker>
                </View>

                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Diastolic (mmHg)
                </ThemedText>
                <View
                  style={{
                    borderColor: "#CBD5E1",
                    borderRadius: 8,
                    borderWidth: 1,
                  }}
                >
                  <Picker
                    selectedValue={bpDiastolic}
                    onValueChange={(value) => setBpDiastolic(Number(value))}
                  >
                    {diastolicOptions.map((value) => (
                      <Picker.Item
                        key={`dia-${value}`}
                        label={`${value}`}
                        value={value}
                      />
                    ))}
                  </Picker>
                </View>
              </>
            ) : null}

            {kind === "heart_rate" ? (
              <>
                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Heart rate (bpm)
                </ThemedText>
                <View
                  style={{
                    borderColor: "#CBD5E1",
                    borderRadius: 8,
                    borderWidth: 1,
                  }}
                >
                  <Picker
                    selectedValue={heartRateBpm}
                    onValueChange={(value) => setHeartRateBpm(Number(value))}
                  >
                    {heartRateOptions.map((value) => (
                      <Picker.Item
                        key={`hr-${value}`}
                        label={`${value}`}
                        value={value}
                      />
                    ))}
                  </Picker>
                </View>
              </>
            ) : null}

            {kind === "weight" ? (
              <>
                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Weight ({weightUnit === "lb" ? "lbs" : "kg"})
                </ThemedText>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      borderColor: "#CBD5E1",
                      borderRadius: 8,
                      borderWidth: 1,
                      flex: 1,
                    }}
                  >
                    <Picker
                      selectedValue={weightValue}
                      onValueChange={(value) => setWeightValue(Number(value))}
                    >
                      {weightOptions.map((value) => (
                        <Picker.Item
                          key={`weight-whole-${value}`}
                          label={`${Math.round(value)}`}
                          value={value}
                        />
                      ))}
                    </Picker>
                  </View>
                  <View
                    style={{
                      borderColor: "#CBD5E1",
                      borderRadius: 8,
                      borderWidth: 1,
                      flex: 1,
                    }}
                  >
                    <Picker
                      selectedValue={weightDecimal}
                      onValueChange={(value) =>
                        setWeightDecimal(Number(value))
                      }
                    >
                      {weightDecimalOptions.map((value) => (
                        <Picker.Item
                          key={`weight-decimal-${value}`}
                          label={`.${value}`}
                          value={value}
                        />
                      ))}
                    </Picker>
                  </View>
                </View>
                <ThemedText style={{ fontSize: 12, opacity: 0.7 }}>
                  Selected: {weightValue}
                  .{weightDecimal} {weightUnit === "lb" ? "lbs" : "kg"}
                </ThemedText>
              </>
            ) : null}

            {kind === "sleep" ? (
              <>
                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Sleep from
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setShowSleepFromPicker(true)}
                  style={{
                    borderColor: "#CBD5E1",
                    borderRadius: 8,
                    borderWidth: 1,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                  }}
                >
                  <ThemedText>
                    {formatTimeLabel(sleepFromTime.toISOString())}
                  </ThemedText>
                </TouchableOpacity>
                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Sleep to
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setShowSleepToPicker(true)}
                  style={{
                    borderColor: "#CBD5E1",
                    borderRadius: 8,
                    borderWidth: 1,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                  }}
                >
                  <ThemedText>
                    {formatTimeLabel(sleepToTime.toISOString())}
                  </ThemedText>
                </TouchableOpacity>
                <View
                  style={{
                    backgroundColor: "#F8FAFC",
                    borderColor: "#CBD5E1",
                    borderRadius: 8,
                    borderWidth: 1,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                >
                  <ThemedText style={{ fontSize: 12, opacity: 0.78 }}>
                    If "from" is later than "to", it will be saved as overnight
                    sleep.
                  </ThemedText>
                </View>
              </>
            ) : null}

            {kind !== "steps" ? (
              <>
                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Date (defaults to today)
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={{
                    borderColor: "#CBD5E1",
                    borderRadius: 8,
                    borderWidth: 1,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                  }}
                >
                  <ThemedText>{formatDateLabel(measuredDate)}</ThemedText>
                </TouchableOpacity>
              </>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => setModalOpen(false)}
                style={{ padding: 8 }}
              >
                <ThemedText style={{ fontWeight: "600" }}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSave}
                disabled={saving}
                style={{
                  backgroundColor: "#2563EB",
                  borderRadius: 8,
                  opacity: saving ? 0.65 : 1,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <ThemedText style={{ color: "white", fontWeight: "700" }}>
                  {saving ? "Saving..." : "Save"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showDatePicker ? (
        <DateTimePicker
          value={measuredDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          maximumDate={new Date()}
          onChange={(event, selectedDate) => {
            if (Platform.OS !== "ios") {
              setShowDatePicker(false);
            }
            if (event.type === "set" && selectedDate) {
              setMeasuredDate(selectedDate);
            }
          }}
        />
      ) : null}
      {showSleepFromPicker ? (
        <DateTimePicker
          value={sleepFromTime}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selectedDate) => {
            if (Platform.OS !== "ios") {
              setShowSleepFromPicker(false);
            }
            if (event.type === "set" && selectedDate) {
              setSleepFromTime(selectedDate);
            }
          }}
        />
      ) : null}
      {showSleepToPicker ? (
        <DateTimePicker
          value={sleepToTime}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selectedDate) => {
            if (Platform.OS !== "ios") {
              setShowSleepToPicker(false);
            }
            if (event.type === "set" && selectedDate) {
              setSleepToTime(selectedDate);
            }
          }}
        />
      ) : null}
    </>
  );
}
