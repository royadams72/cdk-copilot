import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type MenuItem = {
  id: string;
  label: string;
  onPress: () => void;
};

type HeaderOverflowMenuProps = {
  accessibilityLabel: string;
  items: MenuItem[];
};

export function HeaderOverflowMenu({
  accessibilityLabel,
  items,
}: HeaderOverflowMenuProps) {
  const triggerRef = useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ right: 16, top: 72 });

  function openMenu() {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get("window").width;
      setAnchor({
        right: Math.max(16, screenWidth - (x + width)),
        top: y + height + 8,
      });
      setOpen(true);
    });
  }

  function closeMenu() {
    setOpen(false);
  }

  return (
    <>
      <View collapsable={false} ref={triggerRef}>
        <TouchableOpacity
          accessibilityLabel={accessibilityLabel}
          onPress={openMenu}
          style={{
            alignItems: "center",
            backgroundColor: "rgba(148,163,184,0.18)",
            borderRadius: 999,
            height: 40,
            justifyContent: "center",
            width: 40,
          }}
        >
          <MaterialIcons color="#0F172A" name="more-horiz" size={22} />
        </TouchableOpacity>
      </View>
      <Modal
        animationType="fade"
        onRequestClose={closeMenu}
        transparent
        visible={open}
      >
        <Pressable
          onPress={closeMenu}
          style={{
            backgroundColor: "rgba(15,23,42,0.02)",
            bottom: 0,
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        />
        <View
          style={{
            backgroundColor: "#FFF",
            borderColor: "#CBD5E1",
            borderRadius: 16,
            borderWidth: 1,
            elevation: 8,
            minWidth: 180,
            paddingVertical: 8,
            position: "absolute",
            right: anchor.right,
            shadowColor: "#0F172A",
            shadowOffset: { height: 10, width: 0 },
            shadowOpacity: 0.12,
            shadowRadius: 20,
            top: anchor.top,
          }}
        >
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => {
                closeMenu();
                item.onPress();
              }}
              style={{ paddingHorizontal: 14, paddingVertical: 12 }}
            >
              <Text style={{ color: "#0F172A", fontSize: 16, fontWeight: "600" }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </>
  );
}
