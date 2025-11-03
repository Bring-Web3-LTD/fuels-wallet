import { ContentProxyConnection } from '@fuel-wallet/connections';
import { WALLET_NAME } from '~/config';
import './bring/contentScript';

const connection = ContentProxyConnection.start(WALLET_NAME);

// Ensure cleanup when the content script is unloaded
window.addEventListener('beforeunload', () => {
  connection.destroy(false);
});
