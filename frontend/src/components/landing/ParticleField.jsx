import React, { useMemo } from 'react';

/**
 * ParticleField — lightweight CSS-only 3D-feeling particle field.
 * Generates N particles with randomized start positions, sizes,
 * 3D drift vectors and animation delays using CSS variables.
 */
const ParticleField = ({ count = 32 }) => {
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const left = Math.random() * 100;
        const top = 60 + Math.random() * 50;
        const size = 3 + Math.random() * 7;
        const dx = (Math.random() - 0.5) * 220;
        const dy = -(120 + Math.random() * 320);
        const dz = (Math.random() - 0.3) * 240;
        const dur = 12 + Math.random() * 16;
        const delay = -Math.random() * dur;
        return { i, left, top, size, dx, dy, dz, dur, delay };
      }),
    [count]
  );

  return (
    <div className="aust-hero__particles" aria-hidden="true">
      {dots.map((d) => (
        <span
          key={d.i}
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
            // CSS variables consumed by the keyframes in landing.css
            ['--dx']: `${d.dx}px`,
            ['--dy']: `${d.dy}px`,
            ['--dz']: `${d.dz}px`,
          }}
        />
      ))}
    </div>
  );
};

export default ParticleField;
