import React from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import '../styles/landing.css';

const fees = [
  { label: 'Application Processing Fee', amount: 'PKR 1,200', note: 'One-time, non-refundable. Paid before submitting the application.' },
  { label: 'Admission Fee (Per Semester)', amount: 'PKR 25,000', note: 'Indicative — finalized per admission cycle by Director Admissions.' },
  { label: 'Examination Fee', amount: 'Included', note: 'Included in semester fee for ODL programs.' },
  { label: 'Library / LMS Fee', amount: 'Included', note: 'Digital library & LMS access included with enrollment.' },
];

const FeeStructure = () => (
  <div className="aust-page">
    <SiteNav />

    <section className="aust-subhero">
      <span className="aust-subhero__crumb"><Link to="/">Home</Link> <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }} /> Fee Structure</span>
      <h1>Fee Structure</h1>
      <p>Transparent, predictable fees designed to make quality higher education reachable for every Pakistani learner.</p>
    </section>

    <section className="aust-section">
      <div className="aust-section__eyebrow">Tuition-Friendly</div>
      <h2 className="aust-section__title">A clear breakdown of program fees</h2>
      <p className="aust-section__sub">
        Final fee amounts for any cycle are announced by the Director Admissions
        and visible inside your dashboard once admissions open.
      </p>
      <div className="aust-fee-grid aust-stagger">
        {fees.map((f) => (
          <article key={f.label} className="aust-fee-card aust-slide-up">
            <div className="aust-fee-card__amount">{f.amount}</div>
            <h3>{f.label}</h3>
            <p>{f.note}</p>
          </article>
        ))}
      </div>
    </section>

    <section className="aust-section">
      <div className="aust-info-split">
        <div>
          <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>Payment Methods</div>
          <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>Pay how you prefer</h2>
          <ul className="aust-bullet-list">
            <li><i className="fas fa-building-columns" /> <strong>Bank Deposit</strong> — Upload a copy of your deposit slip.</li>
            <li><i className="fas fa-mobile-screen" /> <strong>Bank Payment Gateway</strong> — Pay securely online via card or bank account.</li>
            <li><i className="fas fa-receipt" /> <strong>Auto-Receipt</strong> — Receipts appear in your dashboard instantly.</li>
            <li><i className="fas fa-rotate-left" /> <strong>Refund Policy</strong> — Per the published academic regulations.</li>
          </ul>
        </div>
        <div>
          <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>What's Included</div>
          <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>No surprise charges</h2>
          <ul className="aust-bullet-list">
            <li><i className="fas fa-circle-check" /> All live &amp; recorded lectures</li>
            <li><i className="fas fa-circle-check" /> Digital library access</li>
            <li><i className="fas fa-circle-check" /> Online proctored examinations</li>
            <li><i className="fas fa-circle-check" /> Faculty office hours &amp; support</li>
            <li><i className="fas fa-circle-check" /> LMS platform &amp; mobile portal</li>
            <li><i className="fas fa-circle-check" /> Digital transcripts &amp; certificates</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="aust-section">
      <div className="aust-cta-banner">
        <h2>Need help with fees?</h2>
        <p>Check our scholarships page or contact the admissions office — we are here to help.</p>
        <div className="aust-hero__cta">
          <Link to="/scholarships" className="aust-btn-hero primary"><i className="fas fa-award" /> Scholarships</Link>
          <Link to="/contact" className="aust-btn-hero outline"><i className="fas fa-envelope" /> Contact Admissions</Link>
        </div>
      </div>
    </section>

    <SiteFooter />
  </div>
);

export default FeeStructure;
