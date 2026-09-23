import React, { useEffect } from 'react';
import { LMS_FRONTEND_URL } from '../utils/lmsConfig';

/**
 * AUST LMS entry point (Section 8 & 12).
 *
 * The Learning Management System is now a fully separate React application that
 * runs on its own origin (LMS_FRONTEND_URL, port 5174). The legacy in-portal
 * "Under Construction" placeholder has been removed entirely per Section 12.
 *
 * This route simply forwards the user to the live LMS sign-in page. Any LMS
 * authentication, forced password change, and role-based dashboards are handled
 * by the LMS frontend itself.
 */
const LMS = () => {
  useEffect(() => {
    // Full-page redirect to the standalone LMS application's login screen.
    window.location.replace(`${LMS_FRONTEND_URL}/login`);
  }, []);

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <div className="spinner" aria-hidden="true"></div>
      <h2 style={{ color: '#1a2744', fontSize: '1.2rem' }}>Opening the AUST Learning Management System…</h2>
      <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
        If you are not redirected automatically,{' '}
        <a href={`${LMS_FRONTEND_URL}/login`} style={{ color: '#2563eb', fontWeight: 600 }}>
          click here to open the LMS
        </a>
        .
      </p>
    </div>
  );
};

export default LMS;
