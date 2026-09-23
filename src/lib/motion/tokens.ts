export const motionTokens = {
  duration: {
    fast: 0.22,
    ui: 0.42,
    base: 0.5,
    section: 0.9,
    cinematic: 1.45,
    slow: 0.78,
  },
  ms: {
    fast: 220,
    ui: 420,
    section: 900,
    cinematic: 1450,
  },
  ease: {
    standard: [0.22, 1, 0.36, 1] as const,
    emphasized: [0.22, 1, 0.36, 1] as const,
    out: [0.16, 1, 0.3, 1] as const,
    soft: [0.33, 0.0, 0.2, 1] as const,
    smooth: [0.22, 1, 0.36, 1] as const,
  },
  reveal: {
    y: 14,
    stagger: 0.1,
  },
} as const;
