'use client';
import { useCallback, useMemo, useState } from 'react';
import { Avatar, Name } from '@coinbase/onchainkit/identity';
import { 
  Transaction, 
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
} from '@coinbase/onchainkit/transaction'; 
import type { LifecycleStatus } from '@coinbase/onchainkit/transaction';
import { Wallet, ConnectWallet } from '@coinbase/onchainkit/wallet';
import { useAccount } from 'wagmi';
import { encodeFunctionData, parseEther } from 'viem';

// ---cut-start---
const BASE_SEPOLIA_CHAIN_ID = 84532;
const COUNTER_ADDRESS: `0x${string}` = "0x14805a57fC436F390a644fb9897162adD0c36905";

// ABI minimale pour placeBet(bool) payable
const counterAbi = [
  {
    type: 'function',
    name: 'placeBet',
    stateMutability: 'payable',
    inputs: [{ name: 'choice', type: 'bool' }],
    outputs: [],
  },
] as const;
// ---cut-end---

export default function TransactionComponents() {
  const { address } = useAccount();

  // UI simple: montant en ETH + choix
  const [amountEth, setAmountEth] = useState('0.01');
  const [choice, setChoice] = useState<boolean | null>(null);

  const calls = useMemo(() => {
    if (!COUNTER_ADDRESS || choice === null) return [];
    const data = encodeFunctionData({
      abi: counterAbi,
      functionName: 'placeBet',
      args: [choice],
    });
    const value = parseEther(amountEth || '0');
    return [{ to: COUNTER_ADDRESS, data, value }];
  }, [amountEth, choice]);

  const handleOnStatus = useCallback((status: LifecycleStatus) => {
    console.log('LifecycleStatus', status);
  }, []);

  return (
    <div style={{ maxWidth: 520, margin: '24px auto', display: 'grid', gap: 16 }}>
      {/* Wallet connect always visible at the top */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Wallet>
          <ConnectWallet>
            <Avatar className='h-6 w-6' />
            <Name />
          </ConnectWallet>
        </Wallet>
      </div>

      {address ? (
        <>
      <label style={{ fontSize: 14 }}>Bet amount (ETH)</label>
      <input
        value={amountEth}
        onChange={(e) => setAmountEth(e.target.value)}
        inputMode="decimal"
        placeholder="0.01"
        style={{ padding: 10, border: '1px solid #12406a', borderRadius: 8 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setChoice(true)}
          style={{ flex: 1, background: '#0b2e50', color: '#fff', border: '1px solid #12406a', borderRadius: 8, padding: 10 }}
        >
          Heads
        </button>
        <button
          onClick={() => setChoice(false)}
          style={{ flex: 1, background: '#0b2e50', color: '#fff', border: '1px solid #12406a', borderRadius: 8, padding: 10 }}
        >
          Tails
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#cfe8ff' }}>Transaction: Place Bet</div>
      <Transaction chainId={BASE_SEPOLIA_CHAIN_ID} calls={calls} onStatus={handleOnStatus}>
        <TransactionButton />
        <TransactionSponsor />
        <TransactionStatus>
          <TransactionStatusLabel />
          <TransactionStatusAction />
        </TransactionStatus>
      </Transaction>
        </>
      ) : (
        <div style={{ color: '#666', fontSize: 14 }}>Connect your wallet to place a bet.</div>
      )}
    </div>
  );
}