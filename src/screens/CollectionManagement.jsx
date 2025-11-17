import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import Button from '../components/common/Button';
import ClaudeGameIdentifier from '../components/ClaudeGameIdentifier';
import GameCard from '../components/GameCard';
// Note: BarcodeScanner and BGGImport will need to be converted separately

const CollectionManagement = () => {
  const { user } = useAuth();
  const { getUserCollection, addGameToCollection } = useCollections();
  const [activeView, setActiveView] = useState('menu'); // 'menu', 'view', 'add', 'import'
  
  const userIdentifier = user?.uid || user?.id;
  const userCollection = userIdentifier ? getUserCollection(userIdentifier) : [];

  const handleAddToCollection = (gameData) => {
    if (userIdentifier) {
      addGameToCollection(userIdentifier, gameData);
      alert(`${gameData.title} added to your collection!`);
    }
  };

  // Show menu when no specific view is active
  const showMenu = activeView === 'menu';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Collection</Text>
        <Text style={styles.subtitle}>
          {userCollection.length} game{userCollection.length !== 1 ? 's' : ''} in your collection
        </Text>
      </View>

      <View style={styles.content}>
        {showMenu && (
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>What would you like to do?</Text>
            
            <Pressable
              style={styles.menuOption}
              onPress={() => setActiveView('view')}
            >
              <View style={styles.menuOptionContent}>
                <Text style={styles.menuOptionIcon}>📚</Text>
                <View style={styles.menuOptionText}>
                  <Text style={styles.menuOptionTitle}>View my MeepleUp collection</Text>
                  <Text style={styles.menuOptionDescription}>
                    Browse your {userCollection.length} game{userCollection.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Text style={styles.menuOptionArrow}>→</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.menuOption}
              onPress={() => setActiveView('add')}
            >
              <View style={styles.menuOptionContent}>
                <Text style={styles.menuOptionIcon}>📷</Text>
                <View style={styles.menuOptionText}>
                  <Text style={styles.menuOptionTitle}>Add games using my camera</Text>
                  <Text style={styles.menuOptionDescription}>
                    Take a photo to identify games with Claude AI
                  </Text>
                </View>
                <Text style={styles.menuOptionArrow}>→</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.menuOption}
              onPress={() => setActiveView('import')}
            >
              <View style={styles.menuOptionContent}>
                <Text style={styles.menuOptionIcon}>🌐</Text>
                <View style={styles.menuOptionText}>
                  <Text style={styles.menuOptionTitle}>Import games from my BGG collection</Text>
                  <Text style={styles.menuOptionDescription}>
                    Sync your BoardGameGeek collection
                  </Text>
                </View>
                <Text style={styles.menuOptionArrow}>→</Text>
              </View>
            </Pressable>
          </View>
        )}

        {activeView === 'view' && (
          <View style={styles.viewContent}>
            <View style={styles.viewHeader}>
              <Pressable
                style={styles.backButton}
                onPress={() => setActiveView('menu')}
              >
                <Text style={styles.backButtonText}>← Back</Text>
              </Pressable>
              <Text style={styles.viewTitle}>My Games</Text>
            </View>
            
            {userCollection.length === 0 ? (
              <View style={styles.emptyCollection}>
                <Text style={styles.emptyTitle}>No games yet</Text>
                <Text style={styles.emptyText}>
                  Add games to your collection by using your camera or importing from BoardGameGeek.
                </Text>
                <View style={styles.emptyActions}>
                  <Button
                    label="Add Games with Camera"
                    onPress={() => setActiveView('add')}
                    style={styles.emptyButton}
                  />
                  <Button
                    label="Import from BGG"
                    onPress={() => setActiveView('import')}
                    variant="outline"
                    style={styles.emptyButton}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.gamesGrid}>
                {userCollection.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </View>
            )}
          </View>
        )}

        {activeView === 'add' && (
          <View style={styles.viewContent}>
            <View style={styles.viewHeader}>
              <Pressable
                style={styles.backButton}
                onPress={() => setActiveView('menu')}
              >
                <Text style={styles.backButtonText}>← Back</Text>
              </Pressable>
              <Text style={styles.viewTitle}>Identify Games</Text>
            </View>
            <ClaudeGameIdentifier onAddToCollection={handleAddToCollection} />
          </View>
        )}

        {activeView === 'import' && (
          <View style={styles.viewContent}>
            <View style={styles.viewHeader}>
              <Pressable
                style={styles.backButton}
                onPress={() => setActiveView('menu')}
              >
                <Text style={styles.backButtonText}>← Back</Text>
              </Pressable>
              <Text style={styles.viewTitle}>Import from BGG</Text>
            </View>
            <View style={styles.tabContent}>
              <Text style={styles.placeholderText}>
                BGG Import will be implemented here
              </Text>
              {/* <BGGImport
                onImportComplete={(count) => {
                  if (count > 0) {
                    setActiveView('view');
                  }
                }}
              /> */}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#d45d5d',
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  menuContainer: {
    paddingVertical: 20,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 24,
    textAlign: 'center',
  },
  menuOption: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  menuOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  menuOptionIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  menuOptionText: {
    flex: 1,
  },
  menuOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  menuOptionDescription: {
    fontSize: 14,
    color: '#666',
  },
  menuOptionArrow: {
    fontSize: 20,
    color: '#999',
    marginLeft: 12,
  },
  viewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#4a90e2',
    fontWeight: '500',
  },
  viewTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
  },
  viewContent: {
    minHeight: 400,
  },
  content: {
    padding: 20,
  },
  tabContent: {
    minHeight: 400,
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 40,
  },
  emptyCollection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  emptyActions: {
    width: '100%',
  },
  emptyButton: {
    marginBottom: 12,
  },
  gamesGrid: {
    gap: 16,
  },
  gameCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  gameCardImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholder: {
    color: '#999',
  },
  gameCardInfo: {
    gap: 4,
  },
  gameCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  gameCardMeta: {
    fontSize: 14,
    color: '#666',
  },
  gameCardBarcode: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});

export default CollectionManagement;
