import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import type { BoardItemView } from "../lib/board-item-view";
import { BoardViewToggle } from "./BoardViewToggle";
import { MindTaskerLogo } from "./MindTaskerLogo";

/** Below this width the top bar switches to icon-only actions so it fits one row on phones. */
export const TOP_BAR_COMPACT_MAX_WIDTH = 600;

export interface TopBarUsage {
  isPremium: boolean;
  used: number;
  allocated: number;
}

interface AppTopBarProps {
  topInset: number;
  usage: TopBarUsage | null;
  onOpenPaywall: () => void;
  boardItemView: BoardItemView;
  onToggleBoardView: () => void;
  notificationsEnabled: boolean;
  unreadNotifications: number;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  onLogoPress: () => void;
}

const ICON_COLOR = "#64748b";
const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

function GearIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={ICON_COLOR} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

function LogoutIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={ICON_COLOR} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Path d="M16 17l5-5-5-5" />
      <Path d="M21 12H9" />
    </Svg>
  );
}

/** Main-screen top bar: logo left, actions right; one row from 360dp up. */
export function AppTopBar({
  topInset,
  usage,
  onOpenPaywall,
  boardItemView,
  onToggleBoardView,
  notificationsEnabled,
  unreadNotifications,
  onOpenNotifications,
  onOpenSettings,
  onSignOut,
  onLogoPress,
}: AppTopBarProps) {
  const { width } = useWindowDimensions();
  const compact = width < TOP_BAR_COMPACT_MAX_WIDTH;

  return (
    <View style={[styles.topBar, compact && styles.topBarCompact, { paddingTop: topInset + 8 }]}>
      <TouchableOpacity
        onPress={onLogoPress}
        accessibilityRole="button"
        accessibilityLabel="חזרה למסך הראשי"
        hitSlop={HIT}
        style={styles.logo}
      >
        <MindTaskerLogo size="medium" />
      </TouchableOpacity>
      <View style={[styles.actions, compact && styles.actionsCompact]}>
        {usage && !usage.isPremium ? (
          <TouchableOpacity onPress={onOpenPaywall} accessibilityRole="button" accessibilityLabel="שימוש ב-AI">
            <Text style={[styles.usage, compact && styles.small]} numberOfLines={1}>
              {compact ? `${usage.used}/${usage.allocated}` : `AI ${usage.used}/${usage.allocated}`}
            </Text>
          </TouchableOpacity>
        ) : usage?.isPremium ? (
          <TouchableOpacity onPress={onOpenPaywall} accessibilityRole="button" accessibilityLabel="Premium" hitSlop={HIT}>
            {compact ? (
              <View style={styles.premiumBadge}>
                <Text style={styles.premiumBadgeText}>★</Text>
              </View>
            ) : (
              <Text style={styles.premium}>Premium</Text>
            )}
          </TouchableOpacity>
        ) : null}
        <BoardViewToggle view={boardItemView} onToggle={onToggleBoardView} compact={compact} />
        {notificationsEnabled ? (
          <TouchableOpacity
            onPress={onOpenNotifications}
            accessibilityRole="button"
            accessibilityLabel="התראות"
            hitSlop={HIT}
          >
            <View style={styles.iconBtn}>
              <Text style={styles.bellIcon}>🔔</Text>
              {unreadNotifications > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadNotifications > 9 ? "9+" : String(unreadNotifications)}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel="הגדרות"
          hitSlop={HIT}
        >
          {compact ? (
            <View style={styles.iconBtn}>
              <GearIcon />
            </View>
          ) : (
            <Text style={styles.link}>הגדרות</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel="התנתק"
          hitSlop={HIT}
        >
          {compact ? (
            <View style={styles.iconBtn}>
              <LogoutIcon />
            </View>
          ) : (
            <Text style={styles.link}>התנתק</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexShrink: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    direction: "ltr",
  },
  topBarCompact: {
    paddingHorizontal: 12,
    gap: 8,
  },
  logo: { flexShrink: 1, minWidth: 0 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    direction: "ltr",
    flexShrink: 0,
  },
  actionsCompact: { gap: 6 },
  iconBtn: {
    position: "relative",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  bellIcon: { fontSize: 16 },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  usage: { fontSize: 12, fontWeight: "600", color: "#b45309" },
  small: { fontSize: 11 },
  premium: { fontSize: 12, fontWeight: "700", color: "#047857" },
  premiumBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    alignItems: "center",
    justifyContent: "center",
  },
  premiumBadgeText: { fontSize: 12, lineHeight: 14, color: "#047857", fontWeight: "700" },
  link: { color: "#64748b", fontSize: 14 },
});
