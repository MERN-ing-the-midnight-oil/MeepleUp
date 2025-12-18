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
  onDateTimeEdit,
  onDateLongPress,
  onDatePress,
  readOnly = false,
  showEditIcon = false,
  onEditIconPress,
}) => {
  // Use local dates consistently - no UTC
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Midnight local time
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const startMonth = today.getMonth();
  const startYear = today.getFullYear();
  
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0);
  const scrollViewRef = useRef(null);

  // Helper function to convert date to key - use LOCAL time components
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
      // Add date with default times - use LOCAL time to prevent timezone shifts
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();
      
      // Create date at midnight local time
      const dateObj = new Date(year, month, day, 0, 0, 0, 0);
      
      // Create start time: same day at the specified hour
      let startTime;
      if (usualStartTime) {
        startTime = new Date(year, month, day, usualStartTime.getHours(), usualStartTime.getMinutes(), 0, 0);
      } else {
        startTime = new Date(year, month, day, 18, 0, 0, 0); // 6 PM default
      }
      
      // Create end time: same day at the specified hour
      let endTime;
      if (usualEndTime) {
        endTime = new Date(year, month, day, usualEndTime.getHours(), usualEndTime.getMinutes(), 0, 0);
      } else {
        endTime = new Date(year, month, day, 22, 0, 0, 0); // 10 PM default
      }
      
      const newDateObj = {
        date: dateObj,
        startTime,
        endTime,
      };
      
      newSelectedDates.push(newDateObj);
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
    // Use local time
    const date = new Date(year, month, 1);
    const dayOfWeek = date.getDay();
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
  
  // Use full screen width - no padding/margin reduction needed
  // Parent container should handle any necessary padding
  const availableWidth = screenWidth;
  const dayWidth = Math.floor(availableWidth / 7); // Each day gets exactly 1/7 of width

  const handleScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / screenWidth);
    if (newIndex >= 0 && newIndex < months.length) {
      setCurrentMonthIndex(newIndex);
    }
  };

  const goToPreviousMonth = () => {
    if (currentMonthIndex > 0) {
      const newIndex = currentMonthIndex - 1;
      setCurrentMonthIndex(newIndex);
      scrollViewRef.current?.scrollTo({
        x: newIndex * screenWidth,
        animated: true,
      });
    }
  };

  const goToNextMonth = () => {
    if (currentMonthIndex < months.length - 1) {
      const newIndex = currentMonthIndex + 1;
      setCurrentMonthIndex(newIndex);
      scrollViewRef.current?.scrollTo({
        x: newIndex * screenWidth,
        animated: true,
      });
    }
  };

  const renderCalendar = (month, year) => {
    const daysInMonth = getDaysInMonth(month, year);
    const days = [];

    const firstDayOfMonth = new Date(year, month, 1);
    const jsFirstDay = firstDayOfMonth.getDay();
    const firstDay = ((jsFirstDay - WEEK_START_INDEX) + 7) % 7;

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add cells for each day of the month - use LOCAL time
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day, 0, 0, 0, 0); // Local time at midnight
      days.push(date);
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
      snapToInterval={screenWidth}
      snapToAlignment="start"
      onMomentumScrollEnd={handleScroll}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      {months.map(({ month, year }, monthIndex) => {
        const calendarDays = renderCalendar(month, year);
        
        return (
          <View key={`${year}-${month}`} style={[styles.monthContainer, { width: screenWidth, marginHorizontal: 0, paddingHorizontal: 0 }]}>
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
                <View key={day} style={[styles.weekdayHeader, { width: dayWidth }]}>
                  <Text style={styles.weekdayText}>{day}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {calendarDays.map((date, index) => {
                if (date === null) {
                  return <View key={`empty-${monthIndex}-${index}`} style={[styles.dayCellWrapper, { width: dayWidth }]} />;
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
                      { width: dayWidth },
                      isToday && styles.todayCellWrapper,
                      isSelected && styles.selectedCellWrapper,
                      isDisabled && styles.disabledCellWrapper,
                    ]}
                    onPress={() => {
                      if (!isDisabled && readOnly && isSelected && dateInfo && onDatePress) {
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
                      } else if (!isDisabled && !readOnly && isSelected && dateInfo && onDatePress) {
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
                    }}
                    onLongPress={() => {
                      if (!isDisabled && !readOnly) {
                        toggleDate(date);
                      }
                    }}
                    delayLongPress={300}
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
                      {holiday && (
                        <View style={styles.holidayIconContainer}>
                          <HolidayIcon 
                            holiday={holiday} 
                            size={16}
                          />
                        </View>
                      )}
                      {isSelected && showEditIcon && onEditIconPress && (
                        <TouchableOpacity
                          style={styles.editIconContainer}
                          onPress={(e) => {
                            e.stopPropagation();
                            const dateKey = dateToKey(date);
                            const index = selectedDates.findIndex(d => {
                              const dKey = dateToKey(d.date instanceof Date ? d.date : new Date(d.date));
                              return dKey === dateKey;
                            });
                            if (index !== -1 && dateInfo) {
                              onEditIconPress(index, {
                                date: dateInfo.date,
                                startTime: dateInfo.startTime,
                                endTime: dateInfo.endTime,
                              });
                            }
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={styles.editIconText}>✏️</Text>
                        </TouchableOpacity>
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
    overflow: 'hidden',
  },
  scrollContentContainer: {
    paddingHorizontal: 0,
  },
  monthContainer: {
    paddingHorizontal: 0,
    flexShrink: 0,
    overflow: 'hidden',
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
    width: '100%',
  },
  weekdayHeader: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 0,
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
    width: '100%',
  },
  dayCellWrapper: {
    minHeight: 60,
    marginBottom: 4,
    paddingHorizontal: 0,
    marginHorizontal: 0,
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
  todayCellWrapper: {},
  selectedCellWrapper: {},
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
  disabledCell: {},
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
  editIconContainer: {
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  editIconText: {
    fontSize: 12,
  },
});

export default CalendarDatePicker;
