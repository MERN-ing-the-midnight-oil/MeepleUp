/**
 * US Holidays with emoji mappings
 * These are holidays that affect work schedules and celebrations
 */

import React from 'react';
import { Text } from 'react-native';

/**
 * Calculate the nth occurrence of a weekday in a month
 * @param {number} year 
 * @param {number} month (0-11)
 * @param {number} dayOfWeek (0-6, Sunday = 0)
 * @param {number} occurrence (1 = first, 2 = second, etc., -1 = last)
 */
const getNthWeekday = (year, month, dayOfWeek, occurrence) => {
  if (occurrence === -1) {
    // Last occurrence
    const lastDay = new Date(year, month + 1, 0);
    const lastDayOfWeek = lastDay.getDay();
    const diff = (lastDayOfWeek - dayOfWeek + 7) % 7;
    return new Date(year, month, lastDay.getDate() - diff);
  }
  
  // First occurrence
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();
  let daysToAdd = (dayOfWeek - firstDayOfWeek + 7) % 7;
  daysToAdd += (occurrence - 1) * 7;
  return new Date(year, month, 1 + daysToAdd);
};

/**
 * Calculate Easter Sunday using the Computus algorithm
 * @param {number} year 
 * @returns {Date} Easter Sunday date
 */
const calculateEaster = (year) => {
  // Computus algorithm (simplified version)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
};

/**
 * Get all US holidays for a given year
 * Returns a Map where keys are date strings in format "YYYY-MM-DD"
 */
export const getUSHolidays = (year) => {
  const holidays = new Map();

  // New Year's Day (January 1) - 🎉
  holidays.set(`${year}-01-01`, {
    name: "New Year's Day",
    emoji: '🎉',
  });

  // Martin Luther King Jr. Day (3rd Monday in January) - ⚖️
  const mlkDay = getNthWeekday(year, 0, 1, 3);
  const mlkKey = `${year}-${String(mlkDay.getMonth() + 1).padStart(2, '0')}-${String(mlkDay.getDate()).padStart(2, '0')}`;
  holidays.set(mlkKey, {
    name: "Martin Luther King Jr. Day",
    emoji: '⚖️',
  });

  // Valentine's Day (February 14) - 💕
  holidays.set(`${year}-02-14`, {
    name: "Valentine's Day",
    emoji: '💕',
  });

  // Presidents Day (3rd Monday in February) - 🏛️
  const presidentsDay = getNthWeekday(year, 1, 1, 3);
  const presKey = `${year}-${String(presidentsDay.getMonth() + 1).padStart(2, '0')}-${String(presidentsDay.getDate()).padStart(2, '0')}`;
  holidays.set(presKey, {
    name: "Presidents Day",
    emoji: '🏛️',
  });

  // St. Patrick's Day (March 17) - ☘️
  holidays.set(`${year}-03-17`, {
    name: "St. Patrick's Day",
    emoji: '☘️',
  });

  // Easter (varies, March/April) - 🐰
  const easter = calculateEaster(year);
  const easterKey = `${year}-${String(easter.getMonth() + 1).padStart(2, '0')}-${String(easter.getDate()).padStart(2, '0')}`;
  holidays.set(easterKey, {
    name: "Easter",
    emoji: '🐰',
  });

  // Mother's Day (2nd Sunday in May) - 💐
  const mothersDay = getNthWeekday(year, 4, 0, 2);
  const mothersKey = `${year}-${String(mothersDay.getMonth() + 1).padStart(2, '0')}-${String(mothersDay.getDate()).padStart(2, '0')}`;
  holidays.set(mothersKey, {
    name: "Mother's Day",
    emoji: '💐',
  });

  // Memorial Day (last Monday in May) - 🎖️
  const memorialDay = getNthWeekday(year, 4, 1, -1);
  const memKey = `${year}-${String(memorialDay.getMonth() + 1).padStart(2, '0')}-${String(memorialDay.getDate()).padStart(2, '0')}`;
  holidays.set(memKey, {
    name: "Memorial Day",
    emoji: '🎖️',
  });

  // Father's Day (3rd Sunday in June) - 👔
  const fathersDay = getNthWeekday(year, 5, 0, 3);
  const fathersKey = `${year}-${String(fathersDay.getMonth() + 1).padStart(2, '0')}-${String(fathersDay.getDate()).padStart(2, '0')}`;
  holidays.set(fathersKey, {
    name: "Father's Day",
    emoji: '👔',
  });

  // Juneteenth (June 19) - 📜
  holidays.set(`${year}-06-19`, {
    name: "Juneteenth",
    emoji: '📜',
  });

  // Independence Day (July 4) - 🧨
  holidays.set(`${year}-07-04`, {
    name: "Independence Day",
    emoji: '🧨',
  });

  // Labor Day (1st Monday in September) - 🔨
  const laborDay = getNthWeekday(year, 8, 1, 1);
  const laborKey = `${year}-${String(laborDay.getMonth() + 1).padStart(2, '0')}-${String(laborDay.getDate()).padStart(2, '0')}`;
  holidays.set(laborKey, {
    name: "Labor Day",
    emoji: '🔨',
  });

  // Columbus Day (2nd Monday in October) - ⛵
  const columbusDay = getNthWeekday(year, 9, 1, 2);
  const colKey = `${year}-${String(columbusDay.getMonth() + 1).padStart(2, '0')}-${String(columbusDay.getDate()).padStart(2, '0')}`;
  holidays.set(colKey, {
    name: "Columbus Day",
    emoji: '⛵',
  });

  // Halloween (October 31) - 🎃
  holidays.set(`${year}-10-31`, {
    name: "Halloween",
    emoji: '🎃',
  });

  // Veterans Day (November 11) - 🪖
  holidays.set(`${year}-11-11`, {
    name: "Veterans Day",
    emoji: '🪖',
  });

  // Thanksgiving (4th Thursday in November) - 🦃
  const thanksgiving = getNthWeekday(year, 10, 4, 4);
  const thanksKey = `${year}-${String(thanksgiving.getMonth() + 1).padStart(2, '0')}-${String(thanksgiving.getDate()).padStart(2, '0')}`;
  holidays.set(thanksKey, {
    name: "Thanksgiving",
    emoji: '🦃',
  });

  // Black Friday (day after Thanksgiving) - 🛍️
  const blackFriday = new Date(thanksgiving);
  blackFriday.setDate(blackFriday.getDate() + 1);
  const blackFridayKey = `${year}-${String(blackFriday.getMonth() + 1).padStart(2, '0')}-${String(blackFriday.getDate()).padStart(2, '0')}`;
  holidays.set(blackFridayKey, {
    name: "Black Friday",
    emoji: '🛍️',
  });

  // Christmas Eve (December 24) - 🎁
  holidays.set(`${year}-12-24`, {
    name: "Christmas Eve",
    emoji: '🎁',
  });

  // Christmas (December 25) - 🎄
  holidays.set(`${year}-12-25`, {
    name: "Christmas",
    emoji: '🎄',
  });

  // New Year's Eve (December 31) - 🍾
  holidays.set(`${year}-12-31`, {
    name: "New Year's Eve",
    emoji: '🍾',
  });

  return holidays;
};

/**
 * Get holiday info for a specific date
 * @param {Date} date 
 * @returns {Object|null} Holiday info or null
 */
export const getHolidayForDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateKey = `${year}-${month}-${day}`;
  
  const holidays = getUSHolidays(year);
  return holidays.get(dateKey) || null;
};

/**
 * Render a holiday emoji component
 * @param {Object} holiday - Holiday object with emoji
 * @param {number} size - Emoji size
 */
export const HolidayIcon = ({ holiday, size = 16 }) => {
  if (!holiday || !holiday.emoji) return null;

  return <Text style={{ fontSize: size, lineHeight: size }}>{holiday.emoji}</Text>;
};
