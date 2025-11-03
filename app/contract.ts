// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0x76927650BCa3CFE769AE3f77ce24B33549A6531C") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
