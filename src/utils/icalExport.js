/**
 * iCal export utility functions for MeepleUp events
 * Generates .ics files compatible with iCal, Google Calendar, and other calendar applications
 */

/**
 * Escape text for iCal format
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
const escapeIcalText = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')  // Escape backslashes
    .replace(/;/g, '\\;')    // Escape semicolons
    .replace(/,/g, '\\,')    // Escape commas
    .replace(/\n/g, '\\n')   // Escape newlines
    .replace(/\r/g, '');     // Remove carriage returns
};

/**
 * Format date to iCal format (YYYYMMDDTHHmmssZ)
 * @param {string|Date} dateString - Date string or Date object
 * @returns {string} - Formatted iCal date string
 */
const formatIcalDate = (dateString) => {
  if (!dateString) return '';
  
  const date = dateString instanceof Date ? dateString : new Date(dateString);
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return '';
  }
  
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};

/**
 * Generate a unique ID for the event
 * @param {string} eventId - Event ID
 * @returns {string} - Unique ID for iCal
 */
const generateIcalUid = (eventId) => {
  const domain = 'meepleup.app';
  return `${eventId}@${domain}`;
};

/**
 * Generate iCal content for a single event
 * @param {Object} event - Event object
 * @param {Object} options - Options for export
 * @returns {string} - iCal formatted string
 */
export const generateIcalEvent = (event, options = {}) => {
  const {
    includeDescription = true,
    includeLocation = true,
    durationHours = 3, // Default 3 hours for game night
  } = options;

  if (!event) {
    throw new Error('Event is required');
  }

  const lines = [];
  
  // Start calendar component
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//MeepleUp//MeepleUp Calendar//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  
  // Start event
  lines.push('BEGIN:VEVENT');
  
  // Unique identifier
  const uid = generateIcalUid(event.id);
  lines.push(`UID:${uid}`);
  
  // Summary (event name)
  const summary = event.name || 'MeepleUp Game Night';
  lines.push(`SUMMARY:${escapeIcalText(summary)}`);
  
  // Description
  if (includeDescription) {
    let description = event.description || '';
    
    // Add location info to description if available
    if (event.generalLocation || event.exactLocation) {
      if (description) description += '\\n\\n';
      description += 'Location: ';
      if (event.exactLocation) {
        description += event.exactLocation;
        if (event.generalLocation) {
          description += ` (${event.generalLocation})`;
        }
      } else {
        description += event.generalLocation || 'TBD';
      }
    }
    
    // Add join code if available
    if (event.joinCode) {
      if (description) description += '\\n\\n';
      description += `Join Code: ${event.joinCode}`;
    }
    
    if (description) {
      lines.push(`DESCRIPTION:${escapeIcalText(description)}`);
    }
  }
  
  // Location
  if (includeLocation) {
    const location = event.exactLocation || event.generalLocation || '';
    if (location) {
      lines.push(`LOCATION:${escapeIcalText(location)}`);
    }
  }
  
  // Date/time
  if (event.scheduledFor) {
    const startDate = new Date(event.scheduledFor);
    
    if (!isNaN(startDate.getTime())) {
      const startDateTime = formatIcalDate(startDate);
      lines.push(`DTSTART:${startDateTime}`);
      
      // Calculate end time (default to 3 hours later if no end time specified)
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + durationHours);
      const endDateTime = formatIcalDate(endDate);
      lines.push(`DTEND:${endDateTime}`);
    }
  }
  
  // Created timestamp
  if (event.createdAt) {
    const createdDate = new Date(event.createdAt);
    if (!isNaN(createdDate.getTime())) {
      lines.push(`DTSTAMP:${formatIcalDate(createdDate)}`);
    }
  } else {
    lines.push(`DTSTAMP:${formatIcalDate(new Date())}`);
  }
  
  // Last modified
  if (event.lastUpdatedAt) {
    const updatedDate = new Date(event.lastUpdatedAt);
    if (!isNaN(updatedDate.getTime())) {
      lines.push(`LAST-MODIFIED:${formatIcalDate(updatedDate)}`);
    }
  }
  
  // Status
  if (event.isActive === false || event.deletedAt) {
    lines.push('STATUS:CANCELLED');
  } else {
    lines.push('STATUS:CONFIRMED');
  }
  
  // Organizer (if available)
  if (event.organizerId) {
    // Note: In a full implementation, you might want to fetch organizer email
    // For now, we'll use a placeholder
    lines.push(`ORGANIZER:mailto:organizer@meepleup.app`);
  }
  
  // End event
  lines.push('END:VEVENT');
  
  // End calendar component
  lines.push('END:VCALENDAR');
  
  return lines.join('\r\n');
};

/**
 * Generate iCal content for multiple events
 * @param {Array} events - Array of event objects
 * @param {Object} options - Options for export
 * @returns {string} - iCal formatted string with multiple events
 */
export const generateIcalCalendar = (events, options = {}) => {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('Events array is required and must not be empty');
  }

  const lines = [];
  
  // Start calendar component
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//MeepleUp//MeepleUp Calendar//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  
  // Add each event
  events.forEach(event => {
    if (!event) return;
    
    const eventLines = generateIcalEvent(event, options).split('\r\n');
    
    // Extract just the event portion (between BEGIN:VEVENT and END:VEVENT)
    const startIdx = eventLines.indexOf('BEGIN:VEVENT');
    const endIdx = eventLines.indexOf('END:VEVENT');
    
    if (startIdx !== -1 && endIdx !== -1) {
      const eventContent = eventLines.slice(startIdx, endIdx + 1);
      lines.push(...eventContent);
    }
  });
  
  // End calendar component
  lines.push('END:VCALENDAR');
  
  return lines.join('\r\n');
};

/**
 * Download iCal file (web only)
 * @param {string} icalContent - iCal formatted string
 * @param {string} filename - Filename for the download (default: 'meepleup-events.ics')
 */
export const downloadIcalFile = (icalContent, filename = 'meepleup-events.ics') => {
  if (typeof window === 'undefined') {
    console.error('downloadIcalFile is only available in browser environment');
    return;
  }

  const blob = new Blob([icalContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Share iCal file (for React Native or web share API)
 * @param {string} icalContent - iCal formatted string
 * @param {string} filename - Filename for sharing
 * @returns {Promise<void>}
 */
export const shareIcalFile = async (icalContent, filename = 'meepleup-events.ics') => {
  // For web, use Web Share API if available, otherwise download
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      const blob = new Blob([icalContent], { type: 'text/calendar;charset=utf-8' });
      const file = new File([blob], filename, { type: 'text/calendar' });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'MeepleUp Events',
          text: 'My MeepleUp game night events',
        });
        return;
      }
    } catch (error) {
      // Web Share API not available or user cancelled, fall back to download
      console.log('Web Share API not available, falling back to download');
    }
  }
  
  // Fallback to download
  if (typeof window !== 'undefined') {
    downloadIcalFile(icalContent, filename);
  }
};

/**
 * Generate a Google Calendar URL for adding an event
 * @param {Object} event - Event object
 * @returns {string} - Google Calendar URL
 */
export const generateGoogleCalendarUrl = (event) => {
  if (!event) {
    return '';
  }

  const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  
  // Format dates for Google Calendar (YYYYMMDDTHHmmss format - local time, no Z)
  // Google Calendar interprets this as local time unless Z is specified
  let dates = '';
  if (event.scheduledFor) {
    // Parse the date - handle both ISO strings and formatted strings
    let startDate;
    const scheduledForValue = event.scheduledFor;
    
    // Try parsing as-is first (works for ISO strings)
    startDate = new Date(scheduledForValue);
    
    // If that doesn't work, try to parse formatted strings like "Sunday, December 21, 2025 at 5:16 PM"
    if (isNaN(startDate.getTime())) {
      const dateStr = String(scheduledForValue).trim();
      
      // Try to parse formats like "Sunday, December 21, 2025 at 5:16 PM"
      // Remove day of week if present (e.g., "Sunday, ")
      let cleaned = dateStr.replace(/^[A-Za-z]+,\s*/i, '');
      
      // Replace "at" with a space for better parsing
      cleaned = cleaned.replace(/\s+at\s+/i, ' ');
      
      // Try parsing the cleaned string
      startDate = new Date(cleaned);
      
      // If still invalid, try a more manual approach
      if (isNaN(startDate.getTime())) {
        // Try to extract date components manually
        // Format: "December 21, 2025 5:16 PM"
        const dateMatch = cleaned.match(/(\w+)\s+(\d+),\s+(\d+)\s+(\d+):(\d+)\s+(AM|PM)/i);
        if (dateMatch) {
          const [, monthName, day, year, hour, minute, ampm] = dateMatch;
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                             'july', 'august', 'september', 'october', 'november', 'december'];
          const monthIndex = monthNames.findIndex(m => m.startsWith(monthName.toLowerCase()));
          
          if (monthIndex !== -1) {
            let hour24 = parseInt(hour, 10);
            if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
              hour24 += 12;
            } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
              hour24 = 0;
            }
            
            startDate = new Date(parseInt(year, 10), monthIndex, parseInt(day, 10), hour24, parseInt(minute, 10));
          }
        }
      }
    }
    
    // If still invalid, return URL without dates
    if (isNaN(startDate.getTime())) {
      console.warn('Invalid date format for scheduledFor:', scheduledForValue);
      // Return URL without dates - user can manually set the date in Google Calendar
    } else {
      // Format date for Google Calendar (local time, not UTC)
      const formatDate = (date) => {
        // Use local time methods, not UTC
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}T${hours}${minutes}${seconds}`;
      };
      
      const startStr = formatDate(startDate);
      // Default to 3 hours duration
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 3);
      const endStr = formatDate(endDate);
      dates = `${startStr}/${endStr}`;
    }
  }

  // Build the URL with parameters
  const params = new URLSearchParams();
  
  // Text parameter (event name)
  if (event.name) {
    params.append('text', event.name);
  }
  
  // Dates (only add if we successfully parsed a date)
  if (dates) {
    params.append('dates', dates);
  }
  
  // Location
  const location = event.exactLocation || event.generalLocation || '';
  if (location) {
    params.append('location', location);
  }
  
  // Description
  let description = event.description || '';
  if (event.joinCode) {
    if (description) description += '\\n\\n';
    description += `Join Code: ${event.joinCode}`;
  }
  if (description) {
    params.append('details', description);
  }

  return `${baseUrl}&${params.toString()}`;
};

