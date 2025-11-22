import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { searchGameByBarcodeWithBGG, updateGameUPCSelection, searchGameUPC, getGameDetails } from '../utils/api';
import Input from './common/Input';
import Button from './common/Button';
import LoadingSpinner from './common/LoadingSpinner';
import './BarcodeScanner.css';

const BarcodeScanner = ({ onGameFound, onAddToCollection }) => {
  const { user } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingBGG, setLoadingBGG] = useState(false);
  const [error, setError] = useState('');
  const [productData, setProductData] = useState(null);
  const [searchTerms, setSearchTerms] = useState('');
  const [searchingGameUPC, setSearchingGameUPC] = useState(false);

  const handleBarcodeChange = (e) => {
    setBarcode(e.target.value);
    setError('');
    setProductData(null);
  };

  const handleLookup = async () => {
    if (!barcode.trim()) {
      setError('Please enter a barcode');
      return;
    }

    setLoading(true);
    setLoadingBGG(false);
    setError('');
    setProductData(null);

    try {
      // First get barcode result
      const barcodeResult = await searchGameByBarcodeWithBGG(barcode, false);
      setProductData(barcodeResult);
      setLoading(false);
      
      // Initialize search terms if GameUPC needs user selection
      if (barcodeResult.bggInfoStatus === 'choose_from_bgg_info_or_search' && barcodeResult.searchedFor) {
        setSearchTerms(barcodeResult.searchedFor);
      }
      
      // If onGameFound callback is provided, call it with the result
      if (onGameFound) {
        onGameFound(barcodeResult);
      }

      // Now search BGG with cleaned title (skip if GameUPC already has verified BGG or needs selection)
      if (barcodeResult.cleanedTitle && 
          barcodeResult.bggInfoStatus !== 'verified' && 
          barcodeResult.bggInfoStatus !== 'choose_from_bgg_info_or_search') {
        setLoadingBGG(true);
        try {
          const fullResult = await searchGameByBarcodeWithBGG(barcode, true);
          setProductData(fullResult);
          
          if (onGameFound) {
            onGameFound(fullResult);
          }
        } catch (bggErr) {
          console.warn('BGG search failed:', bggErr);
          // Don't show error, just keep barcode result
        } finally {
          setLoadingBGG(false);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to lookup barcode. Please try again.');
      console.error('Barcode lookup error:', err);
      setLoading(false);
      setLoadingBGG(false);
    }
  };

  const handleAddToCollection = () => {
    if (productData && onAddToCollection) {
      // Format the game data for the collection
      // Prefer BGG data if available, otherwise use barcode data
      const gameData = {
        id: productData.bggId || `game_${Date.now()}`,
        barcode: productData.barcode,
        title: productData.bggName || productData.title,
        description: productData.bggDetails?.description || productData.description,
        brand: productData.brand,
        category: productData.category,
        image: productData.bggDetails?.image || productData.bggDetails?.thumbnail || productData.image,
        // BGG specific data
        bggId: productData.bggId,
        bggRating: productData.bggDetails?.averageRating,
        yearPublished: productData.bggDetails?.yearPublished || productData.bggYear,
        minPlayers: productData.bggDetails?.minPlayers,
        maxPlayers: productData.bggDetails?.maxPlayers,
        playingTime: productData.bggDetails?.playingTime,
        addedAt: new Date().toISOString(),
        source: productData.bggMatch ? 'barcode_bgg' : 'barcode_lookup',
      };
      
      onAddToCollection(gameData);
      
      // Reset after adding
      setBarcode('');
      setProductData(null);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading) {
      handleLookup();
    }
  };

  const handleSelectBGGGame = async (bggInfo) => {
    if (!productData || !barcode) return;

    setLoadingBGG(true);
    try {
      // Update GameUPC with user's selection
      const userId = user?.id || `user_${Date.now()}`;
      await updateGameUPCSelection(barcode, bggInfo.id, userId);

      // Get full BGG details
      const bggDetails = await getGameDetails(bggInfo.id);

      // Update product data with selected game
      const updatedData = {
        ...productData,
        bggInfoStatus: 'verified',
        bggId: bggInfo.id,
        bggName: bggInfo.name,
        bggThumbnail: bggInfo.thumbnail_url,
        bggImage: bggInfo.image_url,
        bggDetails: bggDetails,
        bggMatch: true,
      };

      setProductData(updatedData);
      
      if (onGameFound) {
        onGameFound(updatedData);
      }
    } catch (err) {
      console.error('Error selecting BGG game:', err);
      setError('Failed to select game. Please try again.');
    } finally {
      setLoadingBGG(false);
    }
  };

  const handleSearchGameUPC = async () => {
    if (!barcode.trim() || !searchTerms.trim()) return;

    setSearchingGameUPC(true);
    try {
      const gameUPCResult = await searchGameUPC(barcode, searchTerms);
      
      // Update product data with new search results
      const updatedData = {
        ...productData,
        bggInfo: gameUPCResult.bggInfo,
        bggInfoStatus: gameUPCResult.bggInfoStatus,
        searchedFor: gameUPCResult.searchedFor,
      };

      setProductData(updatedData);
    } catch (err) {
      console.error('Error searching GameUPC:', err);
      setError('Failed to search. Please try again.');
    } finally {
      setSearchingGameUPC(false);
    }
    };

    return (
    <div className="barcode-scanner">
      <div className="barcode-scanner-header">
        <h2>Barcode Lookup</h2>
        <p className="text-secondary">
          Enter a UPC/EAN barcode to find product information
        </p>
      </div>

      <div className="barcode-input-section">
        <div className="barcode-input-group">
          <Input
            type="text"
            placeholder="Enter barcode (UPC/EAN)"
            value={barcode}
            onChange={handleBarcodeChange}
            onKeyPress={handleKeyPress}
            disabled={loading}
            className="barcode-input"
          />
          <Button
            label={loading ? 'Looking up...' : 'Lookup'}
            onClick={handleLookup}
            disabled={loading || !barcode.trim()}
            className="barcode-lookup-btn"
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
            <p className="text-secondary">Looking up barcode...</p>
          </div>
        )}

        {loadingBGG && (
          <div className="loading-container">
            <LoadingSpinner />
            <p className="text-secondary">Searching BoardGameGeek for "{productData?.cleanedTitle}"...</p>
          </div>
        )}
      </div>

      {productData && (
        <div className="product-result">
          <div className="product-header">
            <h3>Product Found</h3>
            {onAddToCollection && (
              <Button
                label="Add to Collection"
                onClick={handleAddToCollection}
                className="btn btn-primary"
              />
            )}
          </div>

          <div className="product-details">
            {(productData.bggDetails?.image || productData.bggDetails?.thumbnail || productData.image) && (
              <div className="product-image">
                <img 
                  src={productData.bggDetails?.image || productData.bggDetails?.thumbnail || productData.image} 
                  alt={productData.bggName || productData.title} 
                />
              </div>
            )}

            <div className="product-info">
              {/* Show BGG match status and source */}
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--spacing-sm)' }}>
                {productData.bggMatch && (
                  <div className="bgg-match-badge">
                    ✓ Found on BoardGameGeek
                  </div>
                )}
                {productData.source && (
                  <span className="source-badge" style={{ 
                    fontSize: 'var(--font-size-xs)', 
                    color: 'var(--text-secondary)',
                    padding: 'var(--spacing-xs) var(--spacing-sm)',
                    backgroundColor: 'var(--bg-color)',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    via {productData.source === 'gameupc' ? 'GameUPC' : 'Barcode Lookup'}
                  </span>
                )}
              </div>
              
              <h4 className="product-title">
                {productData.bggName || productData.title}
              </h4>
              
              {productData.bggDetails && (
                <div className="bgg-info">
                  {productData.bggDetails.yearPublished && (
                    <p className="product-meta">
                      <strong>Year:</strong> {productData.bggDetails.yearPublished}
                    </p>
                  )}
                  {productData.bggDetails.minPlayers && productData.bggDetails.maxPlayers && (
                    <p className="product-meta">
                      <strong>Players:</strong> {productData.bggDetails.minPlayers} - {productData.bggDetails.maxPlayers}
                    </p>
                  )}
                  {productData.bggDetails.playingTime && (
                    <p className="product-meta">
                      <strong>Playing Time:</strong> {productData.bggDetails.playingTime} min
                    </p>
                  )}
                  {productData.bggDetails.averageRating && (
                    <p className="product-meta">
                      <strong>BGG Rating:</strong> {productData.bggDetails.averageRating.toFixed(1)}/10
                    </p>
                  )}
                </div>
              )}
              
              {productData.brand && (
                <p className="product-meta">
                  <strong>Brand:</strong> {productData.brand}
                </p>
              )}
              
              {productData.category && (
                <p className="product-meta">
                  <strong>Category:</strong> {productData.category}
                </p>
              )}
              
              <p className="product-meta">
                <strong>Barcode:</strong> {productData.barcode}
              </p>

              {productData.cleanedTitle && productData.cleanedTitle !== productData.title && (
                <p className="product-meta text-secondary" style={{ fontSize: '0.85em' }}>
                  <em>Search query: "{productData.cleanedTitle}"</em>
                </p>
              )}

              {productData.bggMatch === false && (
                <div className="bgg-no-match">
                  <p className="text-secondary">
                    ⚠ No match found on BoardGameGeek for "{productData.cleanedTitle || productData.title}"
                  </p>
                </div>
              )}

              {(productData.bggDetails?.description || productData.description) && (
                <div className="product-description">
                  <strong>Description:</strong>
                  <p>{productData.bggDetails?.description || productData.description}</p>
                </div>
              )}

              {/* GameUPC: Choose from BGG options */}
              {productData.bggInfoStatus === 'choose_from_bgg_info_or_search' && productData.bggInfo && (
                <div className="gameupc-selection">
                  <h5>Select the correct game:</h5>
                  <p className="text-secondary" style={{ fontSize: '0.9em', marginBottom: 'var(--spacing-md)' }}>
                    Multiple games found. Please select the correct one:
                  </p>
                  
                  <div className="bgg-options-list">
                    {productData.bggInfo.map((bggOption, index) => (
                      <div
                        key={bggOption.id || index}
                        className="bgg-option-card"
                        onClick={() => handleSelectBGGGame(bggOption)}
                      >
                        {bggOption.thumbnail_url && (
                          <img
                            src={bggOption.thumbnail_url}
                            alt={bggOption.name}
                            className="bgg-option-thumbnail"
                          />
                        )}
                        <div className="bgg-option-info">
                          <h6>{bggOption.name}</h6>
                          {bggOption.confidence !== undefined && (
                            <p className="text-secondary" style={{ fontSize: '0.85em' }}>
                              Confidence: {bggOption.confidence}%
                            </p>
                          )}
                        </div>
                        <Button
                          label="Select"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectBGGGame(bggOption);
                          }}
                          className="btn btn-sm"
                          disabled={loadingBGG}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="gameupc-search" style={{ marginTop: 'var(--spacing-lg)', paddingTop: 'var(--spacing-lg)', borderTop: '1px solid var(--border-color)' }}>
                    <p className="text-secondary" style={{ marginBottom: 'var(--spacing-sm)' }}>
                      Or search with different terms:
                    </p>
                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                      <Input
                        type="text"
                        placeholder={productData.searchedFor || 'Enter search terms'}
                        value={searchTerms}
                        onChange={(e) => setSearchTerms(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && !searchingGameUPC) {
                            handleSearchGameUPC();
                          }
                        }}
                        disabled={searchingGameUPC}
                        style={{ flex: 1 }}
                      />
                      <Button
                        label={searchingGameUPC ? 'Searching...' : 'Search'}
                        onClick={handleSearchGameUPC}
                        disabled={searchingGameUPC || !searchTerms.trim()}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Show raw data in development */}
              {process.env.NODE_ENV === 'development' && (
                <details className="raw-data">
                  <summary>Raw API Response (Dev Only)</summary>
                  <pre>{JSON.stringify(productData.rawData, null, 2)}</pre>
                  {productData.bggDetails && (
                    <>
                      <summary style={{ marginTop: 'var(--spacing-sm)' }}>BGG Details (Dev Only)</summary>
                      <pre>{JSON.stringify(productData.bggDetails, null, 2)}</pre>
                    </>
                  )}
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="barcode-scanner-note">
        <p className="text-secondary">
          <small>
            💡 Tip: You can find the barcode (UPC/EAN) on the bottom of board game boxes.
            Camera scanning will be available soon!
          </small>
        </p>
      </div>
        </div>
    );
};

export default BarcodeScanner;