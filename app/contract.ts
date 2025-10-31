// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0xe6143f86f7c3415e489d6787de4034aaa804960d") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
