import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  Switch,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { db } from '../config/firebase';
import Button from './common/Button';
import Input from './common/Input';
import Modal from './common/Modal';

const RSVPManagementScreen = ({ eventId, onClose }) => {
  const { user } = useAuth();
  const {
    getEventById,
    updateRSVPSettings,
    overrideMemberRSVP,
    updateMemberRSVP,
  } = useEvents();

  const event = getEventById(eventId);
  const userId = user?.uid || user?.id || null;
  const isOrganizer = event?.organizerId === userId;

  const [memberNames, setMemberNames] = useState({});
  const [memberRSVPs, setMemberRSVPs] = useState({});
  const [memberAvatars, setMemberAvatars] = useState({});
  const [rsvpSettings, setRsvpSettings] = useState({
    enabled: true,
    allowMaybe: true,
    attendanceLimit: null,
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [attendanceLimitInput, setAttendanceLimitInput] = useState('');
  const [editingMember, setEditingMember] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (event) {
      setRsvpSettings(event.rsvpSettings || {
        enabled: true,
        allowMaybe: true,
        attendanceLimit: null,
      });
      setAttendanceLimitInput(
        event.rsvpSettings?.attendanceLimit?.toString() || ''
      );
    }
  }, [event]);

  // Fetch member data
  useEffect(() => {
    if (!event?.id || !db) return;

    const fetchMemberData = async () => {
      try {
        const membersSnapshot = await db
          .collection('gamingGroups')
          .doc(event.id)
          .collection('members')
          .get();

        const names = {};
        const rsvps = {};
        const avatars = {};

        for (const memberDoc of membersSnapshot.docs) {
          const memberData = memberDoc.data();
          const memberId = memberDoc.id;
          names[memberId] = memberData.userName || memberId;
          if (memberData.rsvpStatus) {
            rsvps[memberId] = memberData.rsvpStatus;
          }
          if (memberData.userAvatarUrl) {
            avatars[memberId] = memberData.userAvatarUrl;
          }
        }

        setMemberNames(names);
        setMemberRSVPs(rsvps);
        setMemberAvatars(avatars);
      } catch (error) {
        console.error('Error fetching member data:', error);
      }
    };

    fetchMemberData();
  }, [event?.id]);

  const members = useMemo(() => {
    return (event?.members || []).filter((m) => m.status === 'member');
  }, [event]);

  const getRSVPStatusLabel = (status) => {
    if (!status) return 'Not RSVP\'d';
    switch (status) {
      case 'going': return 'Going';
      case 'maybe': return 'Maybe';
      case 'not-going': return 'Can\'t Make It';
      default: return 'Not RSVP\'d';
    }
  };

  const getRSVPCounts = () => {
    const counts = { going: 0, maybe: 0, notGoing: 0, none: 0 };
    members.forEach((member) => {
      const status = memberRSVPs[member.userId] || null;
      if (status === 'going') counts.going += 1;
      else if (status === 'maybe') counts.maybe += 1;
      else if (status === 'not-going') counts.notGoing += 1;
      else counts.none += 1;
    });
    return counts;
  };

  const getMembersByRSVPStatus = (status) => {
    return members.filter((member) => {
      const memberStatus = memberRSVPs[member.userId] || null;
      return memberStatus === status;
    });
  };

  const handleOverrideRSVP = async (memberId, newStatus) => {
    if (!isOrganizer) {
      Alert.alert('Error', 'Only the organizer can override RSVP status.');
      return;
    }

    setLoading(true);
    try {
      await overrideMemberRSVP(eventId, userId, memberId, newStatus);
      setMemberRSVPs((prev) => ({
        ...prev,
        [memberId]: newStatus,
      }));
      Alert.alert('Success', 'RSVP status updated.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update RSVP status.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!isOrganizer) {
      Alert.alert('Error', 'Only the organizer can update RSVP settings.');
      return;
    }

    setLoading(true);
    try {
      const attendanceLimit = attendanceLimitInput.trim()
        ? parseInt(attendanceLimitInput.trim(), 10)
        : null;

      if (attendanceLimit !== null && (isNaN(attendanceLimit) || attendanceLimit < 1)) {
        Alert.alert('Error', 'Attendance limit must be a positive number.');
        setLoading(false);
        return;
      }

      await updateRSVPSettings(eventId, userId, {
        enabled: rsvpSettings.enabled,
        allowMaybe: rsvpSettings.allowMaybe,
        attendanceLimit,
      });

      setRsvpSettings((prev) => ({
        ...prev,
        attendanceLimit,
      }));

      setShowSettingsModal(false);
      Alert.alert('Success', 'RSVP settings updated.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update RSVP settings.');
    } finally {
      setLoading(false);
    }
  };

  const rsvpCounts = getRSVPCounts();
  const goingMembers = getMembersByRSVPStatus('going');
  const maybeMembers = getMembersByRSVPStatus('maybe');
  const notGoingMembers = getMembersByRSVPStatus('not-going');
  const noRSVPMembers = members.filter(
    (m) => !memberRSVPs[m.userId]
  );

  const isValidAvatarUrl = (url) => {
    return url && typeof url === 'string' && url.trim() !== '';
  };

  if (!event || !isOrganizer) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          {!event ? 'Event not found' : 'Only the organizer can manage RSVPs'}
        </Text>
        <Button label="Close" onPress={onClose} style={styles.closeButton} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        <View style={styles.header}>
          <Text style={styles.title}>RSVP Management</Text>
          <Text style={styles.subtitle}>{event.name}</Text>
        </View>

        {/* RSVP Settings */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>RSVP Settings</Text>
            <Button
              label="Edit Settings"
              onPress={() => setShowSettingsModal(true)}
              variant="outline"
              style={styles.editButton}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>RSVP Enabled:</Text>
            <Text style={styles.settingValue}>
              {rsvpSettings.enabled ? 'Yes' : 'No'}
            </Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Allow Maybe:</Text>
            <Text style={styles.settingValue}>
              {rsvpSettings.allowMaybe ? 'Yes' : 'No'}
            </Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Attendance Limit:</Text>
            <Text style={styles.settingValue}>
              {rsvpSettings.attendanceLimit || 'No limit'}
            </Text>
          </View>
        </View>

        {/* RSVP Summary */}
        <View style={[styles.section, styles.summarySection]}>
          <Text style={styles.sectionTitle}>RSVP Summary</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryCount}>{rsvpCounts.going}</Text>
              <Text style={styles.summaryLabel}>Going</Text>
            </View>
            {rsvpSettings.allowMaybe && (
              <View style={styles.summaryItem}>
                <Text style={styles.summaryCount}>{rsvpCounts.maybe}</Text>
                <Text style={styles.summaryLabel}>Maybe</Text>
              </View>
            )}
            <View style={styles.summaryItem}>
              <Text style={styles.summaryCount}>{rsvpCounts.notGoing}</Text>
              <Text style={styles.summaryLabel}>Can't Make It</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryCount}>{rsvpCounts.none}</Text>
              <Text style={styles.summaryLabel}>No RSVP</Text>
            </View>
          </View>
          {rsvpSettings.attendanceLimit && (
            <View style={styles.limitWarning}>
              <Text style={styles.limitWarningText}>
                {rsvpCounts.going >= rsvpSettings.attendanceLimit
                  ? '⚠️ Attendance limit reached'
                  : `${rsvpSettings.attendanceLimit - rsvpCounts.going} spots remaining`}
              </Text>
            </View>
          )}
        </View>

        {/* Going Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Going ({goingMembers.length})
          </Text>
          {goingMembers.length === 0 ? (
            <Text style={styles.emptyText}>No members going yet</Text>
          ) : (
            goingMembers.map((member) => {
              const displayName = memberNames[member.userId] || member.userId;
              const avatarUrl = memberAvatars[member.userId];
              const hasValidAvatar = isValidAvatarUrl(avatarUrl);

              return (
                <View key={member.userId} style={styles.memberRow}>
                  <View style={styles.memberInfo}>
                    {hasValidAvatar ? (
                      <Image
                        source={{ uri: avatarUrl }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarInitial}>
                          {displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.memberName}>
                      {member.role === 'organizer' ? '👑 ' : ''}
                      {displayName}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.overrideButton}
                    onPress={() => setEditingMember({ id: member.userId, name: displayName })}
                  >
                    <Text style={styles.overrideButtonText}>Change</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        {/* Maybe Members */}
        {rsvpSettings.allowMaybe && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Maybe ({maybeMembers.length})
            </Text>
            {maybeMembers.length === 0 ? (
              <Text style={styles.emptyText}>No members with maybe status</Text>
            ) : (
              maybeMembers.map((member) => {
                const displayName = memberNames[member.userId] || member.userId;
                const avatarUrl = memberAvatars[member.userId];
                const hasValidAvatar = isValidAvatarUrl(avatarUrl);

                return (
                  <View key={member.userId} style={styles.memberRow}>
                    <View style={styles.memberInfo}>
                      {hasValidAvatar ? (
                        <Image
                          source={{ uri: avatarUrl }}
                          style={styles.avatar}
                        />
                      ) : (
                        <View style={styles.avatarPlaceholder}>
                          <Text style={styles.avatarInitial}>
                            {displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.memberName}>
                        {member.role === 'organizer' ? '👑 ' : ''}
                        {displayName}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.overrideButton}
                      onPress={() => setEditingMember({ id: member.userId, name: displayName })}
                    >
                      <Text style={styles.overrideButtonText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Can't Make It Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Can't Make It ({notGoingMembers.length})
          </Text>
          {notGoingMembers.length === 0 ? (
            <Text style={styles.emptyText}>No members declined</Text>
          ) : (
            notGoingMembers.map((member) => {
              const displayName = memberNames[member.userId] || member.userId;
              const avatarUrl = memberAvatars[member.userId];
              const hasValidAvatar = isValidAvatarUrl(avatarUrl);

              return (
                <View key={member.userId} style={styles.memberRow}>
                  <View style={styles.memberInfo}>
                    {hasValidAvatar ? (
                      <Image
                        source={{ uri: avatarUrl }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarInitial}>
                          {displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.memberName}>
                      {member.role === 'organizer' ? '👑 ' : ''}
                      {displayName}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.overrideButton}
                    onPress={() => setEditingMember({ id: member.userId, name: displayName })}
                  >
                    <Text style={styles.overrideButtonText}>Change</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        {/* No RSVP Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            No RSVP ({noRSVPMembers.length})
          </Text>
          {noRSVPMembers.length === 0 ? (
            <Text style={styles.emptyText}>All members have RSVP'd</Text>
          ) : (
            noRSVPMembers.map((member) => {
              const displayName = memberNames[member.userId] || member.userId;
              const avatarUrl = memberAvatars[member.userId];
              const hasValidAvatar = isValidAvatarUrl(avatarUrl);

              return (
                <View key={member.userId} style={styles.memberRow}>
                  <View style={styles.memberInfo}>
                    {hasValidAvatar ? (
                      <Image
                        source={{ uri: avatarUrl }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarInitial}>
                          {displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.memberName}>
                      {member.role === 'organizer' ? '👑 ' : ''}
                      {displayName}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.overrideButton}
                    onPress={() => setEditingMember({ id: member.userId, name: displayName })}
                  >
                    <Text style={styles.overrideButtonText}>Set RSVP</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        {/* Footer inside ScrollView with padding */}
        <View style={styles.footer}>
          <Button label="Close" onPress={onClose} style={styles.closeButton} />
        </View>
      </ScrollView>

      {/* Settings Modal */}
      <Modal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        title="RSVP Settings"
      >
        <View style={styles.modalContent}>
          <View style={styles.modalSettingRow}>
            <Text style={styles.modalSettingLabel}>Enable RSVP:</Text>
            <Switch
              value={rsvpSettings.enabled}
              onValueChange={(value) =>
                setRsvpSettings((prev) => ({ ...prev, enabled: value }))
              }
            />
          </View>

          <View style={styles.modalSettingRow}>
            <Text style={styles.modalSettingLabel}>Allow Maybe Option:</Text>
            <Switch
              value={rsvpSettings.allowMaybe}
              onValueChange={(value) =>
                setRsvpSettings((prev) => ({ ...prev, allowMaybe: value }))
              }
            />
          </View>

          <Text style={styles.inputLabel}>Attendance Limit (optional):</Text>
          <Input
            value={attendanceLimitInput}
            onChangeText={setAttendanceLimitInput}
            placeholder="e.g., 10 (leave empty for no limit)"
            keyboardType="numeric"
            style={styles.input}
          />
          <Text style={styles.inputHint}>
            When the limit is reached, new RSVPs will be waitlisted
          </Text>

          <View style={styles.modalActions}>
            <Button
              label="Cancel"
              onPress={() => setShowSettingsModal(false)}
              variant="outline"
              style={styles.modalButton}
            />
            <Button
              label="Save"
              onPress={handleSaveSettings}
              disabled={loading}
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>

      {/* Override RSVP Modal */}
      {editingMember && (
        <Modal
          isOpen={!!editingMember}
          onClose={() => setEditingMember(null)}
          title={`Set RSVP for ${editingMember.name}`}
        >
          <View style={styles.modalContent}>
            <Button
              label="Going"
              onPress={() => {
                handleOverrideRSVP(editingMember.id, 'going');
                setEditingMember(null);
              }}
              style={styles.modalButton}
            />
            {rsvpSettings.allowMaybe && (
              <Button
                label="Maybe"
                onPress={() => {
                  handleOverrideRSVP(editingMember.id, 'maybe');
                  setEditingMember(null);
                }}
                variant="outline"
                style={styles.modalButton}
              />
            )}
            <Button
              label="Can't Make It"
              onPress={() => {
                handleOverrideRSVP(editingMember.id, 'not-going');
                setEditingMember(null);
              }}
              variant="outline"
              style={styles.modalButton}
            />
            <Button
              label="Clear RSVP"
              onPress={() => {
                handleOverrideRSVP(editingMember.id, null);
                setEditingMember(null);
              }}
              variant="outline"
              style={styles.modalButton}
            />
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    overflow: 'visible',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingLabel: {
    fontSize: 14,
    color: '#666',
  },
  settingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    marginBottom: 8,
    overflow: 'visible',
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 80,
    justifyContent: 'center',
  },
  summaryCount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#d45d5d',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  limitWarning: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
  },
  limitWarningText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
  },
  summarySection: {
    paddingBottom: 40,
    overflow: 'visible',
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#d45d5d',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  memberName: {
    fontSize: 16,
    color: '#333',
  },
  overrideButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  overrideButtonText: {
    fontSize: 14,
    color: '#d45d5d',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  footer: {
    padding: 20,
    paddingTop: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginTop: 12,
  },
  closeButton: {
    width: '100%',
  },
  errorText: {
    fontSize: 16,
    color: '#d45d5d',
    textAlign: 'center',
    padding: 20,
  },
  modalContent: {
    padding: 20,
  },
  modalSettingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalSettingLabel: {
    fontSize: 16,
    color: '#333',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
  },
});

export default RSVPManagementScreen;

