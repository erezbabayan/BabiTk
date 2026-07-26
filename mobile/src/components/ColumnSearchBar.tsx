import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { SearchLeafDeco } from "./SearchLeafDeco";

type SearchTone = "slate" | "blue" | "orange";

interface ColumnSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  activeQuery: string;
  onSearch: () => void;
  onClear: () => void;
  placeholder: string;
  tone: SearchTone;
  loading?: boolean;
  inline?: boolean;
}

const TONE: Record<SearchTone, { btn: string; btnText: string; back: string; backText: string; border: string }> =
  {
    slate: { btn: "#fff", btnText: "#334155", back: "#fff", backText: "#334155", border: "rgba(148, 163, 184, 0.55)" },
    blue: { btn: "#3b82f6", btnText: "#fff", back: "#fff", backText: "#1d4ed8", border: "rgba(96, 165, 250, 0.5)" },
    orange: { btn: "#ea580c", btnText: "#fff", back: "#fff", backText: "#c2410c", border: "rgba(251, 146, 60, 0.5)" },
  };

export function ColumnSearchBar({
  value,
  onChange,
  activeQuery,
  onSearch,
  onClear,
  placeholder,
  tone,
  loading = false,
  inline = false,
}: ColumnSearchBarProps) {
  const isActive = activeQuery.trim().length > 0;
  const colors = TONE[tone];

  function handlePrimaryPress() {
    if (isActive) {
      onChange("");
      onClear();
    } else {
      onSearch();
    }
  }

  const shellBorder = { borderColor: colors.border };

  return (
    <View style={[styles.wrap, inline && styles.wrapInline]}>
      <View style={[styles.inputShell, inline && styles.inputShellInline, shellBorder]}>
        <Pressable
          style={[
            styles.embeddedBtn,
            {
              backgroundColor: isActive ? colors.back : colors.btn,
            },
            (isActive || tone === "slate") && styles.embeddedBtnOutline,
          ]}
          onPress={handlePrimaryPress}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={isActive || tone === "slate" ? colors.backText : "#fff"} size="small" />
          ) : (
            <Text
              style={[
                styles.embeddedBtnText,
                (isActive || tone === "slate") && { color: colors.backText },
              ]}
            >
              {isActive ? "חזור" : "חפש"}
            </Text>
          )}
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#a8a29e"
          value={value}
          onChangeText={onChange}
          onSubmitEditing={() => {
            if (!isActive) onSearch();
          }}
          returnKeyType="search"
          textAlign="right"
        />
        <View style={styles.decoSlot} pointerEvents="none">
          <SearchLeafDeco tone={tone} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 6 },
  wrapInline: { marginBottom: 0, flex: 1.65, minWidth: 148, minHeight: 0, alignSelf: "stretch" },
  inputShell: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 10,
    backgroundColor: "#fffefb",
    overflow: "hidden",
    minHeight: 24,
  },
  inputShellInline: {
    flex: 1,
    width: "100%",
  },
  embeddedBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(120, 113, 108, 0.25)",
    minWidth: 34,
  },
  embeddedBtnOutline: {},
  embeddedBtnText: { color: "#fff", fontWeight: "700", fontSize: 9 },
  input: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 6,
    paddingRight: 4,
    paddingVertical: 3,
    fontSize: 10,
    backgroundColor: "transparent",
  },
  decoSlot: {
    justifyContent: "center",
    alignItems: "center",
    paddingRight: 4,
    paddingLeft: 2,
  },
  disabled: { opacity: 0.5 },
});
