import { useCallback, useRef, type ReactNode } from "react";
import { View, type ScrollView } from "react-native";
import type { FieldErrors, FieldValues, Path } from "react-hook-form";

function errorPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  if ("message" in value || "type" in value) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) =>
    errorPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

export function useFormScroll<TValues extends FieldValues>() {
  const scrollRef = useRef<ScrollView>(null);
  const anchors = useRef(new Map<string, View>());
  const order = useRef<string[]>([]);

  const registerField = useCallback(
    (name: Path<TValues>) => (anchor: View | null) => {
      if (!order.current.includes(name)) order.current.push(name);
      if (anchor) {
        anchors.current.set(name, anchor);
      } else {
        anchors.current.delete(name);
      }
    },
    [],
  );

  const scrollToFirstError = useCallback((errors: FieldErrors<TValues>) => {
    const paths = errorPaths(errors);
    const fieldName = order.current.find((name) =>
      paths.some(
        (path) =>
          path === name || path.startsWith(`${name}.`) || name.startsWith(`${path}.`),
      ),
    );
    if (!fieldName) return;

    requestAnimationFrame(() => {
      const anchor = anchors.current.get(fieldName);
      const scrollView = scrollRef.current;
      const contentNode = (
        scrollView as
          | (ScrollView & {
              getInnerViewRef?: () => Parameters<View["measureLayout"]>[0];
            })
          | null
      )?.getInnerViewRef?.();
      if (anchor && scrollView && contentNode) {
        anchor.measureLayout(
          contentNode,
          (_x, y) => scrollView.scrollTo({ animated: true, y: Math.max(0, y - 16) }),
          () => undefined,
        );
      }
    });
  }, []);

  return { registerField, scrollRef, scrollToFirstError };
}

export function FormFieldAnchor<TValues extends FieldValues>({
  children,
  name,
  registerField,
}: {
  children: ReactNode;
  name: Path<TValues> | Path<TValues>[];
  registerField: (name: Path<TValues>) => (anchor: View | null) => void;
}) {
  const names = Array.isArray(name) ? name : [name];

  return (
    <View
      collapsable={false}
      ref={(anchor) => {
        names.forEach((fieldName) => registerField(fieldName)(anchor));
      }}
    >
      {children}
    </View>
  );
}
