// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0x86B35afCBB50bBa68c28C95754039d19ddc743e8") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
