import { CallData } from 'starknet';
import { ethers } from 'ethers';
import * as bitcoin from 'bitcoinjs-lib';

/**
 * Validates a StarkNet address.
 *
 * @param address The StarkNet address to validate.
 * @returns True if the address is valid, false otherwise.
 */
export function validateStarkNetAddress(address: string): boolean {
  try {
    // starknet.js's CallData.compile accepts an address and will throw if it's invalid.
    // We can use a simple CairoOption type for validation.
    // A valid address is a felt252, which CallData.compile can handle.
    CallData.compile({ addr: address });
    // Additional check: StarkNet addresses are typically 66 characters long (0x + 64 hex chars)
    // or shorter if leading zeros are omitted. Max length is 66.
    // Felt252 can be up to 252 bits, so hex can be up to 63 chars + 0x prefix.
    // Starknet.js `isAddress` or similar dedicated function would be ideal if available in future versions
    // For now, CallData.compile is a robust check.
    // Let's ensure it's a hex string and check length.
    if (!ethers.utils.isHexString(address)) {
      return false;
    }
    // Length of a felt252 hex string can be up to 64 characters after '0x'.
    // Smallest is '0x0'.
    return address.length > 2 && address.length <= 66;
  } catch {
    return false;
  }
}

/**
 * Extracts a StarkNet address embedded in a Bitcoin P2SH or P2WSH script.
 * This function assumes a specific, simple embedding scheme where the address
 * is pushed as data in the script.
 * For P2SH: OP_HASH160 <20-byte-hash-of-redeem-script> OP_EQUAL
 * For P2WSH: OP_0 <32-byte-hash-of-witness-script>
 * We are looking for a redeem/witness script that pushes the StarkNet address.
 * A common pattern for embedding data is OP_RETURN <data>, or pushing data directly
 * if the script's purpose is data carriage alongside a spendable condition.
 *
 * This simplified example assumes the StarkNet address is the *only* data push
 * in the relevant part of the script. A more robust solution would require
 * a defined protocol for embedding.
 *
 * For this implementation, we'll assume the script being passed IS the redeem script
 * or witness script itself, and it contains a single data push representing the StarkNet address.
 * The address is expected to be a hex string.
 *
 * Example redeem script: <StarkNet_Address_Hex_Padded_To_Some_Length> OP_CHECKSIG (or similar)
 * Or more simply: OP_RETURN <StarkNet_Address_Hex>
 *
 * Given the task description, we're looking for an address *within* a P2(W)SH.
 * The P2(W)SH commits to a hash of another script. That other script (redeem or witness script)
 * would contain the StarkNet address.
 *
 * Let's assume the `script` parameter IS the redeem/witness script itself,
 * and it's expected to contain a data push that is the StarkNet address.
 *
 * @param script The Bitcoin redeem script or witness script (Buffer or hex string).
 * @returns The extracted StarkNet address as a hex string, or null if not found or invalid.
 */
export function extractAddressFromBitcoinScript(script: Buffer | string): string | null {
  try {
    const scriptBuffer = typeof script === 'string' ? Buffer.from(script, 'hex') : script;
    const chunks = bitcoin.script.decompile(scriptBuffer);

    if (!chunks) {
      return null;
    }

    for (const chunk of chunks) {
      if (Buffer.isBuffer(chunk)) {
        const potentialAddress = '0x' + chunk.toString('hex');
        if (validateStarkNetAddress(potentialAddress)) {
          if (chunk.length > 0 && chunk.length <= 32) {
            return potentialAddress;
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Error extracting address from Bitcoin script:', error);
    return null;
  }
}

/**
 * Converts an EVM or StarkNet address to a 32-byte (uint256) hex string for contract calls.
 *
 * This function normalizes addresses by padding them to exactly 32 bytes (256 bits)
 * as required by many smart contract interfaces.
 *
 * @param address The EVM or StarkNet address (with or without 0x prefix)
 * @returns 0x-prefixed, 64 hex character string (32 bytes)
 *
 * @throws {Error} If the address is invalid or cannot be converted
 *
 * @example
 * ```typescript
 * const addr = "0x123";
 * const padded = toUint256StarknetAddress(addr);
 * // Result: "0x0000000000000000000000000000000000000000000000000000000000000123"
 * ```
 */
export function toUint256StarknetAddress(address: string): string {
  if (!address || typeof address !== 'string') {
    throw new Error('Address must be a non-empty string');
  }

  // Normalize to 0x-prefixed hex string
  const hex = address.startsWith('0x') ? address : '0x' + address;

  // Validate the hex string
  if (!ethers.utils.isHexString(hex)) {
    throw new Error(`Invalid hex string: ${address}`);
  }

  try {
    return ethers.utils.hexZeroPad(hex, 32);
  } catch (error) {
    throw new Error(
      `Failed to pad address to 32 bytes: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
