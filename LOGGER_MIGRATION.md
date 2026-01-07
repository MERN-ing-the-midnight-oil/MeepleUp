# Logger Migration Guide

This document tracks the migration from `console.log/warn/error` to the centralized logger utility.

## Status

- ✅ Logger utility created (`src/utils/logger.js`)
- ✅ `src/services/bggApi.js` - Migrated
- ✅ `src/utils/storage.js` - Migrated
- ⏳ Remaining files: ~54 files with console statements

## Migration Pattern

### Before:
```javascript
if (__DEV__) {
  console.log('[Component] Debug message');
}
console.warn('[Component] Warning message');
console.error('[Component] Error message', error);
```

### After:
```javascript
import logger from '../utils/logger';

logger.debug('[Component] Debug message');
logger.warn('[Component] Warning message');
logger.error('[Component] Error message', error);
```

## Migration Rules

1. **console.log** → `logger.debug()` (for detailed debugging info)
   - Or `logger.info()` if it's important informational message

2. **console.warn** → `logger.warn()` (warnings)

3. **console.error** → `logger.error()` (errors)

4. **Remove `__DEV__` checks** - Logger handles this automatically

5. **Keep context tags** - Maintain `[Component]` or `[Service]` prefixes for easier filtering

## Files to Migrate (Priority Order)

### High Priority (Core Services)
- [ ] `src/config/firebase.js`
- [ ] `src/context/AuthContext.jsx`
- [ ] `src/context/EventsContext.jsx`
- [ ] `src/context/CollectionsContext.jsx`
- [ ] `src/utils/api.js`

### Medium Priority (Components)
- [ ] `src/components/BGGImport.jsx`
- [ ] `src/components/ClaudeGameIdentifier.jsx`
- [ ] `src/components/TextListGameIdentifier.jsx`
- [ ] `src/screens/Onboarding.jsx`
- [ ] `src/screens/EventsScreen.jsx`
- [ ] `src/screens/EventHub.jsx`
- [ ] `src/screens/CollectionScreen.jsx`

### Lower Priority (Utilities)
- [ ] `src/utils/notifications.js`
- [ ] `src/utils/imageUpload.js`
- [ ] `src/services/gameDatabase.js`
- [ ] `src/services/claudeVision.js`
- [ ] Other utility files

## Automated Migration Script

You can use find/replace with regex:

**Find:** `console\.(log|warn|error)\(`
**Replace:** `logger.$1(`

Then add import at top of file:
```javascript
import logger from '../utils/logger';
```

**Note:** Manual review needed to:
- Choose appropriate log level (debug vs info)
- Remove `__DEV__` checks
- Ensure proper error object handling

## Testing After Migration

1. Test in development - verify logs appear correctly
2. Test in production build - verify debug logs are filtered
3. Verify error tracking integration works (when implemented)

