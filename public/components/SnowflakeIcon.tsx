import { useState, useEffect } from 'react';

// ============================================
// Snowflake Cooling Icon
// ============================================
export default function SnowflakeIcon({ size = 32, isOn = true }) {
  const [tick, setTick] = useState(0);
  
  useEffect(() => {
    if (!isOn) return;
    const interval = setInterval(() => setTick(t => (t + 1) % 100), 50);
    return () => clearInterval(interval);
  }, [isOn]);

  const rotation = tick * 3.6; // Full rotation every ~2.8 seconds
  const pulseScale = 1 + Math.sin(tick * 0.15) * 0.1;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {isOn && (
        <defs>
          <filter id="glowCold" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <radialGradient id="iceGradient">
            <stop offset="0%" stopColor="#e0f7ff" />
            <stop offset="100%" stopColor="#60d5ff" />
          </radialGradient>
        </defs>
      )}
      
      <g transform={`translate(50, 50) rotate(${rotation}) scale(${pulseScale})`} filter={isOn ? "url(#glowCold)" : ""}>
        {/* Main snowflake arms */}
        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
          <g key={i} transform={`rotate(${angle})`}>
            {/* Main arm */}
            <line
              x1="0" y1="0" x2="0" y2="-35"
              stroke={isOn ? `rgb(${100 + Math.sin((tick + i * 10) * 0.1) * 50}, ${200 + Math.sin((tick + i * 10) * 0.1) * 55}, 255)` : '#666'}
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* Side branches */}
            <line x1="0" y1="-20" x2="-8" y2="-12" stroke={isOn ? "url(#iceGradient)" : '#666'} strokeWidth="2" strokeLinecap="round"/>
            <line x1="0" y1="-20" x2="8" y2="-12" stroke={isOn ? "url(#iceGradient)" : '#666'} strokeWidth="2" strokeLinecap="round"/>
            <line x1="0" y1="-30" x2="-6" y2="-24" stroke={isOn ? "url(#iceGradient)" : '#666'} strokeWidth="2" strokeLinecap="round"/>
            <line x1="0" y1="-30" x2="6" y2="-24" stroke={isOn ? "url(#iceGradient)" : '#666'} strokeWidth="2" strokeLinecap="round"/>
            {/* Crystal tip */}
            <circle cx="0" cy="-35" r="2.5" fill={isOn ? "#a0e7ff" : '#666'}/>
          </g>
        ))}
        
        {/* Center crystal */}
        <circle cx="0" cy="0" r="5" fill={isOn ? "#60d5ff" : '#666'} opacity={isOn ? 0.8 : 1}/>
        
        {/* Animated sparkles */}
        {isOn && [0, 120, 240].map((angle, i) => (
          <g key={`sparkle-${i}`} transform={`rotate(${angle + tick * 2})`}>
            <circle
              cx="0" cy="-25"
              r={1 + Math.sin((tick * 0.2 + i) * 2) * 0.5}
              fill="#ffffff"
              opacity={0.6 + Math.sin((tick * 0.15 + i)) * 0.4}
            />
          </g>
        ))}
      </g>
      
      {/* Cold air waves */}
      {isOn && [0, 1, 2].map(i => (
        <path
          key={i}
          d={`M${20 + i * 20} ${70 + i * 5} Q${25 + i * 20} ${75 + Math.sin((tick * 0.2 + i)) * 3} ${30 + i * 20} ${70 + i * 5}`}
          stroke={`rgba(100, 200, 255, ${0.4 - i * 0.1})`}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          style={{
            transform: `translateY(${Math.sin((tick * 0.12 + i * 0.8)) * 5}px)`,
            opacity: 0.5 + Math.sin((tick * 0.08 + i)) * 0.3
          }}
        />
      ))}
    </svg>
  );
}