import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ThemedText } from "./themed-text";

interface AccordionPanelProps {
  title: string;
  children: React.ReactNode;
  isActive: boolean;
  ref?: (el: any) => any;
  onShow: () => void;
}
const AccordionPanel = ({
  title,
  children,
  isActive,
  ref,
  onShow,
}: AccordionPanelProps) => {
  const setActiveStyles = (styleName?: string) => {};

  return (
    <View ref={ref}>
      <TouchableOpacity onPress={onShow}>
        <ThemedText type="defaultSemiBold">Daily totals</ThemedText>
      </TouchableOpacity>
      <Text>{children}</Text>
    </View>
  );
};

export default AccordionPanel;
