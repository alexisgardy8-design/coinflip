"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
// import { useQuickAuth } from "@coinbase/onchainkit/minikit";
import styles from "./page.module.css";
import { COUNTER_ADDRESS } from "./contract";

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

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
  }, [setMiniAppReady, isMiniAppReady]);

  const onSelect = (choice: "heads" | "tails") => {
    console.log("Selected:", choice, "Amount (ETH):", betAmount);
  };

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
