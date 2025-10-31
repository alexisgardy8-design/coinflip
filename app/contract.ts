// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0xe6143F86f7c3415e489D6787DE4034aAA804960D") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
