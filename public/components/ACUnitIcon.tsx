import { useState, useEffect } from 'react';

// ============================================
// AC Unit Cooling Icon
// ============================================
export default function ACUnitIcon({ size = 32, isOn = true }) {
  const [tick, setTick] = useState(0);
  
  useEffect(() => {
    if (!isOn) return;
    const interval = setInterval(() => setTick(t => (t + 1) % 100), 50);
    return () => clearInterval(interval);
  }, [isOn]);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {isOn && (
        <defs>
          <filter id="glowAC" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
      )}
      
      {/* AC Unit body */}
      <rect x="15" y="30" width="70" height="45" rx="5" fill="#4a5568" stroke="#2d3748" strokeWidth="2"/>
      
      {/* Vents */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <rect
          key={i}
          x="20"
          y={38 + i * 6}
          width="60"
          height="3"
          rx="1.5"
          fill={isOn ? `rgba(100, 200, 255, ${0.3 + Math.sin((tick * 0.1 + i * 0.3)) * 0.2})` : '#555'}
        />
      ))}
      
      {/* Power indicator */}
      <circle
        cx="75"
        cy="40"
        r="3"
        fill={isOn ? '#60d5ff' : '#555'}
        opacity={isOn ? 0.8 + Math.sin(tick * 0.2) * 0.2 : 1}
        filter={isOn ? "url(#glowAC)" : ""}
      />
      
      {/* Cold air flow - animated curves */}
      {isOn && (
        <g>
          {/* Air streams */}
          {[0, 1, 2, 3].map(i => (
            <path
              key={i}
              d={`M${25 + i * 15} 75 Q${27 + i * 15} ${80 + Math.sin((tick * 0.15 + i * 0.5)) * 4} ${29 + i * 15} ${85 + i * 2}`}
              stroke={`rgba(100, 200, 255, ${0.6 - i * 0.1})`}
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              style={{
                transform: `translateY(${Math.sin((tick * 0.1 + i * 0.7)) * 6}px)`,
                opacity: 0.6 + Math.sin((tick * 0.08 + i)) * 0.3
              }}
              filter="url(#glowAC)"
            />
          ))}
          
          {/* Ice crystals */}
          {[0, 1, 2].map(i => (
            <g key={`crystal-${i}`}>
              <polygon
                points={`${35 + i * 15},${85 + Math.sin((tick * 0.12 + i)) * 8} ${37 + i * 15},${88 + Math.sin((tick * 0.12 + i)) * 8} ${35 + i * 15},${91 + Math.sin((tick * 0.12 + i)) * 8} ${33 + i * 15},${88 + Math.sin((tick * 0.12 + i)) * 8}`}
                fill={`rgba(150, 220, 255, ${0.5 + Math.sin((tick * 0.15 + i)) * 0.3})`}
                filter="url(#glowAC)"
              />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

// ============================================
// Heating Icon (for comparison)
// ============================================
function HeatingIcon({ size = 32, isOn = true }) {
  const [tick, setTick] = useState(0);
  
  useEffect(() => {
    if (!isOn) return;
    const interval = setInterval(() => setTick(t => (t + 1) % 100), 50);
    return () => clearInterval(interval);
  }, [isOn]);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {isOn && (
        <defs>
          <filter id="glowHeat" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
      )}
      <rect x="10" y="45" width="80" height="45" rx="5" fill={isOn ? '#4a4a4a' : '#3a3a3a'} stroke="#555" strokeWidth="2"/>
      {[0, 1, 2, 3, 4].map(i => (
        <rect key={i} x={18 + i * 15} y="50" width="10" height="35" rx="2" 
          fill={isOn ? `rgb(${200 + Math.sin((tick + i * 20) * 0.15) * 55}, ${80 + Math.sin((tick + i * 20) * 0.15) * 40}, 0)` : '#555'}/>
      ))}
      <rect x="18" y="90" width="10" height="8" rx="2" fill="#555"/>
      <rect x="72" y="90" width="10" height="8" rx="2" fill="#555"/>
      {isOn && (
        <g filter="url(#glowHeat)">
          {[0, 1, 2].map(i => (
            <path key={i} d={`M${25 + i * 25} 40 Q${28 + i * 25} ${33 - Math.sin((tick * 0.2 + i) % Math.PI) * 4} ${31 + i * 25} 40`}
              stroke={`rgba(255, ${150 - i * 30}, 0, ${0.9 - i * 0.2})`} strokeWidth="3" fill="none" strokeLinecap="round"
              style={{ transform: `translateY(${-Math.sin((tick * 0.15 + i * 0.5)) * 6}px)` }}/>
          ))}
          <path d={`M50 ${35 - Math.sin(tick * 0.3) * 4} Q45 ${25 - Math.sin(tick * 0.25) * 3} 50 ${15 - Math.sin(tick * 0.2) * 3} Q55 ${25 - Math.sin(tick * 0.25 + 1) * 3} 50 ${35 - Math.sin(tick * 0.3) * 4}`}
            fill={`rgba(255, ${100 + Math.sin(tick * 0.2) * 50}, 0, 0.9)`}/>
        </g>
      )}
    </svg>
  );
}