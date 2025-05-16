import { CHAIN_ID_SEPOLIA } from "@certusone/wormhole-sdk";
import { PublicKey } from "@solana/web3.js";
import { NETWORK } from "../types/ChainConfig.type";

export const ENV_NETWORK = process.env.NETWORK as NETWORK;

export const TBTC_ADDRESS_BYTES_32 = Buffer.concat([
  Buffer.alloc(12), // 12 zero bytes
  Buffer.from("517f2982701695D4E52f1ECFBEf3ba31Df470161", "hex")
]); // sepolia address in bytes32

export const TBTC_PROGRAM_ID = new PublicKey(
  "Gj93RRt6QB7FjmyokAD5rcMAku7pq3Fk2Aa8y6nNbwsV"
);
export const WORMHOLE_GATEWAY_PROGRAM_ID = new PublicKey(
  "87MEvHZCXE3ML5rrmh5uX1FbShHmRXXS32xJDGbQ7h5t"
);
export const CORE_BRIDGE_PROGRAM_ID = ENV_NETWORK === NETWORK.MAINNET
  ?  new PublicKey("worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth")
  : new PublicKey("Bridge1p5gheXUvJ6jGWGeCsgPKgnE3YgdGKRVCMY9o");

export const TOKEN_BRIDGE_PROGRAM_ID = ENV_NETWORK === NETWORK.MAINNET
?  new PublicKey("wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb")
: new PublicKey("B6RHG3mfcckmrYN1UhmJzyS1XX3fZKbkeUcpJe9Sy3FE");

export const TOKEN_BRIDGE_ETHEREUM_ADDRESS = ENV_NETWORK === NETWORK.MAINNET
  ? "0x3ee18B2214AFF97000D974cf647E7C347E8fa585" 
  : "0xDB5492265f6038831E89f495670FF909aDe94bd9"

export const WORMHOLE_API_URL = ENV_NETWORK === NETWORK.MAINNET
  ? "https://api.wormholescan.io"
  : "https://api.testnet.wormholescan.io";

export const EMITTER_CHAIN_ID = CHAIN_ID_SEPOLIA;

export const MAX_VAA_UPLOAD_RETRIES_SOLANA = 5
