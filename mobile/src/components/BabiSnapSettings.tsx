import { useEffect, useRef, useState } from "react";
import { Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";

import {
  BABISNAP_COPY,
  babisnapDownloadUrl,
  babisnapPairLink,
  babisnapStatusLabel,
} from "../../../convex/lib/babisnap";
import logo from "../../assets/babisnap-logo.webp";
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
  const busyRef = useRef(false);

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

  const statusLabel = babisnapStatusLabel({ connected, lastUsedAt });
  const showDownload = !lastUsedAt && Boolean(downloadUrl);

  function connectAndOpen() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setCopied(false);
    void (async () => {
      try {
        const status = await babisnapAction("connect");
        const link = status.token ? babisnapPairLink(status.token) : null;
        setPairLink(link);
        setConnected(true);
        setLastUsedAt(null);
        if (link) await Linking.openURL(link);
      } catch (err) {
        setError(hebrewError(err));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    })();
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
            <View style={styles.header}>
              <Image source={logo} style={styles.headerLogo} />
              <Text style={styles.title}>BabiSnap</Text>
            </View>
            {loading ? <Text style={styles.muted}>טוען...</Text> : null}
            {!loading ? (
              <>
                {statusLabel ? (
                  <Text style={[styles.status, lastUsedAt ? styles.statusOn : null]}>{statusLabel}</Text>
                ) : null}
                {showDownload && downloadUrl ? (
                  <>
                    <Pressable style={styles.download} onPress={() => void Linking.openURL(downloadUrl)}>
                      <Text style={styles.downloadText}>{BABISNAP_COPY.download}</Text>
                    </Pressable>
                    <Text style={styles.note}>{BABISNAP_COPY.installNote}</Text>
                  </>
                ) : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Pressable style={styles.connect} disabled={busy} onPress={connectAndOpen}>
                  <Text style={styles.connectText}>{BABISNAP_COPY.connect}</Text>
                </Pressable>
                {pairLink ? (
                  <Pressable onPress={() => void copyLink()}>
                    <Text style={styles.link}>
                      {copied ? BABISNAP_COPY.copied : BABISNAP_COPY.copyManual}
                    </Text>
                  </Pressable>
                ) : null}
                {connected ? (
                  <Pressable disabled={busy} onPress={disconnect}>
                    <Text style={styles.link}>{BABISNAP_COPY.disconnect}</Text>
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
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  headerLogo: { width: 32, height: 32, borderRadius: 16 },
  title: { fontSize: 18, fontWeight: "800", textAlign: "right", color: "#0f172a" },
  status: { fontSize: 16, fontWeight: "700", textAlign: "right", color: "#334155" },
  statusOn: { color: "#047857" },
  muted: { fontSize: 13, textAlign: "right", color: "#64748b" },
  note: { fontSize: 12, lineHeight: 18, textAlign: "right", color: "#64748b" },
  download: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#047857",
    paddingVertical: 10,
    alignItems: "center",
  },
  downloadText: { color: "#047857", fontSize: 14, fontWeight: "700" },
  connect: {
    borderRadius: 12,
    backgroundColor: "#0f172a",
    paddingVertical: 14,
    alignItems: "center",
  },
  connectText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  link: { fontSize: 12, color: "#64748b", textAlign: "right", textDecorationLine: "underline" },
  error: { color: "#dc2626", textAlign: "right", fontSize: 13 },
  close: { alignItems: "center", paddingTop: 8 },
  closeText: { color: "#64748b", fontSize: 15 },
});
