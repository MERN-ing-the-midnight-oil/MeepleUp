import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import Button from '../components/common/Button';
// Note: BarcodeScanner and BGGImport will need to be converted separately

const CollectionManagement = () => {
  const { user } = useAuth();
  const { getUserCollection, addGameToCollection } = useCollections();
  const [activeTab, setActiveTab] = useState('scanner'); // 'scanner', 'bgg', or 'collection'
  
  const userCollection = user ? getUserCollection(user.id) : [];

  const handleAddToCollection = (gameData) => {
    if (user) {
      addGameToCollection(user.id, gameData);
      alert(`${gameData.title} added to your collection!`);
    }
  };

    return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Collection</Text>
        <Text style={styles.subtitle}>
          {userCollection.length} game{userCollection.length !== 1 ? 's' : ''} in your collection
        </Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'scanner' && styles.tabActive]}
          onPress={() => setActiveTab('scanner')}
        >
          <Text style={[styles.tabText, activeTab === 'scanner' && styles.tabTextActive]}>
            Scan Barcode
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'bgg' && styles.tabActive]}
          onPress={() => setActiveTab('bgg')}
        >
          <Text style={[styles.tabText, activeTab === 'bgg' && styles.tabTextActive]}>
            Import from BGG
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'collection' && styles.tabActive]}
          onPress={() => setActiveTab('collection')}
        >
          <Text style={[styles.tabText, activeTab === 'collection' && styles.tabTextActive]}>
            My Games ({userCollection.length})
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {activeTab === 'scanner' && (
          <View style={styles.tabContent}>
            <Text style={styles.placeholderText}>
              Barcode Scanner will be implemented here
            </Text>
            {/* <BarcodeScanner onAddToCollection={handleAddToCollection} /> */}
          </View>
        )}

        {activeTab === 'bgg' && (
          <View style={styles.tabContent}>
            <Text style={styles.placeholderText}>
              BGG Import will be implemented here
            </Text>
            {/* <BGGImport
              onImportComplete={(count) => {
                if (count > 0) {
                  setActiveTab('collection');
                }
              }}
            /> */}
          </View>
        )}

        {activeTab === 'collection' && (
          <View style={styles.tabContent}>
            {userCollection.length === 0 ? (
              <View style={styles.emptyCollection}>
                <Text style={styles.emptyTitle}>No games yet</Text>
                <Text style={styles.emptyText}>
                  Add games to your collection by scanning barcodes or importing from BoardGameGeek.
                </Text>
                <View style={styles.emptyActions}>
                  <Button
                    label="Scan Barcode"
                    onPress={() => setActiveTab('scanner')}
                    style={styles.emptyButton}
                  />
                  <Button
                    label="Import from BGG"
                    onPress={() => setActiveTab('bgg')}
                    variant="outline"
                    style={styles.emptyButton}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.gamesGrid}>
                {userCollection.map((game) => (
                  <View key={game.id} style={styles.gameCard}>
                    {game.image && (
                      <View style={styles.gameCardImage}>
                        <Text style={styles.imagePlaceholder}>Image</Text>
                        {/* <Image source={{ uri: game.image }} style={styles.gameImage} /> */}
                      </View>
                    )}
                    <View style={styles.gameCardInfo}>
                      <Text style={styles.gameCardTitle}>{game.title}</Text>
                      {game.brand && (
                        <Text style={styles.gameCardMeta}>{game.brand}</Text>
                      )}
                      {game.category && (
                        <Text style={styles.gameCardMeta}>{game.category}</Text>
                      )}
                      {game.barcode && (
                        <Text style={styles.gameCardBarcode}>
                          UPC: {game.barcode}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
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
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#4a90e2',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  tabTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
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
