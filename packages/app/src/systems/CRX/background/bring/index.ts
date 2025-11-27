import { bringInitBackground } from '@bringweb3/chrome-extension-kit';
import type { Account } from '@fuel-wallet/types';
import { IS_DEVELOPMENT } from '~/config';
import { AccountService } from '~/systems/Account/services';
import { welcomeLink } from '../../config';
import { createPopUp } from '../../utils';
import { DatabaseObservable } from '../services/DatabaseObservable';

const CASHBACK_ADDRESS_KEY = 'bring_cashback_wallet_address';
const BRING_PENDING_CASHBACK_KEY = 'bring_pending_cashback';

// Helper function to get saved cashback address from storage
async function getSavedCashbackAddress(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([CASHBACK_ADDRESS_KEY], (result) => {
      resolve(result[CASHBACK_ADDRESS_KEY] || null);
    });
  });
}

// Helper function to save cashback address to storage
async function saveCashbackAddress(address: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CASHBACK_ADDRESS_KEY]: address }, () => {
      resolve();
    });
  });
}

// Helper function to delete cashback address from storage
async function deleteCashbackAddress(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([CASHBACK_ADDRESS_KEY], () => {
      resolve();
    });
  });
}

// Helper function to set pending cashback flag (when user is redirected to wallet creation)
async function setPendingCashbackFlag(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [BRING_PENDING_CASHBACK_KEY]: true }, () => {
      resolve();
    });
  });
}

// Helper function to check and clear pending cashback flag
async function checkAndClearPendingCashbackFlag(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get([BRING_PENDING_CASHBACK_KEY], (result) => {
      const isPending = result[BRING_PENDING_CASHBACK_KEY] || false;
      if (isPending) {
        chrome.storage.local.remove([BRING_PENDING_CASHBACK_KEY], () => {
          resolve(true);
        });
      } else {
        resolve(false);
      }
    });
  });
}

// Helper function to notify all tabs that the cashback wallet address has been updated
async function notifyWalletAddressUpdate(
  address: string | null
): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs
          .sendMessage(tab.id, {
            type: 'CASHBACK_WALLET_UPDATED',
            address,
          })
          .catch(() => {
            // Ignore errors for tabs that don't have content scripts
          });
      }
    }
  } catch (_error) {}
}

// Main function to get cashback wallet address with the required logic
async function getCashbackWalletAddress(): Promise<string | null> {
  // Check if we have a saved cashback address
  const savedAddress = await getSavedCashbackAddress();
  const accounts = await AccountService.getAccounts();

  const addresses = accounts.map((account) => account.address);
  if (savedAddress) {
    if (addresses.includes(savedAddress)) {
      return savedAddress;
    }
    // Saved address is no longer valid, remove it
    await deleteCashbackAddress();
    await notifyWalletAddressUpdate(null);
  }
  // If no saved address, check how many accounts exist

  // If exactly 1 account exists, save it as cashback address and return it
  if (addresses.length === 1) {
    const address = addresses[0];
    await saveCashbackAddress(address);
    await notifyWalletAddressUpdate(address);
    return address;
  }

  // If 0 or multiple accounts, return null (selection page will be opened via promptLogin)
  return null;
}

// Function to open the cashback address selection page or wallet creation page
async function openCashbackAddressSelection() {
  // Check if there are any accounts
  const accounts = await AccountService.getAccounts();

  if (accounts.length === 0) {
    // No accounts exist, set flag and open the wallet creation page
    await setPendingCashbackFlag();
    chrome.tabs.create({ url: welcomeLink() });
  } else {
    // Accounts exist, open the selection popup
    createPopUp(chrome.runtime.getURL('popup.html#/select-cashback-address'));
  }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_CASHBACK_ADDRESS') {
    getCashbackWalletAddress()
      .then((address) => {
        sendResponse({ address });
      })
      .catch((_error) => {
        sendResponse({ address: null });
      });
    // Return true to indicate we'll respond asynchronously
    return true;
  }

  if (message.type === 'DELETE_CASHBACK_ADDRESS') {
    deleteCashbackAddress()
      .then(async () => {
        await notifyWalletAddressUpdate(null);
        sendResponse({ success: true });
      })
      .catch((_error) => {
        sendResponse({ success: false });
      });
    // Return true to indicate we'll respond asynchronously
    return true;
  }

  if (message.type === 'SET_CASHBACK_ADDRESS') {
    const { address } = message;
    if (!address) {
      sendResponse({ success: false, error: 'No address provided' });
      return true;
    }

    saveCashbackAddress(address)
      .then(async () => {
        await notifyWalletAddressUpdate(address);
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    // Return true to indicate we'll respond asynchronously
    return true;
  }

  if (message.type === 'OPEN_CASHBACK_SELECTION') {
    openCashbackAddressSelection()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// Initialize database observable to listen to account changes
const databaseObservable = new DatabaseObservable(['accounts'] as const);

// Listen to account creation events
databaseObservable.on<'accounts:create', Account>(
  'accounts:create',
  async (event) => {
    const newAccount = event.obj;

    // Check if we have a pending cashback flag
    const wasPending = await checkAndClearPendingCashbackFlag();

    if (wasPending) {
      // User just created an account from Bring flow
      // Save the new account as cashback address
      await saveCashbackAddress(newAccount.address);

      // Notify all tabs
      await notifyWalletAddressUpdate(newAccount.address);
    }
  }
);

// Listen to account deletion events
databaseObservable.on<'accounts:delete', Account>(
  'accounts:delete',
  async (event) => {
    const deletedAccount = event.oldObj;
    // Check if the deleted account was the saved cashback address
    const savedAddress = await getSavedCashbackAddress();
    if (savedAddress === deletedAccount.address) {
      await deleteCashbackAddress();
      await notifyWalletAddressUpdate(null);
    }
  }
);

bringInitBackground({
  identifier: '9FaJTDcBCb48wkWKveRBg61jxfhvtg0V2iazjnA5',
  apiEndpoint: IS_DEVELOPMENT ? 'sandbox' : 'prod',
  isEnabledByDefault: true,
});
