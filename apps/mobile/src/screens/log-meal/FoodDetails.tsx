import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Props = {};

export default function FoodDetails({}: Props) {
  return (
    <View style={styles.container}>
      <Text>FoodDetails</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
