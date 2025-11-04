// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0xb5A6cCE69d67D1d7b473cFD337bD0E41756F29EE") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
