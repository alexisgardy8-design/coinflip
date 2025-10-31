// Central contract config for the frontend
// Set this env in .env.local: NEXT_PUBLIC_COUNTER_ADDRESS=0xYourContractAddress
export const COUNTER_ADDRESS = (process.env.NEXT_PUBLIC_COUNTER_ADDRESS || "0x9f8A3dD0EB0f4901cB848BE90b8E674C4Bbf1691") as `0x${string}`;
export { default as COUNTER_ABI } from "./counter-abi.json";
