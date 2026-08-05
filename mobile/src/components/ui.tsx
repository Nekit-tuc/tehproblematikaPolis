import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { colors, radius } from "../theme";

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          borderRadius: radius.xxl,
          padding: 16,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  children,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
}: {
  children: ReactNode;
  onPress?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
}) {
  const backgroundColor = variant === "primary" ? colors.orange : variant === "danger" ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)";
  const color = variant === "primary" ? "#111111" : variant === "danger" ? colors.red : colors.text;
  const borderColor = variant === "danger" ? "rgba(239,68,68,0.34)" : variant === "ghost" ? colors.border : "rgba(245,158,11,0.42)";
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        borderRadius: 22,
        borderWidth: 1,
        borderColor,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        backgroundColor,
        opacity: disabled ? 0.55 : pressed ? 0.78 : 1,
      })}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={{ color, fontWeight: "900", fontSize: 15 }}>{children}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "800" }}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.dim}
        style={[
          {
            minHeight: props.multiline ? 124 : 50,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: "rgba(255,255,255,0.052)",
            color: colors.text,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 15,
            textAlignVertical: props.multiline ? "top" : "center",
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function Pill({ children, tone = "orange" }: { children: ReactNode; tone?: "orange" | "green" | "blue" | "red" | "gray" }) {
  const toneColor = tone === "green" ? colors.green : tone === "blue" ? colors.blue : tone === "red" ? colors.red : tone === "gray" ? colors.dim : colors.orange;
  return (
    <View style={{ alignSelf: "flex-start", maxWidth: 170, borderRadius: 999, borderWidth: 1, borderColor: `${toneColor}55`, backgroundColor: `${toneColor}22`, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text numberOfLines={1} style={{ color: toneColor, fontSize: 13, fontWeight: "900" }}>
        {children}
      </Text>
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 22, fontWeight: "900" }}>
        {title}
      </Text>
      {action}
    </View>
  );
}
