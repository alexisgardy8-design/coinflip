// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";


contract Counter is VRFConsumerBaseV2Plus {
    uint256 public number;
    event RequestSent(uint256 requestId, uint32 numWords);
    event RequestFulfilled(uint256 requestId, uint256[] randomWords);
    event PayoutSent(address counter, uint256 gain);
    event BetPlaced(address indexed bettor, uint256 amount, bool choice);
    event CoinFlipRequested(uint256 indexed requestId, address indexed player);
    event CoinFlipResult(uint256 indexed requestId, address indexed player, bool didWin, uint256 randomWord);

    struct RequestStatus {
        bool fulfilled; // whether the request has been successfully fulfilled
        bool exists; // whether a requestId exists
        uint256[] randomWords;
    }
    mapping(uint256 => RequestStatus) public s_requests; 

    // 2% fees en basis points
  
    uint256 public constant MIN_BET = 0.001 ether;
    address public immutable feeRecipient;

    struct Flip {
      address player;
      bool choice;
      uint256 betNet;   // mise nette après frais
      bool settled;
      bool didWin;
    }

    mapping(uint256 => Flip) public flips;              // requestId => Flip
    mapping(address => uint256) public pendingWinnings; // joueur => gains à récupérer
   


    uint256 public s_subscriptionId = 4937410816868527569599478232880574948340571343081385903828113851362140503943;
    uint256[] public requestIds;
    uint256 public lastRequestId;
    bytes32 public keyHash = 0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71;
    uint32 public callbackGasLimit = 2_500_000;
    uint16 public requestConfirmations = 3;
    uint32 public numWords =  1;

    constructor( uint256 subscriptionId, address _feeRecipiant) VRFConsumerBaseV2Plus(0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE) {
        s_subscriptionId = subscriptionId;
        feeRecipient = _feeRecipiant;
    }


    function requestRandomWords() external onlyOwner returns (uint256 requestId) {
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
    function placeBet(bool choice) external payable returns (uint256 requestId) {
      require(msg.value >= MIN_BET, "Bet too small");

      // Frais 2%
      uint256 fee = (msg.value * 2) / 100;
      uint256 net = msg.value - fee;

      emit BetPlaced(msg.sender, msg.value, choice);

      // Envoi des frais
      if (fee > 0) {
        (bool ok, ) = payable(feeRecipient).call{value: fee}("");
        require(ok, "Fee transfer failed");
      }



      // Demande VRF (Base Sepolia)
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

    // Enregistre le pari lié à la requête
    flips[requestId] = Flip({
      player: msg.sender,
      choice: choice,
      betNet: net,
      settled: false,
      didWin: false
    });

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

    // Récupère le pari et règle le résultat
    Flip storage f = flips[_requestId];
    if (f.player != address(0) && !f.settled) {
        uint256 word = _randomWords[0];
        bool flipSide = (word % 2 == 0);
        bool didWin = (flipSide == f.choice);
        f.settled = true;
        f.didWin = didWin;
        if (didWin) {
            uint256 winAmount = f.betNet * 2;
            pendingWinnings[f.player] += winAmount;
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

  function isWinner(uint256 randomWord, bool choice) public pure returns (bool) {
        // Par exemple, si le joueur choisit true pour pile et false pour face
        bool coinFlipResult = (randomWord % 2 == 0); // true pour pile, false pour face
        return (coinFlipResult == choice);
    }



  // Admin or internal functions only — no public state-changing APIs other than placeBet/getPayout
}
