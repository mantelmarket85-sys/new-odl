import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../utils/AuthContext';

const dashHref = (user) => {
  if (!user) return '/login';
  if (user.role === 'director_admissions' || user.role === 'admin') return '/admin';
  if (user.role === 'coordinator') return '/coordinator';
  return '/dashboard';
};

/**
 * Mega menu structure — pulls inspiration from the AUST RJ landing page
 * (Academic Programs, Student Experience, Online Learning, About, Contact)
 * and merges with the real routes that already exist in this app
 * (course-scheme, why-choose-us, alumni, lms, register, etc.).
 *
 * Each menu can either:
 *  - link directly via `to`
 *  - or expose a dropdown via `dropdown: [{ label, to, icon, desc }]`
 */
const MENU = [
  { label: 'Home', to: '/' },
  {
    label: 'About',
    dropdown: [
      { label: 'About AUST',          to: '/about',          icon: 'fa-university',   desc: 'University profile, history & identity' },
      { label: 'Vision & Mission',    to: '/about#vision',   icon: 'fa-bullseye',     desc: 'What guides our academic direction' },
      { label: 'Accreditation',       to: '/about#accred',   icon: 'fa-certificate',  desc: 'Recognized academic standards' },
      { label: 'Why Choose AUST',     to: '/why-choose-us',  icon: 'fa-stars',        desc: 'Honest reasons students pick AUST' },
    ],
  },
  {
    label: 'Admissions',
    dropdown: [
      { label: 'Apply Online',        to: '/register',        icon: 'fa-rocket',         desc: 'Create your student account' },
      { label: 'Admission Process',   to: '/admissions',      icon: 'fa-list-check',     desc: 'Four clear steps to apply' },
      { label: 'Fee Structure',       to: '/fee-structure',   icon: 'fa-money-bill-wave',desc: 'Transparent program fees' },
      { label: 'Scholarships',        to: '/scholarships',    icon: 'fa-award',          desc: 'Need & merit support' },
      { label: 'Merit Lists',         to: '/admissions#merit',icon: 'fa-ranking-star',   desc: 'How merit is calculated' },
    ],
  },
  {
    label: 'Programs',
    dropdown: [
      { label: 'Faculties & Departments', to: '/faculties',     icon: 'fa-building-columns', desc: 'Academic units offering ODL' },
      { label: 'Associate Degree (ADCS)', to: '/programs',      icon: 'fa-graduation-cap',   desc: '2-year Associate Degree in Computer Science' },
      { label: 'Scheme of Study',         to: '/course-scheme', icon: 'fa-book',             desc: 'Semester-wise course plan' },
      { label: 'Eligibility',             to: '/programs#eligibility', icon: 'fa-clipboard-check', desc: 'Who can apply' },
    ],
  },
  {
    label: 'Online Learning',
    dropdown: [
      { label: 'ODL Overview',       to: '/odl',         icon: 'fa-globe',          desc: 'How Open & Distance Learning works' },
      { label: 'LMS / Learning Portal', to: '/lms',      icon: 'fa-chalkboard-user', desc: 'Live + recorded classes' },
      { label: 'Virtual Classroom',  to: '/odl#virtual', icon: 'fa-video',           desc: 'Attend lectures from anywhere' },
      { label: 'Online Examinations',to: '/odl#exams',   icon: 'fa-file-pen',        desc: 'Sit exams from home' },
      { label: 'Digital Library',    to: '/odl#library', icon: 'fa-book-open-reader',desc: 'Journals, course packs & more' },
    ],
  },
  {
    label: 'Student Life',
    dropdown: [
      { label: 'Alumni Stories',     to: '/alumni',        icon: 'fa-user-tie',     desc: 'Voices from real graduates' },
      { label: 'News & Events',      to: '/news',          icon: 'fa-newspaper',    desc: 'Announcements & updates' },
      { label: 'Notices',            to: '/news#notices',  icon: 'fa-bullhorn',     desc: 'Important notifications' },
      { label: 'Downloads',          to: '/downloads',     icon: 'fa-download',     desc: 'Forms, prospectus & guides' },
      { label: 'FAQs',               to: '/faq',           icon: 'fa-circle-question', desc: 'Quick answers to common questions' },
    ],
  },
  { label: 'Contact', to: '/contact' },
];

const SiteNav = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openIdx, setOpenIdx] = useState(null); // mobile accordion
  const navRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileOpen(false);
    setOpenIdx(null);
  }, [location.pathname, location.hash]);

  // Close mobile menu when resizing to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1080) {
        setMobileOpen(false);
        setOpenIdx(null);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleMobileDropdown = (i) => {
    setOpenIdx((cur) => (cur === i ? null : i));
  };

  return (
    <header
      ref={navRef}
      className={`aust-glass-nav aust-mega-nav${scrolled ? ' is-scrolled' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}
    >
      {/* Top utility bar — visible on desktop only */}
      <div className="aust-topbar" role="region" aria-label="Top utility links">
        <div className="aust-topbar__inner">
          <a href="mailto:director@aust.edu.pk"><i className="fas fa-envelope" /> director@aust.edu.pk</a>
          <a href="tel:+92992123456"><i className="fas fa-phone" /> +92 992 123456</a>
          <span className="aust-topbar__sep" />
          <Link to="/contact"><i className="fas fa-circle-info" /> Request Info</Link>
          <Link to={user ? dashHref(user) : '/login'}>
            <i className="fas fa-right-to-bracket" /> {user ? 'Dashboard' : 'Login'}
          </Link>
        </div>
      </div>

      <div className="aust-mega-nav__row">
        <Link to="/" className="aust-glass-nav__brand" style={{ textDecoration: 'none' }}>
          <img src="/assets/aust-logo.png" alt="AUST" width="38" height="38" decoding="async" />
          <span>
            <b>Abbottabad University Of Science &amp; Technology</b>
            <small>Open &amp; Distance Learning</small>
          </span>
        </Link>

        {/* Mobile hamburger */}
        <button
          type="button"
          className={`aust-menu-toggle${mobileOpen ? ' is-active' : ''}`}
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span /><span /><span />
        </button>

        {/* Desktop + mobile nav */}
        <nav className={`aust-mega-nav__menu${mobileOpen ? ' is-open' : ''}`} aria-label="Primary navigation">
          <ul>
            {MENU.map((item, i) => {
              if (!item.dropdown) {
                return (
                  <li key={item.label} className="aust-mega-item">
                    <Link to={item.to} className="aust-mega-item__link">{item.label}</Link>
                  </li>
                );
              }
              const isOpen = openIdx === i;
              return (
                <li key={item.label} className={`aust-mega-item has-dropdown${isOpen ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="aust-mega-item__link"
                    onClick={() => toggleMobileDropdown(i)}
                    aria-expanded={isOpen}
                  >
                    {item.label} <i className="fas fa-chevron-down aust-mega-caret" />
                  </button>
                  <div className="aust-mega-dropdown" role="menu">
                    {item.dropdown.map((d) => (
                      <Link key={d.label} to={d.to} className="aust-mega-dropdown__item" role="menuitem">
                        <span className="ic"><i className={`fas ${d.icon}`} /></span>
                        <span className="txt">
                          <strong>{d.label}</strong>
                          {d.desc && <small>{d.desc}</small>}
                        </span>
                      </Link>
                    ))}
                  </div>
                </li>
              );
            })}

            {/* Auth CTA section (mobile shows inside menu, desktop shows in a row) */}
            <li className="aust-mega-item aust-mega-cta-li">
              {user ? (
                <Link to={dashHref(user)} className="cta aust-mega-cta">
                  <i className="fas fa-gauge-high" /> Dashboard
                </Link>
              ) : (
                <span className="aust-mega-auth">
                  <Link to="/login" className="ghost">Login</Link>
                  <Link to="/register" className="cta">Apply Now</Link>
                </span>
              )}
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default SiteNav;
