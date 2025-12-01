# Teaching Status System

## Overview

The Teaching Status system (now called "Your feelings about this game") allows users to mark their relationship with games in their collection. Users can select **multiple options** to express their feelings about a game. This information is used by the **MeepleBot** algorithm to suggest games for events based on player interest and teaching availability.

## Status Options

### 1. **Happy to Teach** 🎓
- **Status Code:** `happy-to-teach`
- **Meaning:** Player can and actively wants to teach this game
- **Use Case:** Highest priority for teaching. These players are the best candidates for teaching new players.
- **MeepleBot Weight:** Interest = 3, Teaching Priority = 2

### 2. **Would happily play**
- **Status Code:** `would-happily-play`
- **Meaning:** Player knows the game and wants to play it, but may not be the primary teacher
- **Use Case:** Good for games where multiple people know it. Can potentially teach if needed.
- **MeepleBot Weight:** Interest = 2, Teaching Priority = 1

### 3. **I want to learn**
- **Status Code:** `want-to-learn`
- **Meaning:** Player is interested in learning this game (may or may not own it)
- **Use Case:** Signals interest but requires someone to teach
- **MeepleBot Weight:** Interest = 1, Teaching Priority = 0

### 4. **Haven't played yet**
- **Status Code:** `havent-played-yet`
- **Meaning:** Player owns the game but hasn't played it yet
- **Use Case:** Owns it but needs teaching before they can play
- **MeepleBot Weight:** Interest = 0.5, Teaching Priority = 0

### 5. **Not excited to play**
- **Status Code:** `not-excited-to-play`
- **Meaning:** Player is not excited to play this game
- **Use Case:** Signals negative interest, reduces the game's score in suggestions
- **MeepleBot Weight:** Interest = -1, Teaching Priority = 0

## Multiple Selection

Users can select **multiple options** for each game. For example, a user might select both "Happy to Teach" and "Would happily play" to indicate they can teach but are also happy to just play.

## Migration from Old System

The old system had:
- Single-value status (mutually exclusive)
- `can-teach` → Migrated to `happy-to-teach`
- `still-learning` → Migrated to `havent-played-yet`

Migration happens automatically when a game with an old status is loaded. Old single-value statuses are automatically converted to arrays for backward compatibility.

## How MeepleBot Uses This Data

### Algorithm Logic

1. **Interest Calculation:**
   - Counts all players with any teaching status (except null/empty)
   - Weights each status by enthusiasm level
   - For players with multiple statuses, weights are summed
   - "Not excited to play" reduces the total interest (negative weight)
   - Higher total interest = more people want to play

2. **Teaching Availability:**
   - Checks if at least one player has `happy-to-teach` or `would-happily-play`
   - If some players need teaching (`want-to-learn` or `havent-played-yet`), a teacher is required
   - Games without teachers are deprioritized if learners exist

3. **Scoring:**
   ```
   Score = Total Interest + Teaching Bonus - Penalty
   
   Where:
   - Total Interest = sum of interest weights for all players
   - Teaching Bonus = +2 if at least one teacher exists
   - Penalty = -5 if learners exist but no teacher available
   ```

### Example Scenarios

**Scenario 1: Perfect Match**
- 3 players: "Happy to Teach"
- 2 players: "Would happily play"
- 1 player: "I want to learn"
- **Result:** High score - lots of interest + teacher available

**Scenario 2: Needs Teacher**
- 2 players: "I want to learn"
- 1 player: "Haven't played yet"
- 0 teachers
- **Result:** Low score - interest but no teacher (penalty applied)

**Scenario 3: Everyone Knows It**
- 4 players: "Would happily play"
- **Result:** Good score - everyone can play, no teaching needed

## Implementation Details

### Data Structure

Teaching status is stored in the `userGames/{userId}/games/{gameId}` document:

```javascript
{
  gameId: string,
  userId: string,
  // New format: array of statuses (allows multiple selections)
  teachingStatus: string[] | null,
  // Valid status values:
  // 'happy-to-teach' | 'would-happily-play' | 'want-to-learn' | 'havent-played-yet' | 'not-excited-to-play'
  // ... other game fields
}
```

**Note:** The system supports backward compatibility with old single-value format. Old single values are automatically converted to arrays when loaded.

### Utility Functions

See `src/utils/meepleBot.js` for helper functions:
- `canTeach(status)` - Check if status indicates teaching ability
- `needsTeaching(status)` - Check if status indicates need for teaching
- `getInterestWeight(status)` - Get interest weight for scoring
- `getTeachingPriority(status)` - Get teaching priority
- `analyzeGameForEvent(game, memberGames)` - Analyze a game across all members
- `suggestGamesForEvent(allGames, memberGames, options)` - Get game suggestions

## Future Enhancements

Potential improvements:
1. Allow users to mark interest in games they don't own
2. Track teaching history (who taught whom)
3. Suggest teaching pairs (experienced + learners)
4. Filter suggestions by player count compatibility
5. Consider game complexity/weight in suggestions

