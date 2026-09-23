import React from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import '../styles/landing.css';

const steps = [
  { n: '01', title: 'Create Account', text: 'Register on the online admission portal with your email and a math captcha.', icon: 'fa-user-plus' },
  { n: '02', title: 'Complete Profile', text: 'Fill in your personal, contact and academic details. Upload your photo and CNIC.', icon: 'fa-id-card' },
  { n: '03', title: 'Add Education Records', text: 'Enter Matric, FSc Part-I, and FSc Full results. Result-awaited applications are also accepted.', icon: 'fa-graduation-cap' },
  { n: '04', title: 'Submit Application', text: 'Choose your program, pay the processing fee (Bank Deposit or online Bank Payment Gateway) and submit.', icon: 'fa-paper-plane' },
  { n: '05', title: 'Interview & Merit', text: 'Coordinator schedules your interview, records marks and merit is auto-calculated.', icon: 'fa-clipboard-list' },
  { n: '06', title: 'Pay Fee & Enroll', text: 'After merit selection, pay the admission fee. You will receive your auto-generated roll number.', icon: 'fa-id-badge' },
];

const Admissions = () => (
  <div className="aust-page">
    <SiteNav />

    <section className="aust-subhero">
      <span className="aust-subhero__crumb"><Link to="/">Home</Link> <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }} /> Admissions</span>
      <h1>Admissions at AUST ODL</h1>
      <p>Apply online in six clear steps. Designed for working students, rural learners and anyone who values flexibility.</p>
    </section>

    <section className="aust-section">
      <div className="aust-section__eyebrow">Admission Process</div>
      <h2 className="aust-section__title">Apply online in six clear steps</h2>
      <p className="aust-section__sub">
        From registration to roll number — here is exactly what happens after you click <em>Apply Now</em>.
      </p>
      <div className="aust-process-grid aust-stagger">
        {steps.map((s) => (
          <article key={s.n} className="aust-process-card aust-slide-up">
            <div className="aust-process-card__num">{s.n}</div>
            <div className="aust-process-card__ic"><i className={`fas ${s.icon}`} /></div>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </article>
        ))}
      </div>
    </section>

    <section className="aust-section" id="merit">
      <div className="aust-info-split">
        <div>
          <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>Merit Lists</div>
          <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>How merit is calculated</h2>
          <p className="aust-info-paragraph">
            Merit is calculated using a transparent weighted formula combining your
            academic record (Matric &amp; FSc), interview marks, and the admission cycle
            weights configured by the Director Admissions. The full breakdown is shown
            in your dashboard the moment your interview is scored.
          </p>
          <ul className="aust-bullet-list">
            <li><i className="fas fa-circle-check" /> Academic record (Matric + FSc) — weighted</li>
            <li><i className="fas fa-circle-check" /> Interview &amp; assessment marks</li>
            <li><i className="fas fa-circle-check" /> Final merit auto-calculated</li>
            <li><i className="fas fa-circle-check" /> Director-finalized merit list</li>
            <li><i className="fas fa-circle-check" /> Appeal window for genuine concerns</li>
          </ul>
        </div>
        <div>
          <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>Eligibility</div>
          <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>Who can apply</h2>
          <p className="aust-info-paragraph">
            The Associate Degree in Computer Science (ADCS) requires Intermediate (FSc / FA / ICS / I.Com / DAE)
            with at least <strong>45% aggregate</strong>. You can apply early as
            <em> Result Awaited</em> if your FSc Part-II result has not been declared yet —
            simply update your final result later, right from your dashboard.
          </p>
          <ul className="aust-bullet-list">
            <li><i className="fas fa-circle-check" /> Intermediate (FA/FSc/ICS/I.Com/DAE)</li>
            <li><i className="fas fa-circle-check" /> Minimum 45% aggregate</li>
            <li><i className="fas fa-circle-check" /> Valid CNIC / B-Form</li>
            <li><i className="fas fa-circle-check" /> Working students &amp; rural learners welcome</li>
            <li><i className="fas fa-circle-check" /> Result-awaited applicants accepted</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="aust-section">
      <div className="aust-cta-banner">
        <h2>Application Deadline Approaching</h2>
        <p>Don't wait until the last minute. Create your account today and start your application.</p>
        <div className="aust-hero__cta">
          <Link to="/register" className="aust-btn-hero primary"><i className="fas fa-rocket" /> Start My Application</Link>
          <Link to="/fee-structure" className="aust-btn-hero outline"><i className="fas fa-money-bill-wave" /> View Fee Structure</Link>
        </div>
      </div>
    </section>

    <SiteFooter />
  </div>
);

export default Admissions;
