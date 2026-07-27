// IEEE 11073-20601 16-bit SFLOAT, as used by the Glucose Measurement
// characteristic's concentration field: 4-bit signed exponent (top nibble)
// + 12-bit signed mantissa (bottom 12 bits), value = mantissa * 10^exponent.
// A handful of reserved mantissa values encode NaN/±Infinity/"not at this
// resolution" instead of a number — decode those to null rather than a
// silently-wrong number.
export function decodeSFLOAT(raw: number): number | null {
  const mantissaRaw = raw & 0x0fff;
  const exponentRaw = (raw >> 12) & 0x0f;

  if (mantissaRaw === 0x07ff || mantissaRaw === 0x0800 || mantissaRaw === 0x0801) {
    return null; // NaN / NRes / reserved
  }
  if (mantissaRaw === 0x07fe) return Infinity;
  if (mantissaRaw === 0x0802) return -Infinity;

  const mantissa = mantissaRaw >= 0x0800 ? mantissaRaw - 0x1000 : mantissaRaw;
  const exponent = exponentRaw >= 0x08 ? exponentRaw - 0x10 : exponentRaw;

  return mantissa * Math.pow(10, exponent);
}
