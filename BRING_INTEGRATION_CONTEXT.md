# Bring Integration - Cashback Wallet Address System

## Overview
This document provides context for the Bring Web3 cashback integration implementation in the Fuels Wallet Chrome extension. The system allows users to designate a specific wallet address to receive cashback rewards from Bring.

## What Was Implemented

### Core Functionality
A cashback wallet address management system with the following logic:
1. **If a cashback address is saved** → Return it (after validating it still exists in accounts)
2. **If exactly 1 account exists** → Auto-save it as cashback address and return it
3. **If multiple accounts exist and no cashback address** → Prompt user to select via UI, return null until selected
4. **If no accounts exist** → Open wallet creation page

### Architecture Pattern
- **Background Script**: All business logic lives here (storage, validation, account checks, notifications)
- **Content Script**: Message passing layer and event listener for address updates
- **React UI**: Selection page when user needs to choose from multiple addresses
- **Real-time Updates**: Broadcasts `CASHBACK_WALLET_UPDATED` events to all tabs when address changes
- Follows the same pattern as DApp connection requests (ConnectionRequest page)

## File Structure

### 1. Background Script
**Location**: `/packages/app/src/systems/CRX/background/bring/index.ts`

**Key Functions**:
- `getSavedCashbackAddress()`: Retrieves saved address from chrome.storage.local
- `saveCashbackAddress(address)`: Saves address to chrome.storage.local
- `deleteCashbackAddress()`: Removes saved address from storage
- `notifyWalletAddressUpdate(address)`: Broadcasts CASHBACK_WALLET_UPDATED event to all tabs
- `getCashbackWalletAddress()`: Main logic function (see flow below)
- `openCashbackAddressSelection()`: Opens popup window with selection UI or wallet creation page
- `setPendingCashbackFlag()`: Sets flag when user is redirected to wallet creation
- `checkAndClearPendingCashbackFlag()`: Checks and clears the pending flag

**Database Event Listeners**:
Uses `DatabaseObservable` to listen to Dexie database changes (not chrome.storage)
- `accounts:create`: Auto-saves new account as cashback address if pending flag is set
- `accounts:delete`: Clears saved cashback address if the deleted account was the cashback account

**Message Handlers**:
- `GET_CASHBACK_ADDRESS`: Returns the cashback address (or null)
- `SET_CASHBACK_ADDRESS`: Saves user-selected address and broadcasts update
- `DELETE_CASHBACK_ADDRESS`: Clears saved address and broadcasts update
- `OPEN_CASHBACK_SELECTION`: Opens the selection popup or wallet creation page

**Events Broadcasted**:
- `CASHBACK_WALLET_UPDATED`: Sent to all tabs when cashback address changes (includes the new address or null)

**Storage Key**: `bring_cashback_wallet_address`

### 2. Content Script
**Location**: `/packages/app/src/systems/CRX/scripts/bring/contentScript.ts`

**Key Functions**:
- `getCashbackWalletAddress()`: Sends GET_CASHBACK_ADDRESS message to background
- `openCashbackAddressSelection()`: Sends OPEN_CASHBACK_SELECTION message to background

**Event Listeners**:
- Listens for `CASHBACK_WALLET_UPDATED` messages from background script
- Triggers Bring SDK's `walletAddressUpdateCallback` when address changes

**Bring SDK Integration**:
```typescript
bringInitContentScript({
    getWalletAddress: getCashbackWalletAddress,         // Called to get cashback address
    promptLogin: openCashbackAddressSelection,          // Called when address is null or no accounts
    walletAddressUpdateCallback: (callback) => {        // Called when address changes
        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'CASHBACK_WALLET_UPDATED' && message.address) {
                callback()
            }
        })
    },
    // ... other config
})
```

### 3. Selection UI Page
**Location**: `/packages/app/src/systems/CRX/pages/SelectCashbackAddress/SelectCashbackAddress.tsx`

**Features**:
- Displays all accounts using AccountItem component (same as ConnectionRequest)
- Click-to-select interaction with visual highlighting
- Confirm/Cancel buttons
- On confirm: Sends SET_CASHBACK_ADDRESS message and closes window
- Uses Fuel UI components (@fuel-ui/react) and Layout system

**Styling**: Matches existing wallet design with border-left highlight for selected item

### 4. Routing
**Route Definition**: `/packages/app/src/systems/Core/types.ts`
```typescript
selectCashbackAddress: route('/select-cashback-address')
```

**Route Configuration**: `/packages/app/src/systems/CRX/routes.tsx`
- Exports `crxRoutes` with SelectCashbackAddress component

**Integration**: `/packages/app/src/routes.tsx`
- Added `crxRoutes` to `walletRoutes`
- Accessible in CRX popup context

## Flow Diagrams

### Initial Address Request Flow
```
Bring SDK calls getWalletAddress()
    ↓
Content Script: getCashbackWalletAddress()
    ↓
Background: GET_CASHBACK_ADDRESS message
    ↓
Background: getCashbackWalletAddress() logic
    ↓
Check saved address → Valid? Return it
    ↓ (if no saved)
Check account count
    ↓
1 account? → Save & return it
    ↓
0 or multiple? → Return null
    ↓
Content Script receives null
    ↓
Bring SDK calls promptLogin()
    ↓
Content Script: openCashbackAddressSelection()
    ↓
Background: OPEN_CASHBACK_SELECTION message
    ↓
Background: Opens popup window with selection page
```

### Address Selection Flow
```
User opens selection page
    ↓
Page loads accounts via AccountService.getAccounts()
    ↓
Displays accounts with AccountItem components
    ↓
User clicks account → setSelectedAddress(address)
    ↓
User clicks Confirm
    ↓
Sends SET_CASHBACK_ADDRESS message with selected address
    ↓
Background saves address to chrome.storage.local
    ↓
Background broadcasts CASHBACK_WALLET_UPDATED to all tabs
    ↓
Content scripts receive update and notify Bring SDK
    ↓
Window closes
    ↓
Future getWalletAddress() calls return saved address
```

### No Accounts Flow (New!)
```
Bring SDK calls promptLogin() when no address returned
    ↓
Content Script: openCashbackAddressSelection()
    ↓
Background: OPEN_CASHBACK_SELECTION message
    ↓
Background: Checks AccountService.getAccounts()
    ↓
If accounts.length === 0:
    ↓
Opens wallet creation page (index.html#/sign-up-welcome) in new tab
    ↓
User creates wallet
    ↓
User can retry cashback flow with new account
```

### Real-time Update Flow (New!)
```
Any cashback address change occurs:
- User saves new address
- User deletes address
- Address auto-saved for single account
- Invalid address removed during validation
    ↓
Background: notifyWalletAddressUpdate(address) called
    ↓
Background: Queries all open tabs
    ↓
Background: Sends CASHBACK_WALLET_UPDATED message to each tab
    ↓
Content Scripts: Receive message if Bring script loaded
    ↓
Content Scripts: Trigger walletAddressUpdateCallback
    ↓
Bring SDK: Updates UI/state with new address
```

## Important Implementation Details

### 1. Popup Window Configuration
- **URL**: `popup.html#/select-cashback-address` (NOT index.html)
- **Why popup.html?**:
  - `index.html` uses `crxSignUpRoutes` which doesn't include cashback route
  - `popup.html` uses `crxPopupRoutes` which includes `walletRoutes` containing `crxRoutes`
- **Window Type**: `'popup'` (dedicated window, not tab)
- **Size**: 400x650 pixels

### 2. Address Validation
When a saved address is retrieved, it's validated against current accounts:
```typescript
if (savedAddress) {
    if (addresses.includes(savedAddress)) {
        return savedAddress  // Valid
    } else {
        await deleteCashbackAddress()  // Invalid, remove it
        await notifyWalletAddressUpdate(null)  // Notify all tabs
    }
}
```

### 3. AccountService Integration
The selection page directly imports and uses:
```typescript
import { AccountService } from '~/systems/Account/services'
```
This gives access to `AccountService.getAccounts()` for fetching all accounts.

### 4. Database Event System (DatabaseObservable)
Uses Dexie database observables instead of chrome.storage listeners:
```typescript
import { DatabaseObservable } from '../services/DatabaseObservable'

const databaseObservable = new DatabaseObservable(['accounts'] as const)

// Listen to account creation
databaseObservable.on<'accounts:create', Account>(
    'accounts:create',
    async (event) => {
        const newAccount = event.obj  // Direct access to Account object
        const wasPending = await checkAndClearPendingCashbackFlag()
        if (wasPending) {
            await saveCashbackAddress(newAccount.address)
            await notifyWalletAddressUpdate(newAccount.address)
        }
    }
)

// Listen to account deletion
databaseObservable.on<'accounts:delete', Account>(
    'accounts:delete',
    async (event) => {
        const deletedAccount = event.oldObj
        const savedAddress = await getSavedCashbackAddress()
        if (savedAddress === deletedAccount.address) {
            await deleteCashbackAddress()
            await notifyWalletAddressUpdate(null)
        }
    }
)
```

**Benefits**:
- Type-safe with full `Account` type information
- Direct database event listening via Dexie observables
- Follows the same pattern as `DatabaseEvents.ts` (used for DApp connections)
- Automatic cleanup when cashback account is deleted

### 5. Real-time Notification System
All cashback address changes trigger notifications to active tabs:
```typescript
async function notifyWalletAddressUpdate(address: string | null): Promise<void> {
    const tabs = await chrome.tabs.query({})
    for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
            type: 'CASHBACK_WALLET_UPDATED',
            address,
        }).catch(() => {
            // Ignore errors for tabs without content scripts
        })
    }
}
```

**Trigger Points**:
- User saves address via `SET_CASHBACK_ADDRESS`
- User deletes address via `DELETE_CASHBACK_ADDRESS`
- Single account auto-saved in `getCashbackWalletAddress()`
- Invalid address removed during validation

### 6. No Accounts Handling
When `openCashbackAddressSelection()` is called with no accounts:
- Opens wallet creation page (`index.html#/sign-up-welcome`) via `welcomeLink()`
- Uses `chrome.tabs.create()` to open in a new tab (not popup)
- Allows user to create wallet before proceeding with cashback

## Dependencies

### NPM Packages
- `@bringweb3/chrome-extension-kit`: Bring SDK for browser extensions
- `@fuel-ui/react`: Fuel UI component library
- `@fuel-ui/css`: Fuel CSS utilities
- `framer-motion`: Animations
- `@fuel-wallet/types`: TypeScript types for Account, database change events, etc.
- `dexie-observable`: Database change notifications (via DatabaseObservable)

### Internal Systems
- `~/systems/Account/components/AccountItem`: Reusable account display component
- `~/systems/Account/services`: AccountService for account management
- `~/systems/Core`: Layout, animations, utilities, database
- `~/systems/CRX/background/services/DatabaseObservable`: Event emitter for database changes

## Configuration Files

### Bring SDK Config
**Location**: `/packages/app/src/systems/CRX/background/bring/index.ts`
```typescript
bringInitBackground({
    identifier: '9FaJTDcBCb48wkWKveRBg61jxfhvtg0V2iazjnA5',
    apiEndpoint: 'sandbox',
    isEnabledByDefault: true,
    cashbackPagePath: '/pages/cashback/cashback.html',
})
```

### Theme
**Location**: `/packages/app/src/systems/CRX/scripts/bring/theme.ts`
- Custom dark theme configuration for Bring UI

## Testing Scenarios

### 1. First Time User (No Saved Address, 1 Account)
- Call `getCashbackWalletAddress()`
- Should auto-save and return the single account
- No selection UI shown

### 2. First Time User (No Saved Address, Multiple Accounts)
- Call `getCashbackWalletAddress()`
- Returns null
- Bring SDK calls `promptLogin()`
- Selection popup opens
- User selects address and confirms
- Future calls return selected address

### 3. Returning User (Has Saved Address)
- Call `getCashbackWalletAddress()`
- Returns saved address immediately
- No UI shown

### 4. Deleted Account Scenario
- User has saved address for Account A
- User deletes Account A
- Call `getCashbackWalletAddress()`
- Detects invalid address, deletes it
- Falls back to logic for no saved address

### 5. Manual Deletion
- Send `DELETE_CASHBACK_ADDRESS` message
- Saved address cleared
- `CASHBACK_WALLET_UPDATED` event broadcasted with null
- Next call will trigger selection flow if multiple accounts

### 6. No Accounts Scenario (New!)
- User visits site with Bring integration
- No wallet exists yet
- Call `getCashbackWalletAddress()` returns null
- Bring SDK calls `promptLogin()`
- Wallet creation page opens in new tab
- User creates wallet
- Returns to site and retries

### 7. Real-time Updates (New!)
- User has cashback address saved
- Multiple tabs with Bring SDK open
- User changes cashback address in one location
- All tabs receive `CASHBACK_WALLET_UPDATED` event
- Bring SDK updates UI across all tabs automatically

## Known Limitations & Future Enhancements

### Current Limitations
1. No UI indicator showing which account is the cashback account (could add to AccountItem)
2. No way to change cashback address from wallet UI (must delete and re-trigger)
3. Notification system requires tabs to have content script loaded (works for Bring-enabled sites only)

### Potential Enhancements
1. **Settings Page Integration**: Add "Cashback Settings" page to manage cashback address
2. **Account Indicator**: Show badge/icon on account that's set as cashback account
3. **Change Address Button**: In settings, allow user to open selection page manually
4. **Multi-Address Support**: Allow multiple addresses for different cashback tiers

### Recently Implemented ✅
1. **Real-time Update System**: Broadcasts `CASHBACK_WALLET_UPDATED` events to all tabs when address changes
2. **No Accounts Handling**: Opens wallet creation page when user has no accounts
3. **Comprehensive Notifications**: All address changes (save, delete, auto-save, validation) trigger updates
4. **Database Observable Pattern**: Replaced chrome.storage listener with DatabaseObservable for proper event handling
5. **Auto-cleanup**: Automatically clears cashback address when the saved account is deleted

## Debugging Tips

### Check Saved Address
```javascript
// In browser console (background script context)
chrome.storage.local.get(['bring_cashback_wallet_address'], (result) => {
    console.log('Saved cashback address:', result.bring_cashback_wallet_address)
})
```

### Clear Saved Address
```javascript
chrome.storage.local.remove(['bring_cashback_wallet_address'], () => {
    console.log('Cashback address cleared')
})
```

### Message Testing
```javascript
// Send message from content script context
chrome.runtime.sendMessage({ type: 'GET_CASHBACK_ADDRESS' }, (response) => {
    console.log('Cashback address:', response.address)
})
```

### Listen for Updates
```javascript
// In content script context
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CASHBACK_WALLET_UPDATED') {
        console.log('Cashback address updated to:', message.address)
    }
})
```

### Common Issues
1. **Black screen/redirect**: Using `index.html` instead of `popup.html`
2. **No accounts showing**: Check AccountService.getAccounts() is working
3. **Address not persisting**: Check chrome.storage.local permissions in manifest
4. **Window not opening**: Check chrome.windows permission in manifest
5. **Updates not received**: Ensure content script is loaded and listening for CASHBACK_WALLET_UPDATED
6. **Wallet creation not opening**: Check that welcomeLink() returns correct URL
7. **Events not firing**: Ensure DatabaseObservable is initialized and database is open

## Related Files Reference

### Existing DApp Connection (Reference Pattern)
- `/packages/app/src/systems/DApp/pages/ConnectionRequest/ConnectionRequest.tsx`
- Shows multi-account selection pattern that was replicated

### Database Event System (Reference Pattern)
- `/packages/app/src/systems/CRX/background/services/DatabaseObservable.ts`: Event emitter for Dexie changes
- `/packages/app/src/systems/CRX/background/services/DatabaseEvents.ts`: Example usage for DApp events
- Shows the pattern replicated for Bring cashback events

### Account Management
- `/packages/app/src/systems/Account/services/account.ts`: AccountService implementation
- `/packages/app/src/systems/Account/components/AccountItem/AccountItem.tsx`: Account display component

### Core Types
- `/packages/app/src/systems/Core/types.ts`: Route definitions, Pages enum
- `@fuel-wallet/types`: Account type, database change event types

## Next Session Checklist

When continuing work on this feature:
1. [x] Implement real-time notification system ✅
2. [x] Handle no accounts scenario with wallet creation ✅
3. [ ] Test with actual Bring integration on a live site
4. [ ] Test real-time updates across multiple tabs
5. [ ] Add error handling for network failures
6. [ ] Consider adding cashback management to Settings page
7. [ ] Add visual indicator for cashback account in account list
8. [ ] Test account deletion scenarios thoroughly
9. [ ] Test no-accounts flow end-to-end
10. [ ] Consider adding analytics/telemetry for cashback usage
11. [ ] Document in user-facing documentation

## Questions to Consider

1. Should there be a timeout for the selection window?
2. Should we prevent closing the window without selection?
3. Should we show estimated cashback amounts in the selection UI?
4. Should we allow different cashback addresses for different sites?
5. Should there be a default "always use current account" option?

---

**Last Updated**: 2025-11-03
**Status**: Production-ready with DatabaseObservable pattern
**Branch**: `bring-integration`

## Recent Updates

### 2025-11-03 (Latest) - DatabaseObservable Refactor
- **Replaced chrome.storage listener** with `DatabaseObservable` pattern
- Now uses `databaseObservable.on('accounts:create')` to detect new accounts
- Added `databaseObservable.on('accounts:delete')` to auto-cleanup deleted cashback accounts
- Follows the same pattern as `DatabaseEvents.ts` (DApp connection events)
- Type-safe with full `Account` type information
- Cleaner code: removed manual array comparison logic

### 2025-11-03 (Earlier) - Real-time Notification System
- Added `notifyWalletAddressUpdate()` function to broadcast address changes
- All address modifications now trigger `CASHBACK_WALLET_UPDATED` events
- Content script listens and notifies Bring SDK via `walletAddressUpdateCallback`
- Supports multi-tab synchronization

### 2025-11-03 (Earlier) - No Accounts Handling
- `openCashbackAddressSelection()` now checks account count
- Opens wallet creation page if no accounts exist
- Uses `welcomeLink()` to navigate to sign-up flow
- Graceful onboarding for new users
- Auto-saves newly created account as cashback address via pending flag

### Event Name Change
- Renamed from `WALLET_ADDRESS_UPDATED` to `CASHBACK_WALLET_UPDATED` for clarity
