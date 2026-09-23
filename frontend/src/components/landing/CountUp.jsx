import React, { useEffect, useRef, useState } from 'react';

/**
 * CountUp — animates a number from 0 → value when it scrolls into view.
 * Uses IntersectionObserver and requestAnimationFrame for smooth easing.
 */
const CountUp = ({ value = 0, duration = 1800, suffix = '', prefix = '' }) => {
  const ref = useRef(null);
  const [n, setN] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            const start = performance.now();
            const tick = (now) => {
              const t = Math.min(1, (now - start) / duration);
              const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
              setN(Math.floor(eased * value));
              if (t < 1) requestAnimationFrame(tick);
              else setN(value);
            };
            requestAnimationFrame(tick);
          }
        });
      },
      { threshold: 0.25 }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [value, duration]);

  const formatted = n.toLocaleString('en-US');
  return (
    <span ref={ref}>
      {prefix}{formatted}{suffix}
    </span>
  );
};

export default CountUp;
