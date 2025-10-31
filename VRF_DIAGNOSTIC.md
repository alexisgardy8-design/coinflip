# Diagnostic VRF Chainlink - Base Sepolia

## ✅ Paramètres du contrat (VALIDÉS selon doc Chainlink)

### Configuration VRF v2.5 Base Sepolia
- **Coordinator**: `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE` ✅ (correct)
- **Key Hash (500 gwei)**: `0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71` ✅ (correct)
- **Callback Gas Limit**: `2,500,000` ✅ (max recommandé)
- **Request Confirmations**: `3` ✅ (bon équilibre)
- **Payment Method**: `LINK` (`nativePayment: false`) ✅

### Contrat déployé
- **Adresse**: `0xa4b854f13e50a171c0e317c9e900c1b682383e17`
- **Network**: Base Sepolia (chainId: 84532)
- **Tx de déploiement**: `0x15bd22df934d219177030347ebfa2aa8e5c561540c46f0506f09db6137511124`

## ❌ Causes probables du non-fulfillment

### 1. Subscription ID non définie dans constructor
**PROBLÈME CRITIQUE**: Le `s_subscriptionId` est maintenant une variable non initialisée au lieu d'être hardcodée. 

**Solution**: Passe ta subscription ID au constructor lors du déploiement:
```solidity
constructor(uint256 subscriptionId, address _feeRecipient)
```

### 2. Consumer non ajouté à la subscription
Vérifie sur https://vrf.chain.link que:
- Ta subscription existe sur Base Sepolia
- Le contrat `0xa4b854f13e50a171c0e317c9e900c1b682383e17` est listé comme "Consumer"
- La subscription a assez de LINK (minimum 2-5 LINK pour tester)

### 3. Solde LINK insuffisant
**Coût par requête VRF sur Base Sepolia**:
- Frais de base: ~0.0001 LINK
- Frais de callback (2.5M gas): ~0.01 LINK
- **Total estimé**: ~0.01 LINK par requête

Vérifie le solde de ta subscription:
```bash
# Via Chainlink VRF dashboard
https://vrf.chain.link
```

### 4. Gas Lane (Key Hash) saturé
Si la 500 gwei gas lane est saturée, essaye:
- **150 gwei**: `0x8c49cae0b8e54e8004b7c4e6494792b8e25861cd0a65e9ec6f76af4cbb683d0e`
- **30 gwei**: `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`

Change dans le contrat:
```solidity
bytes32 public keyHash = 0x8c49cae0b8e54e8004b7c4e6494792b8e25861cd0a65e9ec6f76af4cbb683d0e; // 150 gwei
```

### 5. Callback Gas trop élevé
Si ta subscription manque de LINK, réduis temporairement:
```solidity
uint32 public callbackGasLimit = 500_000; // Au lieu de 2.5M
```
Coût réduit: ~0.002 LINK par requête

## 🔧 Checklist de résolution

1. [ ] Vérifier que `subscriptionId` est bien passé au constructor lors du déploiement
2. [ ] Confirmer que l'adresse du contrat est consumer de la subscription
3. [ ] Vérifier le solde LINK de la subscription (min 2 LINK)
4. [ ] Tester avec une gas lane moins chère (150 gwei ou 30 gwei)
5. [ ] Réduire `callbackGasLimit` si nécessaire (500k minimum)
6. [ ] Vérifier les events `RequestSent` dans les logs de transaction
7. [ ] Attendre 3 confirmations + temps de fulfillment (~1-2 min)

## 🔍 Debug dans l'UI

Ajoute ces logs dans `requestFlipResult`:
```typescript
console.log("Bet ID:", betId);
console.log("VRF Request TX:", vrfHash);
console.log("Check on Basescan:", `https://sepolia.basescan.org/tx/${vrfHash}`);
```

Vérifie dans les logs de la tx:
- Event `RequestSent` avec `requestId`
- Event `CoinFlipRequested` avec `requestId` et `player`

## 📊 Monitoring VRF

1. **Via Chainlink Dashboard**: https://vrf.chain.link
   - Voir l'historique des requêtes
   - Status des fulfillments
   - Solde LINK

2. **Via Basescan**: https://sepolia.basescan.org/address/0xa4b854f13e50a171c0e317c9e900c1b682383e17
   - Events émis
   - Transactions échouées

3. **Logs contrat**: Event `RequestFulfilled` quand Chainlink répond

## 🚨 Erreurs communes

### "Request not found"
- La subscription n'existe pas ou ID incorrect
- Le contrat n'est pas consumer

### "Insufficient funds"
- Pas assez de LINK dans la subscription
- Ajouter LINK via https://vrf.chain.link

### "Gas limit too high"
- `callbackGasLimit` > 2.5M
- Réduire à max 2.5M

### Fulfillment jamais reçu
- Attendre au moins 3 confirmations + 1-2 minutes
- Vérifier que le coordinator peut appeler `rawFulfillRandomWords`
- S'assurer que le contrat n'a pas de bug dans `fulfillRandomWords`

## 🎯 Action immédiate recommandée

1. **Redéployer avec subscription ID**:
```bash
cd backend
forge script script/Counter.s.sol:CounterScript \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast \
  --verify \
  --verifier etherscan \
  -vvvv
```

2. **Ajouter le nouveau contrat comme consumer** sur https://vrf.chain.link

3. **Funder la subscription** avec au moins 2 LINK

4. **Tester une requête** et surveiller les logs

## 📚 Ressources Chainlink

- Base Sepolia VRF Config: https://docs.chain.link/vrf/v2-5/supported-networks#base-sepolia-testnet
- Billing & Costs: https://docs.chain.link/vrf/v2-5/billing
- Security Best Practices: https://docs.chain.link/vrf/v2-5/security
- VRF Dashboard: https://vrf.chain.link
