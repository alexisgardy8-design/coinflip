// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0xBafC1212B8285532Acb6A7D137212d2572643815") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
