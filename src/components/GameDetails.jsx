import React from 'react';

const GameDetails = ({ gameData }) => {
    return (
        <div className="game-details">
            <h2>{gameData.title}</h2>
            <p>{gameData.description}</p>
            <p><strong>Publisher:</strong> {gameData.publisher}</p>
            <p><strong>Release Date:</strong> {gameData.releaseDate}</p>
            <p><strong>Players:</strong> {gameData.players}</p>
            <p><strong>Duration:</strong> {gameData.duration} minutes</p>
        </div>
    );
};

export default GameDetails;