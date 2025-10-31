// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0x7fE05B31Aad63A78FDcbe8F9B9BD85a3a95250C9") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
