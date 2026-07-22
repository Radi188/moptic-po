import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";

import { BranchPickerSheet } from "@/components/branch-picker-sheet";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { Branch } from "@/constants/branches";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "@/contexts/i18n";
import { useTheme } from "@/hooks/use-theme";
import type { ExportFormat, ExportLayout } from "@/lib/inventory-export";

const BRAND = "#232843";

type Props = {
  visible: boolean;
  onClose: () => void;
  /**
   * Runs the export; resolves when done, rejects/throws to surface an error.
   * `branchLabel` is the selected branch name, or undefined for all branches.
   */
  onExport: (
    format: ExportFormat,
    layout: ExportLayout,
    branchLabel: string | undefined,
  ) => Promise<void>;
};

export function ExportInventorySheet({ visible, onClose, onExport }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { session } = useAuth();

  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [layout, setLayout] = useState<ExportLayout>("plain");
  const [branch, setBranch] = useState<Branch | null>(session?.branch ?? null);
  const [branchPicker, setBranchPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try {
      await onExport(format, layout, branch?.name);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={busy ? undefined : onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={busy ? undefined : onClose}
        />
        <ThemedView
          style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.four }]}
        >
          <ThemedView style={styles.handle} type="backgroundSelected" />
          <View>
            <ThemedText type="subtitle" style={styles.title}>
              {t("export.title")}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t("export.subtitle")}
            </ThemedText>
          </View>

          <View style={styles.group}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t("export.branch")}
            </ThemedText>
            <Pressable
              onPress={() => setBranchPicker(true)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <ThemedView type="backgroundElement" style={styles.branchSelect}>
                <Ionicons
                  name="business-outline"
                  size={18}
                  color={theme.textSecondary}
                />
                <ThemedText
                  numberOfLines={1}
                  style={[styles.branchValue, { color: theme.text }]}
                >
                  {branch?.name ?? t("filters.allBranches")}
                </ThemedText>
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={theme.textSecondary}
                />
              </ThemedView>
            </Pressable>
          </View>

          <View style={styles.group}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t("export.format")}
            </ThemedText>
            <View style={styles.segment}>
              <SegmentButton
                icon="document-text-outline"
                label={t("export.pdf")}
                active={format === "pdf"}
                onPress={() => setFormat("pdf")}
                theme={theme}
              />
              <SegmentButton
                icon="grid-outline"
                label={t("export.excel")}
                active={format === "excel"}
                onPress={() => setFormat("excel")}
                theme={theme}
              />
            </View>
          </View>

          <View style={styles.group}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t("export.layout")}
            </ThemedText>
            <View style={styles.segment}>
              <SegmentButton
                icon="list-outline"
                label={t("export.plain")}
                active={layout === "plain"}
                onPress={() => setLayout("plain")}
                theme={theme}
              />
              <SegmentButton
                icon="albums-outline"
                label={t("export.grouped")}
                active={layout === "grouped"}
                onPress={() => setLayout("grouped")}
                theme={theme}
              />
              <SegmentButton
                icon="clipboard-outline"
                label={t("export.count")}
                active={layout === "count"}
                onPress={() => setLayout("count")}
                theme={theme}
              />
            </View>
          </View>

          <Pressable
            onPress={handleExport}
            disabled={busy}
            style={({ pressed }) => [
              styles.exportButton,
              pressed && !busy && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            {busy ? (
              <>
                <ActivityIndicator color="#ffffff" size="small" />
                <ThemedText style={styles.exportText}>
                  {t("export.preparing")}
                </ThemedText>
              </>
            ) : (
              <>
                <Ionicons name="share-outline" size={18} color="#ffffff" />
                <ThemedText style={styles.exportText}>
                  {t("export.action")}
                </ThemedText>
              </>
            )}
          </Pressable>
        </ThemedView>
      </View>

      <BranchPickerSheet
        visible={branchPicker}
        selectedId={branch?.id}
        allowAll
        onSelectAll={() => {
          setBranch(null);
          setBranchPicker(false);
        }}
        onSelect={(b) => {
          setBranch(b);
          setBranchPicker(false);
        }}
        onClose={() => setBranchPicker(false)}
      />
    </Modal>
  );
}

function SegmentButton({
  icon,
  label,
  active,
  onPress,
  theme,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.segmentFlex, pressed && styles.pressed]}
    >
      <ThemedView
        type={active ? "backgroundSelected" : "backgroundElement"}
        style={[
          styles.segmentButton,
          active && { borderColor: theme.tint },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={active ? theme.tint : theme.textSecondary}
        />
        <ThemedText
          type="smallBold"
          numberOfLines={1}
          style={[
            styles.segmentLabel,
            { color: active ? theme.tint : theme.text },
          ]}
        >
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  sheet: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    gap: Spacing.four,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
  },
  title: {
    fontSize: 22,
    lineHeight: 34,
  },
  group: {
    gap: Spacing.two,
  },
  branchSelect: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 52,
    borderRadius: Spacing.three,
  },
  branchValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  segment: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  segmentFlex: {
    flex: 1,
  },
  segmentButton: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.one,
    paddingHorizontal: Spacing.one,
    minHeight: 64,
    borderRadius: Spacing.three,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  segmentLabel: {
    fontSize: 12,
    textAlign: "center",
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    backgroundColor: BRAND,
    height: 52,
    borderRadius: Spacing.three,
  },
  exportText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.6,
  },
});
