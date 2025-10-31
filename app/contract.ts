// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0x7fFbc0f8c7fb64387D7CaF642c164359b4AD96c3") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
