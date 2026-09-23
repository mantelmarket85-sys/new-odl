import React from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import { whyChooseUs } from '../data/courseScheme';
import '../styles/landing.css';

const extras = [
  {
    icon: 'fa-clock',
    title: 'Lectures On Your Schedule',
    desc: 'Recorded lectures and live sessions you can attend or replay later. Built for working students and parents.',
  },
  {
    icon: 'fa-mobile-screen',
    title: 'Mobile First Portal',
    desc: 'The portal works just as well on a phone as it does on a desktop. Your studies travel with you.',
  },
  {
    icon: 'fa-headset',
    title: 'Friendly Support',
    desc: 'A real coordinator team that answers in plain English (and Urdu) when you have a question.',
  },
];

const WhyChooseUs = () => {
  return (
    <div className="aust-page">
      <SiteNav />

      <section className="aust-subhero">
        <div className="aust-subhero__crumb">
          <Link to="/">Home</Link> <span>/</span> <span style={{ color: '#fff' }}>Why Choose Us</span>
        </div>
        <h1>Why students keep choosing AUST</h1>
        <p>
          Honest, plain reasons our learners pick AUST for their online studies —
          no marketing fluff, just what makes the day-to-day experience work.
        </p>
      </section>

      <section className="aust-section" style={{ paddingTop: '3rem' }}>
        <div className="aust-section__eyebrow">The Core Six</div>
        <h2 className="aust-section__title">What we get right, every term</h2>
        <p className="aust-section__sub">
          Six foundations that shape how teaching, support and assessment work
          across every program.
        </p>
        <div className="aust-why-grid aust-stagger">
          {whyChooseUs.map((w) => (
            <div key={w.title} className="aust-why-card aust-slide-up">
              <div className="ic"><i className={`fas ${w.icon}`} /></div>
              <h4>{w.title}</h4>
              <p>{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="aust-section">
        <div className="aust-section__eyebrow">A Few More Reasons</div>
        <h2 className="aust-section__title">Small things that add up</h2>
        <p className="aust-section__sub">
          The little details that make a calmer, kinder learning experience.
        </p>
        <div className="aust-why-grid aust-stagger">
          {extras.map((w) => (
            <div key={w.title} className="aust-why-card aust-slide-up">
              <div className="ic"><i className={`fas ${w.icon}`} /></div>
              <h4>{w.title}</h4>
              <p>{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="aust-section">
        <div className="aust-cta-banner">
          <h2>Sound like the right fit?</h2>
          <p>
            Spend a minute creating your account and start your application
            today. You can save your progress and return whenever it suits you.
          </p>
          <div className="aust-hero__cta">
            <Link to="/register" className="aust-btn-hero primary">
              <i className="fas fa-user-plus" /> Create Account
            </Link>
            <Link to="/course-scheme" className="aust-btn-hero outline">
              <i className="fas fa-book-open" /> See the courses
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export default WhyChooseUs;
