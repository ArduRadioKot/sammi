import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

const GAP = 14;
const RADIUS = 150;
const JITTER = 2.6;

function hash2(i: number, j: number) {
  let n = (i * 374761393 + j * 668265263) | 0;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

export function CursorField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const pointer = { x: -2400, y: -2400, active: false };
    let raf = 0;
    let running = true;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = () => {
      ctx.clearRect(0, 0, width, height);
      const cols = Math.ceil(width / GAP) + 2;
      const rows = Math.ceil(height / GAP) + 2;
      const mx = pointer.x;
      const my = pointer.y;

      for (let j = 0; j < rows; j += 1) {
        for (let i = 0; i < cols; i += 1) {
          const n = hash2(i, j);
          const n2 = hash2(j + 17, i + 9);
          let x = i * GAP + (n - 0.5) * JITTER;
          let y = j * GAP + (n2 - 0.5) * JITTER;
          let alpha = 0.1 + n * 0.18;
          let size = 1.05 + n2 * 0.7;

          if (pointer.active && !reduce) {
            const dx = x - mx;
            const dy = y - my;
            const dist = Math.hypot(dx, dy);
            if (dist < RADIUS) {
              const t = 1 - dist / RADIUS;
              const fall = t * t;
              const inv = 1 / (dist || 1);
              x += dx * inv * fall * 11;
              y += dy * inv * fall * 11;
              alpha += fall * 0.45;
              size += fall * 0.75;
            }
          }

          ctx.fillStyle = `rgba(236, 240, 236, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, size * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    let scheduled = false;
    const requestPaint = () => {
      if (scheduled || !running) return;
      scheduled = true;
      raf = window.requestAnimationFrame(() => {
        scheduled = false;
        paint();
      });
    };

    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      if (!reduce) requestPaint();
    };
    const onLeave = () => {
      pointer.active = false;
      requestPaint();
    };
    const onVisibility = () => {
      running = !document.hidden;
      if (running) requestPaint();
    };

    const onResize = () => {
      resize();
      requestPaint();
    };

    resize();
    requestPaint();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduce]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[1]" />;
}
