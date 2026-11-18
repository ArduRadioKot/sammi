import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_speed;
uniform float u_scale;
uniform float u_noise;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_void;

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = (uv * 2.0 - 1.0);
  p.x *= u_res.x / max(u_res.y, 1.0);
  p *= u_scale;
  float t = u_time * u_speed;

  p.x += sin(p.y * 1.6 + t * 0.32) * 0.28;
  p.y += cos(p.x * 1.15 - t * 0.26) * 0.22;

  float fold = 0.5 + 0.5 * sin(p.x * 1.05 + p.y * 0.42 + t * 0.18);
  float drift = 0.5 + 0.5 * sin(p.y * 1.25 - p.x * 0.32 - t * 0.14);
  float n = fract(sin(dot(floor(gl_FragCoord.xy * 0.35), vec2(12.9898, 78.233))) * 43758.5453);

  vec3 col = mix(u_c3, u_c1, smoothstep(0.34, 0.66, fold));
  col = mix(col, u_c2, smoothstep(0.38, 0.65, drift) * 0.44);
  col += (n - 0.5) * u_noise;

  float vignette = 1.0 - smoothstep(0.42, 0.86, length((uv - vec2(0.56, 0.53)) * vec2(1.08, 1.0)));
  col *= mix(0.78, 1.0, vignette);

  float sectionFade = smoothstep(0.0, 0.18, uv.y) * (1.0 - smoothstep(0.9, 1.0, uv.y));
  col = mix(u_void, col, sectionFade);

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "compile");
  }
  return shader;
}

export function SilkGradient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    let program: WebGLProgram | null = null;
    let raf = 0;
    let visible = false;
    let elapsed = 0;
    let previousTime: number | undefined;

    try {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    } catch {
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uSpeed = gl.getUniformLocation(program, "u_speed");
    const uScale = gl.getUniformLocation(program, "u_scale");
    const uNoise = gl.getUniformLocation(program, "u_noise");
    const uC1 = gl.getUniformLocation(program, "u_c1");
    const uC2 = gl.getUniformLocation(program, "u_c2");
    const uC3 = gl.getUniformLocation(program, "u_c3");
    const uVoid = gl.getUniformLocation(program, "u_void");

    gl.uniform1f(uSpeed, 0.48);
    gl.uniform1f(uScale, 1.05);
    gl.uniform1f(uNoise, 0.015);
    gl.uniform3f(uC1, 36 / 255, 79 / 255, 57 / 255);
    gl.uniform3f(uC2, 21 / 255, 51 / 255, 37 / 255);
    gl.uniform3f(uC3, 18 / 255, 30 / 255, 24 / 255);
    gl.uniform3f(uVoid, 13 / 255, 18 / 255, 14 / 255);

    const draw = () => {
      gl.uniform1f(uTime, elapsed / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      draw();
    };

    const tick = (time: number) => {
      elapsed += time - (previousTime ?? time);
      previousTime = time;
      draw();
      raf = window.requestAnimationFrame(tick);
    };

    const updateAnimation = () => {
      if (visible && !document.hidden && !reduce) {
        if (!raf) raf = window.requestAnimationFrame(tick);
        return;
      }
      window.cancelAnimationFrame(raf);
      raf = 0;
      previousTime = undefined;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        updateAnimation();
      },
      { rootMargin: "80px" },
    );
    observer.observe(canvas);

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    document.addEventListener("visibilitychange", updateAnimation);

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", updateAnimation);
      gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    };
  }, [reduce]);

  return (
    <div className="route-silk pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
