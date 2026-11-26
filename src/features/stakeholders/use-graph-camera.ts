import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { Point, Size } from "./graph-layout";

type Camera = Point & { scale: number };
type Pointer = { start: Point; current: Point };

export const MAX_SCALE = 2.5;
const FIT_PADDING = 16;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function keepVisible(offset: number, viewport: number, content: number) {
  const margin = Math.min(72, viewport / 2, content / 2);
  return clamp(offset, margin - content, viewport - margin);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function useGraphCamera(content: Size, initialFocus?: Point) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [custom, setCustom] = useState<Camera | null>(null);
  const [fitted, setFitted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, Pointer>());
  const gesture = useRef(false);

  useLayoutEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      setSize({ width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitScale = Math.max(0.05, Math.min(1,
    (size.width - FIT_PADDING * 2) / content.width,
    (size.height - FIT_PADDING * 2) / content.height,
  ));
  const minScale = Math.min(0.2, fitScale);
  const focus = !fitted && (size.width < 520 || fitScale < 0.65) ? initialFocus : undefined;
  const initialScale = focus ? Math.max(fitScale, 0.78) : fitScale;
  const initialX = focus ? size.width / 2 - focus.x * initialScale : (size.width - content.width * fitScale) / 2;
  const initialY = focus ? size.height * 0.32 - focus.y * initialScale : (size.height - content.height * fitScale) / 2;
  const constrain = useCallback((next: Camera): Camera => ({
    scale: next.scale,
    x: keepVisible(next.x, size.width, content.width * next.scale),
    y: keepVisible(next.y, size.height, content.height * next.scale),
  }), [content.height, content.width, size.height, size.width]);
  const camera = constrain(custom ?? { x: initialX, y: initialY, scale: initialScale });

  const move = useCallback((change: (current: Camera) => Camera) => {
    setCustom((previous) => constrain(change(constrain(previous ?? { x: initialX, y: initialY, scale: initialScale }))));
  }, [constrain, initialScale, initialX, initialY]);

  const zoomAt = useCallback((factor: number, from: Point, to = from) => {
    move((current) => {
      const scale = clamp(current.scale * factor, minScale, MAX_SCALE);
      const ratio = scale / current.scale;
      return { scale, x: to.x - (from.x - current.x) * ratio, y: to.y - (from.y - current.y) * ratio };
    });
  }, [minScale, move]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = svg.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1);
      zoomAt(Math.exp(-clamp(delta, -160, 160) * 0.003), { x: event.clientX - box.left, y: event.clientY - box.top });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || pointers.current.size >= 2) return;
    const point = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 0) gesture.current = false;
    pointers.current.set(event.pointerId, { start: point, current: point });
    if (pointers.current.size === 2) {
      gesture.current = true;
      setDragging(true);
      for (const pointerId of pointers.current.keys()) event.currentTarget.setPointerCapture(pointerId);
    }
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const pointer = pointers.current.get(event.pointerId);
    if (!pointer) return;
    const next = { x: event.clientX, y: event.clientY };
    const previous = pointer.current;
    pointer.current = next;
    const other = [...pointers.current].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const box = event.currentTarget.getBoundingClientRect();
      const before = midpoint(previous, other.current);
      const after = midpoint(next, other.current);
      zoomAt(
        distance(next, other.current) / Math.max(1, distance(previous, other.current)),
        { x: before.x - box.left, y: before.y - box.top },
        { x: after.x - box.left, y: after.y - box.top },
      );
      return;
    }
    if (!gesture.current && distance(pointer.start, next) < 5) return;
    if (!gesture.current) {
      gesture.current = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    pan(next.x - previous.x, next.y - previous.y);
  }

  function releasePointer(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) setDragging(false);
  }

  function pan(dx: number, dy: number) {
    move((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  }

  function reveal(point: Point) {
    const screenX = camera.x + camera.scale * point.x;
    const screenY = camera.y + camera.scale * point.y;
    if (screenX >= 42 && screenX <= size.width - 42 && screenY >= 32 && screenY <= size.height - 32) return;
    move((current) => ({
      ...current,
      x: size.width / 2 - point.x * current.scale,
      y: size.height / 2 - point.y * current.scale,
    }));
  }

  return {
    svgRef, camera, dragging, gesture, minScale, pan, reveal,
    zoom: (factor: number) => zoomAt(factor, { x: size.width / 2, y: size.height / 2 }),
    fit: () => { setFitted(true); setCustom(null); },
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: releasePointer,
      onPointerCancel: releasePointer,
      onPointerLeave: (event: PointerEvent<SVGSVGElement>) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) releasePointer(event);
      },
      onLostPointerCapture: (event: PointerEvent<SVGSVGElement>) => {
        if (event.target === event.currentTarget) releasePointer(event);
      },
    },
  };
}
