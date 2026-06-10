import { useEffect, useRef } from 'react';

type NodePoint = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const NODE_COUNT = 90;
const CONNECT_DISTANCE = 140;
const CURSOR_INFLUENCE = 170;

const MeshBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodes: NodePoint[] = [];
    const cursor = { x: -9999, y: -9999, active: false };
    let width = 0;
    let height = 0;
    let raf = 0;

    const randomVelocity = () => (Math.random() - 0.5) * 0.35;

    const resize = () => {
      const parent = canvas.parentElement;
      width = parent ? parent.clientWidth : window.innerWidth;
      height = parent ? parent.clientHeight : 520;
      canvas.width = width;
      canvas.height = height;

      nodes.length = 0;
      for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: randomVelocity(),
          vy: randomVelocity(),
        });
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      cursor.x = e.clientX - rect.left;
      cursor.y = e.clientY - rect.top;
      cursor.active = true;
    };

    const onMouseLeave = () => {
      cursor.active = false;
      cursor.x = -9999;
      cursor.y = -9999;
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;

        if (n.x <= 0 || n.x >= width) n.vx *= -1;
        if (n.y <= 0 || n.y >= height) n.vy *= -1;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);

          if (dist < CONNECT_DISTANCE) {
            const alpha = 1 - dist / CONNECT_DISTANCE;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(96, 165, 250, ${alpha * 0.28})`;
            ctx.lineWidth = 1;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      nodes.forEach((n, index) => {
        let radius = 1.8;
        let color = 'rgba(147, 197, 253, 0.8)';

        if (cursor.active) {
          const distToCursor = Math.hypot(n.x - cursor.x, n.y - cursor.y);
          if (distToCursor < CURSOR_INFLUENCE) {
            const influence = 1 - distToCursor / CURSOR_INFLUENCE;
            const blink = 0.55 + 0.45 * Math.sin(time * 0.008 + index);
            radius = 2 + influence * 3.5 * blink;
            color = `rgba(56, 189, 248, ${0.7 + influence * 0.3})`;

            ctx.beginPath();
            ctx.strokeStyle = `rgba(56, 189, 248, ${influence * 0.35})`;
            ctx.lineWidth = 1;
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(cursor.x, cursor.y);
            ctx.stroke();
          }
        }

        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      if (cursor.active) {
        const pulse = 10 + Math.sin(time * 0.01) * 4;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.arc(cursor.x, cursor.y, pulse, 0, Math.PI * 2);
        ctx.stroke();
      }

      raf = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);
    raf = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-90" />;
};

export default MeshBackground;
