import React from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import '../styles/landing.css';

const scholarships = [
  { name: 'Merit Scholarship', amount: 'Up to 50% Tuition', desc: 'Awarded to top-ranked students on the finalized merit list each cycle.', icon: 'fa-trophy', tag: 'Merit' },
  { name: 'Need-Based Aid', amount: 'Up to 40% Tuition', desc: 'For students from low-income families demonstrating genuine financial need.', icon: 'fa-hand-holding-heart', tag: 'Need' },
  { name: 'Women in Tech', amount: 'Up to 30% Tuition', desc: 'Encouraging female learners in computing through targeted fee waivers.', icon: 'fa-venus', tag: 'Inclusion' },
  { name: 'Rural Scholar', amount: 'Up to 35% Tuition', desc: 'For students from underserved rural areas of Khyber Pakhtunkhwa and beyond.', icon: 'fa-tractor', tag: 'Access' },
  { name: 'Working Professionals', amount: 'Up to 20% Tuition', desc: 'A modest discount for working students balancing employment with study.', icon: 'fa-briefcase', tag: 'Career' },
  { name: 'Special Needs Support', amount: 'Up to 50% Tuition', desc: 'For applicants with documented special needs or disabilities.', icon: 'fa-wheelchair', tag: 'Inclusion' },
];

const Scholarships = () => (
  <div className="aust-page">
    <SiteNav />

    <section className="aust-subhero">
      <span className="aust-subhero__crumb"><Link to="/">Home</Link> <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }} /> Scholarships</span>
      <h1>Scholarships &amp; Financial Aid</h1>
      <p>We believe quality higher education should be within reach — these scholarships make that possible.</p>
    </section>

    <section className="aust-section">
      <div className="aust-section__eyebrow">Financial Support</div>
      <h2 className="aust-section__title">Six ways AUST helps you afford your degree</h2>
      <p className="aust-section__sub">
        Scholarships are reviewed each cycle by Director Admissions and announced
        inside your student dashboard after merit selection.
      </p>
      <div className="aust-scholarship-grid aust-stagger">
        {scholarships.map((s) => (
          <article key={s.name} className="aust-scholarship-card aust-slide-up">
            <div className="aust-scholarship-card__head">
              <div className="ic"><i className={`fas ${s.icon}`} /></div>
              <span className="aust-scholarship-card__tag">{s.tag}</span>
            </div>
            <h3>{s.name}</h3>
            <div className="aust-scholarship-card__amount">{s.amount}</div>
            <p>{s.desc}</p>
          </article>
        ))}
      </div>
    </section>

    <section className="aust-section">
      <div className="aust-info-split">
        <div>
          <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>How to Apply</div>
          <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>Applying is part of admission</h2>
          <p className="aust-info-paragraph">
            You don't need a separate form. When you submit your application, your
            financial-aid request is automatically reviewed by the admissions team
            alongside your academic record.
          </p>
          <ul className="aust-bullet-list">
            <li><i className="fas fa-circle-check" /> Submit your application normally</li>
            <li><i className="fas fa-circle-check" /> Upload supporting documents (income / disability / domicile)</li>
            <li><i className="fas fa-circle-check" /> Admissions reviews and notifies you</li>
            <li><i className="fas fa-circle-check" /> Discount applied to admission fee invoice</li>
          </ul>
        </div>
        <div>
          <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>Have questions?</div>
          <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>Talk to admissions</h2>
          <p className="aust-info-paragraph">
            If you are unsure which scholarship you qualify for, write to us. The
            admissions office can guide you on documentation and timelines before
            you finalize your application.
          </p>
          <Link to="/contact" className="aust-btn-hero primary"><i className="fas fa-envelope" /> Contact Admissions</Link>
        </div>
      </div>
    </section>

    <SiteFooter />
  </div>
);

export default Scholarships;
