"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
// import { useQuickAuth } from "@coinbase/onchainkit/minikit";
import styles from "./page.module.css";
import { COUNTER_ADDRESS, COUNTER_ABI } from "./contract";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { Abi, parseEther } from "viem";


export default function Home() {
  // If you need to verify the user's identity, you can use the useQuickAuth hook.
  // This hook will verify the user's signature and return the user's FID. You can update
  // this to meet your needs. See the /app/api/auth/route.ts file for more details.
  // Note: If you don't need to verify the user's identity, you can get their FID and other user data
  // via `useMiniKit().context?.user`.
  // const { data, isLoading, error } = useQuickAuth<{
  //   userFid: string;
  // }>("/api/auth");

  const { setMiniAppReady, isMiniAppReady } = useMiniKit();

  const [betAmount, setBetAmount] = useState<string>("");
  const [choice, setChoice] = useState<"heads" | "tails" | null>(null);

  const { data: txHash, isPending, writeContract, writeContractAsync, error: writeError, reset } = useWriteContract();
  const publicClient = usePublicClient();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
  }, [setMiniAppReady, isMiniAppReady]);

  const onSelect = (c: "heads" | "tails") => {
    setChoice(c);
    console.log("Selected:", c, "Amount (ETH):", betAmount);
  };

  const onPlaceBet = async () => {
    if (!choice) return;
    const amount = betAmount?.trim();
    if (!amount) return;
    try {
      // Reset previous state if any
      if (txHash || writeError) reset();

      const totalWei = parseEther(amount as `${number}`);
      const feeWei = (totalWei * BigInt(2)) / BigInt(100); // 2%
      const netWei = totalWei - feeWei;      // montant net pour le pari
      const picked = choice === "heads"; // true=heads, false=tails

      // 1) Transaction de pari (value = net)
      const betHash = await writeContractAsync({
        address: COUNTER_ADDRESS,
        abi: COUNTER_ABI as Abi,
        functionName: "placeBet",
        args: [picked],
        value: netWei,
      });

      // Attendre la confirmation du pari avant d'envoyer les frais
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: betHash });
        if (receipt.status !== "success") {
          console.warn("Bet tx did not succeed; skipping fee forwarding.");
          return;
        }
      }

      // 2) Transaction des frais (value = fee) : le contrat renvoie immédiatement vers feeRecipient
      await writeContractAsync({
        address: COUNTER_ADDRESS,
        abi: COUNTER_ABI as Abi,
        functionName: "forwardFee",
        args: [],
        value: feeWei,
      });
    } catch (e) {
      console.error("placeBet error:", e);
    }
  };

  // 2% of the entered bet in ETH (display only)
  const feeText = (() => {
    if (!betAmount) return null;
    const amountNum = Number(betAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
    const fee = amountNum * 0.02; // 2% of bet in ETH
    return fee.toLocaleString(undefined, { maximumFractionDigits: 6 });
  })();

  return (
    <div className={styles.container}>
      <header className={styles.headerWrapper}>
        <Wallet />
      </header>

      <div className={styles.content}>
        <Image
          priority
          src="/sphere.svg"
          alt="Sphere"
          width={200}
          height={200}
        />
        <h1 className={styles.title}>MiniKit</h1>

        <p>
          Get started by editing <code>app/page.tsx</code>
        </p>

        <div style={{ marginTop: 16, marginBottom: 24, textAlign: "center" }}>
          <p style={{ marginBottom: 8 }}>
            Contract address:
          </p>
          <p style={{ wordBreak: "break-all", marginBottom: 8 }}>
            <code>{COUNTER_ADDRESS}</code>
          </p>
          <a
            target="_blank"
            rel="noreferrer"
            href={`https://sepolia.basescan.org/address/${COUNTER_ADDRESS}`}
          >
            View on Basescan (Base Sepolia)
          </a>
        </div>

        <div style={{
          marginTop: 16,
          marginBottom: 24,
          width: "100%",
          maxWidth: 420,
          border: "1px solid #12406a",
          borderRadius: 12,
          padding: 16,
          background: "#0b2e50",
          color: "#fff",
        }}>
          <h2 style={{ margin: 0, marginBottom: 12, fontSize: 20 }}>Place your bet</h2>
          <label style={{ display: "block", fontSize: 14, opacity: 0.9, marginBottom: 8, color: "#fff" }}>
            Bet amount (ETH)
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.001"
            placeholder="0.001"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            style={{
              width: "100%",
              height: 44,
              borderRadius: 8,
              border: "1px solid #12406a",
              background: "#0e355b",
              color: "#fff",
              padding: "0 12px",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button
              onClick={() => onSelect("heads")}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 8,
                border: "1px solid #12406a",
                background: "#0b2e50",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Heads
            </button>
            <button
              onClick={() => onSelect("tails")}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 8,
                border: "1px solid #12406a",
                background: "#0b2e50",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Tails
            </button>
          </div>

          <button
            onClick={onPlaceBet}
            disabled={isPending || !betAmount || !choice}
            style={{
              width: "100%",
              height: 44,
              marginTop: 12,
              borderRadius: 8,
              border: "1px solid #12406a",
              background: isPending ? "#0e355b" : "#12406a",
              color: "#fff",
              fontWeight: 700,
              cursor: isPending ? "not-allowed" : "pointer",
            }}
          >
            {isPending ? "Sending…" : `Place Bet ${choice ? `(${choice})` : ""}`}
          </button>

          {feeText && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#cfe8ff" }}>
              2% fees on bet placed: {feeText} ETH
            </div>
          )}

          {(txHash || isConfirming || isConfirmed || writeError) && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              {txHash && (
                <div style={{ marginBottom: 6 }}>
                  Tx sent: {txHash.substring(0, 10)}…
                  {" "}
                  <a
                    href={`https://sepolia.basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#9dd1ff" }}
                  >
                    View
                  </a>
                </div>
              )}
              {isConfirming && <div>Confirming on-chain…</div>}
              {isConfirmed && <div>Confirmed ✔</div>}
              {writeError && (
                <div style={{ color: "#ffb4b4" }}>Error: {writeError.message}</div>
              )}
            </div>
          )}
        </div>

        <h2 className={styles.componentsTitle}>Explore Components</h2>

        <ul className={styles.components}>
          {[
            {
              name: "Transaction",
              url: "https://docs.base.org/onchainkit/transaction/transaction",
            },
            {
              name: "Swap",
              url: "https://docs.base.org/onchainkit/swap/swap",
            },
            {
              name: "Checkout",
              url: "https://docs.base.org/onchainkit/checkout/checkout",
            },
            {
              name: "Wallet",
              url: "https://docs.base.org/onchainkit/wallet/wallet",
            },
            {
              name: "Identity",
              url: "https://docs.base.org/onchainkit/identity/identity",
            },
          ].map((component) => (
            <li key={component.name}>
              <a target="_blank" rel="noreferrer" href={component.url}>
                {component.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
