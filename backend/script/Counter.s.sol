// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {Counter} from "../src/Counter.sol";
import "forge-std/console2.sol";

contract CounterScript is Script {
   

    function run() external {
        // Variables d'env requises:
        // - PRIVATE_KEY            : clé privée du déployeur
        // - VRF_SUBSCRIPTION_ID    : ID de ta souscription VRF 2.5 (Base Sepolia)
        // - FEE_RECIPIENT          : adresse qui reçoit 2% de fees
        // Note: we rely on --private-key CLI for broadcasting; no need to parse PRIVATE_KEY in Solidity
        uint256 subId      = vm.envUint("VRF_SUBSCRIPTION_ID");
        address feeRcpt    = vm.envAddress("FEE_RECIPIENT");
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        // Use the private key provided via CLI flag --private-key or the default broadcaster
        vm.startBroadcast(deployerPk);
        Counter counter = new Counter(subId, feeRcpt);
        console2.log("Counter deployed at:", address(counter));
        vm.stopBroadcast();
    }
}