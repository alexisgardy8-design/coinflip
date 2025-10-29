// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0xDEAfAC0C8a4DCEd9733A11d3FD23566338664d97") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
