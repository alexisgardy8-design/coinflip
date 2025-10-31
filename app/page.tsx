"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
// import { useQuickAuth } from "@coinbase/onchainkit/minikit";
import styles from "./page.module.css";
import { COUNTER_ADDRESS, COUNTER_ABI } from "./contract";
import { useWriteContract, usePublicClient } from "wagmi";
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
  const [betId, setBetId] = useState<bigint | null>(null);
  const [step, setStep] = useState<"idle" | "placing" | "vrf" | "done">("idle");
  const [lastTxHash, setLastTxHash] = useState<string>("");
  const [betResult, setBetResult] = useState<{ settled: boolean; didWin: boolean } | null>(null);
  const [pendingWinnings, setPendingWinnings] = useState<bigint>(BigInt(0));
  const [isCheckingResult, setIsCheckingResult] = useState(false);
  const [fundAmount, setFundAmount] = useState<string>("");
  const [contractBalance, setContractBalance] = useState<bigint>(BigInt(0));

  const { data: txHash, isPending, writeContractAsync, error: writeError, reset } = useWriteContract();
  const publicClient = usePublicClient();

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
  }, [setMiniAppReady, isMiniAppReady]);

  useEffect(() => {
    // Charger le solde du contrat au montage
    const loadContractBalance = async () => {
      if (publicClient) {
        try {
          const balance = await publicClient.readContract({
            address: COUNTER_ADDRESS,
            abi: COUNTER_ABI as Abi,
            functionName: "getContractBalance"
          }) as bigint;
          setContractBalance(balance);
        } catch (e) {
          console.error("Error loading contract balance:", e);
        }
      }
    };
    loadContractBalance();
  }, [publicClient]);

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
      setStep("placing");

      // L'utilisateur entre le montant total à envoyer
      // 98% → mise nette, 2% → frais (envoyés après settlement)
      const amountWei = parseEther(amount as `${number}`);
      
      const picked = choice === "heads"; // true=heads, false=tails

      // Étape 1: placeBet (98% pour le pari, 2% gardés pour frais après settlement)
      const betHash = await writeContractAsync({
        address: COUNTER_ADDRESS,
        abi: COUNTER_ABI as Abi,
        functionName: "placeBet",
        args: [picked],
        value: amountWei  // Total (98% pari + 2% frais)
      });
      setLastTxHash(betHash);

      // Attendre la confirmation et récupérer le betId
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: betHash });
        if (receipt.status !== "success") {
          console.warn("Bet tx failed");
          setStep("idle");
          return;
        }

        // Récupérer betId depuis nextBetId - 1
        const nextBetIdFromContract = await publicClient.readContract({
          address: COUNTER_ADDRESS,
          abi: COUNTER_ABI as Abi,
          functionName: "nextBetId"
        }) as bigint;
        
        const currentBetId = nextBetIdFromContract - BigInt(1);
        setBetId(currentBetId);
      }

      // Étape 2: requestFlipResult (déclenche le VRF)
      setStep("vrf");
      const currentBetId = betId || (await publicClient?.readContract({
        address: COUNTER_ADDRESS,
        abi: COUNTER_ABI as Abi,
        functionName: "nextBetId"
      }) as bigint) - BigInt(1);

      const vrfHash = await writeContractAsync({
        address: COUNTER_ADDRESS,
        abi: COUNTER_ABI as Abi,
        functionName: "requestFlipResult",
        args: [currentBetId]
      });
      setLastTxHash(vrfHash);

      if (publicClient) {
        const vrfReceipt = await publicClient.waitForTransactionReceipt({ hash: vrfHash });
        if (vrfReceipt.status === "success") {
          setStep("done");
          // Commencer à vérifier le résultat du pari périodiquement
          checkBetResult(currentBetId);
        } else {
          console.warn("VRF request tx failed");
          setStep("idle");
        }
      }

    } catch (e) {
      console.error("placeBet error:", e);
      setStep("idle");
    }
  };

  const checkBetResult = async (checkBetId: bigint) => {
    if (!publicClient) return;
    setIsCheckingResult(true);
    
    try {
      // Vérifier le statut du pari
      const flip = await publicClient.readContract({
        address: COUNTER_ADDRESS,
        abi: COUNTER_ABI as Abi,
        functionName: "flips",
        args: [checkBetId]
      }) as [string, boolean, bigint, bigint, boolean, boolean]; // [player, choice, betNet, fee, settled, didWin]

      const [player, , , , settled, didWin] = flip;
      
      if (settled) {
        setBetResult({ settled, didWin });
        
        // Si gagné, vérifier les gains en attente
        if (didWin && publicClient) {
          const winnings = await publicClient.readContract({
            address: COUNTER_ADDRESS,
            abi: COUNTER_ABI as Abi,
            functionName: "pendingWinnings",
            args: [player]
          }) as bigint;
          
          setPendingWinnings(winnings);
        }
        
        // Après le settlement (win ou lose), appeler forwardFee pour envoyer les 2%
        try {
          const feeHash = await writeContractAsync({
            address: COUNTER_ADDRESS,
            abi: COUNTER_ABI as Abi,
            functionName: "forwardFee",
            args: [player]
          });
          console.log("Fees forwarded:", feeHash);
        } catch (feeError) {
          console.error("Error forwarding fees:", feeError);
          // Ne pas bloquer si l'envoi des frais échoue
        }
        
        setIsCheckingResult(false);
      } else {
        // Pas encore résolu, réessayer dans 5 secondes
        setTimeout(() => checkBetResult(checkBetId), 5000);
      }
    } catch (e) {
      console.error("Error checking bet result:", e);
      setIsCheckingResult(false);
    }
  };

  const onClaimPayout = async () => {
    if (!publicClient) return;
    
    try {
      const payoutHash = await writeContractAsync({
        address: COUNTER_ADDRESS,
        abi: COUNTER_ABI as Abi,
        functionName: "getPayout",
        args: []
      });
      setLastTxHash(payoutHash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: payoutHash });
      if (receipt.status === "success") {
        setPendingWinnings(BigInt(0));
        alert("Payout claimed successfully! 🎉");
      }
    } catch (e) {
      console.error("Payout error:", e);
    }
  };

  const onFundContract = async () => {
    if (!publicClient) return;
    const amount = fundAmount?.trim();
    if (!amount) return;
    
    try {
      const fundHash = await writeContractAsync({
        address: COUNTER_ADDRESS,
        abi: COUNTER_ABI as Abi,
        functionName: "fundContract",
        args: [],
        value: parseEther(amount as `${number}`)
      });
      setLastTxHash(fundHash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: fundHash });
      if (receipt.status === "success") {
        // Recharger le solde du contrat
        const balance = await publicClient.readContract({
          address: COUNTER_ADDRESS,
          abi: COUNTER_ABI as Abi,
          functionName: "getContractBalance"
        }) as bigint;
        setContractBalance(balance);
        setFundAmount("");
        alert("Contract funded successfully! 💰");
      }
    } catch (e) {
      console.error("Fund contract error:", e);
    }
  };

  // Calcul de la mise nette et des frais
  const netBetText = (() => {
    if (!betAmount) return null;
    const amountNum = Number(betAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
    const netBet = amountNum * 0.98; // 98% pour la mise nette
    return netBet.toLocaleString(undefined, { maximumFractionDigits: 6 });
  })();
  
  const feeText = (() => {
    if (!betAmount) return null;
    const amountNum = Number(betAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
    const fee = amountNum * 0.02; // 2% de frais (envoyés après settlement)
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
          <div style={{ marginTop: 12, fontSize: 14, color: "#9dd1ff" }}>
            Contract Balance: {(Number(contractBalance) / 1e18).toFixed(4)} ETH
          </div>
        </div>

        {/* Fund Contract Section */}
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
          <h2 style={{ margin: 0, marginBottom: 12, fontSize: 18 }}>Fund Contract 💰</h2>
          <p style={{ fontSize: 13, color: "#cfe8ff", marginBottom: 12 }}>
            Add ETH to the contract to pay winners
          </p>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Amount in ETH"
            value={fundAmount}
            onChange={(e) => setFundAmount(e.target.value)}
            style={{
              width: "100%",
              height: 44,
              borderRadius: 8,
              border: "1px solid #12406a",
              background: "#0e355b",
              color: "#fff",
              padding: "0 12px",
              outline: "none",
              marginBottom: 12,
            }}
          />
          <button
            onClick={onFundContract}
            disabled={isPending || !fundAmount}
            style={{
              width: "100%",
              height: 44,
              borderRadius: 8,
              border: "1px solid #12406a",
              background: (isPending || !fundAmount) ? "#0e355b" : "#1a7a3e",
              color: "#fff",
              fontWeight: 700,
              cursor: (isPending || !fundAmount) ? "not-allowed" : "pointer",
            }}
          >
            {isPending ? "Funding..." : "Fund Contract"}
          </button>
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
            disabled={isPending || !betAmount || !choice || step !== "idle"}
            style={{
              width: "100%",
              height: 44,
              marginTop: 12,
              borderRadius: 8,
              border: "1px solid #12406a",
              background: (isPending || step !== "idle") ? "#0e355b" : "#12406a",
              color: "#fff",
              fontWeight: 700,
              cursor: (isPending || step !== "idle") ? "not-allowed" : "pointer",
            }}
          >
            {step === "placing" && "1/2 Placing bet…"}
            {step === "vrf" && "2/2 Requesting result…"}
            {step === "done" && "Bet complete! ✔"}
            {step === "idle" && `Place Bet ${choice ? `(${choice})` : ""}`}
          </button>

          {netBetText && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#9dd1ff" }}>
              Net bet: {netBetText} ETH (98%)
            </div>
          )}
          
          {feeText && (
            <div style={{ marginTop: 4, fontSize: 12, color: "#cfe8ff" }}>
              Fees (sent after result): {feeText} ETH (2%)
            </div>
          )}

          {betId && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#9dd1ff" }}>
              Bet ID: {betId.toString()}
            </div>
          )}

          {(lastTxHash || writeError) && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              {lastTxHash && (
                <div style={{ marginBottom: 6 }}>
                  Last tx: {lastTxHash.substring(0, 10)}…
                  {" "}
                  <a
                    href={`https://sepolia.basescan.org/tx/${lastTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#9dd1ff" }}
                  >
                    View
                  </a>
                </div>
              )}
              {writeError && (
                <div style={{ color: "#ffb4b4" }}>Error: {writeError.message}</div>
              )}
            </div>
          )}

          {step === "done" && betId && !betResult && (
            <div style={{ marginTop: 16, padding: 12, background: "#0e355b", borderRadius: 8 }}>
              <div style={{ fontSize: 13, marginBottom: 8, color: "#9dd1ff" }}>
                ⏳ Waiting for Chainlink VRF to settle your bet...
              </div>
              <div style={{ fontSize: 12, color: "#cfe8ff", marginBottom: 8 }}>
                This may take 1-2 minutes. Check back soon!
              </div>
              {isCheckingResult && (
                <div style={{ fontSize: 12, color: "#cfe8ff", marginTop: 8 }}>
                  🔄 Checking result...
                </div>
              )}
            </div>
          )}

          {betResult && betResult.settled && (
            <div style={{ 
              marginTop: 16, 
              padding: 12, 
              background: betResult.didWin ? "#0e4d2b" : "#4d0e0e", 
              borderRadius: 8,
              border: betResult.didWin ? "1px solid #1a7a3e" : "1px solid #7a1a1a"
            }}>
              <div style={{ fontSize: 16, marginBottom: 8, fontWeight: 700 }}>
                {betResult.didWin ? "🎉 YOU WON!" : "😔 You Lost"}
              </div>
              <div style={{ fontSize: 13, color: "#cfe8ff", marginBottom: 8 }}>
                {betResult.didWin 
                  ? `Congratulations! You can claim your winnings.`
                  : `Better luck next time!`
                }
              </div>
              
              {betResult.didWin && pendingWinnings > BigInt(0) && (
                <>
                  <div style={{ fontSize: 14, marginBottom: 8, color: "#9dd1ff" }}>
                    Pending winnings: {(Number(pendingWinnings) / 1e18).toFixed(4)} ETH
                  </div>
                  <button
                    onClick={onClaimPayout}
                    disabled={isPending}
                    style={{
                      width: "100%",
                      height: 40,
                      borderRadius: 6,
                      border: "1px solid #1a7a3e",
                      background: "#1a7a3e",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: isPending ? "not-allowed" : "pointer",
                      marginBottom: 8,
                    }}
                  >
                    {isPending ? "Claiming..." : "Claim Payout 💰"}
                  </button>
                </>
              )}
              
              <button
                onClick={() => {
                  setStep("idle");
                  setBetId(null);
                  setLastTxHash("");
                  setBetAmount("");
                  setChoice(null);
                  setBetResult(null);
                  setPendingWinnings(BigInt(0));
                  reset();
                }}
                style={{
                  width: "100%",
                  height: 36,
                  borderRadius: 6,
                  border: "1px solid #12406a",
                  background: "#12406a",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Place Another Bet
              </button>
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
