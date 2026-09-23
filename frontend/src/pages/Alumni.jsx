import React from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import { alumni } from '../data/courseScheme';
import '../styles/landing.css';

const Alumni = () => (
  <div className="aust-page">
    <SiteNav />

    <section className="aust-subhero">
      <div className="aust-subhero__crumb">
        <Link to="/">Home</Link> <span>/</span> <span style={{ color: '#fff' }}>Alumni</span>
      </div>
      <h1>Alumni Stories</h1>
      <p>
        Real students who completed AUST online and are now working as
        developers, analysts, IT officers and entrepreneurs across Pakistan.
      </p>
    </section>

    <section className="aust-section" style={{ paddingTop: '3rem' }}>
      <div className="aust-section__eyebrow">Living Proof</div>
      <h2 className="aust-section__title">Voices from our graduates</h2>
      <p className="aust-section__sub">
        We picked a small handful of recent stories — different cities, different
        careers, but all started right here.
      </p>

      <div className="aust-alumni-track-wrap" style={{ marginBottom: '2rem' }}>
        <div className="aust-alumni-track" style={{ animation: 'austAlumniScroll 50s linear infinite' }}>
          {[...alumni, ...alumni].map((a, i) => (
            <article key={`tk-${i}`} className="aust-alumni-card">
              <header className="aust-alumni-card__head">
                <div className="aust-alumni-card__avatar">{a.initials}</div>
                <div>
                  <div className="aust-alumni-card__name">{a.name}</div>
                  <div className="aust-alumni-card__role">{a.role}</div>
                </div>
              </header>
              <p className="aust-alumni-card__quote">“{a.quote}”</p>
              <div className="aust-alumni-card__stars">
                {'★'.repeat(a.rating)}{'☆'.repeat(5 - a.rating)}
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Static grid for accessibility / SEO */}
      <div
        className="aust-stagger"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 18,
          marginTop: '1rem',
        }}
      >
        {alumni.map((a) => (
          <article key={a.name} className="aust-alumni-card aust-slide-up" style={{ flex: 'unset' }}>
            <header className="aust-alumni-card__head">
              <div className="aust-alumni-card__avatar">{a.initials}</div>
              <div>
                <div className="aust-alumni-card__name">{a.name}</div>
                <div className="aust-alumni-card__role">{a.role}</div>
              </div>
            </header>
            <p className="aust-alumni-card__quote">“{a.quote}”</p>
            <div className="aust-alumni-card__stars">
              {'★'.repeat(a.rating)}{'☆'.repeat(5 - a.rating)}
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="aust-section">
      <div className="aust-cta-banner">
        <h2>Your story could be next</h2>
        <p>
          Every alumnus on this page started with a single application form.
          Spend a minute on yours today.
        </p>
        <div className="aust-hero__cta">
          <Link to="/register" className="aust-btn-hero primary">
            <i className="fas fa-user-plus" /> Apply Now
          </Link>
          <Link to="/why-choose-us" className="aust-btn-hero outline">
            <i className="fas fa-stars" /> Why AUST
          </Link>
        </div>
      </div>
    </section>

    <SiteFooter />
  </div>
);

export default Alumni;
