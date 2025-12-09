"use client";

import { JSX, useEffect, useState } from "react";

export default function FloatingParticles(): JSX.Element {
  const [tick, setTick] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => (t + 1) % 1000), 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(25)].map((_, i) => (    
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 3 + (i % 4) * 2,
            height: 3 + (i % 4) * 2,
            left: `${10 + (i * 4.5) % 80}%`,
            bottom: `${(tick * 0.1 + i * 15) % 120 - 10}%`,
            background: `rgba(255, ${100 + i * 5}, 0, ${0.2 + (i % 3) * 0.1})`,
            boxShadow: `0 0 ${6 + i % 4}px rgba(255, 100, 0, 0.4)`,
            transition: 'bottom 0.5s linear',
          }}
        />
      ))}
    </div>
  );
}