import { useEffect, useState } from "react";

export default function HeatingIcon({ size = 32, isOn = true, className = '' }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isOn) return;
    const interval = setInterval(() => setTick(t => (t + 1) % 100), 50);
    return () => clearInterval(interval);
  }, [isOn]);

  const s = size / 100; // scale factor

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className}>
      {isOn && (
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
      )}
      
      {/* Radiator body */}
      <rect x="10" y="45" width="80" height="45" rx="5" fill={isOn ? '#4a4a4a' : '#3a3a3a'} stroke="#555" strokeWidth="2"/>
      
      {/* Radiator fins */}
      {[0, 1, 2, 3, 4].map(i => (
        <rect 
          key={i} 
          x={18 + i * 15} y="50" width="10" height="35" rx="2" 
          fill={isOn 
            ? `rgb(${200 + Math.sin((tick + i * 20) * 0.15) * 55}, ${80 + Math.sin((tick + i * 20) * 0.15) * 40}, 0)`
            : '#555'
          }
        />
      ))}
      
      {/* Legs */}
      <rect x="18" y="90" width="10" height="8" rx="2" fill="#555"/>
      <rect x="72" y="90" width="10" height="8" rx="2" fill="#555"/>

      {/* Heat waves & flames (only when on) */}
      {isOn && (
        <g filter="url(#glow)">
          {[0, 1, 2].map(i => (
            <path
              key={i}
              d={`M${25 + i * 25} 40 Q${28 + i * 25} ${33 - Math.sin((tick * 0.2 + i) % Math.PI) * 4} ${31 + i * 25} 40`}
              stroke={`rgba(255, ${150 - i * 30}, 0, ${0.9 - i * 0.2})`}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              style={{ transform: `translateY(${-Math.sin((tick * 0.15 + i * 0.5)) * 6}px)` }}
            />
          ))}
          {/* Flames */}
          <path
            d={`M50 ${35 - Math.sin(tick * 0.3) * 4} Q45 ${25 - Math.sin(tick * 0.25) * 3} 50 ${15 - Math.sin(tick * 0.2) * 3} Q55 ${25 - Math.sin(tick * 0.25 + 1) * 3} 50 ${35 - Math.sin(tick * 0.3) * 4}`}
            fill={`rgba(255, ${100 + Math.sin(tick * 0.2) * 50}, 0, 0.9)`}
          />
          <path
            d={`M30 ${38 - Math.sin(tick * 0.25) * 3} Q27 ${30 - Math.sin(tick * 0.2) * 2} 30 ${22 - Math.sin(tick * 0.22) * 2} Q33 ${30 - Math.sin(tick * 0.2 + 1) * 2} 30 ${38 - Math.sin(tick * 0.25) * 3}`}
            fill={`rgba(255, ${120 + Math.sin(tick * 0.18) * 40}, 0, 0.7)`}
          />
          <path
            d={`M70 ${38 - Math.sin(tick * 0.28) * 3} Q67 ${30 - Math.sin(tick * 0.22) * 2} 70 ${22 - Math.sin(tick * 0.24) * 2} Q73 ${30 - Math.sin(tick * 0.22 + 1) * 2} 70 ${38 - Math.sin(tick * 0.28) * 3}`}
            fill={`rgba(255, ${120 + Math.sin(tick * 0.2) * 40}, 0, 0.7)`}
          />
        </g>
      )}
    </svg>
  );
}