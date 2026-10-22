import { useEffect, useState } from "react";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";

import {
  BABISNAP_COPY,
  babisnapDownloadUrl,
  babisnapPairLink,
  formatBabisnapLastUsed,
} from "../../../convex/lib/babisnap";
import { babisnapAction } from "../lib/babisnap-client";

function hebrewError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "unauthorized") return "יש להתחבר מחדש";
  return "לא הצלחנו. נסו שוב.";
}

export function BabiSnapSettings({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const downloadUrl = babisnapDownloadUrl();
  const [connected, setConnected] = useState(false);
  const [lastUsedAt, setLastUsedAt] = useState<string | null>(null);
  const [pairLink, setPairLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setPairLink(null);
      setCopied(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void babisnapAction("status")
      .then((status) => {
        if (cancelled) return;
        setConnected(status.connected);
        setLastUsedAt(status.lastUsedAt);
      })
      .catch((err) => {
        if (!cancelled) setError(hebrewError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const lastLabel = formatBabisnapLastUsed(lastUsedAt);

  async function connect() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const status = await babisnapAction("connect");
      setPairLink(status.token ? babisnapPairLink(status.token) : null);
      setConnected(true);
      setLastUsedAt(null);
    } catch (err) {
      setError(hebrewError(err));
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    Alert.alert(BABISNAP_COPY.disconnect, BABISNAP_COPY.disconnectConfirm, [
      { text: "ביטול", style: "cancel" },
      {
        text: BABISNAP_COPY.disconnect,
        style: "destructive",
        onPress: () => {
          setBusy(true);
          setError(null);
          setPairLink(null);
          void babisnapAction("disconnect")
            .then((status) => {
              setConnected(status.connected);
              setLastUsedAt(status.lastUsedAt);
            })
            .catch((err) => setError(hebrewError(err)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  async function copyLink() {
    if (!pairLink) return;
    await Clipboard.setStringAsync(pairLink);
    setCopied(true);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>BabiSnap</Text>
            {loading ? <Text style={styles.muted}>טוען...</Text> : null}
            {!loading ? (
              <>
                <Text style={[styles.status, connected ? styles.statusOn : null]}>
                  {connected ? BABISNAP_COPY.connected : BABISNAP_COPY.disconnected}
                </Text>
                {connected ? (
                  <Text style={styles.muted}>
                    {lastLabel ? `${BABISNAP_COPY.lastPrefix}: ${lastLabel}` : BABISNAP_COPY.noneYet}
                  </Text>
                ) : null}
                {!connected && downloadUrl ? (
                  <>
                    <Pressable style={styles.download} onPress={() => void Linking.openURL(downloadUrl)}>
                      <Text style={styles.downloadText}>{BABISNAP_COPY.download}</Text>
                    </Pressable>
                    <Text style={styles.note}>{BABISNAP_COPY.installNote}</Text>
                  </>
                ) : null}
                {pairLink ? (
                  <View style={styles.once}>
                    <Text style={styles.note}>{BABISNAP_COPY.once}</Text>
                    <Pressable style={styles.open} onPress={() => void Linking.openURL(pairLink)}>
                      <Text style={styles.openText}>{BABISNAP_COPY.open}</Text>
                    </Pressable>
                    <Text style={styles.note}>{BABISNAP_COPY.hint}</Text>
                    <Pressable onPress={() => void copyLink()}>
                      <Text style={styles.copy}>{copied ? BABISNAP_COPY.copied : BABISNAP_COPY.copy}</Text>
                    </Pressable>
                  </View>
                ) : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Pressable style={styles.connect} disabled={busy} onPress={() => void connect()}>
                  <Text style={styles.connectText}>{BABISNAP_COPY.connect}</Text>
                </Pressable>
                {connected ? (
                  <Pressable style={styles.disconnect} disabled={busy} onPress={disconnect}>
                    <Text style={styles.disconnectText}>{BABISNAP_COPY.disconnect}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
            <Pressable style={styles.close} onPress={onClose}>
              <Text style={styles.closeText}>סגור</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: 20,
  },
  sheet: {
    maxHeight: "88%",
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 16,
  },
  scroll: { gap: 10 },
  title: { fontSize: 18, fontWeight: "800", textAlign: "right", color: "#0f172a" },
  status: { fontSize: 16, fontWeight: "700", textAlign: "right", color: "#334155" },
  statusOn: { color: "#047857" },
  muted: { fontSize: 13, textAlign: "right", color: "#64748b" },
  note: { fontSize: 12, lineHeight: 18, textAlign: "right", color: "#64748b" },
  download: {
    borderRadius: 12,
    backgroundColor: "#047857",
    paddingVertical: 14,
    alignItems: "center",
  },
  downloadText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  once: {
    gap: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
  },
  open: {
    borderRadius: 12,
    backgroundColor: "#0f172a",
    paddingVertical: 16,
    alignItems: "center",
  },
  openText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  copy: { fontSize: 12, color: "#64748b", textAlign: "right", textDecorationLine: "underline" },
  connect: {
    borderRadius: 12,
    backgroundColor: "#0f172a",
    paddingVertical: 14,
    alignItems: "center",
  },
  connectText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  disconnect: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 12,
    alignItems: "center",
  },
  disconnectText: { color: "#334155", fontSize: 14, fontWeight: "700" },
  error: { color: "#dc2626", textAlign: "right", fontSize: 13 },
  close: { alignItems: "center", paddingTop: 8 },
  closeText: { color: "#64748b", fontSize: 15 },
});
