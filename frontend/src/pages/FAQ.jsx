import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import '../styles/landing.css';

const groups = [
  {
    title: 'Admissions',
    icon: 'fa-list-check',
    items: [
      { q: 'Who is eligible to apply?', a: 'Intermediate (FA/FSc/ICS/I.Com/DAE) with at least 45% aggregate marks. There is no age restriction and we welcome students from all provinces.' },
      { q: 'Can I apply if my FSc result is not yet declared?', a: 'Yes. Apply as "Result Awaited" using your Part-I marks. Once your full FSc result is declared you can update it from your student dashboard.' },
      { q: 'How is merit calculated?', a: 'Merit is a transparent weighted score combining your academic record (Matric + FSc), interview marks and the cycle weights set by the Director Admissions. The breakdown is visible inside your dashboard.' },
      { q: 'Is there an entry test?', a: 'There is no MCQ-style entry test. Shortlisted candidates attend an online interview which is scored by the coordinator.' },
    ],
  },
  {
    title: 'Fees & Payments',
    icon: 'fa-money-bill-wave',
    items: [
      { q: 'How much is the application processing fee?', a: 'PKR 1,200 — paid once, before submitting your application. Payable via Bank Deposit or the online Bank Payment Gateway.' },
      { q: 'What payment methods are accepted?', a: 'Bank Deposit (upload your slip), the online Bank Payment Gateway (pay securely by card/account), and 1Bill vouchers. The available options appear in your dashboard when needed.' },
      { q: 'Are there scholarships?', a: 'Yes — Merit, Need-Based, Women in Tech, Rural Scholar, Working Professionals, and Special Needs scholarships are reviewed automatically when you apply. See our Scholarships page.' },
      { q: 'Is the admission fee refundable?', a: 'Refunds follow the published academic regulations of the university. Please contact admissions for case-specific guidance.' },
    ],
  },
  {
    title: 'Online Learning',
    icon: 'fa-chalkboard-user',
    items: [
      { q: 'Do I have to attend live classes?', a: 'Live classes are scheduled but every lecture is recorded. You can attend live or revisit recordings at your convenience.' },
      { q: 'How do exams work?', a: 'Exams are conducted online with secure proctoring, randomised question banks, and same-day result publication for objective papers.' },
      { q: 'Is the degree the same as on-campus?', a: 'Yes. The credential is awarded by AUST under the same university charter and recognition.' },
      { q: 'What if I have weak internet?', a: 'Recordings are downloadable in low-bandwidth mode, and the LMS works on mobile data. We design for real Pakistani connectivity.' },
    ],
  },
  {
    title: 'Student Portal & LMS',
    icon: 'fa-laptop',
    items: [
      { q: 'Where do I track my application?', a: 'Inside your student dashboard. The Admission Timeline updates within seconds of every decision made by the admissions team.' },
      { q: 'When do I get my roll number?', a: 'Your roll number is auto-generated the moment the coordinator enrolls you — typically right after you pay the admission fee.' },
      { q: 'How do I reset my password?', a: 'Use the "Forgot Password" link on the login page. You\'ll receive a secure reset link by email valid for 30 minutes.' },
      { q: 'Can I change my registered email?', a: 'Please contact the Director Admissions to update your registered email after enrollment.' },
    ],
  },
];

const FAQ = () => {
  const [open, setOpen] = useState(`0-0`);

  return (
    <div className="aust-page">
      <SiteNav />

      <section className="aust-subhero">
        <span className="aust-subhero__crumb"><Link to="/">Home</Link> <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }} /> FAQ</span>
        <h1>Frequently Asked Questions</h1>
        <p>Quick answers to the questions students ask most often. Can't find yours? <Link to="/contact" style={{ color: '#93c5fd', textDecoration: 'underline' }}>Get in touch.</Link></p>
      </section>

      <section className="aust-section">
        {groups.map((g, gi) => (
          <div key={g.title} className="aust-faq-group">
            <div className="aust-faq-group__head">
              <span className="ic"><i className={`fas ${g.icon}`} /></span>
              <h2>{g.title}</h2>
            </div>
            <div className="aust-faq-list">
              {g.items.map((it, ii) => {
                const key = `${gi}-${ii}`;
                const isOpen = open === key;
                return (
                  <button
                    type="button"
                    key={key}
                    className={`aust-faq-item${isOpen ? ' is-open' : ''}`}
                    onClick={() => setOpen(isOpen ? null : key)}
                    aria-expanded={isOpen}
                  >
                    <span className="aust-faq-item__q">
                      <i className="fas fa-circle-question" /> {it.q}
                      <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'} aust-faq-item__caret`} />
                    </span>
                    {isOpen && <span className="aust-faq-item__a">{it.a}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="aust-section">
        <div className="aust-cta-banner">
          <h2>Still need help?</h2>
          <p>Our admissions team typically replies within one working day.</p>
          <div className="aust-hero__cta">
            <Link to="/contact" className="aust-btn-hero primary"><i className="fas fa-envelope" /> Contact Admissions</Link>
            <Link to="/downloads" className="aust-btn-hero outline"><i className="fas fa-download" /> Downloads</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export default FAQ;
