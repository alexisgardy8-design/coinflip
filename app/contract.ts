// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0xEf5d90Ce092Dfd443FF385aEE5C85755971e6cE8") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
