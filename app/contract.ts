// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0x14805a57fC436F390a644fb9897162adD0c36905") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
