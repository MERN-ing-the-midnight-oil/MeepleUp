import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Image, Platform } from 'react-native';
import { formatDate, formatTime } from '../utils/helpers';
import { theme } from '../utils/theme';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import Input from './common/Input';
import Button from './common/Button';
import { createNotification, getUserNotificationPreferences, isNotificationEnabled } from '../utils/notifications';

/**
 * Helper function to safely parse a date string
 */
const safeParseDate = (dateString) => {
  if (!dateString) return null;
  if (dateString instanceof Date) return dateString;
  const parsed = new Date(dateString);
  return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Get date key for a given date (YYYY-MM-DD format)
 */
const getDateKey = (eventDate) => {
  if (!eventDate) return null;
  const date = safeParseDate(eventDate);
  if (!date || isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Upcoming events - Built from scratch with basic React Native components
 * No dependencies on Modal.jsx or Input.jsx
 */
const LogisticsCardV2 = ({ 
  futureEvents, 
  eventId, 
  userId, 
  user, 
  notifyDiscussionActivity,
  isOrganizerOrCoOrganizer = false,
  // RSVP props
  members = [],
  memberNames = {},
  memberAvatars = {},
  memberRSVPs = {},
  rsvpSettings = { enabled: true, allowMaybe: false, attendanceLimit: null },
  isMember = false,
  getRSVPForDate = null,
  handleRSVP = null,
  handleHostUpdateMemberRSVP = null,
  // Location props
  event = null,
  // Navigation props
  navigation = null,
  navigate = null,
  // User profile modal
  setSelectedUserForProfile = null,
  // Edit handlers
  handleUpdateDateCardField = null,
}) => {
  // State for text inputs - one per card
  const [inputs, setInputs] = useState({}); // { [index]: text }
  const [saving, setSaving] = useState({}); // { [index]: boolean } - track saving state per card
  const [announcements, setAnnouncements] = useState([]); // All announcements for this event
  const [openRSVPDropdown, setOpenRSVPDropdown] = useState(null); // null or dateKey
  const [editingMemberRSVP, setEditingMemberRSVP] = useState(null); // { dateKey, memberId } or null
  const [editingDateCardField, setEditingDateCardField] = useState(null); // { dateKey, field: 'date' | 'time' | 'location' | 'address' }
  const [editingDateCardForm, setEditingDateCardForm] = useState({
    date: null,
    startTime: null,
    endTime: null,
    location: '',
    address: '',
  });
  const [editingAnnouncement, setEditingAnnouncement] = useState(null); // { announcementId, content }
  const [editingAnnouncementContent, setEditingAnnouncementContent] = useState(''); // Content being edited

  // Fetch announcements from Firestore
  // Simplified query to avoid composite index requirement
  useEffect(() => {
    if (!eventId || !db) return;

    const postsRef = db.collection('gamingGroups').doc(eventId).collection('posts');
    
    const unsubscribe = postsRef
      .where('isAnnouncement', '==', true)
      .onSnapshot(
        (snapshot) => {
          const fetchedAnnouncements = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            // Filter out deleted announcements in JavaScript
            if (data.deleted === true) return;
            
            fetchedAnnouncements.push({
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt?.seconds * 1000) || new Date(),
            });
          });
          // Sort by createdAt in JavaScript (newest first)
          fetchedAnnouncements.sort((a, b) => {
            const aTime = a.createdAt.getTime();
            const bTime = b.createdAt.getTime();
            return bTime - aTime; // Descending order
          });
          setAnnouncements(fetchedAnnouncements);
        },
        (error) => {
          console.error('Error fetching announcements:', error);
        }
      );

    return () => unsubscribe();
  }, [eventId]);

  if (!futureEvents || futureEvents.length === 0) {
    return null;
  }

  return (
    <View style={{ marginTop: 24, paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: theme.colors.textPrimary }}>
        Upcoming events
      </Text>
      {futureEvents.map((ed, index) => {
        const date = safeParseDate(ed.date);
        const startTime = safeParseDate(ed.startTime);
        const endTime = safeParseDate(ed.endTime);
        
        if (!date || isNaN(date.getTime())) return null;
        
        const dateStr = formatDate(date.toISOString());
        // Format date for Gameplan button (e.g., "Thu Dec 9th")
        const getOrdinalSuffix = (day) => {
          if (day > 3 && day < 21) return 'th';
          switch (day % 10) {
            case 1: return 'st';
            case 2: return 'nd';
            case 3: return 'rd';
            default: return 'th';
          }
        };
        const gameplanDateStr = date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }).replace(/(\d+)/, (match) => match + getOrdinalSuffix(parseInt(match)));
        
        let timeStr = '';
        if (startTime && !isNaN(startTime.getTime()) && endTime && !isNaN(endTime.getTime())) {
          timeStr = `${formatTime(startTime.toISOString())} - ${formatTime(endTime.toISOString())}`;
        } else if (startTime && !isNaN(startTime.getTime())) {
          timeStr = formatTime(startTime.toISOString());
        }
        
        const inputValue = inputs[index] || '';
        const originalIndex = ed.originalIndex !== undefined ? ed.originalIndex : index;
        const dateKey = getDateKey(date);
        
        // Get location and address
        const location = ed.location || ed.generalLocation || event?.location || event?.generalLocation || '';
        const address = ed.address || ed.exactLocation || (isMember ? (event?.address || event?.exactLocation) : '');
        const note = ed.note || '';
        
        // Get RSVP data
        const showRSVPForDate = isMember && rsvpSettings?.enabled;
        const dateRSVP = showRSVPForDate && getRSVPForDate ? getRSVPForDate(userId, date) : null;
        
        // Get all members' RSVP statuses for this date
        const membersWithRSVP = members.map(member => {
          if (!member || !member.userId) return null;
          const memberRsvps = memberRSVPs[member.userId];
          let rsvpStatus = null;
          
          if (!memberRsvps || memberRsvps === null || memberRsvps === undefined) {
            rsvpStatus = null;
          } else if (typeof memberRsvps === 'string') {
            rsvpStatus = date ? null : memberRsvps;
          } else if (typeof memberRsvps === 'object' && memberRsvps.constructor === Object) {
            rsvpStatus = memberRsvps[dateKey] || null;
          } else {
            rsvpStatus = null;
          }
          
          const avatarUrl = memberAvatars[member.userId] || null;
          
          return {
            userId: member.userId,
            userName: memberNames[member.userId] || member.userId,
            avatarUrl: avatarUrl,
            rsvpStatus: rsvpStatus || 'no response',
          };
        }).filter(Boolean);
        
        // Get host/organizer info
        const organizer = members.find(m => m.userId === event?.organizerId) || members.find(m => m.role === 'organizer');
        const organizerName = organizer ? (memberNames[organizer.userId] || organizer.userId) : null;
        const organizerAvatar = organizer ? (memberAvatars[organizer.userId] || null) : null;
        
        // Helper to check if avatar URL is valid
        const isValidAvatarUrl = (url) => {
          return url && typeof url === 'string' && url.trim() !== '';
        };
        
        return (
          <TouchableOpacity
            key={`v2-card-${index}`}
            activeOpacity={0.7}
            onPress={() => {
              // Close dropdown if open
              if (openRSVPDropdown === dateKey) {
                setOpenRSVPDropdown(null);
              }
            }}
            style={{ marginBottom: 24 }}
          >
            <LinearGradient
              colors={['#fff8f0', '#f5e6d3', '#e8d4b8', '#f5e6d3', '#fff8f0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              locations={[0, 0.3, 0.5, 0.7, 1]}
              style={{
                borderRadius: 0,
                padding: 16,
                borderWidth: 4,
                borderColor: theme.colors.woodDark,
              }}
            >
              {/* Date */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                {editingDateCardField?.dateKey === dateKey && editingDateCardField?.field === 'date' ? (
                  <View style={{ flex: 1 }}>
                    {Platform.OS !== 'web' ? (
                      <DateTimePicker
                        value={editingDateCardForm.date || date}
                        mode="date"
                        display="default"
                        minimumDate={new Date()}
                        onChange={(event, selectedDate) => {
                          if (selectedDate) {
                            setEditingDateCardForm(prev => ({ ...prev, date: selectedDate }));
                          }
                          if (Platform.OS === 'android') {
                            setEditingDateCardField(null);
                          }
                        }}
                      />
                    ) : (
                      <View>
                        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 }}>
                          Select date (YYYY-MM-DD):
                        </Text>
                        <Input
                          placeholder="YYYY-MM-DD"
                          value={editingDateCardForm.date ? editingDateCardForm.date.toISOString().split('T')[0] : formatDate(date.toISOString())}
                          onChangeText={(text) => {
                            const parts = text.split('-');
                            if (parts.length === 3) {
                              const parsed = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
                              if (!isNaN(parsed.getTime())) {
                                setEditingDateCardForm(prev => ({ ...prev, date: parsed }));
                              }
                            }
                          }}
                          style={{ marginBottom: 8 }}
                        />
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button
                        label="💾"
                        onPress={() => {
                          if (handleUpdateDateCardField) {
                            handleUpdateDateCardField(dateKey, originalIndex, 'date', editingDateCardForm.date);
                          }
                          setEditingDateCardField(null);
                          setEditingDateCardForm({ date: null, startTime: null, endTime: null, location: '', address: '' });
                        }}
                        style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                      />
                      <Button
                        label="❌"
                        onPress={() => {
                          setEditingDateCardField(null);
                          setEditingDateCardForm({ date: null, startTime: null, endTime: null, location: '', address: '' });
                        }}
                        variant="outline"
                        style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                      />
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.colors.textPrimary }}>
                      {dateStr}
                    </Text>
                    {isOrganizerOrCoOrganizer && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setEditingDateCardField({ dateKey, field: 'date' });
                          setEditingDateCardForm(prev => ({ ...prev, date: date }));
                        }}
                        style={{ padding: 4, marginLeft: 8 }}
                      >
                        <Text style={{ fontSize: 16 }}>✏️</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
              
              {/* Time */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                {editingDateCardField?.dateKey === dateKey && editingDateCardField?.field === 'time' ? (
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 }}>Start:</Text>
                        {Platform.OS !== 'web' ? (
                          <DateTimePicker
                            value={editingDateCardForm.startTime || startTime || new Date()}
                            mode="time"
                            display="default"
                            onChange={(event, selectedTime) => {
                              if (selectedTime) {
                                setEditingDateCardForm(prev => ({ ...prev, startTime: selectedTime }));
                              }
                            }}
                          />
                        ) : (
                          <Input
                            placeholder="HH:MM (24-hour)"
                            value={editingDateCardForm.startTime ? formatTime(editingDateCardForm.startTime.toISOString()) : (startTime ? formatTime(startTime.toISOString()) : '')}
                            onChangeText={(text) => {
                              const [hours, minutes] = text.split(':');
                              if (hours && minutes) {
                                const newTime = new Date(date);
                                newTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                                setEditingDateCardForm(prev => ({ ...prev, startTime: newTime }));
                              }
                            }}
                            style={{ marginBottom: 8 }}
                          />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 }}>End:</Text>
                        {Platform.OS !== 'web' ? (
                          <DateTimePicker
                            value={editingDateCardForm.endTime || endTime || new Date()}
                            mode="time"
                            display="default"
                            onChange={(event, selectedTime) => {
                              if (selectedTime) {
                                setEditingDateCardForm(prev => ({ ...prev, endTime: selectedTime }));
                              }
                            }}
                          />
                        ) : (
                          <Input
                            placeholder="HH:MM (24-hour)"
                            value={editingDateCardForm.endTime ? formatTime(editingDateCardForm.endTime.toISOString()) : (endTime ? formatTime(endTime.toISOString()) : '')}
                            onChangeText={(text) => {
                              const [hours, minutes] = text.split(':');
                              if (hours && minutes) {
                                const newTime = new Date(date);
                                newTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                                setEditingDateCardForm(prev => ({ ...prev, endTime: newTime }));
                              }
                            }}
                            style={{ marginBottom: 8 }}
                          />
                        )}
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button
                        label="💾 Save"
                        onPress={async () => {
                          if (handleUpdateDateCardField) {
                            await handleUpdateDateCardField(dateKey, originalIndex, 'startTime', editingDateCardForm.startTime || startTime);
                            await handleUpdateDateCardField(dateKey, originalIndex, 'endTime', editingDateCardForm.endTime || endTime || startTime);
                          }
                          setEditingDateCardField(null);
                          setEditingDateCardForm({ date: null, startTime: null, endTime: null, location: '', address: '' });
                        }}
                        style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                      />
                      <Button
                        label="❌ Cancel"
                        onPress={() => {
                          setEditingDateCardField(null);
                          setEditingDateCardForm({ date: null, startTime: null, endTime: null, location: '', address: '' });
                        }}
                        variant="outline"
                        style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                      />
                    </View>
                  </View>
                ) : (
                  <>
                    {timeStr ? (
                      <Text style={{ fontSize: 16, color: theme.colors.textSecondary }}>
                        {timeStr}
                      </Text>
                    ) : null}
                    {isOrganizerOrCoOrganizer && timeStr && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setEditingDateCardField({ dateKey, field: 'time' });
                          setEditingDateCardForm(prev => ({
                            ...prev,
                            startTime: startTime || new Date(),
                            endTime: endTime || new Date(),
                          }));
                        }}
                        style={{ padding: 4, marginLeft: 8 }}
                      >
                        <Text style={{ fontSize: 16 }}>✏️</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
              
              {/* Location Info */}
              {(location || isOrganizerOrCoOrganizer) && (
                <View style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary, marginRight: 8 }}>
                      📍 Location:
                    </Text>
                  </View>
                  {editingDateCardField?.dateKey === dateKey && editingDateCardField?.field === 'location' ? (
                    <View>
                      <Input
                        value={editingDateCardForm.location !== undefined ? editingDateCardForm.location : location}
                        onChangeText={(text) => setEditingDateCardForm(prev => ({ ...prev, location: text }))}
                        placeholder="Location name"
                        style={{ marginBottom: 8 }}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Button
                          label="💾"
                          onPress={() => {
                            if (handleUpdateDateCardField) {
                              handleUpdateDateCardField(dateKey, originalIndex, 'location', editingDateCardForm.location);
                            }
                            setEditingDateCardField(null);
                            setEditingDateCardForm({ date: null, startTime: null, endTime: null, location: '', address: '' });
                          }}
                          style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                        />
                        <Button
                          label="❌"
                          onPress={() => {
                            setEditingDateCardField(null);
                            setEditingDateCardForm({ date: null, startTime: null, endTime: null, location: '', address: '' });
                          }}
                          variant="outline"
                          style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>
                        {location || 'Not set'}
                      </Text>
                      {isOrganizerOrCoOrganizer && (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            setEditingDateCardField({ dateKey, field: 'location' });
                            setEditingDateCardForm(prev => ({ ...prev, location: location || '' }));
                          }}
                          style={{ padding: 4, marginLeft: 8 }}
                        >
                          <Text style={{ fontSize: 16 }}>✏️</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              )}
              
              {/* Address */}
              {(address || (isOrganizerOrCoOrganizer && location)) && (
                <View style={{ marginBottom: 8 }}>
                  {editingDateCardField?.dateKey === dateKey && editingDateCardField?.field === 'address' ? (
                    <View>
                      <Input
                        value={editingDateCardForm.address !== undefined ? editingDateCardForm.address : address}
                        onChangeText={(text) => setEditingDateCardForm(prev => ({ ...prev, address: text }))}
                        placeholder="Address"
                        style={{ marginBottom: 8 }}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Button
                          label="💾"
                          onPress={() => {
                            if (handleUpdateDateCardField) {
                              handleUpdateDateCardField(dateKey, originalIndex, 'address', editingDateCardForm.address);
                            }
                            setEditingDateCardField(null);
                            setEditingDateCardForm({ date: null, startTime: null, endTime: null, location: '', address: '' });
                          }}
                          style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                        />
                        <Button
                          label="❌"
                          onPress={() => {
                            setEditingDateCardField(null);
                            setEditingDateCardForm({ date: null, startTime: null, endTime: null, location: '', address: '' });
                          }}
                          variant="outline"
                          style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>
                        {address || (isOrganizerOrCoOrganizer ? 'Not set' : '')}
                      </Text>
                      {isOrganizerOrCoOrganizer && (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            setEditingDateCardField({ dateKey, field: 'address' });
                            setEditingDateCardForm(prev => ({ ...prev, address: address || '' }));
                          }}
                          style={{ padding: 4, marginLeft: 8 }}
                        >
                          <Text style={{ fontSize: 16 }}>✏️</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              )}
              
              {/* Host Contact Info */}
              {organizerName && (
                <View style={{ flexDirection: 'row', marginBottom: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary, marginRight: 8 }}>
                    👤 Host:
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    {organizerAvatar && isValidAvatarUrl(organizerAvatar) ? (
                      <Image
                        source={{ uri: organizerAvatar }}
                        style={{ width: 24, height: 24, borderRadius: 12, marginRight: 8 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.woodMedium, marginRight: 8, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#ffffff', fontWeight: 'bold' }}>
                          {organizerName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>
                      {organizerName}
                    </Text>
                  </View>
                </View>
              )}
              
              {/* RSVP Info */}
              {showRSVPForDate && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: 8 }}>
                    📋 RSVP:
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
                    {membersWithRSVP.map((member) => {
                      const hasValidAvatar = isValidAvatarUrl(member.avatarUrl);
                      const rsvpStatus = member.rsvpStatus;
                      const rsvpColor =
                        rsvpStatus === 'going' ? '#2e9b5e' :
                        rsvpStatus === 'maybe' ? '#a06c00' :
                        rsvpStatus === 'not going' ? '#b33936' :
                        '#555';
                      
                      const isEditingThisMember = editingMemberRSVP?.dateKey === dateKey && editingMemberRSVP?.memberId === member.userId;
                      
                      return (
                        <View key={member.userId} style={{ marginRight: 8, marginBottom: 8 }}>
                          {isEditingThisMember ? (
                            <View style={{
                              backgroundColor: '#ffffff',
                              borderRadius: 8,
                              padding: 12,
                              borderWidth: 1,
                              borderColor: '#d4c5b0',
                              minWidth: 150,
                            }}>
                              <TouchableOpacity
                                style={{
                                  padding: 8,
                                  borderRadius: 4,
                                  backgroundColor: rsvpStatus === 'going' ? '#f0f9f4' : 'transparent',
                                  marginBottom: 4,
                                }}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  if (handleHostUpdateMemberRSVP) {
                                    handleHostUpdateMemberRSVP(member.userId, dateKey, 'going');
                                  }
                                  setEditingMemberRSVP(null);
                                }}
                              >
                                <Text style={{ fontSize: 14, color: theme.colors.textPrimary, textAlign: 'center' }}>
                                  ✓ Going
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{
                                  padding: 8,
                                  borderRadius: 4,
                                  backgroundColor: rsvpStatus === 'not going' ? '#fef0f0' : 'transparent',
                                  marginBottom: 4,
                                }}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  if (handleHostUpdateMemberRSVP) {
                                    handleHostUpdateMemberRSVP(member.userId, dateKey, 'not-going');
                                  }
                                  setEditingMemberRSVP(null);
                                }}
                              >
                                <Text style={{ fontSize: 14, color: theme.colors.textPrimary, textAlign: 'center' }}>
                                  ✗ Can't Make It
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{
                                  padding: 8,
                                  borderRadius: 4,
                                  alignItems: 'center',
                                }}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  setEditingMemberRSVP(null);
                                }}
                              >
                                <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>
                                  ❌ Cancel
                                </Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={{ alignItems: 'center' }}
                              onPress={(e) => {
                                e.stopPropagation();
                                if (isOrganizerOrCoOrganizer && member.userId !== userId) {
                                  setEditingMemberRSVP({ dateKey, memberId: member.userId });
                                } else if (setSelectedUserForProfile) {
                                  setSelectedUserForProfile({
                                    userId: member.userId,
                                    userName: member.userName,
                                    avatarUrl: member.avatarUrl
                                  });
                                }
                              }}
                              onLongPress={(e) => {
                                e.stopPropagation();
                                if (isOrganizerOrCoOrganizer && member.userId !== userId) {
                                  setEditingMemberRSVP({ dateKey, memberId: member.userId });
                                }
                              }}
                            >
                              <View style={{ position: 'relative' }}>
                                {hasValidAvatar ? (
                                  <Image
                                    source={{ uri: member.avatarUrl }}
                                    style={{ 
                                      width: 40, 
                                      height: 40, 
                                      borderRadius: 20,
                                      borderWidth: 2,
                                      borderColor: '#ffffff',
                                    }}
                                    resizeMode="cover"
                                    onError={(error) => {
                                      // Reduced logging - only log in dev mode and suppress repeated errors
                                      if (__DEV__) {
                                        // Silently handle avatar load errors - they're expected for missing avatars
                                      }
                                    }}
                                  />
                                ) : (
                                  <View style={{ 
                                    width: 40, 
                                    height: 40, 
                                    borderRadius: 20, 
                                    backgroundColor: theme.colors.woodMedium, 
                                    justifyContent: 'center', 
                                    alignItems: 'center',
                                    borderWidth: 2,
                                    borderColor: '#ffffff',
                                  }}>
                                    <Text style={{ fontSize: 16, color: '#ffffff', fontWeight: 'bold' }}>
                                      {member.userName.charAt(0).toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                                {isOrganizerOrCoOrganizer && member.userId !== userId && (
                                  <View style={{
                                    position: 'absolute',
                                    top: -4,
                                    right: -4,
                                    width: 24,
                                    height: 24,
                                    borderRadius: 12,
                                    backgroundColor: theme.colors.woodMedium,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    borderWidth: 2,
                                    borderColor: '#ffffff',
                                  }}>
                                    <Text style={{ fontSize: 14, color: '#ffffff' }}>
                                      ✏️
                                    </Text>
                                  </View>
                                )}
                                <View style={{
                                  position: 'absolute',
                                  bottom: -2,
                                  right: -2,
                                  width: 16,
                                  height: 16,
                                  borderRadius: 8,
                                  backgroundColor: rsvpColor,
                                  borderWidth: 2,
                                  borderColor: '#ffffff',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                }}>
                                  <Text style={{ fontSize: 10, color: '#ffffff', fontWeight: 'bold' }}>
                                    {rsvpStatus === 'no response' ? '?' : rsvpStatus === 'going' ? '✓' : rsvpStatus === 'maybe' ? '?' : '✗'}
                                  </Text>
                                </View>
                              </View>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                  
                  {/* Your RSVP Dropdown */}
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: 8 }}>
                      Your RSVP:
                    </Text>
                    <View>
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: 12,
                          backgroundColor: '#ffffff',
                          borderRadius: 4,
                          borderWidth: 1,
                          borderColor: '#d4c5b0',
                        }}
                        onPress={(e) => {
                          e.stopPropagation();
                          setOpenRSVPDropdown(openRSVPDropdown === dateKey ? null : dateKey);
                        }}
                      >
                        <Text style={{ fontSize: 14, color: theme.colors.textPrimary }}>
                          {dateRSVP === 'going' ? '✅ Going' : dateRSVP === 'not-going' ? '❌ Can\'t Make It' : 'No response'}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                          {openRSVPDropdown === dateKey ? '▲' : '▼'}
                        </Text>
                      </TouchableOpacity>
                      {openRSVPDropdown === dateKey && handleRSVP && (
                        <View style={{
                          backgroundColor: '#ffffff',
                          borderRadius: 4,
                          borderWidth: 1,
                          borderColor: '#d4c5b0',
                          marginTop: 4,
                          overflow: 'hidden',
                        }}>
                          <TouchableOpacity
                            style={{
                              padding: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: '#d4c5b0',
                              backgroundColor: dateRSVP === 'going' ? '#f0f9f4' : 'transparent',
                            }}
                            onPress={(e) => {
                              e.stopPropagation();
                              if (e && e.preventDefault) {
                                e.preventDefault();
                              }
                              handleRSVP('going', date, e);
                              setOpenRSVPDropdown(null);
                            }}
                          >
                            <Text style={{ fontSize: 14, color: theme.colors.textPrimary }}>
                              ✅ Going
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{
                              padding: 12,
                              backgroundColor: dateRSVP === 'not-going' ? '#fef0f0' : 'transparent',
                            }}
                            onPress={(e) => {
                              e.stopPropagation();
                              if (e && e.preventDefault) {
                                e.preventDefault();
                              }
                              handleRSVP('not-going', date, e);
                              setOpenRSVPDropdown(null);
                            }}
                          >
                            <Text style={{ fontSize: 14, color: theme.colors.textPrimary }}>
                              ❌ Can't Make It
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              )}
              
              {/* Notes */}
              {note && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: 4 }}>
                    📝 Notes:
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>
                    {note}
                  </Text>
                </View>
              )}
              
              {/* Announcements Section */}
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary }}>
                    📢 Announcements
                  </Text>
                </View>
                
                {/* Display existing announcements for this date */}
                {(() => {
                  const dateAnnouncements = announcements.filter(ann => 
                    ann.associatedDateKey === dateKey
                  );
                  
                  if (dateAnnouncements.length > 0) {
                    return (
                      <View style={{ marginBottom: 12 }}>
                        {dateAnnouncements.map((announcement) => {
                          const isEditingThis = editingAnnouncement === announcement.id;
                          const canEdit = isOrganizerOrCoOrganizer && announcement.userId === userId;
                          
                          return (
                            <View
                              key={announcement.id}
                              style={{
                                backgroundColor: '#ffffff',
                                padding: 12,
                                borderRadius: 4,
                                marginBottom: 8,
                                borderLeftWidth: 3,
                                borderLeftColor: theme.colors.meepleRed,
                              }}
                            >
                              {isEditingThis ? (
                                <View>
                                  <TextInput
                                    value={editingAnnouncementContent}
                                    onChangeText={setEditingAnnouncementContent}
                                    placeholder="Enter announcement text..."
                                    multiline
                                    numberOfLines={4}
                                    maxLength={3000}
                                    style={{
                                      borderWidth: 1,
                                      borderColor: '#d4c5b0',
                                      borderRadius: 4,
                                      padding: 12,
                                      fontSize: 14,
                                      minHeight: 100,
                                      textAlignVertical: 'top',
                                      backgroundColor: '#ffffff',
                                      marginBottom: 8,
                                      color: theme.colors.textPrimary,
                                    }}
                                    placeholderTextColor={theme.colors.textSecondary}
                                  />
                                  <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <Button
                                      label="💾 Save"
                                      onPress={async () => {
                                        if (!editingAnnouncementContent.trim()) {
                                          Alert.alert('Error', 'Please enter some text.');
                                          return;
                                        }

                                        if (!eventId || !userId) {
                                          Alert.alert('Error', 'Missing event or user information.');
                                          return;
                                        }

                                        try {
                                          const postsRef = db.collection('gamingGroups').doc(eventId).collection('posts');
                                          const announcementRef = postsRef.doc(announcement.id);
                                          
                                          // Check if 30 minutes have passed since creation
                                          const announcementDoc = await announcementRef.get();
                                          const announcementData = announcementDoc.data();
                                          const createdAt = announcementData.createdAt?.toDate?.() || new Date(announcementData.createdAt?.seconds * 1000);
                                          const now = new Date();
                                          const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60);
                                          
                                          await announcementRef.update({
                                            content: editingAnnouncementContent.trim(),
                                            edited: true,
                                            updatedAt: firebase.firestore.Timestamp.now(),
                                          });

                                          // If 30+ minutes have passed, notify users who have seen the announcement
                                          if (minutesSinceCreation >= 30 && db && eventId) {
                                            try {
                                              const membersRef = db.collection('gamingGroups').doc(eventId).collection('members');
                                              const membersSnapshot = await membersRef.get();
                                              
                                              const userName = user?.name || user?.email || 'The host';
                                              const dateStr = formatDate(date.toISOString());
                                              
                                              for (const memberDoc of membersSnapshot.docs) {
                                                const memberData = memberDoc.data();
                                                const memberId = memberData.userId;
                                                
                                                if (memberId && memberId !== userId) {
                                                  const preferences = await getUserNotificationPreferences(memberId);
                                                  
                                                  if (isNotificationEnabled(preferences, 'discussion')) {
                                                    await createNotification(memberId, {
                                                      type: 'new_post',
                                                      groupId: eventId,
                                                      postId: announcement.id,
                                                      fromUserId: userId,
                                                      fromUserName: userName,
                                                      message: `${userName} updated an announcement for ${dateStr}.`,
                                                    });
                                                  }
                                                }
                                              }
                                            } catch (notifError) {
                                              console.error('Error notifying members about announcement edit:', notifError);
                                            }
                                          }

                                          setEditingAnnouncement(null);
                                          setEditingAnnouncementContent('');
                                          Alert.alert('Success', 'Announcement updated successfully!');
                                        } catch (error) {
                                          console.error('Error updating announcement:', error);
                                          Alert.alert('Error', error.message || 'Failed to update announcement. Please try again.');
                                        }
                                      }}
                                      style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                                    />
                                    <Button
                                      label="❌ Cancel"
                                      onPress={() => {
                                        setEditingAnnouncement(null);
                                        setEditingAnnouncementContent('');
                                      }}
                                      variant="outline"
                                      style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                                    />
                                  </View>
                                </View>
                              ) : (
                                <>
                                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                    <View style={{ flex: 1 }}>
                                      {announcement.content ? (
                                        <Text style={{ fontSize: 14, color: theme.colors.textPrimary, marginBottom: 4 }}>
                                          {announcement.content}
                                        </Text>
                                      ) : null}
                                      {announcement.photoUrl ? (
                                        <Text style={{ fontSize: 14, color: theme.colors.textSecondary, fontStyle: 'italic', marginBottom: 4 }}>
                                          📷 Photo announcement
                                        </Text>
                                      ) : null}
                                      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 }}>
                                        {announcement.userName || 'Unknown'} • {formatDate(announcement.createdAt.toISOString())}
                                        {announcement.edited ? ' (edited)' : ''}
                                      </Text>
                                    </View>
                                    {canEdit && (
                                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <TouchableOpacity
                                          onPress={(e) => {
                                            e.stopPropagation();
                                            setEditingAnnouncement(announcement.id);
                                            setEditingAnnouncementContent(announcement.content || '');
                                          }}
                                          style={{ padding: 4, marginLeft: 8 }}
                                        >
                                          <Text style={{ fontSize: 14 }}>✏️</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          onPress={(e) => {
                                            e.stopPropagation();
                                            Alert.alert(
                                              'Delete Announcement',
                                              'Are you sure you want to delete this announcement? This action cannot be undone.',
                                              [
                                                {
                                                  text: 'Cancel',
                                                  style: 'cancel',
                                                },
                                                {
                                                  text: 'Delete',
                                                  style: 'destructive',
                                                  onPress: async () => {
                                                    if (!eventId || !userId) {
                                                      Alert.alert('Error', 'Missing event or user information.');
                                                      return;
                                                    }

                                                    try {
                                                      const postsRef = db.collection('gamingGroups').doc(eventId).collection('posts');
                                                      const announcementRef = postsRef.doc(announcement.id);
                                                      
                                                      await announcementRef.update({
                                                        deleted: true,
                                                        updatedAt: firebase.firestore.Timestamp.now(),
                                                      });

                                                      Alert.alert('Success', 'Announcement deleted successfully!');
                                                    } catch (error) {
                                                      console.error('Error deleting announcement:', error);
                                                      Alert.alert('Error', error.message || 'Failed to delete announcement. Please try again.');
                                                    }
                                                  },
                                                },
                                              ]
                                            );
                                          }}
                                          style={{ padding: 4, marginLeft: 4 }}
                                        >
                                          <Text style={{ fontSize: 14 }}>🗑️</Text>
                                        </TouchableOpacity>
                                      </View>
                                    )}
                                  </View>
                                </>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    );
                  }
                  return null;
                })()}
                
                {/* Text Input and Add Button - Only show for organizers */}
                {isOrganizerOrCoOrganizer ? (
              <>
                <TextInput
                  value={inputValue}
                  onChangeText={(text) => {
                    setInputs(prev => ({
                      ...prev,
                      [index]: text
                    }));
                  }}
                  placeholder="Enter text (up to 500 words)..."
                  multiline
                  numberOfLines={4}
                  maxLength={3000}
                  style={{
                    borderWidth: 1,
                    borderColor: '#d4c5b0',
                    borderRadius: 4,
                    padding: 12,
                    fontSize: 16,
                    minHeight: 100,
                    textAlignVertical: 'top',
                    backgroundColor: '#ffffff',
                    marginBottom: 12,
                    color: theme.colors.textPrimary,
                  }}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                
                {/* Add Button - plain TouchableOpacity */}
                <TouchableOpacity
                  onPress={async () => {
                    if (!inputValue.trim()) {
                      Alert.alert('Error', 'Please enter some text before posting.');
                      return;
                    }

                    if (!eventId || !userId) {
                      Alert.alert('Error', 'Missing event or user information.');
                      return;
                    }

                    // Get the original index from the event date object
                    const originalIndex = ed.originalIndex !== undefined ? ed.originalIndex : index;
                    
                    // Get date key
                    const dateKey = getDateKey(date);
                    if (!dateKey) {
                      Alert.alert('Error', 'Invalid date.');
                      return;
                    }

                    setSaving(prev => ({ ...prev, [index]: true }));

                    try {
                      // Save announcement to Firestore
                      const postsRef = db.collection('gamingGroups').doc(eventId).collection('posts');
                      
                      const postData = {
                        userId,
                        userName: user?.name || user?.email || 'Unknown',
                        userAvatarUrl: user?.photoURL || user?.avatarUrl || null,
                        content: inputValue.trim(),
                        photoUrl: null, // No photo support in V2 for now
                        likeCount: 0,
                        commentCount: 0,
                        createdAt: firebase.firestore.Timestamp.now(),
                        updatedAt: firebase.firestore.Timestamp.now(),
                        edited: false,
                        deleted: false,
                        pinned: false,
                        isAnnouncement: true,
                        associatedDateKey: dateKey,
                        associatedDateIndex: originalIndex,
                        associatedDate: date.toISOString(),
                      };

                      const docRef = await postsRef.add(postData);

                      // Notify members about new announcement
                      try {
                        await notifyDiscussionActivity(eventId, userId, {
                          type: 'new_post',
                          postId: docRef.id,
                          fromUserName: user?.name || user?.email || 'Unknown',
                          message: `${user?.name || 'The host'} posted an announcement`,
                        });
                      } catch (notifError) {
                        console.error('Error sending announcement notification:', notifError);
                      }

                      // Clear input and show success
                      setInputs(prev => {
                        const updated = { ...prev };
                        delete updated[index];
                        return updated;
                      });

                      Alert.alert('Success', 'Announcement posted successfully!');
                    } catch (error) {
                      console.error('Error saving announcement:', error);
                      Alert.alert('Error', error.message || 'Failed to save announcement. Please try again.');
                    } finally {
                      setSaving(prev => {
                        const updated = { ...prev };
                        delete updated[index];
                        return updated;
                      });
                    }
                  }}
                  disabled={saving[index] || !inputValue.trim()}
                  style={{
                    backgroundColor: saving[index] || !inputValue.trim() 
                      ? theme.colors.textSecondary 
                      : theme.colors.meepleRed,
                    paddingVertical: 12,
                    paddingHorizontal: 24,
                    borderRadius: 4,
                    alignItems: 'center',
                    opacity: saving[index] || !inputValue.trim() ? 0.6 : 1,
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>
                    {saving[index] ? 'Posting...' : 'Make announcement'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
              </View>
              
              {/* Gameplan Button */}
              <View style={{ marginTop: 12 }}>
                {dateRSVP === 'going' ? (
                  <TouchableOpacity
                    onPress={(e) => {
                      if (e && e.stopPropagation) {
                        e.stopPropagation();
                      }
                      const currentEventId = eventId;
                      const dateIndex = originalIndex;
                      if (Platform.OS === 'web' && navigate && currentEventId) {
                        navigate(`/event/${currentEventId}/browse/${dateIndex}`);
                      } else if (navigation?.navigate && currentEventId) {
                        navigation.navigate('BrowseAndPropose', { 
                          eventId: currentEventId, 
                          dateIndex: dateIndex 
                        });
                      }
                    }}
                    style={{
                      backgroundColor: theme.colors.meepleRed,
                      paddingVertical: 12,
                      paddingHorizontal: 24,
                      borderRadius: 4,
                      alignItems: 'center',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>
                      🎲 Gameplan for {gameplanDateStr}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View
                    style={{
                      backgroundColor: '#f5f5f5',
                      paddingVertical: 12,
                      paddingHorizontal: 24,
                      borderRadius: 4,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#d4c5b0',
                    }}
                  >
                    <Text style={{ color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center' }}>
                      RSVP "going" to participate in the gameplan
                    </Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default LogisticsCardV2;

