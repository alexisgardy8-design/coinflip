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

    struct RequestStatus {
        bool fulfilled; // whether the request has been successfully fulfilled
        bool exists; // whether a requestId exists
        uint256[] randomWords;
    }
    mapping(uint256 => RequestStatus) public s_requests; 
    mapping(address => uint256) public pendingBetAmount;
   


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

    uint256 public constant MIN_BET = 0.001 ether;
    address public immutable feeRecipient;

  
    function placeBet(bool choice) external payable {
        // L'ETH est transféré au contrat automatiquement si la fonction ne revert pas.
        require(msg.value >= MIN_BET, "Bet too small");

        //frais
        uint256 fee = (msg.value * 2) / 100; // 2% de frais
        pendingBetAmount[msg.sender] = msg.value - fee;
        // Si on arrive ici, la transaction est valide et les fonds sont au contrat.
        emit BetPlaced(msg.sender, msg.value, choice);
        // Interaction: on envoie les frais à feeRecipient
        if (fee > 0) {
            (bool ok, ) = payable(feeRecipient).call{value: fee}("");
            require(ok, "Fee transfer failed");
        }
    }

  function requestRandomWords() external returns (uint256 requestId) {
    require(pendingBetAmount[msg.sender] > 0, "Bet not placed");
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

  function fulfillRandomWords(uint256 _requestId, uint256[] calldata _randomWords) internal override {
    require(s_requests[_requestId].exists, "request not found");
    s_requests[_requestId].fulfilled = true;
    s_requests[_requestId].randomWords = _randomWords;
    emit RequestFulfilled(_requestId, _randomWords);
  }

  function getRequestStatus(
    uint256 _requestId
  ) external view returns (bool fulfilled, uint256[] memory randomWords) {
    require(s_requests[_requestId].exists, "request not found");
    RequestStatus memory request = s_requests[_requestId];
    return (request.fulfilled, request.randomWords);
  }
    

  // Envoie depuis le contrat `amount` vers l'adresse `to` et émet PayoutSent si succès
  function getPayout(address better, bool isWin) external {
    require(pendingBetAmount[better] > 0, "Bet not placed");
    require(better != address(0), "better=0");
    require(isWin, "You lost the bet");
    uint256 amount = pendingBetAmount[better] * 2;
    bool sent;
    (sent, ) = payable(better).call{value: amount}("");
    require(sent, "Transfer failed");
    emit PayoutSent(better, amount);
  }

  function isWinner(uint256 randomWord, bool choice) public pure returns (bool) {
        // Par exemple, si le joueur choisit true pour pile et false pour face
        bool coinFlipResult = (randomWord % 2 == 0); // true pour pile, false pour face
        return (coinFlipResult == choice);
    }



    function setNumber(uint256 newNumber) public {
        number = newNumber;
    }

    function increment() public {
        number++;
    }
}
