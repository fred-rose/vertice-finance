import { useEffect, useRef } from "react";
import { fragmentShader, vertexShader } from "./topoFieldShaders";
import "./TopoFieldBackground.css";

interface TopoFieldProps {
  speed?: number;
  density?: number;
  opacity?: number;
  className?: string;
}

/** Decorative only: no financial data or persistence. */
export function TopoFieldBackground({
  speed = 1,
  density = 1,
  opacity = 1,
  className = "",
}: TopoFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const parameters = useRef({ speed, density });
  const synchronizeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const layer = layerRef.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const small = matchMedia("(max-width: 700px)");
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    const shaders: WebGLShader[] = [];
    let frame = 0;
    let disposed = false;
    let failed = false;
    let visible = true;
    let time = 0;
    let previous = 0;
    let lastDraw = 0;
    let resolution: WebGLUniformLocation | null = null;
    let clock: WebGLUniformLocation | null = null;
    let contours: WebGLUniformLocation | null = null;
    let pixelRatio: WebGLUniformLocation | null = null;
    let drawingDpr = 1;

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      layer.dataset.animation = "paused";
    }
    function release() {
      if (!gl) return;
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      for (const shader of shaders) gl.deleteShader(shader);
      buffer = null;
      program = null;
      shaders.length = 0;
    }
    function fallback() {
      failed = true;
      stop();
      release();
      layer.dataset.renderer = "fallback";
    }
    function draw() {
      if (!gl || !program || failed || disposed) return;
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(clock, time);
      gl.uniform1f(
        contours,
        Math.min(2.5, Math.max(0.25, parameters.current.density)),
      );
      gl.uniform1f(pixelRatio, drawingDpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function animateTopoField(now: number) {
      frame = 0;
      if (
        disposed ||
        failed ||
        document.hidden ||
        !visible ||
        reduced.matches ||
        small.matches
      ) {
        stop();
        return;
      }
      if (previous)
        time +=
          Math.min((now - previous) / 1000, 0.1) *
          Math.min(3, Math.max(0, parameters.current.speed));
      previous = now;
      // At most 30 WebGL draws/s, with no allocation in this callback.
      if (now - lastDraw >= 1000 / 30) {
        draw();
        lastDraw = now;
      }
      frame = requestAnimationFrame(animateTopoField);
    }
    function synchronize() {
      stop();
      if (disposed) return;
      // Cover the heading/toolbar and the first existing visual block, without layout padding.
      const composition = layer.parentElement!;
      const firstBlock = composition.querySelector<HTMLElement>(
        ".welcome-panel, .summary, .empty-state",
      );
      const heading = composition.querySelector<HTMLElement>(".page-heading");
      const bottom = (firstBlock ?? heading)?.getBoundingClientRect().bottom;
      if (bottom !== undefined) {
        layer.style.height =
          Math.ceil(bottom - composition.getBoundingClientRect().top + 24) +
          "px";
      }
      if (failed) return;
      if (small.matches) {
        layer.dataset.renderer = "fallback";
        return;
      }
      if (!gl) {
        try {
          gl = canvas.getContext("webgl", {
            alpha: false,
            premultipliedAlpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
          });
          if (!gl) {
            fallback();
            return;
          }
          function compile(type: number, source: string) {
            const shader = gl!.createShader(type);
            if (!shader) throw new Error("shader");
            shaders.push(shader);
            gl!.shaderSource(shader, source);
            gl!.compileShader(shader);
            if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS))
              throw new Error("compile");
            return shader;
          }
          program = gl.createProgram();
          if (!program) throw new Error("program");
          gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
          gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
          gl.linkProgram(program);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw new Error("link");
          gl.useProgram(program);
          buffer = gl.createBuffer();
          if (!buffer) throw new Error("buffer");
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 3, -1, -1, 3]),
            gl.STATIC_DRAW,
          );
          const position = gl.getAttribLocation(program, "position");
          gl.enableVertexAttribArray(position);
          gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
          resolution = gl.getUniformLocation(program, "u_resolution");
          clock = gl.getUniformLocation(program, "u_time");
          contours = gl.getUniformLocation(program, "density");
          pixelRatio = gl.getUniformLocation(program, "u_dpr");
        } catch {
          fallback();
          return;
        }
      }
      const bounds = layer.getBoundingClientRect();
      // Limit DPR and drawing-buffer width independently of large monitors.
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        1.25,
        1536 / Math.max(1, bounds.width),
      );
      drawingDpr = dpr;
      canvas.width = Math.max(1, Math.round(bounds.width * dpr));
      canvas.height = Math.max(1, Math.round(bounds.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      layer.dataset.renderer = "webgl";
      if (document.hidden || !visible) return;
      draw();
      if (!reduced.matches && parameters.current.speed > 0) {
        layer.dataset.animation = "running";
        frame = requestAnimationFrame(animateTopoField);
      }
    }
    function lost(event: Event) {
      event.preventDefault();
      fallback();
    }
    canvas.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", synchronize);
    window.addEventListener("resize", synchronize);
    reduced.addEventListener("change", synchronize);
    small.addEventListener("change", synchronize);
    const resize = new ResizeObserver(synchronize);
    resize.observe(layer);
    resize.observe(layer.parentElement!);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      synchronize();
    });
    intersection.observe(layer);
    synchronizeRef.current = synchronize;
    synchronize();
    return () => {
      disposed = true;
      stop();
      resize.disconnect();
      intersection.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      document.removeEventListener("visibilitychange", synchronize);
      window.removeEventListener("resize", synchronize);
      reduced.removeEventListener("change", synchronize);
      small.removeEventListener("change", synchronize);
      synchronizeRef.current = null;
      release();
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  useEffect(() => {
    parameters.current = { speed, density };
    synchronizeRef.current?.();
  }, [speed, density]);

  return (
    <div
      ref={layerRef}
      className={"topofield-background " + className}
      style={{ opacity: Math.min(1, Math.max(0, opacity)) }}
      aria-hidden="true"
      data-renderer="fallback"
      data-animation="paused"
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
