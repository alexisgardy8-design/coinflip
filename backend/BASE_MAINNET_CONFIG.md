# Configuration Base Mainnet - Counter.sol

## ✅ Paramètres mis à jour pour Base Mainnet

### 🎯 VRF Configuration
- **VRF Coordinator**: `0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634` (Base Mainnet)
- **Key Hash**: `0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab` (2 gwei gas lane)
- **Callback Gas Limit**: `150,000` (optimisé pour Base Mainnet)
- **Request Confirmations**: `3` (équilibre sécurité/vitesse)
- **LINK Cost**: ~0.005 LINK par flip (~$0.06 @ $12/LINK)

### 💰 Paramètres de Rentabilité
- **MIN_BET**: `0.012 ETH` (~$36 @ $3000/ETH)
- **MAX_BET**: `0.1 ETH` (~$300 @ $3000/ETH)
- **House Edge**: `2%`
- **Coût VRF par flip**: ~$0.575 (LINK + gas minimal Base)

### 📊 Calcul de Rentabilité

#### Coûts par flip:
- LINK: ~0.005 LINK × $12 = $0.06
- Gas Base Mainnet: ~200k gas × 0.05 gwei × $3000/ETH ≈ $0.03
- **Total VRF**: ~$0.09 par flip

#### Revenus (House Edge 2%):
- MIN_BET 0.012 ETH × 2% = 0.00024 ETH (~$0.72)
- **Profit net par flip**: $0.72 - $0.09 = **$0.63** ✅

#### Break-even:
- Si perte: payer 2× la mise = coût élevé
- Avec 50% win rate: revenus fees compensent largement les coûts VRF

### 🏦 Bankroll Recommandé

#### Contract Balance:
- **Minimum**: 0.5 ETH (~$1,500)
  - Permet 20+ paris MAX_BET simultanés
  - Couverture large pour absorber variance court terme

#### VRF Subscription:
- **Minimum**: 5 LINK (~$60)
  - Permet ~1,000 flips
  - Recharge recommandée à 2 LINK restants

### 🚀 Déploiement

#### Prérequis:
1. ✅ Créer subscription VRF sur Base Mainnet
2. ✅ Approvisionner subscription avec 5+ LINK
3. ✅ Déployer contrat avec:
   - `subscriptionId`: ID de ta subscription VRF
   - `_feeRecipient`: Adresse pour recevoir les 2% de fees

#### Post-déploiement:
1. Ajouter le contrat comme consumer dans la subscription VRF
2. Financer le contrat avec 0.5+ ETH via `fundContract()`
3. Vérifier avec `canAcceptBet(0.012 ether)` → doit retourner `true`

### 🔧 Fonctions Admin

- **setPaused(bool)**: Pause d'urgence
- **emergencyWithdraw()**: Retrait fonds (requiert pause)
- **withdrawAccumulatedFees()**: Récupération fees bloquées

### 📈 Stratégie de Croissance

#### Phase 1 (Lancement):
- MIN_BET: 0.012 ETH
- Bankroll: 0.5 ETH
- Target: Stabiliser flow et tester système

#### Phase 2 (Expansion):
- Augmenter bankroll si volume élevé
- Possibilité d'augmenter MAX_BET si demande
- Monitorer win rate réel vs théorique (50%)

### ⚠️ Points d'Attention

1. **Gas Base Mainnet**: Extrêmement bas (~0.05 gwei), coût VRF dominé par LINK
2. **Variance**: Prévoir séquences de pertes (normal statistiquement)
3. **LINK Subscription**: Monitorer balance, recharger avant épuisement
4. **Contract Balance**: Toujours maintenir > 10× MAX_BET pour liquidité

### 🔐 Sécurité

- ✅ 5 vulnérabilités critiques fixées
- ✅ CEI pattern strict
- ✅ Protection double request VRF
- ✅ Timeout cancellation (1 hour)
- ✅ AccumulatedFees recovery
- ✅ Emergency pause + withdraw

---

**Date de configuration**: 4 novembre 2025  
**Réseau**: Base Mainnet (Chain ID: 8453)  
**Status**: ✅ Prêt pour déploiement
