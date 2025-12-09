import { useEffect, useState } from "react";

export default function HeatingBorder({ children, isOn = true, borderRadius = 16 }) {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!isOn) return;
    const interval = setInterval(() => setPulse(p => (p + 1) % 100), 50);
    return () => clearInterval(interval);
  }, [isOn]);
  const glow = isOn ? Math.sin(pulse * 0.1) * 0.3 + 0.7 : 0;

  return (
    <div className="relative overflow-hidden h-full" style={{
      borderRadius,
      ...(isOn ? { boxShadow: `inset 0 0 ${40 + glow * 30}px rgba(255, 100, 0, ${0.15 + glow * 0.1}), inset 0 0 ${80 + glow * 40}px rgba(255, 50, 0, ${0.08 + glow * 0.05})` } : {})
    }}>
      <div className="absolute inset-0 pointer-events-none" style={{
        borderRadius,
        ...(isOn ? {
          border: `3px solid rgba(255, ${80 + glow * 40}, 0, ${0.5 + glow * 0.4})`,
          boxShadow: `0 0 15px rgba(255, 100, 0, ${0.4 + glow * 0.3}), 0 0 30px rgba(255, 50, 0, ${0.2 + glow * 0.15})`
        } : { border: '3px solid #333' })
      }} />
      {isOn && [0, 1, 2, 3].map(c => (
        <div key={c} className="absolute w-24 h-24 pointer-events-none" style={{
          top: c < 2 ? borderRadius / 2 : 'auto', bottom: c >= 2 ? borderRadius / 2 : 'auto',
          left: c % 2 === 0 ? borderRadius / 2 : 'auto', right: c % 2 === 1 ? borderRadius / 2 : 'auto',
          background: `radial-gradient(circle at ${c % 2 === 0 ? '0%' : '100%'} ${c < 2 ? '0%' : '100%'}, rgba(255, 100, 0, ${0.3 + glow * 0.2}) 0%, transparent 70%)`,
          filter: 'blur(8px)'
        }} />
      ))}
      {children}
    </div>
  );
}