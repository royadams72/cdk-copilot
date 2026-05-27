import React, { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { LabeledInput } from "@/screens/onboarding/components/FormFields";
import type { AutocompleteOption } from "@/screens/onboarding/types";

export function AutocompleteSelectionField({
  label,
  value,
  placeholder,
  error,
  onSearch,
  onSelect,
}: {
  error?: string;
  label: string;
  onSearch: (query: string) => Promise<AutocompleteOption[]>;
  onSelect: (option: AutocompleteOption) => void;
  placeholder: string;
  value?: string;
}) {
  const [query, setQuery] = React.useState(value ?? "");
  const [options, setOptions] = React.useState<AutocompleteOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);

  useEffect(() => {
    setQuery(value ?? "");
  }, [value]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setOptions([]);
      setLoading(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      try {
        setLoading(true);
        setSearchError(null);
        const next = await onSearch(trimmed);
        if (!cancelled) {
          setOptions(next);
        }
      } catch (err: any) {
        if (!cancelled) {
          setOptions([]);
          setSearchError(err?.message ?? "Search failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [onSearch, query]);

  return (
    <View style={{ gap: 8 }}>
      <LabeledInput
        label={label}
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        error={error}
      />
      {loading ? <Text style={{ color: "#555" }}>Searching...</Text> : null}
      {searchError ? <Text style={{ color: "#b91c1c" }}>{searchError}</Text> : null}
      {!loading && options.length > 0 ? (
        <View
          style={{
            borderColor: "#d1d5db",
            borderRadius: 12,
            borderWidth: 1,
            overflow: "hidden",
          }}
        >
          {options.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => {
                setQuery(option.label);
                setOptions([]);
                onSelect(option);
              }}
              style={{
                borderBottomWidth: 1,
                borderColor: "#e5e7eb",
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontWeight: "600" }}>{option.label}</Text>
              {option.supportingText ? (
                <Text style={{ color: "#555" }}>{option.supportingText}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
