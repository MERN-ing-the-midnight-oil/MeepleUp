import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CalendarDatePicker = ({ 
  selectedDates = [], // Array of { date: Date, startTime: Date, endTime: Date }
  onDatesChange, 
  minDate,
  usualStartTime,
  usualEndTime,
  onDateTimeEdit, // Callback when user wants to edit a date's time
  onDateLongPress, // Callback when user long-presses a selected date
  onDatePress, // Callback when user taps a selected date
}) => {
  const today = new Date();
  const startMonth = today.getMonth();
  const startYear = today.getFullYear();

  // Helper function to convert date to key - must be defined before useMemo
  const dateToKey = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  // Create a map of date keys to date objects with times
  const selectedDatesMap = useMemo(() => {
    const map = new Map();
    selectedDates.forEach(dateObj => {
      const date = dateObj.date instanceof Date ? dateObj.date : new Date(dateObj.date);
      if (!isNaN(date.getTime())) {
        map.set(dateToKey(date), {
          date,
          startTime: dateObj.startTime instanceof Date ? dateObj.startTime : new Date(dateObj.startTime),
          endTime: dateObj.endTime instanceof Date ? dateObj.endTime : new Date(dateObj.endTime),
        });
      }
    });
    return map;
  }, [selectedDates]);

  const isDateSelected = (date) => {
    return selectedDatesMap.has(dateToKey(date));
  };

  const getDateInfo = (date) => {
    return selectedDatesMap.get(dateToKey(date));
  };

  const toggleDate = (date) => {
    const dateKey = dateToKey(date);
    const newSelectedDates = [...selectedDates];
    
    if (selectedDatesMap.has(dateKey)) {
      // Remove date
      const index = newSelectedDates.findIndex(d => {
        const dKey = dateToKey(d.date instanceof Date ? d.date : new Date(d.date));
        return dKey === dateKey;
      });
      if (index !== -1) {
        newSelectedDates.splice(index, 1);
      }
    } else {
      // Add date with default times
      const startTime = new Date(date);
      startTime.setHours(usualStartTime.getHours(), usualStartTime.getMinutes(), 0, 0);
      
      const endTime = new Date(date);
      endTime.setHours(usualEndTime.getHours(), usualEndTime.getMinutes(), 0, 0);
      
      newSelectedDates.push({
        date: new Date(date),
        startTime,
        endTime,
      });
    }
    
    // Sort dates
    newSelectedDates.sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });
    
    onDatesChange(newSelectedDates);
  };

  const isDateDisabled = (date) => {
    if (minDate) {
      const min = new Date(minDate);
      min.setHours(0, 0, 0, 0);
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);
      return checkDate < min;
    }
    return false;
  };

  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    return new Date(year, month, 1).getDay();
  };

  // Generate 12 months starting from current month
  const generateMonths = () => {
    const months = [];
    for (let i = 0; i < 12; i++) {
      const month = (startMonth + i) % 12;
      const year = startYear + Math.floor((startMonth + i) / 12);
      months.push({ month, year });
    }
    return months;
  };

  const months = generateMonths();
  const screenWidth = Dimensions.get('window').width;

  const renderCalendar = (month, year) => {
    const daysInMonth = getDaysInMonth(month, year);
    const firstDay = getFirstDayOfMonth(month, year);
    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      days.push(date);
    }

    return days;
  };

  return (
    <ScrollView 
      style={styles.container} 
      horizontal={true}
      pagingEnabled={true}
      showsHorizontalScrollIndicator={true}
      decelerationRate="fast"
      snapToInterval={screenWidth}
      snapToAlignment="start"
    >
      {months.map(({ month, year }, monthIndex) => {
        const calendarDays = renderCalendar(month, year);
        
        return (
          <View key={`${year}-${month}`} style={[styles.monthContainer, { width: screenWidth }]}>
            {/* Month Header */}
            <View style={styles.monthHeader}>
              <Text style={styles.monthYear}>
                {MONTHS[month]} {year}
              </Text>
            </View>

            {/* Weekday Headers */}
            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((day) => (
                <View key={day} style={styles.weekdayHeader}>
                  <Text style={styles.weekdayText}>{day}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {calendarDays.map((date, index) => {
                if (date === null) {
                  return <View key={`empty-${monthIndex}-${index}`} style={styles.dayCell} />;
                }

                const isSelected = isDateSelected(date);
                const isDisabled = isDateDisabled(date);
                const isToday = dateToKey(date) === dateToKey(today);
                const dateInfo = isSelected ? getDateInfo(date) : null;

                return (
                  <TouchableOpacity
                    key={dateToKey(date)}
                    style={[
                      styles.dayCellWrapper,
                      isToday && styles.todayCellWrapper,
                      isSelected && styles.selectedCellWrapper,
                      isDisabled && styles.disabledCellWrapper,
                    ]}
                    onPress={() => {
                      if (!isDisabled) {
                        if (isSelected && dateInfo && onDatePress) {
                          // Tap on selected date opens details
                          const dateKey = dateToKey(date);
                          const index = selectedDates.findIndex(d => {
                            const dKey = dateToKey(d.date instanceof Date ? d.date : new Date(d.date));
                            return dKey === dateKey;
                          });
                          if (index !== -1) {
                            onDatePress(index, {
                              date: dateInfo.date,
                              startTime: dateInfo.startTime,
                              endTime: dateInfo.endTime,
                            });
                          }
                        }
                      }
                    }}
                    onLongPress={() => {
                      if (!isDisabled && !isSelected) {
                        // Long press on unselected date creates/selects it
                        toggleDate(date);
                      }
                    }}
                    delayLongPress={500}
                    disabled={isDisabled}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.dayCell,
                        isToday && styles.todayCell,
                        isSelected && styles.selectedCell,
                        isDisabled && styles.disabledCell,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          isToday && styles.todayText,
                          isSelected && styles.selectedText,
                          isDisabled && styles.disabledText,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
  },
  monthContainer: {
    paddingHorizontal: 16,
  },
  monthHeader: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  monthYear: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2f2f2f',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
  dayCellWrapper: {
    width: '14.28%',
    minHeight: 60,
    marginBottom: 4,
    paddingHorizontal: 1,
  },
  dayCell: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 1,
    borderRadius: 8,
    minHeight: 60,
  },
  todayCellWrapper: {
    // Container for today styling if needed
  },
  selectedCellWrapper: {
    // Container for selected styling if needed
  },
  disabledCellWrapper: {
    opacity: 0.3,
  },
  dayText: {
    fontSize: 16,
    color: '#2f2f2f',
    fontWeight: '500',
    marginBottom: 2,
  },
  selectedText: {
    color: '#fff',
    fontWeight: '600',
    marginBottom: 2,
  },
  todayCell: {
    backgroundColor: '#e8f4fd',
  },
  todayText: {
    fontWeight: '600',
    color: '#4a90e2',
  },
  selectedCell: {
    backgroundColor: '#4caf50',
    paddingVertical: 4,
  },
  disabledCell: {
    // Disabled styling handled by wrapper
  },
  disabledText: {
    color: '#ccc',
  },
});

export default CalendarDatePicker;

