# TypeScript Migration Guide

This document tracks the gradual migration from JavaScript to TypeScript.

## Status

- ✅ TypeScript installed and configured
- ✅ `tsconfig.json` created
- ✅ Basic type definitions created (`src/types/index.ts`)
- ⏳ Migration in progress

## Migration Strategy

### Phase 1: Setup ✅
- Install TypeScript and type definitions
- Create `tsconfig.json` with appropriate settings
- Create types directory structure
- Add type-check scripts to package.json

### Phase 2: Type Definitions (In Progress)
- Define core types (User, Game, Event, etc.)
- Create utility types
- Add JSDoc comments to existing JS files

### Phase 3: Convert Utilities & Services
- Start with pure utility functions (no React)
- Convert services (bggApi, gameDatabase, etc.)
- Add type annotations gradually

### Phase 4: Convert Contexts
- Add types to context providers
- Type context values and methods
- Ensure type safety in context consumers

### Phase 5: Convert Components
- Start with simple components
- Add props interfaces
- Convert complex components last

## Type Definitions

Core types are defined in `src/types/index.ts`:

- `Game` - Board game data structure
- `User` - User profile and authentication
- `Event` - Gaming group/MeepleUp
- `Member` - Event membership
- `AvailabilityProfile` - User availability matching
- And more...

## Usage

### Type Checking
```bash
npm run type-check        # Check all TypeScript files
npm run type-check:watch # Watch mode for continuous checking
```

### Gradual Migration
1. Rename `.js` files to `.ts` or `.tsx` (for React components)
2. Add type annotations
3. Fix type errors
4. Test thoroughly

### Example Migration

**Before (JavaScript):**
```javascript
export function getUserCollection(userId) {
  return collections[userId] || [];
}
```

**After (TypeScript):**
```typescript
import { Game } from '../types';

export function getUserCollection(userId: string): Game[] {
  return collections[userId] || [];
}
```

## Next Steps

1. Continue adding type definitions as needed
2. Start converting utility functions
3. Add types to service files
4. Gradually convert components

