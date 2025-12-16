import React, { useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { getHolidayForDate, HolidayIcon } from '../../utils/holidays';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Configure week start: 0 = Sunday, 1 = Monday
const WEEK_START_INDEX = 1; // Start week on Monday
const WEEKDAYS = WEEK_START_INDEX === 0
  ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  // Anchor all calculations in UTC to avoid timezone/DST shifts
  const todayLocal = new Date();
  const today = new Date(Date.UTC(
    todayLocal.getUTCFullYear(),
    todayLocal.getUTCMonth(),
    todayLocal.getUTCDate()
  ));
  const todayKey = `${today.getUTCFullYear()}-${today.getUTCMonth()}-${today.getUTCDate()}`;
  const startMonth = today.getUTCMonth();
  const startYear = today.getUTCFullYear();
  
  // State to track current month index (0 = current month)
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0);
  const scrollViewRef = useRef(null);

  // Helper function to convert date to key - must be defined before useMemo
  const dateToKey = (date) => {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
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
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    // Use UTC to avoid timezone/DST shifts
    const date = new Date(Date.UTC(year, month, 1));
    const dayOfWeek = date.getUTCDay();
    
    // Debug: Log for December 2025 to verify
    if (__DEV__ && month === 11 && year === 2025) {
      console.log(`[CalendarDatePicker] getFirstDayOfMonth(11, 2025) = ${dayOfWeek} (${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]})`);
    }
    
    return dayOfWeek;
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
  // Reduce available width significantly to account for implicit padding/margins and ensure all columns fit
  // Use 96% of screen width to ensure all 7 columns fit comfortably
  const availableWidth = Math.floor(screenWidth * 0.96);
  const columnWidth = Math.floor(availableWidth / 7); // Exact pixel width per column - smaller to ensure fit

  // Handle scroll to update current month index
  const handleScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / availableWidth);
    if (newIndex >= 0 && newIndex < months.length) {
      setCurrentMonthIndex(newIndex);
    }
  };

  // Navigate to previous month
  const goToPreviousMonth = () => {
    if (currentMonthIndex > 0) {
      const newIndex = currentMonthIndex - 1;
      setCurrentMonthIndex(newIndex);
      scrollViewRef.current?.scrollTo({
        x: newIndex * availableWidth,
        animated: true,
      });
    }
  };

  // Navigate to next month
  const goToNextMonth = () => {
    if (currentMonthIndex < months.length - 1) {
      const newIndex = currentMonthIndex + 1;
      setCurrentMonthIndex(newIndex);
      scrollViewRef.current?.scrollTo({
        x: newIndex * availableWidth,
        animated: true,
      });
    }
  };

  const renderCalendar = (month, year) => {
    const daysInMonth = getDaysInMonth(month, year);
    const days = [];

    // Calculate the first day of the month directly to ensure accuracy
    // JavaScript Date months are 0-indexed (0=Jan, 11=Dec)
    // getDay() returns 0=Sunday, 1=Monday, 2=Tuesday, etc.
    const firstDayOfMonth = new Date(Date.UTC(year, month, 1));
    const jsFirstDay = firstDayOfMonth.getUTCDay();
    // Adjust for week start (e.g., if Monday-start, shift Sunday to last column)
    const firstDay = ((jsFirstDay - WEEK_START_INDEX) + 7) % 7;
    
    // Debug log to verify calculation
    if (__DEV__ && month === 11 && year === 2025) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      console.log(`[CalendarDatePicker] December 2025 - JS first day: ${jsFirstDay} (${dayNames[jsFirstDay]}), adjusted first day (week start ${WEEK_START_INDEX === 0 ? 'Sun' : 'Mon'}): ${firstDay} (${WEEKDAYS[firstDay]})`);
    }

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add cells for each day of the month
    // Use UTC dates to avoid timezone issues that could shift the date
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, month, day));
      days.push(date);
    }

    // Debug: Log first 7 days to verify layout
    if (__DEV__ && month === 11 && year === 2025) {
      const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      console.log('[CalendarDatePicker] First 7 cells in days array:');
      days.slice(0, 7).forEach((d, i) => {
        if (d === null) {
          console.log(`  Index ${i} (${WEEKDAYS[i]}): null (empty)`);
        } else {
          const dayNum = d.getDate();
          const actualDay = d.getUTCDay();
          const adjustedDay = ((actualDay - WEEK_START_INDEX) + 7) % 7;
          console.log(`  Index ${i} (${WEEKDAYS[i]}): Day ${dayNum} (actual day: ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][actualDay]}, adjusted column: ${WEEKDAYS[adjustedDay]})`);
        }
      });
    }

    return days;
  };

  return (
    <ScrollView 
      ref={scrollViewRef}
      style={styles.container} 
      contentContainerStyle={styles.scrollContentContainer}
      horizontal={true}
      pagingEnabled={true}
      showsHorizontalScrollIndicator={true}
      decelerationRate="fast"
      snapToInterval={availableWidth}
      snapToAlignment="start"
      onMomentumScrollEnd={handleScroll}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      {months.map(({ month, year }, monthIndex) => {
        const calendarDays = renderCalendar(month, year);
        
        return (
          <View key={`${year}-${month}`} style={[styles.monthContainer, { width: availableWidth, maxWidth: availableWidth }]}>
            {/* Month Header */}
            <View style={styles.monthHeader}>
              {monthIndex === currentMonthIndex && (
                <>
                  <TouchableOpacity
                    onPress={goToPreviousMonth}
                    disabled={currentMonthIndex === 0}
                    style={[
                      styles.monthNavButton,
                      currentMonthIndex === 0 && styles.monthNavButtonDisabled
                    ]}
                  >
                    <Text style={[
                      styles.monthNavButtonText,
                      currentMonthIndex === 0 && styles.monthNavButtonTextDisabled
                    ]}>‹</Text>
                  </TouchableOpacity>
                  <Text style={styles.monthYear}>
                    {MONTHS[month]} {year}
                  </Text>
                  <TouchableOpacity
                    onPress={goToNextMonth}
                    disabled={currentMonthIndex === months.length - 1}
                    style={[
                      styles.monthNavButton,
                      currentMonthIndex === months.length - 1 && styles.monthNavButtonDisabled
                    ]}
                  >
                    <Text style={[
                      styles.monthNavButtonText,
                      currentMonthIndex === months.length - 1 && styles.monthNavButtonTextDisabled
                    ]}>›</Text>
                  </TouchableOpacity>
                </>
              )}
              {monthIndex !== currentMonthIndex && (
                <Text style={styles.monthYear}>
                  {MONTHS[month]} {year}
                </Text>
              )}
            </View>

            {/* Weekday Headers */}
            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((day) => (
                <View key={day} style={[styles.weekdayHeader, { width: columnWidth }]}>
                  <Text style={styles.weekdayText}>{day}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {calendarDays.map((date, index) => {
                if (date === null) {
                  return <View key={`empty-${monthIndex}-${index}`} style={[styles.dayCell, { width: columnWidth }]} />;
                }

                const isSelected = isDateSelected(date);
                const isDisabled = isDateDisabled(date);
                const isToday = dateToKey(date) === todayKey;
                const dateInfo = isSelected ? getDateInfo(date) : null;
                const holiday = getHolidayForDate(date);

                return (
                  <TouchableOpacity
                    key={dateToKey(date)}
                    style={[
                      styles.dayCellWrapper,
                      { width: columnWidth },
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
                        {date.getUTCDate()}
                      </Text>
                      {/* Holiday emoji - positioned below date number */}
                      {holiday && (
                        <View style={styles.holidayIconContainer}>
                          <HolidayIcon 
                            holiday={holiday} 
                            size={16}
                          />
                        </View>
                      )}
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
    paddingHorizontal: 0,
    marginHorizontal: 0,
  },
  scrollContentContainer: {
    paddingHorizontal: 0,
  },
  monthContainer: {
    paddingHorizontal: 0,
    marginHorizontal: 0,
    width: '100%',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    gap: 12,
  },
  monthYear: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2f2f2f',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 0,
    marginHorizontal: 0,
  },
  weekdayHeader: {
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
    paddingHorizontal: 0,
    marginHorizontal: 0,
  },
  dayCellWrapper: {
    minHeight: 60,
    marginBottom: 4,
    paddingHorizontal: 0,
    marginHorizontal: 0,
    maxWidth: '13.7%', // Ensure columns don't exceed this percentage (7 * 13.7% = 95.9%)
  },
  dayCell: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 1,
    borderRadius: 8,
    minHeight: 60,
    position: 'relative',
  },
  holidayIconContainer: {
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
  monthNavButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavButtonDisabled: {
    opacity: 0.3,
  },
  monthNavButtonText: {
    fontSize: 32,
    color: '#4a90e2',
    fontWeight: '300',
    lineHeight: 32,
  },
  monthNavButtonTextDisabled: {
    color: '#999',
  },
});

export default CalendarDatePicker;

