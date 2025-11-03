# 🛡️ Améliorations de Sécurité

## Corrections appliquées

### 1. ✅ Vérification correcte du balance du contrat
**Problème** : La vérification `address(this).balance >= potentialPayout` était faite APRÈS avoir reçu `msg.value`, donc le check était faussé.

**Solution** : 
```solidity
uint256 contractBalanceBeforeBet = address(this).balance - msg.value;
require(contractBalanceBeforeBet >= potentialPayout, "Insufficient contract balance");
```

Maintenant, le contrat vérifie qu'il a assez de fonds AVANT d'accepter le pari.

### 2. ✅ Système de pause d'urgence
**Problème** : Aucun moyen d'arrêter le contrat en cas de bug critique ou d'attaque.

**Solution** : Ajout de :
- Variable `bool public paused`
- Modifier `whenNotPaused` sur `placeBet` et `requestFlipResult`
- Fonction `setPaused(bool)` pour l'admin
- Event `PausedStateChanged`

### 3. ✅ Fonction de retrait d'urgence
**Problème** : En cas de bug critique, impossible de récupérer les fonds du contrat.

**Solution** : Ajout de `emergencyWithdraw()` :
- Seulement accessible par l'admin
- Seulement quand le contrat est en pause
- Permet de retirer tous les fonds en cas d'urgence

### 4. ✅ Fonction `canAcceptBet` pour le frontend
**Problème** : Le frontend ne pouvait pas vérifier à l'avance si un pari serait accepté.

**Solution** : Fonction view `canAcceptBet(uint256 betAmount)` qui retourne :
- `false` si le contrat est en pause
- `false` si le montant est hors limites
- `false` si le balance est insuffisant
- `true` sinon

### 5. ✅ Suppression de code mort
**Problème** : Fonction `isWinner` jamais utilisée, code confus.

**Solution** : Fonction supprimée, la logique est directement dans `fulfillRandomWords`.

### 6. ✅ Event `BetCancelled`
**Problème** : Aucun event lors du timeout cancellation.

**Solution** : Ajout de `event BetCancelled(uint256 indexed betId, address indexed player, uint256 refundAmount)`.

### 7. ✅ Admin immutable
**Problème** : Pas de système admin pour la pause d'urgence.

**Solution** : 
- `address public immutable admin` (défini au constructor)
- Modifier `onlyAdmin()`
- Admin = deployer du contrat

## Frontend

### Vérification avant pari
Le frontend appelle maintenant `canAcceptBet(betAmount)` avant d'envoyer la transaction :
```typescript
const canAccept = await publicClient.readContract({
  address: COUNTER_ADDRESS,
  abi: COUNTER_ABI as Abi,
  functionName: "canAcceptBet",
  args: [desiredAmountWei]
}) as boolean;

if (!canAccept) {
  alert("⚠️ Contract cannot accept this bet (insufficient balance or paused)");
  return;
}
```

### Affichage du balance
- Balance du contrat affiché en temps réel
- Max payout possible visible
- Statut de pause visible (rouge si paused)
- Refresh automatique toutes les 10 secondes

## Checklist de sécurité

- ✅ Vérification du balance AVANT d'accepter le pari
- ✅ MAX_BET constant (1 ETH)
- ✅ MIN_BET constant (0.001 ETH)
- ✅ Protection double VRF request (`betHasPendingRequest`)
- ✅ Protection collision requestId
- ✅ CEI Pattern dans `cancelBetAfterTimeout`
- ✅ Timeout cancellation (1 heure)
- ✅ Système de pause d'urgence
- ✅ Retrait d'urgence admin
- ✅ Frontend vérifie `canAcceptBet` avant transaction
- ✅ Overflow protection (Solidity 0.8+)
- ✅ Struct `Flip` inchangée (pas de breaking changes)
- ✅ Calls VRF inchangés (pas de breaking changes)

## Gas optimisations possibles (non appliquées)

- Utiliser `_onlyAdmin()` et `_whenNotPaused()` dans les modifiers (suggestion du linter)
- Convertir les immutables en SCREAMING_SNAKE_CASE (cosmétique)

## Prochaines étapes

1. **Redéployer le contrat** avec les améliorations
2. **Mettre à jour `COUNTER_ADDRESS`** dans `app/contract.ts`
3. **Tester la pause** : appeler `setPaused(true)` en tant qu'admin
4. **Tester `canAcceptBet`** : vérifier que le frontend refuse les paris trop gros
5. **Funder le contrat** : s'assurer qu'il a assez d'ETH pour payer les gains

## Fonctions admin ajoutées

```solidity
// Mettre en pause / reprendre
function setPaused(bool _paused) external onlyAdmin

// Retirer les fonds en urgence (seulement si paused)
function emergencyWithdraw() external onlyAdmin
```

## Notes importantes

⚠️ **L'admin est immutable** : défini au deployment, ne peut pas être changé. Assurez-vous de déployer avec la bonne adresse admin !

⚠️ **emergencyWithdraw nécessite pause** : Pour éviter les abus, le retrait d'urgence n'est possible que si le contrat est d'abord mis en pause.

⚠️ **Pas de breaking changes** : La struct `Flip` et les appels VRF sont exactement identiques, le contrat est 100% compatible avec l'ancien frontend.
