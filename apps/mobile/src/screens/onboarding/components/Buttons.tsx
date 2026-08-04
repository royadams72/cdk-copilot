import { AppButton, type AppButtonProps } from "@/components/ui/button";

export { AppButton } from "@/components/ui/button";

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return <AppButton label={label} onPress={onPress} disabled={disabled} variant="primary" />;
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return <AppButton label={label} onPress={onPress} disabled={disabled} variant="secondary" />;
}

export function TertiaryDangerButton({
  label,
  onPress,
  disabled,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return <AppButton label={label} onPress={onPress} disabled={disabled} variant="danger" />;
}

export type ButtonProps = AppButtonProps;
