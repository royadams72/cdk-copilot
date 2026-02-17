import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { FeedbackModal } from "@/components/feedback-modal";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { useAppDispatch } from "@/store/hooks";
import { fetchDashboard } from "@/store/slices/dashboardSlice";

type DrugSuggestion = {
  id: string;
  name: string;
  displayName: string;
  dmplusdCode: string | null;
  snomedCode: string | null;
  form: string | null;
  route: string | null;
};

const ROUTE_OPTIONS = ["", "oral", "iv", "subcutaneous", "topical", "inhaled"];
const FORM_OPTIONS = [
  "",
  "tablet",
  "capsule",
  "solution",
  "injection",
  "powder",
  "cream",
  "inhaler",
];

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normaliseDose(value: string) {
  const cleaned = cleanText(value).toLowerCase();
  if (!cleaned) return "";
  const match = cleaned.match(
    /^(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?|tablet(?:s)?|capsule(?:s)?|puff(?:s)?|drop(?:s)?)$/i
  );
  if (!match) return cleaned;
  return `${match[1]} ${match[2].toLowerCase()}`;
}

function normaliseFrequency(value: string) {
  const cleaned = cleanText(value).toLowerCase();
  if (!cleaned) return "";
  const map: Record<string, string> = {
    bid: "twice daily",
    tid: "three times daily",
    qd: "once daily",
    od: "once daily",
    qid: "four times daily",
    prn: "as needed",
  };
  return map[cleaned] ?? cleaned;
}

export default function AddMedication() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");
  const [route, setRoute] = useState("");
  const [form, setForm] = useState("");
  const [instructions, setInstructions] = useState("");
  const [startAt, setStartAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedDrug, setSelectedDrug] = useState<DrugSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<DrugSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const canShowSuggestions = useMemo(
    () => name.trim().length > 1 && suggestions.length > 0,
    [name, suggestions.length]
  );

  useEffect(() => {
    const query = name.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const handle = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await authFetch(
          `${API}/api/medications/search?query=${encodeURIComponent(query)}&limit=8`,
          { method: "GET" }
        );
        const body: any = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          setSuggestions([]);
          return;
        }
        setSuggestions(body.data?.items ?? []);
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => clearTimeout(handle);
  }, [name]);

  async function handleSubmit() {
    const cleanedName = cleanText(name);
    const cleanedDose = normaliseDose(dose);
    const cleanedFrequency = normaliseFrequency(frequency);
    const cleanedInstructions = cleanText(instructions);
    const cleanedStart = cleanText(startAt);

    if (!cleanedName || !cleanedDose || !cleanedStart) {
      setErrorMessage("Name, dose and start date are required.");
      setShowErrorModal(true);
      return;
    }

    const parsedStart = new Date(cleanedStart);
    if (Number.isNaN(parsedStart.getTime())) {
      setErrorMessage("Start date must be a valid date (YYYY-MM-DD).");
      setShowErrorModal(true);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: cleanedName,
        dose: cleanedDose,
        frequency: cleanedFrequency,
        route: cleanText(route),
        form: cleanText(form),
        instructions: cleanedInstructions,
        startAt: parsedStart.toISOString(),
        drugRefId: selectedDrug?.id,
        dmplusdCode: selectedDrug?.dmplusdCode ?? undefined,
        snomedCode: selectedDrug?.snomedCode ?? undefined,
      };

      const res = await authFetch(`${API}/api/medications/create`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const body: any = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.message ?? "Failed to save medication");
      }

      dispatch(fetchDashboard({ scope: "today" }));
      router.replace("/(dashboard)/dashboard");
    } catch (err: any) {
      setErrorMessage(err?.message ?? "Failed to save medication");
      setShowErrorModal(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 28 }}>
        <View style={{ gap: 4 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
          </TouchableOpacity>
          <ThemedText type="title">Add Medication</ThemedText>
          <ThemedText style={{ opacity: 0.7 }}>
            Name, dose and start date are required.
          </ThemedText>
        </View>

        <View>
          <ThemedText>Name</ThemedText>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              setSelectedDrug(null);
            }}
            placeholder="Start typing medication name"
            autoCapitalize="words"
            style={{
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.5)",
              borderRadius: 10,
              padding: 10,
              marginTop: 6,
            }}
          />
          {searching ? (
            <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" />
              <ThemedText style={{ opacity: 0.7 }}>Searching drugs...</ThemedText>
            </View>
          ) : null}
          {canShowSuggestions ? (
            <View
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.35)",
                borderRadius: 10,
              }}
            >
              {suggestions.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => {
                    setName(item.displayName);
                    setSelectedDrug(item);
                    if (item.route) setRoute(item.route);
                    if (item.form) setForm(item.form);
                    setSuggestions([]);
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(148,163,184,0.22)",
                  }}
                >
                  <ThemedText style={{ fontWeight: "600" }}>{item.displayName}</ThemedText>
                  <ThemedText style={{ opacity: 0.7, fontSize: 12 }}>
                    {[item.form, item.route].filter(Boolean).join(" · ") || "No form/route"}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        <View>
          <ThemedText>Route</ThemedText>
          <View
            style={{
              marginTop: 6,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.5)",
              borderRadius: 10,
            }}
          >
            <Picker selectedValue={route} onValueChange={setRoute}>
              {ROUTE_OPTIONS.map((option) => (
                <Picker.Item
                  key={option || "none"}
                  label={option ? option : "Select route"}
                  value={option}
                />
              ))}
            </Picker>
          </View>
        </View>

        <View>
          <ThemedText>Form</ThemedText>
          <View
            style={{
              marginTop: 6,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.5)",
              borderRadius: 10,
            }}
          >
            <Picker selectedValue={form} onValueChange={setForm}>
              {FORM_OPTIONS.map((option) => (
                <Picker.Item
                  key={option || "none"}
                  label={option ? option : "Select form"}
                  value={option}
                />
              ))}
            </Picker>
          </View>
        </View>

        <View>
          <ThemedText>Dose</ThemedText>
          <TextInput
            value={dose}
            onChangeText={setDose}
            onBlur={() => setDose(normaliseDose(dose))}
            placeholder="e.g. 800 mg"
            style={{
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.5)",
              borderRadius: 10,
              padding: 10,
              marginTop: 6,
            }}
          />
        </View>

        <View>
          <ThemedText>Frequency</ThemedText>
          <TextInput
            value={frequency}
            onChangeText={setFrequency}
            onBlur={() => setFrequency(normaliseFrequency(frequency))}
            placeholder="e.g. three times daily"
            style={{
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.5)",
              borderRadius: 10,
              padding: 10,
              marginTop: 6,
            }}
          />
        </View>

        <View>
          <ThemedText>Start date (YYYY-MM-DD)</ThemedText>
          <TextInput
            value={startAt}
            onChangeText={setStartAt}
            placeholder="2026-02-16"
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.5)",
              borderRadius: 10,
              padding: 10,
              marginTop: 6,
            }}
          />
        </View>

        <View>
          <ThemedText>Instructions</ThemedText>
          <TextInput
            value={instructions}
            onChangeText={setInstructions}
            placeholder="Take with meals"
            multiline
            numberOfLines={3}
            style={{
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.5)",
              borderRadius: 10,
              padding: 10,
              marginTop: 6,
              minHeight: 86,
              textAlignVertical: "top",
            }}
          />
        </View>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={{
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: "center",
            backgroundColor: submitting ? "rgba(15,23,42,0.3)" : "rgba(15,23,42,0.9)",
          }}
        >
          <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
            {submitting ? "Saving..." : "Save medication"}
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>

      <FeedbackModal
        mode="error"
        visible={showErrorModal}
        title="Medication form error"
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
      />
    </View>
  );
}
