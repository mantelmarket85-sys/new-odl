import React from 'react';

/**
 * Optimized hero image component for auth pages.
 * - Uses native lazy loading + async decode to avoid blocking the main thread
 * - Loaded as <img> (not CSS background) so the browser can prioritize it
 * - fetchpriority="high" because it's above-the-fold
 */
const AuthHeroImage = ({ src = '/assets/aust-campus.jpg', alt = '' }) => (
  <img
    className="aust-image-bg"
    src={src}
    alt={alt}
    decoding="async"
    fetchpriority="high"
    draggable="false"
  />
);

export default AuthHeroImage;
