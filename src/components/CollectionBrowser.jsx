import React from 'react';

const CollectionBrowser = ({ collectionData }) => {
    const [filteredCollection, setFilteredCollection] = React.useState(collectionData);

    const handleFilter = (criteria) => {
        const filtered = collectionData.filter(game => game.category === criteria);
        setFilteredCollection(filtered);
    };

    const handleSort = (sortBy) => {
        const sorted = [...filteredCollection].sort((a, b) => a[sortBy] > b[sortBy] ? 1 : -1);
        setFilteredCollection(sorted);
    };

    return (
        <div>
            <h2>Your Game Collection</h2>
            <div>
                <button onClick={() => handleFilter('Board Game')}>Filter Board Games</button>
                <button onClick={() => handleSort('name')}>Sort by Name</button>
            </div>
            <ul>
                {filteredCollection.map(game => (
                    <li key={game.id}>{game.name}</li>
                ))}
            </ul>
        </div>
    );
};

export default CollectionBrowser;