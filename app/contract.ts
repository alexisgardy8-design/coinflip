// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0x183492341b029Df6f71AA760409734913C551E74") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
