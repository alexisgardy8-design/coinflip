"use client";
import { useEffect, useState } from "react";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
// import { useQuickAuth } from "@coinbase/onchainkit/minikit";
import styles from "./page.module.css";
import { COUNTER_ADDRESS, COUNTER_ABI } from "./contract";
import { useWriteContract, usePublicClient, useAccount } from "wagmi";
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
  const [fundAmount, setFundAmount] = useState<string>("");
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [contractBalance, setContractBalance] = useState<bigint>(BigInt(0));
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const [adminAddress, setAdminAddress] = useState<`0x${string}` | null>(null);

  const { data: txHash, isPending, writeContractAsync, error: writeError, reset } = useWriteContract();
  const publicClient = usePublicClient();
  const { address } = useAccount();

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
  }, [setMiniAppReady, isMiniAppReady]);
  
  // � Charger l'adresse admin du contrat
  useEffect(() => {
    const loadAdminAddress = async () => {
      if (!publicClient) return;
      
      try {
        const admin = await publicClient.readContract({
          address: COUNTER_ADDRESS,
          abi: COUNTER_ABI as Abi,
          functionName: "admin"
        }) as `0x${string}`;
        
        setAdminAddress(admin);
        console.log("Admin address loaded:", admin);
      } catch (e) {
        console.error("Error loading admin address:", e);
      }
    };
    
    loadAdminAddress();
  }, [publicClient]);
  
  // �🛡️ Charger le balance du contrat et le statut de pause
  useEffect(() => {
    const loadContractInfo = async () => {
      if (!publicClient) return;
      
      try {
        // 📊 Utiliser la fonction getStats pour réduire les appels RPC
        const stats = await publicClient.readContract({
          address: COUNTER_ADDRESS,
          abi: COUNTER_ABI as Abi,
          functionName: "getStats"
        }) as [bigint, bigint, boolean];
        
        const [_totalBets, balance, paused] = stats;
        setContractBalance(balance);
        setIsPaused(paused);
      } catch (e) {
        console.error("Error loading contract info:", e);
      }
    };
    
    // Charger au mount et après chaque pari/payout (pas d'interval constant)
    loadContractInfo();
  }, [publicClient, betResult]); // ⚡ Refresh seulement quand betResult change

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
    if (amountNum < 0.0032) {
      alert("Minimum bet is 0.0032 ETH (~$7.50)");
      return;
    }
    if (amountNum > 0.02) {
      alert("Maximum bet is 0.02 ETH (~$50)");
      return;
    }
    
    // 🛡️ VALIDATION: Vérifier que le contrat peut payer
    if (publicClient) {
      try {
        const desiredAmountWei = parseEther(amount as `${number}`);
        const canAccept = await publicClient.readContract({
          address: COUNTER_ADDRESS,
          abi: COUNTER_ABI as Abi,
          functionName: "canAcceptBet",
          args: [desiredAmountWei]
        }) as boolean;
        
        if (!canAccept) {
          alert("⚠️ Contract cannot accept this bet (insufficient balance or paused). Please try a smaller amount or contact admin.");
          return;
        }
      } catch (e) {
        console.error("Error checking contract balance:", e);
        alert("Unable to verify contract balance. Please try again.");
        return;
      }
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

        // 🎯 Récupérer betId depuis l'event BetPlaced dans les logs
        // L'event BetPlaced a bettor et betId comme topics indexés
        // topics[0] = event signature hash
        // topics[1] = bettor (indexed)
        // topics[2] = betId (indexed) ← C'EST CE QU'ON VEUT
        
        let currentBetId: bigint;
        const betPlacedLog = receipt.logs.find(
          (log) => {
            try {
              // Vérifier si c'est l'event BetPlaced en comparant l'adresse
              return log.address.toLowerCase() === COUNTER_ADDRESS.toLowerCase() && 
                     log.topics.length >= 3; // Au moins 3 topics (signature + 2 indexed params)
            } catch {
              return false;
            }
          }
        );
        
        if (betPlacedLog && betPlacedLog.topics[2]) {
          // betId est le 2ème topic indexé (topics[2])
          currentBetId = BigInt(betPlacedLog.topics[2]);
          console.log("✅ BetId récupéré depuis l'event:", currentBetId.toString());
        } else {
          // Fallback: lire nextBetId - 1 (moins fiable en cas de concurrence)
          console.warn("⚠️ Impossible de lire betId depuis l'event, utilisation du fallback");
          const nextBetIdFromContract = await publicClient.readContract({
            address: COUNTER_ADDRESS,
            abi: COUNTER_ABI as Abi,
            functionName: "nextBetId"
          }) as bigint;
          currentBetId = nextBetIdFromContract - BigInt(1);
        }
        
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
          setIsFlipping(true); // 🪙 Démarrer l'animation
          
          // 🎯 PRIORITÉ 1: WebSocket - Écouter l'event CoinFlipResult en temps réel
          let eventListenerActive = true;
          let unwatchFn: (() => void) | null = null;
          
          try {
            unwatchFn = publicClient.watchContractEvent({
              address: COUNTER_ADDRESS,
              abi: COUNTER_ABI as Abi,
              eventName: "CoinFlipResult",
              onLogs: async (logs) => {
                if (!eventListenerActive) return;
                
                // Vérifier tous les events pour trouver celui qui correspond à notre joueur
                for (const log of logs) {
                  try {
                    // Vérifier que c'est notre event en lisant le flip
                    const flip = await publicClient.readContract({
                      address: COUNTER_ADDRESS,
                      abi: COUNTER_ABI as Abi,
                      functionName: "flips",
                      args: [currentBetId]
                    }) as [string, boolean, bigint, boolean, boolean];
                    
                    const [player, choice, , settled, didWin] = flip;
                    
                    // Si le flip est settled, c'est notre résultat
                    if (settled) {
                      console.log("🎉 Event CoinFlipResult reçu instantanément!", log);
                      eventListenerActive = false;
                      if (unwatchFn) unwatchFn();
                      
                      const result = choice ? "Heads" : "Tails";
                      const vrfResult = didWin ? result : (choice ? "Tails" : "Heads");
                      
                      setBetResult({ settled: true, didWin, result: vrfResult });
                      setIsFlipping(false);
                      setIsCheckingResult(false);
                      
                      if (didWin) {
                        const winnings = await publicClient.readContract({
                          address: COUNTER_ADDRESS,
                          abi: COUNTER_ABI as Abi,
                          functionName: "pendingWinnings",
                          args: [player]
                        }) as bigint;
                        setPendingWinnings(winnings);
                      }
                      
                      break;
                    }
                  } catch (err) {
                    console.error("Error processing event log:", err);
                  }
                }
              }
            });
          } catch (watchError) {
            console.warn("⚠️ WebSocket setup failed, using polling only:", watchError);
            eventListenerActive = false;
          }
          
          // PRIORITÉ 2: Fallback polling après 10s si l'event n'est pas reçu
          setTimeout(() => {
            if (eventListenerActive) {
              console.log("⚠️ WebSocket timeout, basculement sur polling...");
              checkBetResult(currentBetId);
            }
          }, 10000);
          
          // Cleanup après 5 minutes max
          setTimeout(() => {
            if (eventListenerActive) {
              eventListenerActive = false;
              if (unwatchFn) unwatchFn();
            }
          }, 300000);
        } else {
          console.warn("VRF request tx failed");
          setStep("idle");
        }
      }

    } catch (e) {
      console.error("placeBet error:", e);
      setStep("idle");
      setIsFlipping(false);
    }
  };

  const checkBetResult = async (checkBetId: bigint, attempt: number = 0) => {
    if (!publicClient) return;
    
    // Timeout après 24 tentatives avec exponential backoff
    const MAX_ATTEMPTS = 24;
    
    if (attempt >= MAX_ATTEMPTS) {
      console.warn("VRF timeout - max attempts reached");
      setIsCheckingResult(false);
      setIsFlipping(false);
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
      }) as [string, boolean, bigint, boolean, boolean];

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
        const result = choice ? "Heads" : "Tails";
        const vrfResult = didWin ? result : (choice ? "Tails" : "Heads");
        
        console.log("✅ Bet settled! Result:", vrfResult, "Win:", didWin);
        
        setBetResult({ settled, didWin, result: vrfResult });
        setIsFlipping(false);
        
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
        // ⚡ Exponential backoff: 5s → 7.5s → 11.25s → ... max 30s
        const delay = Math.min(5000 * Math.pow(1.5, attempt), 30000);
        console.log(`Bet not settled yet, retrying in ${(delay/1000).toFixed(1)}s...`);
        setTimeout(() => checkBetResult(checkBetId, attempt + 1), delay);
      }
    } catch (e) {
      console.error("Error checking bet result:", e);
      setIsCheckingResult(false);
      setIsFlipping(false);
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

  const onFundContract = async () => {
    if (!fundAmount) return;
    
    try {
      const fundHash = await writeContractAsync({
        address: COUNTER_ADDRESS,
        abi: COUNTER_ABI as Abi,
        functionName: "fundContract",
        args: [],
        value: parseEther(fundAmount)
      });
      setLastTxHash(fundHash);

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: fundHash });
        if (receipt.status === "success") {
          alert(`Contract funded with ${fundAmount} ETH! 💰`);
          setFundAmount("");
        }
      }
    } catch (e) {
      console.error("Fund error:", e);
      alert("Failed to fund contract");
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
        {/* Admin toggle button - visible seulement pour l'admin */}
        {address && adminAddress && address.toLowerCase() === adminAddress.toLowerCase() && (
          <button
            onClick={() => setShowAdminPanel(!showAdminPanel)}
            style={{
              position: "fixed",
              top: 20,
              right: 20,
              padding: "8px 16px",
              background: showAdminPanel ? "#8b5cf6" : "#4c1d95",
              color: "#fff",
              border: showAdminPanel ? "2px solid #a78bfa" : "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              zIndex: 1000,
              transition: "all 0.2s ease",
            }}
          >
            🔧 Admin
          </button>
        )}
      </header>

      <div className={styles.content}>
        {/* Admin Panel */}
        {showAdminPanel && (
          <div style={{
            marginBottom: 24,
            width: "100%",
            maxWidth: 420,
            border: "2px solid #8b5cf6",
            borderRadius: 16,
            padding: 24,
            background: "linear-gradient(135deg, #2d1b4e 0%, #1a1032 100%)",
            boxShadow: "0 8px 32px rgba(139, 92, 246, 0.3)",
          }}>
            <h3 style={{ margin: 0, marginBottom: 16, fontSize: 18, fontWeight: 700, color: "#8b5cf6" }}>
              🔧 Admin Panel
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 14, marginBottom: 8, color: "#d1d5db", fontWeight: 500 }}>
                Fund Contract (ETH)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.05"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 8,
                  border: "2px solid #4c1d95",
                  background: "#0f0820",
                  color: "#fff",
                  padding: "0 12px",
                  outline: "none",
                  fontSize: 14,
                }}
              />
            </div>
            <button
              onClick={onFundContract}
              disabled={!fundAmount || isPending}
              style={{
                width: "100%",
                height: 44,
                borderRadius: 10,
                border: "none",
                background: fundAmount && !isPending
                  ? "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)"
                  : "#4c1d95",
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                cursor: fundAmount && !isPending ? "pointer" : "not-allowed",
                transition: "all 0.2s ease",
                marginBottom: 16,
              }}
            >
              {isPending ? "Funding..." : "💰 Fund Contract"}
            </button>
            
            {/* Pause/Unpause Section */}
            <div style={{ 
              marginTop: 16, 
              padding: 12, 
              background: isPaused ? "#7f1d1d" : "#064e3b",
              borderRadius: 8,
              border: isPaused ? "1px solid #ef4444" : "1px solid #10b981",
              marginBottom: 12
            }}>
              <div style={{ fontSize: 13, color: "#fff", marginBottom: 8, fontWeight: 600 }}>
                Contract Status: {isPaused ? "⏸️ PAUSED" : "▶️ ACTIVE"}
              </div>
              <div style={{ fontSize: 11, color: "#d1d5db", marginBottom: 0 }}>
                {isPaused 
                  ? "⚠️ New bets are blocked. Users cannot place bets or request VRF."
                  : "✅ Contract is operational. Users can place bets normally."
                }
              </div>
            </div>
            
            <button
              onClick={async () => {
                try {
                  const pauseHash = await writeContractAsync({
                    address: COUNTER_ADDRESS,
                    abi: COUNTER_ABI as Abi,
                    functionName: "setPaused",
                    args: [!isPaused]
                  });
                  
                  if (publicClient) {
                    const receipt = await publicClient.waitForTransactionReceipt({ hash: pauseHash });
                    if (receipt.status === "success") {
                      setIsPaused(!isPaused);
                      alert(`Contract ${!isPaused ? "paused" : "unpaused"} successfully! ${!isPaused ? "⏸️" : "▶️"}`);
                    }
                  }
                } catch (e) {
                  console.error("Pause/Unpause error:", e);
                  alert("Failed to change pause state");
                }
              }}
              disabled={isPending}
              style={{
                width: "100%",
                height: 44,
                borderRadius: 10,
                border: "none",
                background: isPaused
                  ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                  : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                cursor: isPending ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {isPending ? "Processing..." : isPaused ? "▶️ Unpause Contract" : "⏸️ Pause Contract"}
            </button>
          </div>
        )}

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
          
          {/* 🛡️ Affichage du balance du contrat et statut */}
          <div style={{ 
            marginTop: 16, 
            padding: "8px 16px", 
            borderRadius: 8, 
            background: isPaused ? "#991b1b" : "#1a1032",
            border: isPaused ? "1px solid #ef4444" : "1px solid #4c1d95",
            display: "inline-block"
          }}>
            {isPaused && (
              <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 4, fontWeight: 600 }}>
                ⚠️ Contract Paused
              </div>
            )}
            <div style={{ fontSize: 12, color: "#a78bfa" }}>
              💰 Contract Balance: {(Number(contractBalance) / 1e18).toFixed(4)} ETH
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              Max payout: {(Number(contractBalance) / 2e18).toFixed(4)} ETH
            </div>
          </div>
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
            placeholder="0.0032"
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
          
          {/* 🎯 Boutons de mise rapide */}
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {["0.0032", "0.005", "0.01", "0.02"].map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount(amount)}
                style={{
                  height: 36,
                  borderRadius: 8,
                  border: betAmount === amount ? "2px solid #8b5cf6" : "1px solid #4c1d95",
                  background: betAmount === amount ? "#4c1d95" : "#1a1032",
                  color: betAmount === amount ? "#a78bfa" : "#9ca3af",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  if (betAmount !== amount) {
                    e.currentTarget.style.background = "#2d1b4e";
                    e.currentTarget.style.borderColor = "#6d28d9";
                    e.currentTarget.style.color = "#c4b5fd";
                  }
                }}
                onMouseLeave={(e) => {
                  if (betAmount !== amount) {
                    e.currentTarget.style.background = "#1a1032";
                    e.currentTarget.style.borderColor = "#4c1d95";
                    e.currentTarget.style.color = "#9ca3af";
                  }
                }}
              >
                {amount}
              </button>
            ))}
          </div>
          
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
              {/* 🪙 Animation de flip pendant l'attente */}
              {isFlipping && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 64,
                    display: "inline-block",
                    animation: "coinFlip 1s infinite ease-in-out"
                  }}>
                    🪙
                  </div>
                  <style jsx>{`
                    @keyframes coinFlip {
                      0% { transform: rotateY(0deg); }
                      50% { transform: rotateY(180deg); }
                      100% { transform: rotateY(360deg); }
                    }
                  `}</style>
                </div>
              )}
              <div style={{ fontSize: 32, marginBottom: 8 }}>
                {isFlipping ? "🔮" : "⏳"}
              </div>
              <div style={{ fontSize: 14, marginBottom: 8, color: "#a78bfa", fontWeight: 600 }}>
                {isFlipping ? "🪙 Flipping the coin..." : "⏳ Waiting for Chainlink VRF..."}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
                {isFlipping 
                  ? "Generating provably fair randomness on-chain" 
                  : "This may take 1-2 minutes. The coin is flipping! 🪙"}
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
