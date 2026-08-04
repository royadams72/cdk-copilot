import React from "react";
import { Section as AppSection } from "@/components/ui/section";

export function Section({
  title,
  description,
  emptyLabel,
  addLabel,
  onAdd,
  children,
}: {
  addLabel: string;
  children: React.ReactNode;
  description?: string;
  emptyLabel: string;
  onAdd: () => void;
  title: string;
}) {
  return (
    <AppSection
      actionLabel={addLabel}
      description={description}
      emptyLabel={emptyLabel}
      onAction={onAdd}
      title={title}
      variant="plain"
    >
      {React.Children.count(children) > 0 ? children : undefined}
    </AppSection>
  );
}
