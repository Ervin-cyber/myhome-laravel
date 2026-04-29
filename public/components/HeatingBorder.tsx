import { JSX, useEffect, useState } from "react";

export default function HeatingBorder({ children, isOn = true, borderRadius = 16, mode = 'heating' }: { children: JSX.Element, isOn: boolean, borderRadius: number, mode?: 'heating' | 'cooling' }) {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!isOn) return;
    const interval = setInterval(() => setPulse(p => (p + 1) % 100), 50);
    return () => clearInterval(interval);
  }, [isOn]);
  const glow = isOn ? Math.sin(pulse * 0.1) * 0.3 + 0.7 : 0;
  const isCooling = mode === 'cooling';
  const mainColor = isCooling ? '100, 180, 255' : '255, 100, 0';
  const shadowColor = isCooling ? '50, 120, 255' : '255, 50, 0';

  return (
    <div className="relative overflow-hidden h-full" style={{
      borderRadius,
      ...(isOn ? { boxShadow: `inset 0 0 ${30 + glow * 20}px rgba(${mainColor}, ${0.12 + glow * 0.08}), inset 0 0 ${60 + glow * 30}px rgba(${shadowColor}, ${0.06 + glow * 0.04})` } : {})
    }}>
      <div className="absolute inset-0 pointer-events-none" style={{
        borderRadius,
        ...(isOn ? {
          border: `3px solid rgba(${mainColor}, ${0.4 + glow * 0.3})`,
          boxShadow: `0 0 10px rgba(${mainColor}, ${0.3 + glow * 0.2}), 0 0 20px rgba(${shadowColor}, ${0.15 + glow * 0.1})`
        } : { border: '3px solid #333' })
      }} />
      {!!isOn && [0, 1, 2, 3].map(c => (
        <div key={c} className="absolute w-16 h-16 pointer-events-none" style={{
          top: c < 2 ? borderRadius / 2 : 'auto', bottom: c >= 2 ? borderRadius / 2 : 'auto',
          left: c % 2 === 0 ? borderRadius / 2 : 'auto', right: c % 2 === 1 ? borderRadius / 2 : 'auto',
          background: `radial-gradient(circle at ${c % 2 === 0 ? '0%' : '100%'} ${c < 2 ? '0%' : '100%'}, rgba(${mainColor}, ${0.1 + glow * 0.05}) 0%, transparent 45%)`,
          filter: 'blur(3px)'
        }} />
      ))}
      {children}
    </div>
  );
}