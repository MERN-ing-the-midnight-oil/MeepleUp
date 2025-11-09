import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import { fetchBGGCollection, getGameDetails } from '../utils/api';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import './BGGImport.css';

const BGGImport = ({ onImportComplete }) => {
  const { user, updateUser } = useAuth();
  const { addGameToCollection } = useCollections();
  const [bggUsername, setBggUsername] = useState(user?.bggUsername || '');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [collection, setCollection] = useState(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importedGames, setImportedGames] = useState([]);

  const handleFetchCollection = async () => {
    if (!bggUsername.trim()) {
      setError('Please enter a BGG username');
      return;
    }

    setLoading(true);
    setError('');
    setCollection(null);

    try {
      const games = await fetchBGGCollection(bggUsername, {
        own: 1,
        stats: 1,
        subtype: 'boardgame',
      });

      if (games.length === 0) {
        setError('No games found in your BGG collection. Make sure your collection is set to public.');
        setLoading(false);
        return;
      }

      setCollection(games);
      
      // Save BGG username to user profile
      if (user) {
        updateUser({ bggUsername: bggUsername.trim() });
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch BGG collection. Please try again.');
      console.error('BGG collection fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImportGames = async () => {
    if (!collection || collection.length === 0) return;

    setImporting(true);
    setError('');
    setImportProgress({ current: 0, total: collection.length });
    setImportedGames([]);

    try {
      for (let i = 0; i < collection.length; i++) {
        const game = collection[i];
        
        try {
          // Get full game details from BGG
          const gameDetails = await getGameDetails(game.bggId);
          
          // Format game data for MeepleUp collection
          const gameData = {
            id: `bgg_${game.bggId}`,
            bggId: game.bggId,
            title: gameDetails?.name || game.name,
            description: gameDetails?.description || '',
            image: gameDetails?.image || gameDetails?.thumbnail || game.image || game.thumbnail,
            yearPublished: gameDetails?.yearPublished || game.yearPublished,
            minPlayers: gameDetails?.minPlayers,
            maxPlayers: gameDetails?.maxPlayers,
            playingTime: gameDetails?.playingTime,
            bggRating: gameDetails?.averageRating || game.averageRating,
            userRating: game.rating,
            numplays: game.numplays,
            addedAt: new Date().toISOString(),
            source: 'bgg_import',
          };

          // Add to collection
          if (user) {
            addGameToCollection(user.id, gameData);
            setImportedGames((prev) => [...prev, gameData]);
          }

          setImportProgress({ current: i + 1, total: collection.length });
          
          // Small delay to avoid rate limiting
          if (i < collection.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (gameError) {
          console.warn(`Failed to import game ${game.name}:`, gameError);
          // Continue with next game
        }
      }

      const finalCount = importedGames.length;
      if (onImportComplete && finalCount > 0) {
        onImportComplete(finalCount);
      }
    } catch (err) {
      setError(err.message || 'Failed to import games. Some games may have been imported.');
      console.error('Import error:', err);
    } finally {
      setImporting(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading) {
      handleFetchCollection();
    }
  };

  return (
    <div className="bgg-import">
      <div className="bgg-import-header">
        <h2>Import from BoardGameGeek</h2>
        <p className="text-secondary">
          Import your BGG collection to quickly populate your MeepleUp collection.
        </p>
      </div>

      <div className="bgg-import-form">
        <div className="bgg-username-input">
          <Input
            type="text"
            placeholder="Enter your BGG username"
            value={bggUsername}
            onChange={(e) => {
              setBggUsername(e.target.value);
              setError('');
              setCollection(null);
            }}
            onKeyPress={handleKeyPress}
            disabled={loading || importing}
          />
          <Button
            label={loading ? 'Loading...' : 'Fetch Collection'}
            onClick={handleFetchCollection}
            disabled={loading || importing || !bggUsername.trim()}
            className="bgg-fetch-btn"
          />
        </div>

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {loading && (
          <div className="loading-container">
            <LoadingSpinner />
            <p className="text-secondary">
              Fetching your BGG collection... This may take a few seconds.
            </p>
          </div>
        )}
      </div>

      {collection && collection.length > 0 && (
        <div className="bgg-collection-preview">
          <div className="collection-summary">
            <h3>Collection Found</h3>
            <p className="text-secondary">
              Found <strong>{collection.length}</strong> game{collection.length !== 1 ? 's' : ''} in your BGG collection.
            </p>
          </div>

          {!importing && (
            <div className="import-actions">
              <Button
                label={`Import ${collection.length} Games`}
                onClick={handleImportGames}
                className="btn btn-primary btn-full"
              />
              <p className="text-secondary" style={{ fontSize: '0.85em', marginTop: 'var(--spacing-sm)' }}>
                This will add all games from your BGG collection to your MeepleUp collection.
              </p>
            </div>
          )}

          {importing && (
            <div className="import-progress">
              <div className="progress-bar-container">
                <div
                  className="progress-bar"
                  style={{
                    width: `${(importProgress.current / importProgress.total) * 100}%`,
                  }}
                />
              </div>
              <p className="text-secondary">
                Importing {importProgress.current} of {importProgress.total} games...
              </p>
            </div>
          )}

          {importedGames.length > 0 && !importing && (
            <div className="import-success">
              <div className="success-message">
                ✓ Successfully imported {importedGames.length} game{importedGames.length !== 1 ? 's' : ''}!
              </div>
              {onImportComplete && (
                <Button
                  label="View Collection"
                  onClick={() => onImportComplete(importedGames.length)}
                  className="btn btn-outline"
                  style={{ marginTop: 'var(--spacing-md)' }}
                />
              )}
            </div>
          )}

          {/* Show first few games as preview */}
          {!importing && importedGames.length === 0 && (
            <div className="collection-preview-list">
              <h4>Preview (first 5 games):</h4>
              <ul>
                {collection.slice(0, 5).map((game) => (
                  <li key={game.bggId}>
                    {game.thumbnail && (
                      <img
                        src={game.thumbnail}
                        alt={game.name}
                        className="preview-thumbnail"
                      />
                    )}
                    <span>{game.name}</span>
                    {game.yearPublished && (
                      <span className="text-secondary"> ({game.yearPublished})</span>
                    )}
                  </li>
                ))}
              </ul>
              {collection.length > 5 && (
                <p className="text-secondary" style={{ fontSize: '0.85em', marginTop: 'var(--spacing-sm)' }}>
                  ... and {collection.length - 5} more games
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BGGImport;

