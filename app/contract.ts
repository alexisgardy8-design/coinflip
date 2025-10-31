// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0x6a01F32bB0cbBDdB83bf97F58777E8F12d345461") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
