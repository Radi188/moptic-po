import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

import {
  fetchCategories,
  toCategoryOptions,
  type CategoryOption,
} from "@/api/categories";
import { isApiConfigured } from "@/api/config";
import { createItem, updateItem } from "@/api/items";
import { getWarehouses, type ApiOption } from "@/api/purchase-orders";
import { createStockAdjustment } from "@/api/stock-adjustments";
import { OptionSheet } from "@/components/option-sheet";
import { ScreenHeader } from "@/components/screen-header";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "@/contexts/i18n";
import {
  addProduct,
  BRANDS,
  getProduct,
  STOCK_TYPES,
  updateProduct,
  type InventoryProduct,
  type ProductStatus,
} from "@/data/inventory";
import { useTheme } from "@/hooks/use-theme";

const BRAND = "#232843";
const DARK = "#232843";

// The API expects a single-letter stock_type code; the form uses readable labels.
const STOCK_TYPE_CODES: Record<string, string> = {
  Stock: "S",
  "Not Stock": "N",
};

type Tab = "general" | "gallery";
type Lang = "en" | "kh";
type SheetKey = "brand" | "status" | "stockType" | "category";

export default function InventoryItemFormScreen() {
  const { id, product: productParam } = useLocalSearchParams<{
    id: string;
    product?: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const { t } = useTranslation();

  const isNew = id === "new";
  // The list passes the selected row as a JSON param (it comes from the API, not
  // the local store), so prefer that; fall back to the local store for offline.
  const existing = useMemo(() => {
    if (isNew) return undefined;
    if (productParam) {
      try {
        return JSON.parse(productParam) as InventoryProduct;
      } catch {
        // Fall through to the local store if the param is malformed.
      }
    }
    return getProduct(id);
  }, [id, isNew, productParam]);

  const [tab, setTab] = useState<Tab>("general");
  const [lang, setLang] = useState<Lang>("en");

  const [code, setCode] = useState(existing?.code ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [nameKhmer, setNameKhmer] = useState(existing?.nameKhmer ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [descriptionKhmer, setDescriptionKhmer] = useState(
    existing?.descriptionKhmer ?? "",
  );
  const [brand, setBrand] = useState(existing?.brand ?? "");
  const [status, setStatus] = useState<ProductStatus>(
    existing?.status ?? "active",
  );
  const [stockType, setStockType] = useState(existing?.stockType ?? "Stock");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [cost, setCost] = useState(existing ? String(existing.cost) : "0");
  const [price, setPrice] = useState(existing ? String(existing.price) : "0");
  const [barcode, setBarcode] = useState(existing?.barcode ?? "");
  const [stock, setStock] = useState(existing ? String(existing.stock) : "0");
  const [alertStock, setAlertStock] = useState(
    existing ? String(existing.reorderLevel) : "0",
  );
  const [thumbnail, setThumbnail] = useState(existing?.thumbnail ?? "");
  const [gallery, setGallery] = useState<string[]>(existing?.gallery ?? []);

  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Warehouses are needed to seed initial branch stock on create (so the new
  // item shows up in the branch-scoped inventory list). We default to the first.
  const [warehouses, setWarehouses] = useState<ApiOption[]>([]);

  // Load sub-categories from the backend, optionally filtered by the search term.
  const loadCategories = useCallback(async (search?: string) => {
    try {
      const options = toCategoryOptions(await fetchCategories(search));
      setCategoryOptions(options);
      setCategoriesError(null);
      return options;
    } catch (err) {
      setCategoriesError(
        (err as Error).message || "Could not load categories.",
      );
      return [];
    }
  }, []);

  // Initial load — and resolve an existing product's saved name back to its id.
  useEffect(() => {
    loadCategories().then((options) => {
      if (existing?.category && !existing.categoryId) {
        const match = options.find((o) => o.name === existing.category);
        if (match) setCategoryId(match.id);
      }
    });
  }, [loadCategories, existing?.category, existing?.categoryId]);

  // Re-query the backend as the user types (debounced) while the picker is open.
  useEffect(() => {
    if (sheet !== "category") return;
    const handle = setTimeout(() => loadCategories(categorySearch), 300);
    return () => clearTimeout(handle);
  }, [categorySearch, sheet, loadCategories]);

  // Load warehouses once (create flow) so we can seed initial stock by default.
  useEffect(() => {
    if (!isNew || !isApiConfigured()) return;
    let active = true;
    getWarehouses()
      .then((options) => {
        if (active) setWarehouses(options);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isNew]);

  if (!isNew && !existing) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title={t("common.notFound")} onBack={() => router.back()} />
        <View style={styles.centered}>
          <ThemedText themeColor="textSecondary">
            {t("invForm.notFoundBody")}
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  const sheets: Record<
    SheetKey,
    {
      title: string;
      options: string[];
      selected: string;
      onSelect: (v: string) => void;
    }
  > = {
    brand: {
      title: t("invForm.selectBrand"),
      options: BRANDS,
      selected: brand,
      onSelect: setBrand,
    },
    status: {
      title: t("invForm.itemStatus"),
      options: [t("common.active"), t("common.inactive")],
      selected: status === "active" ? t("common.active") : t("common.inactive"),
      onSelect: (v) => setStatus(v === t("common.active") ? "active" : "inactive"),
    },
    stockType: {
      title: t("invForm.stockType"),
      options: STOCK_TYPES,
      selected: stockType,
      onSelect: setStockType,
    },
    category: {
      title: t("filters.selectCategory"),
      options: categoryOptions.map((o) => o.label),
      selected:
        categoryOptions.find((o) => o.id === categoryId)?.label ?? category,
      onSelect: (label) => {
        const picked = categoryOptions.find((o) => o.label === label);
        setCategory(picked?.name ?? label);
        setCategoryId(picked?.id ?? "");
      },
    },
  };
  const activeSheet = sheet ? sheets[sheet] : null;

  async function pickThumbnail() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
    });
    if (!res.canceled && res.assets[0]) setThumbnail(res.assets[0].uri);
  }

  async function addGalleryImages() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.6,
    });
    if (!res.canceled)
      setGallery((current) => [...current, ...res.assets.map((a) => a.uri)]);
  }

  function removeGalleryImage(index: number) {
    setGallery((current) => current.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (submitting) return;
    if (!name.trim()) {
      setError(t("invForm.nameRequired"));
      setTab("general");
      return;
    }
    if (!code.trim()) {
      setError(t("invForm.codeRequired"));
      setTab("general");
      return;
    }
    if (!categoryId) {
      setError(t("invForm.categoryRequired"));
      setTab("general");
      return;
    }

    const input = {
      code: code.trim(),
      name: name.trim(),
      nameKhmer: nameKhmer.trim(),
      category,
      categoryId,
      brand,
      stockType,
      barcode: barcode.trim(),
      cost: parseFloat(cost) || 0,
      price: parseFloat(price) || 0,
      stock: parseInt(stock, 10) || 0,
      reorderLevel: parseInt(alertStock, 10) || 0,
      status,
      description: description.trim(),
      descriptionKhmer: descriptionKhmer.trim(),
      thumbnail,
      gallery,
    };

    // Without an API URL configured, edit/create fall back to the in-memory store.
    if (!isApiConfigured()) {
      if (isNew) addProduct(input);
      else updateProduct(id, input);
      Alert.alert(
        t("invForm.saved"),
        isNew ? t("invForm.productCreated") : t("invForm.changesSaved"),
        [{ text: t("common.ok"), onPress: () => router.back() }],
      );
      return;
    }

    // Editing — PUT /items/{id} to persist the change on the backend.
    if (!isNew) {
      setError(null);
      setSubmitting(true);
      try {
        await updateItem(id, {
          item_code: code.trim(),
          item_name: name.trim(),
          item_name_kh: nameKhmer.trim() || name.trim(),
          price: parseFloat(price) || 0,
          cost: parseFloat(cost) || 0,
          category_id: Number(categoryId),
          alert_stock: parseInt(alertStock, 10) || 0,
          stock_type: STOCK_TYPE_CODES[stockType],
          // Send status so the update doesn't clear it (which would turn the
          // item into a draft and drop it from the branch inventory list).
          status: status === "active" ? 1 : 0,
        });
        Alert.alert(t("invForm.saved"), t("invForm.changesSaved"), [
          { text: t("common.ok"), onPress: () => router.back() },
        ]);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : t("invForm.saveChangesError");
        setError(message);
        setTab("general");
        Alert.alert(t("invForm.couldNotSaveChanges"), message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // POST /api/v1/staff/items — create the product on the backend.
    setError(null);
    setSubmitting(true);
    try {
      const created = await createItem({
        item_code: code.trim(),
        item_name: name.trim(),
        // item_name_kh is required by the backend — fall back to the EN name.
        item_name_kh: nameKhmer.trim() || name.trim(),
        price: parseFloat(price) || 0,
        cost: parseFloat(cost) || 0,
        category_id: Number(categoryId),
        alert_stock: parseInt(alertStock, 10) || 0,
        stock_type: STOCK_TYPE_CODES[stockType],
        status: status === "active" ? 1 : 0,
      });

      // If the server accepted the request but returned no item id, the create
      // likely didn't persist — surface that instead of a false "created".
      if (!created.id) {
        const msg = t("invForm.noIdMsg");
        setError(msg);
        Alert.alert(t("invForm.noIdTitle"), msg);
        return;
      }

      // Optionally set the entered opening stock for the active branch's default
      // warehouse. The item already appears in the list without this (the backend
      // creates zero-qty stock rows on create), so this only sets a starting count.
      const initialQty = parseInt(stock, 10) || 0;
      const warehouseId = Number(warehouses[0]?.id ?? 0);
      const branchLoginId = Number(session?.branch.id ?? 0);
      let note = "";
      if (initialQty > 0 && warehouseId && branchLoginId) {
        try {
          await createStockAdjustment({
            warehouse_id: warehouseId,
            branch_login_id: branchLoginId,
            items: [
              {
                item_id: Number(created.id),
                adjust_qty: initialQty,
                adjust_type: "correction_in",
                description: "Initial stock on item creation",
              },
            ],
          });
        } catch (stockErr) {
          note = t("invForm.openingStockFailNote");
        }
      } else if (initialQty > 0) {
        note = t("invForm.openingStockNoWhNote");
      }

      // Confirm success explicitly — otherwise a silent back() looks like
      // nothing happened. router.back() returns to the list, which refreshes
      // on focus so the new item appears.
      Alert.alert(
        t("invForm.productCreatedTitle"),
        t("invForm.productCreatedBody", { name: name.trim(), note }),
        [{ text: t("common.ok"), onPress: () => router.back() }],
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : t("invForm.saveItemError");
      setError(message);
      setTab("general");
      // Surface the failure in a dialog so it can't be missed below the fold.
      Alert.alert(t("invForm.couldNotCreate"), message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={isNew ? t("invForm.newTitle") : existing!.name}
        subtitle={isNew ? t("invForm.newSubtitle") : t("invForm.editSubtitle")}
        onBack={() => router.back()}
      />

      <View style={styles.tabBarWrap}>
        <Segmented
          value={tab}
          onChange={setTab}
          theme={theme}
          options={[
            { key: "general", label: t("invForm.tabGeneral") },
            { key: "gallery", label: t("invForm.tabGallery") },
          ]}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {tab === "general" ? (
            <>
              <Field
                label={t("invForm.itemCode")}
                value={code}
                onChangeText={setCode}
                placeholder={t("invForm.itemCode")}
                autoCapitalize="characters"
                autoCorrect={false}
                theme={theme}
              />

              <Segmented
                value={lang}
                onChange={setLang}
                theme={theme}
                options={[
                  { key: "en", label: t("language.en") },
                  { key: "kh", label: t("language.km") },
                ]}
              />

              {lang === "en" ? (
                <>
                  <Field
                    label={t("invForm.nameEn")}
                    value={name}
                    onChangeText={setName}
                    placeholder={t("invForm.nameEnPlaceholder")}
                    theme={theme}
                  />
                  <Field
                    label={t("invForm.descEn")}
                    value={description}
                    onChangeText={setDescription}
                    placeholder={t("invForm.descEnPlaceholder")}
                    multiline
                    theme={theme}
                  />
                </>
              ) : (
                <>
                  <Field
                    label={t("invForm.nameKh")}
                    value={nameKhmer}
                    onChangeText={setNameKhmer}
                    placeholder="ឈ្មោះទំនិញ"
                    theme={theme}
                  />
                  <Field
                    label={t("invForm.descKh")}
                    value={descriptionKhmer}
                    onChangeText={setDescriptionKhmer}
                    placeholder="ការពិពណ៌នា"
                    multiline
                    theme={theme}
                  />
                </>
              )}

              <View style={styles.fieldGroup}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t("invForm.thumbnail")}
                </ThemedText>
                <ThemedView type="backgroundElement" style={styles.thumbBox}>
                  {thumbnail ? (
                    <Image
                      source={{ uri: thumbnail }}
                      style={styles.thumbImage}
                      contentFit="cover"
                    />
                  ) : (
                    <Ionicons
                      name="image-outline"
                      size={44}
                      color={theme.textSecondary}
                    />
                  )}
                </ThemedView>
                <Pressable
                  onPress={pickThumbnail}
                  style={({ pressed }) => [
                    styles.darkButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="camera-outline" size={18} color="#ffffff" />
                  <ThemedText style={styles.darkButtonText}>
                    {t("invForm.chooseThumbnail")}
                  </ThemedText>
                </Pressable>
              </View>

              <SelectField
                label={t("productDetails.brand")}
                value={brand}
                placeholder={t("invForm.selectBrand")}
                icon="ribbon-outline"
                onPress={() => setSheet("brand")}
                theme={theme}
              />
              <SelectField
                label={t("invForm.itemStatus")}
                value={status === "active" ? t("common.active") : t("common.inactive")}
                icon="ellipse-outline"
                onPress={() => setSheet("status")}
                theme={theme}
              />
              <SelectField
                label={t("invForm.stockType")}
                value={stockType}
                icon="cube-outline"
                onPress={() => setSheet("stockType")}
                theme={theme}
              />
              <SelectField
                label={t("invForm.category")}
                value={category}
                placeholder={
                  categoriesError
                    ? t("invForm.categoriesError")
                    : categoryOptions.length === 0
                      ? t("invForm.categoriesLoading")
                      : t("filters.selectCategory")
                }
                icon="pricetag-outline"
                onPress={() => {
                  if (categoriesError) {
                    setCategoriesError(null);
                    loadCategories();
                  } else {
                    setSheet("category");
                  }
                }}
                theme={theme}
              />
              {categoriesError && (
                <ThemedText type="small" style={styles.error}>
                  {categoriesError}
                </ThemedText>
              )}

              <ThemedText type="smallBold" style={styles.sectionTitle}>
                {t("invForm.pricingStock")}
              </ThemedText>
              <View style={styles.row}>
                <Field
                  label={t("productDetails.cost")}
                  value={cost}
                  onChangeText={setCost}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  theme={theme}
                  containerStyle={styles.rowItem}
                />
                <Field
                  label={t("invForm.salePrice")}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  theme={theme}
                  containerStyle={styles.rowItem}
                />
              </View>
              <View style={styles.row}>
                <Field
                  label={t("productDetails.barcode")}
                  value={barcode}
                  onChangeText={setBarcode}
                  placeholder={t("productDetails.barcode")}
                  autoCapitalize="none"
                  autoCorrect={false}
                  theme={theme}
                  containerStyle={styles.rowItem}
                />
                <Field
                  label={t("invForm.alertStock")}
                  value={alertStock}
                  onChangeText={setAlertStock}
                  placeholder="0"
                  keyboardType="number-pad"
                  theme={theme}
                  containerStyle={styles.rowItem}
                />
              </View>
              <Field
                label={t("invForm.stockOnHand")}
                value={stock}
                onChangeText={setStock}
                placeholder="0"
                keyboardType="number-pad"
                theme={theme}
              />
            </>
          ) : (
            <View style={styles.fieldGroup}>
              <ThemedText type="small" themeColor="textSecondary">
                {t("invForm.addPhotos")}
              </ThemedText>
              <View style={styles.galleryGrid}>
                {gallery.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.galleryItem}>
                    <Image
                      source={{ uri }}
                      style={styles.galleryImage}
                      contentFit="cover"
                    />
                    <Pressable
                      onPress={() => removeGalleryImage(index)}
                      style={styles.galleryRemove}
                      hitSlop={Spacing.one}
                    >
                      <Ionicons name="close" size={14} color="#ffffff" />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  onPress={addGalleryImages}
                  style={({ pressed }) => [
                    styles.galleryItem,
                    styles.galleryAdd,
                    { borderColor: theme.backgroundSelected },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="add" size={28} color={theme.textSecondary} />
                </Pressable>
              </View>
            </View>
          )}

          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <Pressable
            onPress={handleSave}
            disabled={submitting}
            style={({ pressed }) => [
              styles.saveButton,
              (pressed || submitting) && styles.pressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Ionicons name="checkmark" size={18} color="#ffffff" />
            )}
            <ThemedText style={styles.saveButtonText}>
              {submitting ? t("invForm.saving") : isNew ? t("invForm.saveItem") : t("common.saveChanges")}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={!!sheet}
        title={activeSheet?.title ?? ""}
        options={activeSheet?.options ?? []}
        selected={activeSheet?.selected}
        searchable={sheet === "category"}
        searchValue={categorySearch}
        onSearchChange={setCategorySearch}
        searchPlaceholder={t("invForm.searchCategories")}
        emptyText={categoriesError ?? t("invForm.noCategories")}
        onSelect={(value) => {
          activeSheet?.onSelect(value);
          setError(null);
          setSheet(null);
          setCategorySearch("");
        }}
        onClose={() => {
          setSheet(null);
          setCategorySearch("");
        }}
      />
    </ThemedView>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  theme,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={[styles.segmented, { backgroundColor: theme.backgroundElement }]}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <ThemedText
              type="smallBold"
              numberOfLines={1}
              style={
                active
                  ? styles.segmentActiveText
                  : { color: theme.textSecondary }
              }
            >
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  icon,
  onPress,
  theme,
}: {
  label: string;
  value: string;
  placeholder?: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.fieldGroup}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <ThemedView type="backgroundElement" style={styles.input}>
          <View style={styles.selectRow}>
            <Ionicons name={icon} size={18} color={theme.textSecondary} />
            <ThemedText
              numberOfLines={1}
              style={[
                styles.selectValue,
                { color: value ? theme.text : theme.textSecondary },
              ]}
            >
              {value || placeholder}
            </ThemedText>
            <Ionicons
              name="chevron-down"
              size={18}
              color={theme.textSecondary}
            />
          </View>
        </ThemedView>
      </Pressable>
    </View>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & {
  label: string;
  theme: ReturnType<typeof useTheme>;
  containerStyle?: object;
};

function Field({
  label,
  theme,
  containerStyle,
  style,
  multiline,
  ...inputProps
}: FieldProps) {
  return (
    <View style={[styles.fieldGroup, containerStyle]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedView
        type="backgroundElement"
        style={[styles.input, multiline && styles.inputMultiline]}
      >
        <TextInput
          placeholderTextColor={theme.textSecondary}
          style={[styles.inputText, { color: theme.text }, style]}
          multiline={multiline}
          {...inputProps}
        />
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBarWrap: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  segmented: {
    flexDirection: "row",
    borderRadius: Spacing.three,
    padding: Spacing.half,
    gap: Spacing.half,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: DARK,
  },
  segmentActiveText: {
    color: "#ffffff",
  },
  body: {
    padding: Spacing.four,
    paddingTop: 0,
    gap: Spacing.three,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  rowItem: {
    flex: 1,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 52,
    justifyContent: "center",
  },
  inputMultiline: {
    minHeight: 96,
    paddingVertical: Spacing.two,
  },
  inputText: {
    fontSize: 16,
  },
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  selectValue: {
    flex: 1,
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 16,
    marginTop: Spacing.one,
  },
  thumbBox: {
    height: 180,
    borderRadius: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  darkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 48,
    borderRadius: Spacing.three,
    backgroundColor: DARK,
    marginTop: Spacing.one,
  },
  darkButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.three,
  },
  galleryItem: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: Spacing.three,
    overflow: "hidden",
  },
  galleryImage: {
    width: "100%",
    height: "100%",
  },
  galleryRemove: {
    position: "absolute",
    top: Spacing.one,
    right: Spacing.one,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  galleryAdd: {
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    color: "#e5484d",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.one,
    height: 52,
    borderRadius: Spacing.three,
    backgroundColor: BRAND,
    marginTop: Spacing.two,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.7,
  },
});
