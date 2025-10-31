"use client";
import { useEffect, useState } from "react";
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
  const [betResult, setBetResult] = useState<{ settled: boolean; didWin: boolean; result: string } | null>(null);
  const [pendingWinnings, setPendingWinnings] = useState<bigint>(BigInt(0));
  const [isCheckingResult, setIsCheckingResult] = useState(false);
  const [checkAttempts, setCheckAttempts] = useState(0);

  const { data: txHash, isPending, writeContractAsync, error: writeError, reset } = useWriteContract();
  const publicClient = usePublicClient();

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
    
    // ✅ VALIDATION: MIN_BET et MAX_BET
    const amountNum = parseFloat(amount);
    if (amountNum < 0.001) {
      alert("Minimum bet is 0.001 ETH");
      return;
    }
    if (amountNum > 1) {
      alert("Maximum bet is 1 ETH");
      return;
    }
    
    try {
      // Reset previous state if any
      if (txHash || writeError) reset();
      setStep("placing");
      setCheckAttempts(0);

      // L'utilisateur entre un montant, on envoie seulement 98% (2% = frais de support)
      const desiredAmountWei = parseEther(amount as `${number}`);
      const actualBetWei = (desiredAmountWei * BigInt(98)) / BigInt(100); // 98% du montant
      
      const picked = choice === "heads"; // true=heads, false=tails

      // Étape 1: placeBet (enregistre le pari avec 98% du montant)
      const betHash = await writeContractAsync({
        address: COUNTER_ADDRESS,
        abi: COUNTER_ABI as Abi,
        functionName: "placeBet",
        args: [picked],
        value: actualBetWei  // 98% du montant entré par l'utilisateur
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
        
        // Étape 2: requestFlipResult (déclenche le VRF)
        setStep("vrf");
        
        const vrfHash = await writeContractAsync({
          address: COUNTER_ADDRESS,
          abi: COUNTER_ABI as Abi,
          functionName: "requestFlipResult",
          args: [currentBetId]
        });
        setLastTxHash(vrfHash);

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

  const checkBetResult = async (checkBetId: bigint, attempt: number = 0) => {
    if (!publicClient) return;
    
    // Timeout après 24 tentatives (2 minutes à 5s par tentative)
    const MAX_ATTEMPTS = 24;
    
    if (attempt >= MAX_ATTEMPTS) {
      console.warn("VRF timeout - max attempts reached");
      setIsCheckingResult(false);
      // Garder step="done" pour afficher les options de retry
      // Permettre à l'utilisateur de réessayer manuellement
      return;
    }
    
    setIsCheckingResult(true);
    setCheckAttempts(attempt + 1);
    
    try {
      // Vérifier le statut du pari
      const flip = await publicClient.readContract({
        address: COUNTER_ADDRESS,
        abi: COUNTER_ABI as Abi,
        functionName: "flips",
        args: [checkBetId]
      }) as [string, boolean, bigint, boolean, boolean]; // [player, choice, betNet, settled, didWin]

      const [player, choice, , settled, didWin] = flip;
      
      console.log("Checking bet result:", { 
        betId: checkBetId.toString(), 
        attempt: attempt + 1, 
        settled, 
        didWin, 
        choice,
        player 
      });
      
      if (settled) {
        // Récupérer le résultat VRF pour l'afficher
        const result = choice ? "Heads" : "Tails"; // choice du joueur
        
        // Le résultat réel du VRF est l'inverse si le joueur a perdu, sinon pareil
        const vrfResult = didWin ? result : (choice ? "Tails" : "Heads");
        
        console.log("Bet settled! Result:", vrfResult, "Win:", didWin);
        
        setBetResult({ settled, didWin, result: vrfResult });
        
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
        
        setIsCheckingResult(false);
        setCheckAttempts(0);
      } else {
        // Pas encore résolu, réessayer dans 5 secondes
        console.log("Bet not settled yet, retrying in 5s...");
        setTimeout(() => checkBetResult(checkBetId, attempt + 1), 5000);
      }
    } catch (e) {
      console.error("Error checking bet result:", e);
      setIsCheckingResult(false);
      setCheckAttempts(0);
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

  // Calculs pour affichage
  const actualBetText = (() => {
    if (!betAmount) return null;
    const amountNum = Number(betAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
    const actualBet = amountNum * 0.98; // 98% envoyé au contrat
    return actualBet.toLocaleString(undefined, { maximumFractionDigits: 6 });
  })();

  const feeText = (() => {
    if (!betAmount) return null;
    const amountNum = Number(betAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
    const fee = amountNum * 0.02; // 2% de frais de support
    return fee.toLocaleString(undefined, { maximumFractionDigits: 6 });
  })();

  const potentialWinText = (() => {
    if (!betAmount) return null;
    const amountNum = Number(betAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
    const actualBet = amountNum * 0.98; // 98% du montant
    const potentialWin = actualBet * 2; // Gain = 2x le montant envoyé
    return potentialWin.toLocaleString(undefined, { maximumFractionDigits: 6 });
  })();

  return (
    <div className={styles.container}>
      <header className={styles.headerWrapper}>
        <Wallet />
      </header>

      <div className={styles.content}>
        {/* Header avec titre personnalisé */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 64, marginBottom: 8 }}>🪙</div>
          <h1 style={{ 
            fontSize: 36, 
            fontWeight: 800, 
            margin: 0, 
            marginBottom: 8,
            background: "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text"
          }}>
            Coin Flip
          </h1>
          <p style={{ fontSize: 14, color: "#9ca3af", margin: 0 }}>
            Provably fair • Powered by Chainlink VRF
          </p>
        </div>

        <div style={{
          marginTop: 16,
          marginBottom: 24,
          width: "100%",
          maxWidth: 420,
          border: "1px solid #2d1b4e",
          borderRadius: 16,
          padding: 24,
          background: "linear-gradient(135deg, #1a1032 0%, #2d1b4e 100%)",
          color: "#fff",
          boxShadow: "0 8px 32px rgba(139, 92, 246, 0.15)",
        }}>
          <h2 style={{ margin: 0, marginBottom: 20, fontSize: 22, fontWeight: 700, textAlign: "center" }}>
            Place Your Bet 🎲
          </h2>
          <label style={{ display: "block", fontSize: 14, marginBottom: 8, color: "#d1d5db", fontWeight: 500 }}>
            Bet Amount (ETH)
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.001"
            placeholder="0.0012"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 10,
              border: "2px solid #4c1d95",
              background: "#0f0820",
              color: "#fff",
              padding: "0 16px",
              outline: "none",
              fontSize: 16,
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#8b5cf6";
              e.target.style.boxShadow = "0 0 0 3px rgba(139, 92, 246, 0.1)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#4c1d95";
              e.target.style.boxShadow = "none";
            }}
          />
          
          <div style={{ marginTop: 20, marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 14, color: "#d1d5db", fontWeight: 500, marginBottom: 12 }}>
              Choose Your Side
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => onSelect("heads")}
                style={{
                  flex: 1,
                  height: 56,
                  borderRadius: 12,
                  border: choice === "heads" ? "2px solid #FFD700" : "2px solid #4c1d95",
                  background: choice === "heads" 
                    ? "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)" 
                    : "#1a1032",
                  color: choice === "heads" ? "#000" : "#fff",
                  fontWeight: 700,
                  fontSize: 16,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: choice === "heads" ? "0 4px 16px rgba(255, 215, 0, 0.4)" : "none",
                }}
                onMouseEnter={(e) => {
                  if (choice !== "heads") {
                    e.currentTarget.style.background = "#2d1b4e";
                    e.currentTarget.style.borderColor = "#8b5cf6";
                  }
                }}
                onMouseLeave={(e) => {
                  if (choice !== "heads") {
                    e.currentTarget.style.background = "#1a1032";
                    e.currentTarget.style.borderColor = "#4c1d95";
                  }
                }}
              >
                👑 Heads
              </button>
              <button
                onClick={() => onSelect("tails")}
                style={{
                  flex: 1,
                  height: 56,
                  borderRadius: 12,
                  border: choice === "tails" ? "2px solid #FFD700" : "2px solid #4c1d95",
                  background: choice === "tails" 
                    ? "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)" 
                    : "#1a1032",
                  color: choice === "tails" ? "#000" : "#fff",
                  fontWeight: 700,
                  fontSize: 16,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: choice === "tails" ? "0 4px 16px rgba(255, 215, 0, 0.4)" : "none",
                }}
                onMouseEnter={(e) => {
                  if (choice !== "tails") {
                    e.currentTarget.style.background = "#2d1b4e";
                    e.currentTarget.style.borderColor = "#8b5cf6";
                  }
                }}
                onMouseLeave={(e) => {
                  if (choice !== "tails") {
                    e.currentTarget.style.background = "#1a1032";
                    e.currentTarget.style.borderColor = "#4c1d95";
                  }
                }}
              >
                🔄 Tails
              </button>
            </div>
          </div>

          <button
            onClick={onPlaceBet}
            disabled={isPending || !betAmount || !choice || step !== "idle"}
            style={{
              width: "100%",
              height: 52,
              marginTop: 20,
              borderRadius: 12,
              border: "none",
              background: (isPending || step !== "idle") 
                ? "#4c1d95" 
                : "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
              cursor: (isPending || step !== "idle") ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              boxShadow: (isPending || step !== "idle") 
                ? "none" 
                : "0 4px 16px rgba(139, 92, 246, 0.4)",
            }}
            onMouseEnter={(e) => {
              if (step === "idle" && !isPending && betAmount && choice) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 24px rgba(139, 92, 246, 0.5)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = (isPending || step !== "idle") 
                ? "none" 
                : "0 4px 16px rgba(139, 92, 246, 0.4)";
            }}
          >
            {step === "placing" && "1/2 Placing bet…"}
            {step === "vrf" && "2/2 Requesting result…"}
            {step === "done" && "Bet complete! ✔"}
            {step === "idle" && `🎲 Place Bet ${choice ? `(${choice})` : ""}`}
          </button>

          {actualBetText && (
            <div style={{ 
              marginTop: 16, 
              padding: 12, 
              background: "#0f0820", 
              borderRadius: 8,
              border: "1px solid #4c1d95"
            }}>
              <div style={{ fontSize: 12, color: "#a78bfa", marginBottom: 4 }}>
                💰 Net bet: {actualBetText} ETH (98%)
              </div>
              <div style={{ fontSize: 12, color: "#fbbf24", marginBottom: 4 }}>
                ⚡ Support fee: {feeText} ETH (2%)
              </div>
              {potentialWinText && (
                <div style={{ fontSize: 13, color: "#10b981", fontWeight: 600, marginTop: 8 }}>
                  🎯 Potential win: {potentialWinText} ETH
                </div>
              )}
            </div>
          )}

          {betId && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#a78bfa", textAlign: "center" }}>
              Bet ID: {betId.toString()}
            </div>
          )}

          {(lastTxHash || writeError) && (
            <div style={{ marginTop: 12, fontSize: 12 }}>
              {lastTxHash && (
                <div style={{ 
                  marginBottom: 6, 
                  padding: 8, 
                  background: "#0f0820", 
                  borderRadius: 6,
                  textAlign: "center"
                }}>
                  <span style={{ color: "#a78bfa" }}>Tx: {lastTxHash.substring(0, 10)}…</span>
                  {" "}
                  <a
                    href={`https://sepolia.basescan.org/tx/${lastTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#8b5cf6", textDecoration: "underline" }}
                  >
                    View
                  </a>
                </div>
              )}
              {writeError && (
                <div style={{ 
                  color: "#ef4444", 
                  background: "#fef2f2", 
                  padding: 12, 
                  borderRadius: 8,
                  border: "1px solid #fecaca"
                }}>
                  ⚠️ {writeError.message}
                </div>
              )}
            </div>
          )}

          {step === "done" && betId && !betResult && (
            <div style={{ 
              marginTop: 16, 
              padding: 16, 
              background: "#0f0820", 
              borderRadius: 12,
              border: "1px solid #4c1d95",
              textAlign: "center"
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔮</div>
              <div style={{ fontSize: 14, marginBottom: 8, color: "#a78bfa", fontWeight: 600 }}>
                ⏳ Waiting for Chainlink VRF...
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
                This may take 1-2 minutes. The coin is flipping! 🪙
              </div>
              {isCheckingResult && (
                <div style={{ fontSize: 12, color: "#8b5cf6", marginTop: 8 }}>
                  🔄 Checking result... (Attempt {checkAttempts}/24)
                </div>
              )}
              {checkAttempts >= 24 && !isCheckingResult && (
                <>
                  <div style={{ 
                    fontSize: 13, 
                    color: "#fbbf24", 
                    marginTop: 12,
                    padding: 12,
                    background: "rgba(251, 191, 36, 0.1)",
                    borderRadius: 8,
                    border: "1px solid rgba(251, 191, 36, 0.3)"
                  }}>
                    ⚠️ VRF taking longer than expected. Check back later or try manually.
                  </div>
                  <button
                    onClick={() => {
                      if (betId) {
                        setCheckAttempts(0);
                        checkBetResult(betId, 0);
                      }
                    }}
                    style={{
                      marginTop: 12,
                      width: "100%",
                      height: 40,
                      borderRadius: 8,
                      border: "2px solid #8b5cf6",
                      background: "rgba(139, 92, 246, 0.1)",
                      color: "#8b5cf6",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(139, 92, 246, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(139, 92, 246, 0.1)";
                    }}
                  >
                    🔄 Check Result Again
                  </button>
                  <button
                    onClick={() => {
                      // Permettre nouveau bet
                      setStep("idle");
                      setBetId(null);
                      setLastTxHash("");
                      setBetAmount("");
                      setChoice(null);
                      setBetResult(null);
                      setPendingWinnings(BigInt(0));
                      setIsCheckingResult(false);
                      setCheckAttempts(0);
                      reset();
                    }}
                    style={{
                      marginTop: 8,
                      width: "100%",
                      height: 40,
                      borderRadius: 8,
                      border: "2px solid #ef4444",
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "#ef4444",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                    }}
                  >
                    ❌ Cancel & Place New Bet
                  </button>
                </>
              )}
            </div>
          )}

          {betResult && betResult.settled && (
            <div style={{ 
              marginTop: 16, 
              padding: 20, 
              background: betResult.didWin 
                ? "linear-gradient(135deg, #064e3b 0%, #065f46 100%)" 
                : "linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)", 
              borderRadius: 12,
              border: betResult.didWin ? "2px solid #10b981" : "2px solid #ef4444",
              boxShadow: betResult.didWin 
                ? "0 8px 32px rgba(16, 185, 129, 0.3)" 
                : "0 8px 32px rgba(239, 68, 68, 0.3)",
              textAlign: "center"
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>
                {betResult.didWin ? "🎉" : "😔"}
              </div>
              <div style={{ fontSize: 24, marginBottom: 12, fontWeight: 800, color: "#fff" }}>
                {betResult.didWin ? "YOU WON!" : "YOU LOST"}
              </div>
              <div style={{ fontSize: 16, color: "#fbbf24", marginBottom: 12, fontWeight: 600 }}>
                🪙 Result: {betResult.result}
              </div>
              <div style={{ fontSize: 13, color: "#e5e7eb", marginBottom: 16 }}>
                {betResult.didWin 
                  ? `The coin landed on ${betResult.result}! 🎊`
                  : `The coin landed on ${betResult.result}. Try again!`
                }
              </div>
              
              {betResult.didWin && pendingWinnings > BigInt(0) && (
                <>
                  <div style={{ 
                    fontSize: 18, 
                    marginBottom: 16, 
                    color: "#fbbf24",
                    fontWeight: 700,
                    padding: 12,
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: 8
                  }}>
                    💰 Winnings: {(Number(pendingWinnings) / 1e18).toFixed(4)} ETH
                  </div>
                  <button
                    onClick={onClaimPayout}
                    disabled={isPending}
                    style={{
                      width: "100%",
                      height: 48,
                      borderRadius: 10,
                      border: "none",
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 16,
                      cursor: isPending ? "not-allowed" : "pointer",
                      marginBottom: 12,
                      transition: "all 0.2s ease",
                      boxShadow: "0 4px 16px rgba(16, 185, 129, 0.4)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isPending) {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 6px 24px rgba(16, 185, 129, 0.5)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 4px 16px rgba(16, 185, 129, 0.4)";
                    }}
                  >
                    {isPending ? "Claiming..." : "💸 Claim Winnings"}
                  </button>
                </>
              )}
              
              <button
                onClick={() => {
                  // Reset complet de tous les états
                  setStep("idle");
                  setBetId(null);
                  setLastTxHash("");
                  setBetAmount("");
                  setChoice(null);
                  setBetResult(null);
                  setPendingWinnings(BigInt(0));
                  setIsCheckingResult(false);
                  setCheckAttempts(0);
                  reset();
                }}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 10,
                  border: "2px solid rgba(255,255,255,0.3)",
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
              >
                🎲 Place Another Bet
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
