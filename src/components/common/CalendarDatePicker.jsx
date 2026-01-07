import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { getHolidayForDate, HolidayIcon } from '../../utils/holidays';
import storage from '../../utils/storage';

// Module-level storage for restore position - persists across component instances
// This ensures the position survives even if the component remounts
let globalRestorePosition = null;

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
  memberRSVPs = {}, // { [userId]: { [dateKey]: status } }
  currentUserId = null, // Current user's ID to show their RSVP status
}) => {
  // Use local dates consistently - no UTC
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Midnight local time
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const startMonth = today.getMonth();
  const startYear = today.getFullYear();
  
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0);
  const scrollViewRef = useRef(null);
  const savedScrollPositionRef = useRef(0); // Track scroll position to preserve it
  const monthIndexRef = useRef(0); // Track month index in a ref to preserve across re-renders
  const pendingRestoreRef = useRef(null); // Store position to restore after selectedDates changes
  const isRestoringRef = useRef(false); // Flag to prevent scroll handlers from interfering during restore
  
  // Storage keys for persisting the last viewed month (only used during active use)
  const STORAGE_KEY = 'calendar_last_month_index';
  const STORAGE_TIMESTAMP_KEY = 'calendar_last_month_timestamp';
  const userInteractedRef = useRef(false);
  const isInitialMountRef = useRef(true);

  // Helper function to convert date to key - use LOCAL time components
  const dateToKey = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  // Helper function to format date as YYYY-MM-DD matching EventHub's getDateKey format
  // This uses UTC to match how dates are stored in memberRSVPs
  const formatDateKey = (date) => {
    const d = new Date(date);
    // Convert to UTC to match EventHub's getDateKey which uses toISOString()
    // This ensures we match the date keys stored in memberRSVPs
    return d.toISOString().split('T')[0];
  };

  // Helper function to get RSVP status for a date (for current user)
  const getRSVPStatusForDate = (date) => {
    if (!currentUserId || !memberRSVPs[currentUserId]) return null;
    const userRSVPs = memberRSVPs[currentUserId];
    // Handle both old string format and new object format
    if (typeof userRSVPs === 'string') {
      // Old format: single status - this is not date-specific, so don't show on calendar
      // Only show date-specific RSVPs on the calendar
      return null;
    }
    // New format: object with date keys (YYYY-MM-DD format)
    // The calendar date is in local time. We need to match how EventHub's getDateKey works.
    // EventHub's getDateKey uses: date.toISOString().split('T')[0]
    // However, this can cause timezone issues. To fix this, we format using local date components
    // which matches what the calendar displays. We also check the UTC format for backward compatibility.
    const localDate = new Date(date);
    localDate.setHours(0, 0, 0, 0);
    
    // Format using local date components (YYYY-MM-DD) - this is what the calendar shows
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const localDateKey = `${year}-${month}-${day}`;
    
    // Also try UTC format for backward compatibility with existing data
    const utcDateKey = localDate.toISOString().split('T')[0];
    
    // Check both formats - prefer local format first, then UTC format
    return userRSVPs[localDateKey] || userRSVPs[utcDateKey] || null;
  };

  // Helper function to get RSVP icon
  const getRSVPIcon = (status) => {
    switch (status) {
      case 'going':
        return '✅';
      case 'maybe':
        return '🤔';
      case 'not-going':
        return '❌';
      default:
        return null;
    }
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
    console.log('[CalendarDatePicker] ========== LONG-PRESS DETECTED ==========');
    console.log('[CalendarDatePicker] toggleDate START - date being toggled:', {
      date: date instanceof Date ? date.toISOString() : date,
      dateKey: dateToKey(date),
      dateString: date.toString(),
    });
    
    const dateKey = dateToKey(date);
    const newSelectedDates = [...selectedDates];
    
    console.log('[CalendarDatePicker] Current selectedDates state:', {
      count: selectedDates.length,
      dates: selectedDates.map(d => ({
        date: d.date instanceof Date ? d.date.toISOString() : d.date,
        dateKey: dateToKey(d.date instanceof Date ? d.date : new Date(d.date)),
      })),
    });
    
    // CRITICAL: Capture position BEFORE calling onDatesChange
    // Try multiple sources to get the most accurate position
    let monthToPreserve = currentMonthIndex;
    let scrollXToPreserve = savedScrollPositionRef.current;
    
    console.log('[CalendarDatePicker] toggleDate - scroll position state:', {
      currentMonthIndex,
      monthIndexRef: monthIndexRef.current,
      savedScrollX: savedScrollPositionRef.current,
      dateKey,
    });
    
    // Priority: refs > state (refs are updated immediately on scroll)
    if (monthIndexRef.current > 0) {
      monthToPreserve = monthIndexRef.current;
      scrollXToPreserve = savedScrollPositionRef.current > 0 
        ? savedScrollPositionRef.current 
        : monthToPreserve * screenWidth;
      console.log('[CalendarDatePicker] toggleDate - using ref values:', { monthToPreserve, scrollXToPreserve });
    } else if (currentMonthIndex > 0) {
      monthToPreserve = currentMonthIndex;
      scrollXToPreserve = monthToPreserve * screenWidth;
      console.log('[CalendarDatePicker] toggleDate - using state value:', { monthToPreserve, scrollXToPreserve });
    } else {
      // Both are 0, user is on current month
      monthToPreserve = 0;
      scrollXToPreserve = 0;
      console.log('[CalendarDatePicker] toggleDate - user is on current month (0)');
    }
    
    // Store in BOTH ref AND module-level variable for maximum persistence
    // Module-level variable survives even component remounts
    const restoreData = {
      monthIndex: monthToPreserve,
      scrollX: scrollXToPreserve,
      timestamp: Date.now(), // Add timestamp for debugging
    };
    pendingRestoreRef.current = restoreData;
    globalRestorePosition = restoreData; // Also store globally
    
    // Also update refs immediately to ensure they're in sync
    monthIndexRef.current = monthToPreserve;
    savedScrollPositionRef.current = scrollXToPreserve;
    
    console.log('[CalendarDatePicker] toggleDate END - saved restore data:', {
      monthToPreserve,
      scrollXToPreserve,
      restoreData: pendingRestoreRef.current,
      dateKey,
    });
    
    if (selectedDatesMap.has(dateKey)) {
      // Remove date
      console.log('[CalendarDatePicker] Date already selected - REMOVING date');
      const index = newSelectedDates.findIndex(d => {
        const dKey = dateToKey(d.date instanceof Date ? d.date : new Date(d.date));
        return dKey === dateKey;
      });
      if (index !== -1) {
        console.log('[CalendarDatePicker] Removing date at index:', index);
        newSelectedDates.splice(index, 1);
      }
    } else {
      // Add date with default times - use LOCAL time to prevent timezone shifts
      console.log('[CalendarDatePicker] Date not selected - ADDING new date');
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();
      
      console.log('[CalendarDatePicker] Creating date object with:', {
        year,
        month,
        day,
        usualStartTime: usualStartTime ? usualStartTime.toISOString() : 'null (using default 18:00)',
        usualEndTime: usualEndTime ? usualEndTime.toISOString() : 'null (using default 22:00)',
      });
      
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
      
      console.log('[CalendarDatePicker] New date object created:', {
        date: newDateObj.date.toISOString(),
        startTime: newDateObj.startTime.toISOString(),
        endTime: newDateObj.endTime.toISOString(),
      });
      
      newSelectedDates.push(newDateObj);
      console.log('[CalendarDatePicker] Added to newSelectedDates array, new count:', newSelectedDates.length);
    }
    
    // Sort dates
    console.log('[CalendarDatePicker] Sorting dates before calling onDatesChange');
    newSelectedDates.sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });
    
    console.log('[CalendarDatePicker] Final newSelectedDates before onDatesChange:', {
      count: newSelectedDates.length,
      dates: newSelectedDates.map(d => ({
        date: d.date instanceof Date ? d.date.toISOString() : d.date,
        startTime: d.startTime instanceof Date ? d.startTime.toISOString() : d.startTime,
        endTime: d.endTime instanceof Date ? d.endTime.toISOString() : d.endTime,
      })),
    });
    
    console.log('[CalendarDatePicker] Calling onDatesChange callback...');
    onDatesChange(newSelectedDates);
    console.log('[CalendarDatePicker] onDatesChange callback completed');
    console.log('[CalendarDatePicker] ========== LONG-PRESS HANDLING COMPLETE ==========');
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

  // Always start at current month (index 0) on initial load - don't restore from storage
  // This prevents flickering when users log in fresh
  useEffect(() => {
    console.log('[CalendarDatePicker] Initial mount effect running, isInitialMount:', isInitialMountRef.current);
    if (isInitialMountRef.current) {
      // Mark initial mount as complete immediately - we always start at current month
      isInitialMountRef.current = false;
      console.log('[CalendarDatePicker] Marked initial mount as complete');
    }
  }, []); // Only run on mount

  // Keep ref in sync with state
  useEffect(() => {
    monthIndexRef.current = currentMonthIndex;
  }, [currentMonthIndex]);

  // Preserve calendar scroll position when selectedDates changes (e.g., when user adds a date)
  // Use useLayoutEffect to capture ref values synchronously before React commits
  useLayoutEffect(() => {
    const hasGlobalRestore = globalRestorePosition !== null;
    
    console.log('[CalendarDatePicker] useLayoutEffect triggered for selectedDates:', {
      selectedDatesCount: selectedDates.length,
      isInitialMount: isInitialMountRef.current,
      hasGlobalRestore,
      globalRestore: globalRestorePosition,
      pendingRestore: pendingRestoreRef.current,
    });
    
    // If globalRestorePosition is null but we have a pendingRestore, use that
    if (!hasGlobalRestore && pendingRestoreRef.current) {
      console.log('[CalendarDatePicker] globalRestorePosition is null, but pendingRestore exists - using it');
      globalRestorePosition = pendingRestoreRef.current;
    }
    
    // If we have a global restore position, restore even on initial mount
    // This handles the case where the component remounts after toggleDate
    // Also restore if we have pendingRestoreRef (even if globalRestorePosition was cleared)
    const hasPendingRestore = pendingRestoreRef.current !== null;
    if (!isInitialMountRef.current || hasGlobalRestore || hasPendingRestore) {
      // PRIORITY 1: Use pendingRestoreRef if available (set in toggleDate)
      // This is the most reliable since it's set right before onDatesChange
      const restoreData = pendingRestoreRef.current;
      
      // If globalRestorePosition was cleared but we have pendingRestoreRef, restore it
      if (!hasGlobalRestore && restoreData) {
        console.log('[CalendarDatePicker] Restoring globalRestorePosition from pendingRestoreRef');
        globalRestorePosition = restoreData;
      }
      
      // PRIORITY 2: Try to read current scroll position directly from ScrollView
      let currentScrollX = 0;
      if (scrollViewRef.current) {
        // Try to get current scroll position - this is a workaround since
        // ScrollView doesn't expose a direct way to read contentOffset
        // We'll use the refs as fallback
        currentScrollX = savedScrollPositionRef.current;
      }
      
      const refMonth = monthIndexRef.current;
      const refScrollX = savedScrollPositionRef.current;
      const stateMonth = currentMonthIndex;
      
      // PRIORITY 1: Use globalRestorePosition (module-level, survives remounts)
      // PRIORITY 2: Use pendingRestoreRef (component-level ref)
      // PRIORITY 3: Use ref values (updated immediately on scroll)
      // PRIORITY 4: Fall back to state if refs are 0
      const globalRestore = globalRestorePosition;
      
      console.log('[CalendarDatePicker] selectedDates changed (layout) - checking restore position:', {
        globalRestore,
        restoreData,
        refMonth,
        refScrollX,
        currentScrollX,
        stateMonth,
        hasScrollView: !!scrollViewRef.current,
      });
      
      let monthToRestore = 0;
      let scrollXToRestore = 0;
      
      if (globalRestore && globalRestore.monthIndex >= 0) {
        // PRIORITY 1: globalRestorePosition (survives remounts)
        monthToRestore = globalRestore.monthIndex;
        scrollXToRestore = globalRestore.scrollX;
        console.log('[CalendarDatePicker] Using globalRestorePosition:', globalRestore);
        // If we're restoring from global on initial mount, mark mount as complete
        if (isInitialMountRef.current) {
          isInitialMountRef.current = false;
          console.log('[CalendarDatePicker] Restoring on initial mount, marking mount as complete');
        }
      } else if (restoreData && restoreData.monthIndex >= 0) {
        monthToRestore = restoreData.monthIndex;
        scrollXToRestore = restoreData.scrollX;
        console.log('[CalendarDatePicker] Using pendingRestoreRef:', restoreData);
      } else if (refMonth > 0 || refScrollX > 0) {
        monthToRestore = refMonth;
        scrollXToRestore = refScrollX > 0 ? refScrollX : refMonth * screenWidth;
        console.log('[CalendarDatePicker] Using ref values:', { refMonth, refScrollX });
      } else if (stateMonth > 0) {
        monthToRestore = stateMonth;
        scrollXToRestore = stateMonth * screenWidth;
        console.log('[CalendarDatePicker] Using state value:', stateMonth);
      } else {
        console.log('[CalendarDatePicker] All values are 0, skipping restore');
        return;
      }
      
      // Calculate target scroll position
      const targetX = scrollXToRestore > 0 ? scrollXToRestore : monthToRestore * screenWidth;
      
      console.log('[CalendarDatePicker] Final restore decision (layout):', {
        monthToRestore,
        scrollXToRestore,
        targetX,
      });
      
      if (scrollViewRef.current && monthToRestore >= 0 && targetX > 0) {
        // Set restore flag to prevent scroll handlers from interfering
        isRestoringRef.current = true;
        
        // Update state to match the restored position
        if (monthToRestore !== currentMonthIndex) {
          setCurrentMonthIndex(monthToRestore);
        }
        
        // Update refs to match
        monthIndexRef.current = monthToRestore;
        savedScrollPositionRef.current = targetX;
        
        // Restore synchronously in layout effect
        console.log('[CalendarDatePicker] Restoring scroll in layout effect to:', targetX);
        scrollViewRef.current.scrollTo({
          x: targetX,
          animated: false,
        });
        
        // Clear restore flag after a short delay, but keep globalRestorePosition longer
        // to survive re-renders that happen after Firestore saves
        setTimeout(() => {
          isRestoringRef.current = false;
          // Clear pendingRestoreRef but keep globalRestorePosition for much longer
          // to survive re-renders/remounts that happen after async Firestore saves
          pendingRestoreRef.current = null;
          console.log('[CalendarDatePicker] Restore complete, re-enabling scroll handlers (keeping globalRestorePosition)');
          
          // Don't clear globalRestorePosition here - let it persist until user manually scrolls
          // This ensures it survives re-renders/remounts that happen after async Firestore saves
          // It will be cleared in handleScroll when user takes control
        }, 100);
      } else {
        // If we couldn't restore, keep the data for the backup effect
        console.log('[CalendarDatePicker] Could not restore in layout effect, keeping restore data for backup');
      }
    }
  }, [selectedDates, screenWidth]); // Removed currentMonthIndex from deps to prevent loops
  
  // Also use regular useEffect as backup for async restore
  useEffect(() => {
    if (!isInitialMountRef.current && pendingRestoreRef.current) {
      const restoreData = pendingRestoreRef.current;
      const targetX = restoreData.scrollX > 0 ? restoreData.scrollX : restoreData.monthIndex * screenWidth;
      
      // Double-check restore after paint
      requestAnimationFrame(() => {
        if (scrollViewRef.current && targetX >= 0) {
          isRestoringRef.current = true;
          console.log('[CalendarDatePicker] Backup restore after paint to:', targetX);
          
          // Update state and refs
          if (restoreData.monthIndex !== currentMonthIndex) {
            setCurrentMonthIndex(restoreData.monthIndex);
          }
          monthIndexRef.current = restoreData.monthIndex;
          savedScrollPositionRef.current = targetX;
          
          scrollViewRef.current.scrollTo({
            x: targetX,
            animated: false,
          });
          
          // Clear restore flag and pending restore
          setTimeout(() => {
            isRestoringRef.current = false;
            pendingRestoreRef.current = null;
          }, 100);
        }
      });
    }
  }, [selectedDates, screenWidth, currentMonthIndex]);

  // Save month index when user actively navigates (not on initial load)
  // This allows the month to persist while viewing calendar day details modals
  useEffect(() => {
    if (userInteractedRef.current && !isInitialMountRef.current) {
      const saveMonthIndex = async () => {
        try {
          await storage.setItem(STORAGE_KEY, currentMonthIndex.toString());
          await storage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
        } catch (error) {
          console.error('Error saving month index:', error);
        }
      };
      
      saveMonthIndex();
    }
  }, [currentMonthIndex]);

  const handleScroll = (event) => {
    // Ignore scroll events during restore to prevent interference
    if (isRestoringRef.current) {
      return;
    }
    
    // Clear globalRestorePosition when user manually scrolls
    // This means the restore is complete and user has taken control
    if (globalRestorePosition !== null) {
      console.log('[CalendarDatePicker] User scrolled manually - clearing globalRestorePosition');
      globalRestorePosition = null;
    }
    
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / screenWidth);
    
    // Always update refs to track current position (even if state hasn't updated yet)
    savedScrollPositionRef.current = offsetX;
    monthIndexRef.current = newIndex;
    
    // Update state if index changed - this ensures state reflects actual scroll position
    if (newIndex >= 0 && newIndex < months.length && newIndex !== currentMonthIndex) {
      console.log('[CalendarDatePicker] Scroll detected, updating month index:', { 
        oldIndex: currentMonthIndex, 
        newIndex, 
        offsetX,
        monthIndexRef: monthIndexRef.current,
      });
      userInteractedRef.current = true;
      setCurrentMonthIndex(newIndex);
    }
  };
  
  // Separate handler for momentum scroll end to ensure state is updated
  const handleMomentumScrollEnd = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / screenWidth);
    
    // Update refs regardless of restore flag
    savedScrollPositionRef.current = offsetX;
    monthIndexRef.current = newIndex;
    
    // Ignore state updates during restore
    if (isRestoringRef.current) {
      return;
    }
    
    if (newIndex >= 0 && newIndex < months.length) {
      console.log('[CalendarDatePicker] Momentum scroll ended, final position:', {
        newIndex,
        offsetX,
        currentMonthIndex,
      });
      userInteractedRef.current = true;
      // Always update state to match final scroll position
      if (newIndex !== currentMonthIndex) {
        setCurrentMonthIndex(newIndex);
      }
    }
  };

  const goToPreviousMonth = () => {
    if (currentMonthIndex > 0) {
      const newIndex = currentMonthIndex - 1;
      userInteractedRef.current = true;
      monthIndexRef.current = newIndex; // Update ref immediately
      savedScrollPositionRef.current = newIndex * screenWidth; // Update saved position
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
      userInteractedRef.current = true;
      monthIndexRef.current = newIndex; // Update ref immediately
      savedScrollPositionRef.current = newIndex * screenWidth; // Update saved position
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
      onMomentumScrollEnd={handleMomentumScrollEnd}
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
                const rsvpStatus = getRSVPStatusForDate(date);
                const rsvpIcon = getRSVPIcon(rsvpStatus);

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
                      // If date is selected and onDatePress callback exists, call it
                      // This allows editing the date's time, location, and note
                      console.log('[CalendarDatePicker] Date pressed:', {
                        isDisabled,
                        isSelected,
                        hasDateInfo: !!dateInfo,
                        hasOnDatePress: !!onDatePress,
                        dateKey: dateToKey(date)
                      });
                      
                      if (!isDisabled && isSelected && dateInfo && onDatePress) {
                        const dateKey = dateToKey(date);
                        const index = selectedDates.findIndex(d => {
                          const dKey = dateToKey(d.date instanceof Date ? d.date : new Date(d.date));
                          return dKey === dateKey;
                        });
                        console.log('[CalendarDatePicker] Found index:', index, 'for dateKey:', dateKey);
                        if (index !== -1) {
                          console.log('[CalendarDatePicker] Calling onDatePress with index:', index);
                          onDatePress(index, {
                            date: dateInfo.date,
                            startTime: dateInfo.startTime,
                            endTime: dateInfo.endTime,
                          });
                        } else {
                          console.warn('[CalendarDatePicker] Could not find index for dateKey:', dateKey);
                        }
                      } else {
                        console.log('[CalendarDatePicker] Conditions not met:', {
                          isDisabled,
                          isSelected,
                          hasDateInfo: !!dateInfo,
                          hasOnDatePress: !!onDatePress
                        });
                      }
                      // If date is not selected and not readOnly, toggle it (for long press)
                      // Regular tap on unselected date does nothing - use long press to select
                    }}
                    onLongPress={() => {
                      if (!isDisabled && !readOnly) {
                        // If onDateLongPress callback is provided, use it instead of toggleDate
                        if (onDateLongPress) {
                          const isSelected = isDateSelected(date);
                          const dateInfo = isSelected ? getDateInfo(date) : null;
                          onDateLongPress(date, isSelected, dateInfo);
                        } else {
                          toggleDate(date);
                        }
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
                      {rsvpIcon && (
                        <Text style={styles.rsvpIcon}>
                          {rsvpIcon}
                        </Text>
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
  rsvpIcon: {
    fontSize: 14,
    marginTop: 2,
    textAlign: 'center',
  },
});

export default CalendarDatePicker;
