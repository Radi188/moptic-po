import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { OptionSheet } from '@/components/option-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addProduct,
  BRANDS,
  CATEGORIES,
  getProduct,
  STOCK_TYPES,
  updateProduct,
  type ProductStatus,
} from '@/data/inventory';

const BRAND = '#232843';
const DARK = '#232843';

type Tab = 'general' | 'gallery';
type Lang = 'en' | 'kh';
type SheetKey = 'brand' | 'status' | 'stockType' | 'category';

export default function InventoryItemFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const isNew = id === 'new';
  const existing = useMemo(() => (isNew ? undefined : getProduct(id)), [id, isNew]);

  const [tab, setTab] = useState<Tab>('general');
  const [lang, setLang] = useState<Lang>('en');

  const [code, setCode] = useState(existing?.code ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [nameKhmer, setNameKhmer] = useState(existing?.nameKhmer ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [descriptionKhmer, setDescriptionKhmer] = useState(existing?.descriptionKhmer ?? '');
  const [brand, setBrand] = useState(existing?.brand ?? '');
  const [status, setStatus] = useState<ProductStatus>(existing?.status ?? 'active');
  const [stockType, setStockType] = useState(existing?.stockType ?? 'Stock');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [cost, setCost] = useState(existing ? String(existing.cost) : '0');
  const [price, setPrice] = useState(existing ? String(existing.price) : '0');
  const [barcode, setBarcode] = useState(existing?.barcode ?? '');
  const [stock, setStock] = useState(existing ? String(existing.stock) : '0');
  const [alertStock, setAlertStock] = useState(existing ? String(existing.reorderLevel) : '0');
  const [thumbnail, setThumbnail] = useState(existing?.thumbnail ?? '');
  const [gallery, setGallery] = useState<string[]>(existing?.gallery ?? []);

  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isNew && !existing) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title="Not found" onBack={() => router.back()} />
        <View style={styles.centered}>
          <ThemedText themeColor="textSecondary">This product no longer exists.</ThemedText>
        </View>
      </ThemedView>
    );
  }

  const sheets: Record<
    SheetKey,
    { title: string; options: string[]; selected: string; onSelect: (v: string) => void }
  > = {
    brand: { title: 'Select brand', options: BRANDS, selected: brand, onSelect: setBrand },
    status: {
      title: 'Item status',
      options: ['Active', 'Inactive'],
      selected: status === 'active' ? 'Active' : 'Inactive',
      onSelect: (v) => setStatus(v === 'Active' ? 'active' : 'inactive'),
    },
    stockType: { title: 'Stock type', options: STOCK_TYPES, selected: stockType, onSelect: setStockType },
    category: { title: 'Select category', options: CATEGORIES, selected: category, onSelect: setCategory },
  };
  const activeSheet = sheet ? sheets[sheet] : null;

  async function pickThumbnail() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!res.canceled && res.assets[0]) setThumbnail(res.assets[0].uri);
  }

  async function addGalleryImages() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.6,
    });
    if (!res.canceled) setGallery((current) => [...current, ...res.assets.map((a) => a.uri)]);
  }

  function removeGalleryImage(index: number) {
    setGallery((current) => current.filter((_, i) => i !== index));
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Product name is required.');
      setTab('general');
      return;
    }
    if (!code.trim()) {
      setError('Item code is required.');
      setTab('general');
      return;
    }
    if (!category) {
      setError('Please select a category.');
      setTab('general');
      return;
    }

    const input = {
      code: code.trim(),
      name: name.trim(),
      nameKhmer: nameKhmer.trim(),
      category,
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
    if (isNew) {
      addProduct(input);
    } else {
      updateProduct(id, input);
    }
    router.back();
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={isNew ? 'New Product' : existing!.name}
        subtitle={isNew ? 'Add to inventory' : 'Edit product'}
        onBack={() => router.back()}
      />

      <View style={styles.tabBarWrap}>
        <Segmented
          value={tab}
          onChange={setTab}
          theme={theme}
          options={[
            { key: 'general', label: 'General Details' },
            { key: 'gallery', label: 'Product Gallery' },
          ]}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {tab === 'general' ? (
            <>
              <Field
                label="Item Code"
                value={code}
                onChangeText={setCode}
                placeholder="Item Code"
                autoCapitalize="characters"
                autoCorrect={false}
                theme={theme}
              />

              <Segmented
                value={lang}
                onChange={setLang}
                theme={theme}
                options={[
                  { key: 'en', label: 'English' },
                  { key: 'kh', label: 'Khmer' },
                ]}
              />

              {lang === 'en' ? (
                <>
                  <Field
                    label="Item Name (EN)"
                    value={name}
                    onChangeText={setName}
                    placeholder="Item Name in English"
                    theme={theme}
                  />
                  <Field
                    label="Description (EN)"
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Description in English"
                    multiline
                    theme={theme}
                  />
                </>
              ) : (
                <>
                  <Field
                    label="Item Name (KH)"
                    value={nameKhmer}
                    onChangeText={setNameKhmer}
                    placeholder="ឈ្មោះទំនិញ"
                    theme={theme}
                  />
                  <Field
                    label="Description (KH)"
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
                  Thumbnail
                </ThemedText>
                <ThemedView type="backgroundElement" style={styles.thumbBox}>
                  {thumbnail ? (
                    <Image source={{ uri: thumbnail }} style={styles.thumbImage} contentFit="cover" />
                  ) : (
                    <Ionicons name="image-outline" size={44} color={theme.textSecondary} />
                  )}
                </ThemedView>
                <Pressable
                  onPress={pickThumbnail}
                  style={({ pressed }) => [styles.darkButton, pressed && styles.pressed]}>
                  <Ionicons name="camera-outline" size={18} color="#ffffff" />
                  <ThemedText style={styles.darkButtonText}>Choose Thumbnail</ThemedText>
                </Pressable>
              </View>

              <SelectField
                label="Brand"
                value={brand}
                placeholder="Select brand"
                icon="ribbon-outline"
                onPress={() => setSheet('brand')}
                theme={theme}
              />
              <SelectField
                label="Item Status"
                value={status === 'active' ? 'Active' : 'Inactive'}
                icon="ellipse-outline"
                onPress={() => setSheet('status')}
                theme={theme}
              />
              <SelectField
                label="Stock Type"
                value={stockType}
                icon="cube-outline"
                onPress={() => setSheet('stockType')}
                theme={theme}
              />
              <SelectField
                label="Category"
                value={category}
                placeholder="Select category"
                icon="pricetag-outline"
                onPress={() => setSheet('category')}
                theme={theme}
              />

              <ThemedText type="smallBold" style={styles.sectionTitle}>
                Pricing & Stock
              </ThemedText>
              <View style={styles.row}>
                <Field
                  label="Cost"
                  value={cost}
                  onChangeText={setCost}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  theme={theme}
                  containerStyle={styles.rowItem}
                />
                <Field
                  label="Sale Price"
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
                  label="Barcode"
                  value={barcode}
                  onChangeText={setBarcode}
                  placeholder="Barcode"
                  autoCapitalize="none"
                  autoCorrect={false}
                  theme={theme}
                  containerStyle={styles.rowItem}
                />
                <Field
                  label="Alert Stock"
                  value={alertStock}
                  onChangeText={setAlertStock}
                  placeholder="0"
                  keyboardType="number-pad"
                  theme={theme}
                  containerStyle={styles.rowItem}
                />
              </View>
              <Field
                label="Stock on hand"
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
                Add product photos
              </ThemedText>
              <View style={styles.galleryGrid}>
                {gallery.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.galleryItem}>
                    <Image source={{ uri }} style={styles.galleryImage} contentFit="cover" />
                    <Pressable
                      onPress={() => removeGalleryImage(index)}
                      style={styles.galleryRemove}
                      hitSlop={Spacing.one}>
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
                  ]}>
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
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <Ionicons name="checkmark" size={18} color="#ffffff" />
            <ThemedText style={styles.saveButtonText}>
              {isNew ? 'Save Item' : 'Save changes'}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={!!sheet}
        title={activeSheet?.title ?? ''}
        options={activeSheet?.options ?? []}
        selected={activeSheet?.selected}
        onSelect={(value) => {
          activeSheet?.onSelect(value);
          setError(null);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
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
    <View style={[styles.segmented, { backgroundColor: theme.backgroundElement }]}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.segment, active && styles.segmentActive]}>
            <ThemedText
              type="smallBold"
              numberOfLines={1}
              style={active ? styles.segmentActiveText : { color: theme.textSecondary }}>
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
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.fieldGroup}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.input}>
          <View style={styles.selectRow}>
            <Ionicons name={icon} size={18} color={theme.textSecondary} />
            <ThemedText
              numberOfLines={1}
              style={[styles.selectValue, { color: value ? theme.text : theme.textSecondary }]}>
              {value || placeholder}
            </ThemedText>
            <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
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

function Field({ label, theme, containerStyle, style, multiline, ...inputProps }: FieldProps) {
  return (
    <View style={[styles.fieldGroup, containerStyle]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedView type="backgroundElement" style={[styles.input, multiline && styles.inputMultiline]}>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarWrap: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: Spacing.three,
    padding: Spacing.half,
    gap: Spacing.half,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: DARK,
  },
  segmentActiveText: {
    color: '#ffffff',
  },
  body: {
    padding: Spacing.four,
    paddingTop: 0,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  rowItem: {
    flex: 1,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 52,
    justifyContent: 'center',
  },
  inputMultiline: {
    minHeight: 96,
    paddingVertical: Spacing.two,
  },
  inputText: {
    fontSize: 16,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  darkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: Spacing.three,
    backgroundColor: DARK,
    marginTop: Spacing.one,
  },
  darkButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  galleryItem: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  galleryRemove: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryAdd: {
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#e5484d',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 52,
    borderRadius: Spacing.three,
    backgroundColor: BRAND,
    marginTop: Spacing.two,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
