import { View, Text, Modal, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface OptionSelectorProps {
  visible: boolean;
  title: string;
  options: Array<{ label: string; value: string; subtitle?: string }>;
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export default function OptionSelector({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}: OptionSelectorProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const handleSelect = (value: string) => {
    onSelect(value);
    onClose();
  };

  const renderOption = ({ item }: { item: { label: string; value: string; subtitle?: string } }) => (
    <TouchableOpacity
      style={[
        styles.optionItem,
        selectedValue === item.value && styles.selectedOption
      ]}
      onPress={() => handleSelect(item.value)}
    >
      <View style={styles.optionContent}>
        <Text style={[
          styles.optionLabel,
          selectedValue === item.value && styles.selectedOptionText
        ]}>
          {item.label}
        </Text>
        {item.subtitle && (
          <Text style={[
            styles.optionSubtitle,
            selectedValue === item.value && styles.selectedOptionSubtext
          ]}>
            {item.subtitle}
          </Text>
        )}
      </View>
      {selectedValue === item.value && (
        <Text style={styles.checkmark}>✓</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <TouchableOpacity 
          style={styles.modalContainer} 
          activeOpacity={1} 
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={options}
            renderItem={renderOption}
            keyExtractor={(item) => item.value}
            style={styles.optionsList}
            showsVerticalScrollIndicator={false}
          />
          
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  optionsList: {
    paddingHorizontal: 20,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
  },
  selectedOption: {
    backgroundColor: theme.colors.primary,
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 2,
  },
  selectedOptionText: {
    color: '#fff',
  },
  optionSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  selectedOptionSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  checkmark: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  cancelButton: {
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 16,
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
});
