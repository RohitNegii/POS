/**
 * Actual Purchase Price Code Generation Utility
 *
 * Implements the client's COMPLISENT mapping:
 * C O M P L I S E N T
 * 1 2 3 4 5 6 7 8 9 0
 *
 * Rules:
 * 1. The final code must always contain exactly 6 characters.
 * 2. The final code must contain alphabets only.
 * 3. Left-pad the price with '0's to make it exactly 6 digits.
 * 4. Replace each digit with its corresponding letter in COMPLISENT.
 * 5. Deterministic: the same actual purchase price always produces the same code.
 */

export const COMPLISENT_MAP: Record<string, string> = Object.freeze({
  '1': 'C',
  '2': 'O',
  '3': 'M',
  '4': 'P',
  '5': 'L',
  '6': 'I',
  '7': 'S',
  '8': 'E',
  '9': 'N',
  '0': 'T',
});

/**
 * Converts an Actual Purchase Price into an exact 6-character alphabetic code
 * using the COMPLISENT mapping.
 *
 * @param actualPurchasePrice - The actual purchase price number or numeric string
 * @returns Exactly 6 uppercase alphabetic characters, or null if input is empty/invalid
 *
 * @example
 * generateActualPurchasePriceCode(100)    // "TTTCTT"  (000100 -> TTTCTT)
 * generateActualPurchasePriceCode(110)    // "TTTCCT"  (000110 -> TTTCCT)
 * generateActualPurchasePriceCode(123456) // "COMPLI"  (123456 -> COMPLI)
 * generateActualPurchasePriceCode(25)     // "TTTTOL"  (000025 -> TTTTOL)
 */
export function generateActualPurchasePriceCode(
  actualPurchasePrice: number | string | null | undefined
): string | null {
  if (
    actualPurchasePrice === null ||
    actualPurchasePrice === undefined ||
    actualPurchasePrice === ''
  ) {
    return null;
  }

  const num =
    typeof actualPurchasePrice === 'number'
      ? actualPurchasePrice
      : parseFloat(String(actualPurchasePrice));

  if (isNaN(num) || num < 0) {
    return null;
  }

  // Convert to integer (rounding to nearest whole unit for the 6-digit code)
  const intVal = Math.round(num);

  // Left-pad with 0s to make exactly 6 digits (or slice last 6 if > 999999)
  const paddedDigits = String(intVal).padStart(6, '0').slice(-6);

  // Map each digit to the corresponding letter in COMPLISENT
  let code = '';
  for (let i = 0; i < paddedDigits.length; i++) {
    const digit = paddedDigits[i];
    code += COMPLISENT_MAP[digit] || 'T';
  }

  return code;
}
