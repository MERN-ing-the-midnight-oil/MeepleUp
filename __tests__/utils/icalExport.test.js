/**
 * @jest-environment node
 */
import {
  generateIcalEvent,
  generateIcalCalendar,
  generateGoogleCalendarUrl,
} from '../../src/utils/icalExport';

describe('icalExport', () => {
  describe('generateIcalEvent', () => {
    it('throws when event is null/undefined', () => {
      expect(() => generateIcalEvent(null)).toThrow('Event is required');
      expect(() => generateIcalEvent(undefined)).toThrow('Event is required');
    });

    it('returns string containing VCALENDAR and VEVENT for minimal event', () => {
      const event = { id: 'evt-1', name: 'Game Night' };
      const ical = generateIcalEvent(event);
      expect(typeof ical).toBe('string');
      expect(ical).toContain('BEGIN:VCALENDAR');
      expect(ical).toContain('BEGIN:VEVENT');
      expect(ical).toContain('Game Night');
      expect(ical).toContain('evt-1@meepleup.app');
    });

    it('includes DTSTART/DTEND when scheduledFor provided', () => {
      const event = {
        id: 'evt-2',
        name: 'Test',
        scheduledFor: '2025-06-15T18:00:00Z',
      };
      const ical = generateIcalEvent(event);
      expect(ical).toContain('DTSTART:');
      expect(ical).toContain('DTEND:');
    });
  });

  describe('generateIcalCalendar', () => {
    it('returns string for events array', () => {
      const events = [{ id: 'e1', name: 'One' }, { id: 'e2', name: 'Two' }];
      const ical = generateIcalCalendar(events);
      expect(typeof ical).toBe('string');
      expect(ical).toContain('BEGIN:VCALENDAR');
      expect(ical).toContain('One');
      expect(ical).toContain('Two');
    });
  });

  describe('generateGoogleCalendarUrl', () => {
    it('returns a URL for minimal event', () => {
      const event = { name: 'Game Night', scheduledFor: '2025-06-15T18:00:00Z' };
      const url = generateGoogleCalendarUrl(event);
      expect(url).toMatch(/^https:\/\//);
      expect(url).toContain('calendar.google.com');
    });
  });
});
