// TPDF dither for integer PCM delivery (8/16-bit).
//
// media/src/audio_mix.rs (`Dither`) implements the identical sequence so GUI
// and native Mac exports stay sample-identical: xorshift32 from DITHER_SEED,
// advanced once per uniform draw, two draws per written sample in interleaved
// frame order, and all arithmetic in double precision before the existing
// floor(x + 0.5) quantisation. Change both sides together.
export const DITHER_SEED = 0x2545f491;

/** Depths where ±1 LSB triangular dither is audible enough to apply. */
export const ditherApplies = (bitDepth: number) => bitDepth === 8 || bitDepth === 16;

export class TpdfDither {
  private state = DITHER_SEED;
  private uniform(): number {
    let x = this.state;
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    this.state = x;
    return x / 4294967296;
  }
  /** Triangular noise in (-1, 1) LSB. */
  next(): number {
    const a = this.uniform();
    return a - this.uniform();
  }
}

/** Signed 16-bit sample, matching the undithered floor(s*32767+0.5) scale. */
export function quantize16(sample: number, dither?: TpdfDither): number {
  const s = Math.max(-1, Math.min(1, sample));
  if (!dither) return Math.round(s * 32767);
  return Math.max(-32768, Math.min(32767, Math.floor(s * 32767 + dither.next() + 0.5)));
}

/** Unsigned 8-bit WAV sample (128 = zero). */
export function quantize8(sample: number, dither?: TpdfDither): number {
  const s = Math.max(-1, Math.min(1, sample));
  if (!dither) return Math.round((s + 1) * 127.5);
  return Math.max(0, Math.min(255, Math.floor((s + 1) * 127.5 + dither.next() + 0.5)));
}
