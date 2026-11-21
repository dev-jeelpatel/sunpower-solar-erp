import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/** Touch/mouse signature canvas. ref.current: { isEmpty(), toDataURL(), clear() } */
const SignaturePad = forwardRef<any, { onChange?: () => void }>(function SignaturePad({ onChange }, ref) {
  const canvas = useRef<any>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0f172a';
  }, []);

  const pos = (e) => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { drawing.current = true; canvas.current.setPointerCapture(e.pointerId); const ctx = canvas.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)); };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvas.current.getContext('2d');
    ctx.lineTo(...pos(e)); ctx.stroke();
    if (empty) { setEmpty(false); onChange?.(); }
  };
  const up = () => { drawing.current = false; };

  useImperativeHandle(ref, () => ({
    isEmpty: () => empty,
    toDataURL: () => canvas.current.toDataURL('image/png'),
    clear: () => { const c = canvas.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setEmpty(true); onChange?.(); },
  }));

  return <canvas ref={canvas} className="sigpad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Customer signature area" />;
});

export default SignaturePad;
