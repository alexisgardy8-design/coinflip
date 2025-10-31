// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0xa4b854f13e50A171C0E317C9E900c1b682383e17") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
