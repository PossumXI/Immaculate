import type { NeuroBand, NeuroBandPower } from "@immaculate/core";

const BAND_LIMITS: Array<{ band: NeuroBand; lowHz: number; highHz: number }> = [
  { band: "delta", lowHz: 1, highHz: 4 },
  { band: "theta", lowHz: 4, highHz: 8 },
  { band: "alpha", lowHz: 8, highHz: 13 },
  { band: "beta", lowHz: 13, highHz: 30 },
  { band: "gamma", lowHz: 30, highHz: 100 }
];

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function collapseSampleRows(rows: number[][]): number[] {
  return rows.map((row) => {
    if (row.length === 0) {
      return 0;
    }
    const sum = row.reduce((accumulator, value) => accumulator + Number(value), 0);
    return sum / row.length;
  });
}

export function extractBandPower(samples: number[], rateHz: number): NeuroBandPower {
  const safeSamples = samples.map((sample) => Number.isFinite(sample) ? Number(sample) : 0);
  const sampleCount = safeSamples.length;
  if (!Number.isFinite(rateHz) || rateHz <= 0 || sampleCount < 8) {
    return {
      delta: 0,
      theta: 0,
      alpha: 0,
      beta: 0,
      gamma: 0,
      dominantBand: "alpha",
      dominantRatio: 0
    };
  }

  const mean = safeSamples.reduce((sum, value) => sum + value, 0) / sampleCount;
  const centered = safeSamples.map((value) => value - mean);
  const bucketedPower = {
    delta: 0,
    theta: 0,
    alpha: 0,
    beta: 0,
    gamma: 0
  };

  const upperBin = Math.floor(sampleCount / 2);
  for (let bin = 1; bin <= upperBin; bin += 1) {
    const frequencyHz = (bin * rateHz) / sampleCount;
    const band = BAND_LIMITS.find(
      (candidate) => frequencyHz >= candidate.lowHz && frequencyHz < candidate.highHz
    )?.band;
    if (!band) {
      continue;
    }

    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const angle = (2 * Math.PI * bin * index) / sampleCount;
      real += centered[index] * Math.cos(angle);
      imaginary -= centered[index] * Math.sin(angle);
    }

    bucketedPower[band] += real * real + imaginary * imaginary;
  }

  const totalBandPower = Object.values(bucketedPower).reduce((sum, value) => sum + value, 0);
  if (totalBandPower <= 0) {
    return {
      delta: 0,
      theta: 0,
      alpha: 0,
      beta: 0,
      gamma: 0,
      dominantBand: "alpha",
      dominantRatio: 0
    };
  }

  const relativePower = {
    delta: Number(clamp(bucketedPower.delta / totalBandPower).toFixed(6)),
    theta: Number(clamp(bucketedPower.theta / totalBandPower).toFixed(6)),
    alpha: Number(clamp(bucketedPower.alpha / totalBandPower).toFixed(6)),
    beta: Number(clamp(bucketedPower.beta / totalBandPower).toFixed(6)),
    gamma: Number(clamp(bucketedPower.gamma / totalBandPower).toFixed(6))
  };

  const dominant = (Object.entries(relativePower) as Array<[NeuroBand, number]>).sort(
    (left, right) => right[1] - left[1]
  )[0] ?? ["alpha", 0];

  return {
    ...relativePower,
    dominantBand: dominant[0],
    dominantRatio: Number(clamp(dominant[1]).toFixed(6))
  };
}
