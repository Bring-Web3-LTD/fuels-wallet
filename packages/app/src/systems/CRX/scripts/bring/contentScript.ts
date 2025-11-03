import { bringInitContentScript } from '@bringweb3/chrome-extension-kit';
import theme from './theme';

// Helper function to get cashback wallet address from background script
async function getCashbackWalletAddress(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_CASHBACK_ADDRESS' }, (response) => {
      if (response?.address) {
        resolve(response.address);
      } else {
        resolve(null);
      }
    });
  });
}

async function openCashbackAddressSelection(): Promise<void> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'OPEN_CASHBACK_SELECTION' }, () => {
      resolve();
    });
  });
}

async function cashbackAddressUpdateCallback(
  callback: () => void
): Promise<void> {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CASHBACK_WALLET_UPDATED') {
      callback();
    }
  });
}

bringInitContentScript({
  getWalletAddress: getCashbackWalletAddress,
  walletAddressUpdateCallback: cashbackAddressUpdateCallback,
  promptLogin: openCashbackAddressSelection,
  theme: 'dark',
  darkTheme: theme,
  text: 'upper',
  switchWallet: true,
});
