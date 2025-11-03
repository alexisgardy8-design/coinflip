// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";


contract Counter is VRFConsumerBaseV2Plus, Pausable {
    address private immutable i_admin; // Admin pour pause/unpause et gestion
    uint256 public number;
    event RequestSent(uint256 requestId, uint32 numWords);
    event RequestFulfilled(uint256 requestId, uint256[] randomWords);
  event PayoutSent(address counter, uint256 gain);
    event BetPlaced(address indexed bettor, uint256 amount, bool choice);
    event CoinFlipRequested(uint256 indexed requestId, address indexed player);
    event CoinFlipResult(uint256 indexed requestId, address indexed player, bool didWin, uint256 randomWord);
  event FeePaid(address indexed recipient, uint256 amount);

    struct RequestStatus {
        bool fulfilled; // whether the request has been successfully fulfilled
        bool exists; // whether a requestId exists
        uint256[] randomWords;
    }
    mapping(uint256 => RequestStatus) public s_requests; 
  
    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant MAX_BET = 1 ether; // Limite d'exposition par pari
    uint256 public constant BET_TIMEOUT = 1 hours; // Délai pour annulation d'urgence
    address public feeRecipient; // Modifiable par owner

    struct Flip {
      address player;
      bool choice;
      uint256 betNet;   // mise nette
      bool settled;
      bool didWin;
    }

    mapping(uint256 => Flip) public flips;              // betId => Flip
    mapping(uint256 => uint256) public requestToBet;    // requestId => betId
    mapping(address => uint256) public pendingWinnings; // joueur => gains à récupérer
    mapping(uint256 => uint256) private betFees;        // betId => frais (2%) à envoyer après settlement
    mapping(uint256 => bool) public betHasPendingRequest; // betId => hasActiveRequest (protection double request)
    mapping(uint256 => uint256) public betTimestamp;    // betId => timestamp pour timeout (séparé de la struct)
   
    uint256 public nextBetId = 1;

    uint256 public s_subscriptionId;
    uint256[] public requestIds;
    uint256 public lastRequestId;
    // Base Sepolia key hash pour 500 gwei gas lane (doc Chainlink confirmé)
    bytes32 public keyHash = 0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71;
    // callbackGasLimit: Max recommandé 2.5M pour éviter out-of-gas dans fulfillment
    // Coût avec LINK: ~0.01 LINK par request sur Base Sepolia
    uint32 public callbackGasLimit = 2_500_000;
    // 3 confirmations = bon équilibre sécurité/vitesse (max 200)
    uint16 public requestConfirmations = 3;
    uint32 public numWords =  1;

    modifier onlyAdmin() {
        require(msg.sender == i_admin, "Not admin");
        _;
    }

    constructor( uint256 subscriptionId, address _feeRecipiant) 
        VRFConsumerBaseV2Plus(0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE)
    {
        require(_feeRecipiant != address(0), "Invalid fee recipient");
        require(subscriptionId > 0, "Invalid subscription ID");
        i_admin = msg.sender;
        s_subscriptionId = subscriptionId;
        feeRecipient = _feeRecipiant;
    }

    function admin() public view returns (address) {
        return i_admin;
    }


    function requestRandomWords() external onlyAdmin returns (uint256 requestId) {
      // Will revert if subscription is not set and funded.
      requestId = s_vrfCoordinator.requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest({
          keyHash: keyHash,
          subId: s_subscriptionId,
          requestConfirmations: requestConfirmations,
          callbackGasLimit: callbackGasLimit,
          numWords: numWords,
          extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: false}))
        })
      );
      s_requests[requestId] = RequestStatus({randomWords: new uint256[](0), exists: true, fulfilled: false});
      requestIds.push(requestId);
      lastRequestId = requestId;
      emit RequestSent(requestId, numWords);
      return requestId;
    }
    function placeBet(bool choice) external payable whenNotPaused returns (uint256 betId) {
      require(msg.value >= MIN_BET, "Bet too small");
      require(msg.value <= MAX_BET, "Bet too large"); // Protection exposition

      betId = nextBetId++;
      
      // Calculer 98% pour le pari, 2% pour les frais
      uint256 fee = (msg.value * 2) / 100;       // 2% de frais
      uint256 betNet = msg.value - fee;          // 98% pour le pari
      uint256 potentialPayout = betNet * 2;
      // Stocker les frais pour ce bet (seront envoyés après settlement)
      betFees[betId] = fee;

       // ✅ CRITIQUE : Vérifier que le contrat peut payer
    require(address(this).balance >= potentialPayout, "Insufficient contract balance");
      
      // Enregistre le pari avec la mise nette (98%)
      flips[betId] = Flip({
        player: msg.sender,
        choice: choice,
        betNet: betNet,
        settled: false,
        didWin: false
      });
      
      betTimestamp[betId] = block.timestamp; // Timestamp séparé pour ne pas changer la struct

      emit BetPlaced(msg.sender, betNet, choice);

      return betId;
  }

  // Nouvelle fonction: déclenche le VRF pour un pari existant
  function requestFlipResult(uint256 betId) external whenNotPaused returns (uint256 requestId) {
    Flip storage f = flips[betId];
    require(f.player != address(0), "Bet does not exist");
    require(f.player == msg.sender, "Not your bet");
    require(!f.settled, "Already settled");
    require(!betHasPendingRequest[betId], "Request already pending"); // Protection double request

    betHasPendingRequest[betId] = true; // Marquer comme en cours

    // Demande VRF (Base Sepolia) financé par LINK
    requestId = s_vrfCoordinator.requestRandomWords(
      VRFV2PlusClient.RandomWordsRequest({
        keyHash: keyHash,
        subId: s_subscriptionId,
        requestConfirmations: requestConfirmations,
        callbackGasLimit: callbackGasLimit,
        numWords: numWords,
        extraArgs: VRFV2PlusClient._argsToBytes(
          VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
        )
      })
    );

    // Lie requestId au betId
    require(requestToBet[requestId] == 0, "Request ID collision"); // Protection collision
    requestToBet[requestId] = betId;

    s_requests[requestId] = RequestStatus({randomWords: new uint256[](0), exists: true, fulfilled: false});
    requestIds.push(requestId);
    lastRequestId = requestId;
    emit RequestSent(requestId, numWords);
    emit CoinFlipRequested(requestId, msg.sender);

    return requestId;
  }



    function fulfillRandomWords(uint256 _requestId, uint256[] calldata _randomWords) internal override {
    require(s_requests[_requestId].exists, "request not found");
    s_requests[_requestId].fulfilled = true;
    s_requests[_requestId].randomWords = _randomWords;

    // Récupère le betId via requestId
    uint256 betId = requestToBet[_requestId];
    Flip storage f = flips[betId];
    
    if (f.player != address(0) && !f.settled) {
        betHasPendingRequest[betId] = false; // Libérer le flag après settlement
        
        uint256 word = _randomWords[0];
        bool flipSide = (word % 2 == 0);
        bool didWin = (flipSide == f.choice);
        f.settled = true;
        f.didWin = didWin;
        
        if (didWin) {
            uint256 winAmount = f.betNet * 2;
            // Protection overflow (redondant en 0.8+ mais explicite)
            require(pendingWinnings[f.player] + winAmount >= pendingWinnings[f.player], "Overflow");
            pendingWinnings[f.player] += winAmount;
        }
        
        // Envoyer les frais (2%) au feeRecipient après settlement
        uint256 fee = betFees[betId];
        if (fee > 0) {
            betFees[betId] = 0; // Clear fees
            (bool ok, ) = payable(feeRecipient).call{value: fee}("");
            require(ok, "Fee transfer failed");
            emit FeePaid(feeRecipient, fee);
        }
        
        emit CoinFlipResult(_requestId, f.player, didWin, word);
    }

    emit RequestFulfilled(_requestId, _randomWords);
  }

  function getRequestStatus(
    uint256 _requestId
  ) external view returns (bool fulfilled, uint256[] memory randomWords) {
    require(s_requests[_requestId].exists, "request not found");
    RequestStatus memory request = s_requests[_requestId];
    return (request.fulfilled, request.randomWords);
  }
    

  // Joueur réclame ses gains
  function getPayout() external returns (uint256 amount) {
    amount = pendingWinnings[msg.sender];
    require(amount > 0, "No winnings");
    
    // Effects
    pendingWinnings[msg.sender] = 0;
    
    // Interactions
    (bool sent, ) = payable(msg.sender).call{value: amount}("");
    require(sent, "Payout failed");
    emit PayoutSent(msg.sender, amount);
    
    return amount;
  }

  // 🛡️ SÉCURITÉ OPTIONNELLE: Annulation d'urgence si VRF timeout
  function cancelBetAfterTimeout(uint256 betId) external {
    Flip storage f = flips[betId];
    require(f.player == msg.sender, "Not your bet");
    require(!f.settled, "Already settled");
    require(block.timestamp >= betTimestamp[betId] + BET_TIMEOUT, "Timeout not reached");
    
    // ✅ CEI Pattern: Checks-Effects-Interactions
    // 1. Checks (done above)
    // 2. Effects
    uint256 refundAmount = f.betNet + betFees[betId];
    f.settled = true; // Marquer comme settled pour éviter double refund
    betHasPendingRequest[betId] = false; // Libérer le flag
    betFees[betId] = 0; // Clear fees
    
    // 3. Interactions
    (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
    require(success, "Refund failed");
  }

  // 🛡️ SÉCURITÉ OPTIONNELLE: Admin peut mettre en pause en cas d'urgence
  function pause() external onlyAdmin {
    _pause();
  }

  function unpause() external onlyAdmin {
    _unpause();
  }

  // 🛡️ SÉCURITÉ OPTIONNELLE: Admin peut modifier le feeRecipient
  function updateFeeRecipient(address newRecipient) external onlyAdmin {
    require(newRecipient != address(0), "Invalid address");
    feeRecipient = newRecipient;
  }

  // 🛡️ SÉCURITÉ OPTIONNELLE: Admin peut retirer les fonds en cas d'urgence (après pause)
  function emergencyWithdraw() external onlyAdmin {
    require(paused(), "Must be paused first");
    uint256 balance = address(this).balance;
    (bool success, ) = payable(i_admin).call{value: balance}("");
    require(success, "Withdraw failed");
  }

  function isWinner(uint256 randomWord, bool choice) public pure returns (bool) {
        // Par exemple, si le joueur choisit true pour pile et false pour face
        bool coinFlipResult = (randomWord % 2 == 0); // true pour pile, false pour face
        return (coinFlipResult == choice);
    }

  // Fonction pour fund le contrat afin de payer les gains des joueurs
  function fundContract() external payable whenNotPaused {
    require(msg.value > 0, "Must send ETH to fund");
    emit ContractFunded(msg.sender, msg.value);
  }

  // Fonction pour vérifier le solde du contrat
  function getContractBalance() external view returns (uint256) {
    return address(this).balance;
  }

  // Événement pour tracker les dépôts
  event ContractFunded(address indexed funder, uint256 amount);

  // Admin or internal functions only — no public state-changing APIs other than placeBet/getPayout
}