import { cssObj } from '@fuel-ui/css';
import { Box, Button, Card, CardList, Text } from '@fuel-ui/react';
import type { Account } from '@fuel-wallet/types';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { AccountItem } from '~/systems/Account/components/AccountItem';
import { AccountService } from '~/systems/Account/services';
import { Layout, animations, coreStyles } from '~/systems/Core';

const MotionCardList = motion(CardList);

export function SelectCashbackAddress() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
    loadSavedCashbackAddress();
  }, []);

  async function loadAccounts() {
    try {
      const accountsList = await AccountService.getAccounts();
      setAccounts(accountsList);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSavedCashbackAddress() {
    try {
      chrome.runtime.sendMessage(
        { type: 'GET_CASHBACK_ADDRESS' },
        (response) => {
          if (response?.address) {
            setSelectedAddress(response.address);
          }
        }
      );
    } catch (error) {
      console.error('Error loading saved cashback address:', error);
    }
  }

  async function handleConfirm() {
    if (!selectedAddress) return;

    // Send message to background script to save the cashback address
    chrome.runtime.sendMessage(
      {
        type: 'SET_CASHBACK_ADDRESS',
        address: selectedAddress,
      },
      () => {
        // Close the window after saving
        window.close();
      }
    );
  }

  function handleCancel() {
    window.close();
  }

  return (
    <Layout title="Select Cashback Address" isLoading={isLoading} noBorder>
      <Layout.Content noBorder noScroll={false} css={styles.content}>
        <Box css={styles.header}>
          <Text fontSize="lg">Choose your cashback wallet</Text>
          <Text fontSize="sm" css={styles.description}>
            Select which address should receive cashback rewards from Bring
          </Text>
        </Box>
        <MotionCardList
          {...animations.slideInTop()}
          gap="$4"
          css={styles.accountList}
        >
          <AnimatePresence>
            <motion.div {...animations.slideInTop()}>
              <Card>
                <Card.Header space="compact">
                  <Text>Select cashback address</Text>
                </Card.Header>
                <Card.Body css={styles.accountCardBody}>
                  {accounts?.map((account) => {
                    const { address } = account;
                    const isSelected = selectedAddress === address;
                    return (
                      <Box
                        key={address}
                        css={{
                          ...styles.accountItemWrapper,
                          ...(isSelected && styles.accountItemSelected),
                        }}
                        onClick={() => setSelectedAddress(address)}
                      >
                        <AccountItem account={account} compact />
                      </Box>
                    );
                  })}
                </Card.Body>
              </Card>
            </motion.div>
          </AnimatePresence>
        </MotionCardList>
      </Layout.Content>
      <Layout.BottomBar>
        <Button variant="ghost" onPress={handleCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          intent="primary"
          onPress={handleConfirm}
          isDisabled={!selectedAddress}
        >
          Confirm
        </Button>
      </Layout.BottomBar>
    </Layout>
  );
}

const styles = {
  content: cssObj({
    display: 'flex',
    flexDirection: 'column',
    padding: '$4 $0 $4 $4 !important',
    ...coreStyles.scrollable(),
    overflowY: 'scroll !important',
  }),
  header: cssObj({
    display: 'flex',
    flexDirection: 'column',
    gap: '$2',
    mb: '$2',
  }),
  description: cssObj({
    color: '$intentsBase8',
  }),
  accountList: cssObj({
    mt: '$4',

    '.fuel_Card .fuel_Card': {
      border: 'none',
    },
  }),
  accountCardBody: cssObj({
    padding: '$0',
  }),
  accountItemWrapper: cssObj({
    cursor: 'pointer',
    borderLeft: '3px solid transparent',
    transition: 'all 0.2s',

    '&:hover': {
      backgroundColor: '$intentsBase2',
    },

    '& ~ &': {
      borderTop: '1px solid $bodyBg',
    },
  }),
  accountItemSelected: cssObj({
    borderLeftColor: '$accent11',
    backgroundColor: '$intentsBase3',
  }),
};
