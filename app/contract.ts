// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0xB5D3a489d2B1C3ef77F1b8cA7A471de0a12E9860") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
