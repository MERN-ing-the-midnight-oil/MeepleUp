import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Modal from './Modal';
import Input from './Input';

const WEEKDAYS = [
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
  { label: 'Sunday', value: 0 },
];

const WEEK_POSITIONS = [
  { label: 'First', value: 1 },
  { label: 'Second', value: 2 },
  { label: 'Third', value: 3 },
  { label: 'Fourth', value: 4 },
];

const formatDateDisplay = (date) => {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatTimeDisplay = (date) => {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatRecurringDisplay = (recurring) => {
  if (!recurring || !recurring.enabled) return '';
  
  const { pattern, weekday, interval, weekPosition } = recurring;
  
  if (pattern === 'daily') {
    return `Every day at ${formatTimeDisplay(recurring.time)}`;
  }
  
  if (pattern === 'weekly') {
    const weekdayName = WEEKDAYS.find(w => w.value === weekday)?.label || '';
    if (interval === 1) {
      return `Every ${weekdayName} at ${formatTimeDisplay(recurring.time)}`;
    } else {
      return `Every other ${weekdayName} at ${formatTimeDisplay(recurring.time)}`;
    }
  }
  
  if (pattern === 'monthly') {
    const weekdayName = WEEKDAYS.find(w => w.value === weekday)?.label || '';
    const position = WEEK_POSITIONS.find(w => w.value === weekPosition)?.label || '';
    return `Every ${position} ${weekdayName} at ${formatTimeDisplay(recurring.time)}`;
  }
  
  return '';
};

const AdvancedDateTimePicker = ({ value, onChange, style }) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Initialize date and time from value or use current date
  const getInitialDate = () => {
    if (value?.date) {
      return new Date(value.date);
    }
    return new Date();
  };
  
  const getInitialTime = () => {
    if (value?.time) {
      return new Date(value.time);
    }
    if (value?.date) {
      return new Date(value.date);
    }
    return new Date();
  };
  
  const initialDate = getInitialDate();
  const initialTime = getInitialTime();
  
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState(initialTime);
  
  // Initialize recurring options
  const isRecurringValue = value?.recurring?.enabled || false;
  const [isRecurring, setIsRecurring] = useState(isRecurringValue);
  
  const [recurring, setRecurring] = useState(
    value?.recurring || {
      enabled: false,
      pattern: 'weekly',
      weekday: initialDate.getDay(),
      interval: 1, // 1 = every week, 2 = every other week
      weekPosition: 1, // For monthly pattern
      time: initialTime,
    }
  );

  const handleDateChange = (event, date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'dismissed') {
        return;
      }
    }
    
    if (date) {
      // Preserve the time when changing date
      const newDate = new Date(date);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      
      // Check if the selected date is in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to compare dates only
      const selectedDateOnly = new Date(newDate);
      selectedDateOnly.setHours(0, 0, 0, 0);
      
      // If the selected date is in the past, advance the year by one
      // This handles cases where user selects a month that has already passed this year
      if (selectedDateOnly < today) {
        const currentYear = today.getFullYear();
        const selectedYear = newDate.getFullYear();
        
        // Only advance if we're in the same year or the selected year is in the past
        if (selectedYear <= currentYear) {
          newDate.setFullYear(currentYear + 1);
        }
      }
      
      setSelectedDate(newDate);
      setSelectedTime(newDate);
      
      // Update recurring weekday if needed
      if (isRecurring && recurring.pattern === 'weekly') {
        const updatedRecurring = {
          ...recurring,
          weekday: date.getDay(),
          time: newDate,
        };
        setRecurring(updatedRecurring);
        onChange({
          date: newDate.toISOString(),
          time: newDate.toISOString(),
          recurring: updatedRecurring,
          displayText: formatRecurringDisplay(updatedRecurring),
        });
      } else {
        onChange({
          date: newDate.toISOString(),
          time: newDate.toISOString(),
          recurring: isRecurring ? { ...recurring, time: newDate } : null,
          displayText: isRecurring 
            ? formatRecurringDisplay({ ...recurring, time: newDate })
            : `${formatDateDisplay(newDate)} at ${formatTimeDisplay(newDate)}`,
        });
      }
    }
  };

  const handleTimeChange = (event, date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
      if (event.type === 'dismissed') {
        return;
      }
    }
    
    if (date) {
      // Update time in the selected date
      const newTime = new Date(selectedDate);
      newTime.setHours(date.getHours());
      newTime.setMinutes(date.getMinutes());
      
      setSelectedTime(newTime);
      
      if (isRecurring) {
        const updatedRecurring = {
          ...recurring,
          time: newTime,
        };
        setRecurring(updatedRecurring);
        onChange({
          date: selectedDate.toISOString(),
          time: newTime.toISOString(),
          recurring: updatedRecurring,
          displayText: formatRecurringDisplay(updatedRecurring),
        });
      } else {
        onChange({
          date: selectedDate.toISOString(),
          time: newTime.toISOString(),
          recurring: null,
          displayText: `${formatDateDisplay(selectedDate)} at ${formatTimeDisplay(newTime)}`,
        });
      }
    }
  };

  const handleRecurringToggle = (enabled) => {
    setIsRecurring(enabled);
    if (!enabled) {
      // Clear recurring
      onChange({
        date: selectedDate.toISOString(),
        time: selectedTime.toISOString(),
        recurring: null,
        displayText: `${formatDateDisplay(selectedDate)} at ${formatTimeDisplay(selectedTime)}`,
      });
    } else {
      // Initialize recurring
      const newRecurring = {
        ...recurring,
        enabled: true,
        weekday: selectedDate.getDay(),
        time: selectedTime,
      };
      setRecurring(newRecurring);
      onChange({
        date: selectedDate.toISOString(),
        time: selectedTime.toISOString(),
        recurring: newRecurring,
        displayText: formatRecurringDisplay(newRecurring),
      });
    }
  };

  const handleRecurringChange = (field, newValue) => {
    const updatedRecurring = {
      ...recurring,
      [field]: newValue,
      enabled: true,
    };
    setRecurring(updatedRecurring);
    onChange({
      date: selectedDate.toISOString(),
      time: selectedTime.toISOString(),
      recurring: updatedRecurring,
      displayText: formatRecurringDisplay(updatedRecurring),
    });
  };

  const displayText = isRecurring && recurring.enabled
    ? formatRecurringDisplay(recurring)
    : (value?.displayText || `${formatDateDisplay(selectedDate)} at ${formatTimeDisplay(selectedTime)}`);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.inputRow}>
        <Pressable
          style={styles.dateInput}
          onPress={() => setShowDatePicker(true)}
        >
          <View pointerEvents="none">
            <Input
              placeholder="Select date"
              value={formatDateDisplay(selectedDate)}
              editable={false}
              style={styles.input}
            />
          </View>
        </Pressable>
        
        <Pressable
          style={styles.timeInput}
          onPress={() => setShowTimePicker(true)}
        >
          <View pointerEvents="none">
            <Input
              placeholder="Select time"
              value={formatTimeDisplay(selectedTime)}
              editable={false}
              style={styles.input}
            />
          </View>
        </Pressable>
      </View>

      {/* Recurring Toggle */}
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Recurring event</Text>
        <Pressable
          style={[styles.toggleButton, isRecurring && styles.toggleButtonActive]}
          onPress={() => handleRecurringToggle(!isRecurring)}
        >
          <Text style={[styles.toggleButtonText, isRecurring && styles.toggleButtonTextActive]}>
            {isRecurring ? 'Yes' : 'No'}
          </Text>
        </Pressable>
      </View>

      {/* Recurring Options */}
      {isRecurring && (
        <View style={styles.recurringOptions}>
          <Text style={styles.recurringTitle}>Recurring every:</Text>
          
          {/* Pattern Selection */}
          <View style={styles.optionRow}>
            <Text style={styles.optionLabel}>Pattern:</Text>
            <View style={styles.buttonGroup}>
              <Pressable
                style={[
                  styles.patternButton,
                  recurring.pattern === 'weekly' && styles.patternButtonActive,
                ]}
                onPress={() => handleRecurringChange('pattern', 'weekly')}
              >
                <Text
                  style={[
                    styles.patternButtonText,
                    recurring.pattern === 'weekly' && styles.patternButtonTextActive,
                  ]}
                >
                  Weekly
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.patternButton,
                  recurring.pattern === 'monthly' && styles.patternButtonActive,
                ]}
                onPress={() => handleRecurringChange('pattern', 'monthly')}
              >
                <Text
                  style={[
                    styles.patternButtonText,
                    recurring.pattern === 'monthly' && styles.patternButtonTextActive,
                  ]}
                >
                  Monthly
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Weekly Options */}
          {recurring.pattern === 'weekly' && (
            <>
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>Frequency:</Text>
                <View style={styles.buttonGroup}>
                  <Pressable
                    style={[
                      styles.frequencyButton,
                      recurring.interval === 1 && styles.frequencyButtonActive,
                    ]}
                    onPress={() => handleRecurringChange('interval', 1)}
                  >
                    <Text
                      style={[
                        styles.frequencyButtonText,
                        recurring.interval === 1 && styles.frequencyButtonTextActive,
                      ]}
                    >
                      Every
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.frequencyButton,
                      recurring.interval === 2 && styles.frequencyButtonActive,
                    ]}
                    onPress={() => handleRecurringChange('interval', 2)}
                  >
                    <Text
                      style={[
                        styles.frequencyButtonText,
                        recurring.interval === 2 && styles.frequencyButtonTextActive,
                      ]}
                    >
                      Every Other
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>Day:</Text>
                <View style={styles.weekdayContainer}>
                  {WEEKDAYS.map((day) => (
                    <Pressable
                      key={day.value}
                      style={[
                        styles.weekdayButton,
                        recurring.weekday === day.value && styles.weekdayButtonActive,
                      ]}
                      onPress={() => handleRecurringChange('weekday', day.value)}
                    >
                      <Text
                        style={[
                          styles.weekdayButtonText,
                          recurring.weekday === day.value && styles.weekdayButtonTextActive,
                        ]}
                      >
                        {day.label.slice(0, 3)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          )}

          {/* Monthly Options */}
          {recurring.pattern === 'monthly' && (
            <>
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>Week of Month:</Text>
                <View style={styles.buttonGroup}>
                  {WEEK_POSITIONS.map((position) => (
                    <Pressable
                      key={position.value}
                      style={[
                        styles.positionButton,
                        recurring.weekPosition === position.value && styles.positionButtonActive,
                      ]}
                      onPress={() => handleRecurringChange('weekPosition', position.value)}
                    >
                      <Text
                        style={[
                          styles.positionButtonText,
                          recurring.weekPosition === position.value && styles.positionButtonTextActive,
                        ]}
                      >
                        {position.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>Day:</Text>
                <View style={styles.weekdayContainer}>
                  {WEEKDAYS.map((day) => (
                    <Pressable
                      key={day.value}
                      style={[
                        styles.weekdayButton,
                        recurring.weekday === day.value && styles.weekdayButtonActive,
                      ]}
                      onPress={() => handleRecurringChange('weekday', day.value)}
                    >
                      <Text
                        style={[
                          styles.weekdayButtonText,
                          recurring.weekday === day.value && styles.weekdayButtonTextActive,
                        ]}
                      >
                        {day.label.slice(0, 3)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          )}

          {/* Display Text */}
          <View style={styles.displayTextContainer}>
            <Text style={styles.displayText}>{displayText}</Text>
          </View>
        </View>
      )}

      {/* Date Picker */}
      {Platform.OS === 'ios' ? (
        <Modal
          isOpen={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          title="Select Date"
        >
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="spinner"
            onChange={(event, date) => {
              // On iOS spinner, we get updates as user scrolls
              // The handleDateChange will check if date is in past and advance year
              handleDateChange(event, date);
            }}
            minimumDate={undefined} // Allow scrolling to past months, we'll handle year advancement in handleDateChange
            style={{ width: '100%' }}
          />
          <View style={styles.iosPickerActions}>
            <Pressable
              style={styles.iosPickerButton}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={styles.iosPickerButtonText}>Done</Text>
            </Pressable>
          </View>
        </Modal>
      ) : (
        showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )
      )}

      {/* Time Picker */}
      {Platform.OS === 'ios' ? (
        <Modal
          isOpen={showTimePicker}
          onClose={() => setShowTimePicker(false)}
          title="Select Time"
        >
          <DateTimePicker
            value={selectedTime}
            mode="time"
            display="spinner"
            onChange={(event, date) => {
              handleTimeChange(event, date);
            }}
            is24Hour={false}
            style={{ width: '100%' }}
          />
          <View style={styles.iosPickerActions}>
            <Pressable
              style={styles.iosPickerButton}
              onPress={() => setShowTimePicker(false)}
            >
              <Text style={styles.iosPickerButtonText}>Done</Text>
            </Pressable>
          </View>
        </Modal>
      ) : (
        showTimePicker && (
          <DateTimePicker
            value={selectedTime}
            mode="time"
            display="default"
            onChange={handleTimeChange}
            is24Hour={false}
          />
        )
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dateInput: {
    flex: 1,
  },
  timeInput: {
    flex: 1,
  },
  input: {
    marginBottom: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  toggleButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#d45d5d',
    borderColor: '#d45d5d',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  toggleButtonTextActive: {
    color: '#fff',
  },
  recurringOptions: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  recurringTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  optionRow: {
    marginBottom: 16,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  patternButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  patternButtonActive: {
    backgroundColor: '#d45d5d',
    borderColor: '#d45d5d',
  },
  patternButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  patternButtonTextActive: {
    color: '#fff',
  },
  weekdayContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weekdayButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  weekdayButtonActive: {
    backgroundColor: '#d45d5d',
    borderColor: '#d45d5d',
  },
  weekdayButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  weekdayButtonTextActive: {
    color: '#fff',
  },
  frequencyButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  frequencyButtonActive: {
    backgroundColor: '#d45d5d',
    borderColor: '#d45d5d',
  },
  frequencyButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  frequencyButtonTextActive: {
    color: '#fff',
  },
  positionButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 70,
    alignItems: 'center',
  },
  positionButtonActive: {
    backgroundColor: '#d45d5d',
    borderColor: '#d45d5d',
  },
  positionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  positionButtonTextActive: {
    color: '#fff',
  },
  displayTextContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  displayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
  },
  iosPickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  iosPickerButton: {
    backgroundColor: '#d45d5d',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  iosPickerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AdvancedDateTimePicker;

