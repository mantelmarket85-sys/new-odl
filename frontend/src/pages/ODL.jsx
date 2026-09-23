import React from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import '../styles/landing.css';

const lmsFeatures = [
  { title: 'Live & Recorded Classes', text: 'Attend live sessions or revisit recorded lectures on demand.', icon: 'fa-video' },
  { title: 'Digital Library',          text: 'Access reading material, references and academic resources online.', icon: 'fa-book-open-reader' },
  { title: 'Assessment Portal',        text: 'Submit assignments, quizzes and examination tasks online.', icon: 'fa-file-pen' },
  { title: 'Progress Dashboard',       text: 'Track grades, attendance, deadlines and course milestones.', icon: 'fa-chart-line' },
  { title: 'Discussion Forums',        text: 'Talk to classmates and faculty in moderated subject forums.', icon: 'fa-comments' },
  { title: 'Faculty Support',          text: 'Office-hour links, email and ticketed help from your instructors.', icon: 'fa-headset' },
];

const ODL = () => (
  <div className="aust-page">
    <SiteNav />

    <section className="aust-subhero">
      <span className="aust-subhero__crumb"><Link to="/">Home</Link> <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }} /> Online Learning</span>
      <h1>Open &amp; Distance Learning</h1>
      <p>A complete digital campus — lectures, library, assessments and results — in one connected experience.</p>
    </section>

    <section className="aust-section">
      <div className="aust-section__eyebrow">Why ODL</div>
      <h2 className="aust-section__title">Learn anywhere, on your schedule</h2>
      <p className="aust-section__sub">
        AUST ODL is built for students who want to keep their job, support their family
        or live outside major cities — without giving up the credential.
      </p>
      <div className="aust-feature-strip aust-stagger">
        <div className="aust-feature-strip__card aust-slide-up">
          <i className="fas fa-house-laptop" />
          <strong>Study from Home</strong>
          <span>Lectures on your phone or laptop, no commute.</span>
        </div>
        <div className="aust-feature-strip__card aust-slide-up">
          <i className="fas fa-clock" />
          <strong>Flexible Hours</strong>
          <span>Watch recordings whenever you can find time.</span>
        </div>
        <div className="aust-feature-strip__card aust-slide-up">
          <i className="fas fa-user-graduate" />
          <strong>Real Faculty</strong>
          <span>Same AUST instructors as on-campus programs.</span>
        </div>
        <div className="aust-feature-strip__card aust-slide-up">
          <i className="fas fa-globe" />
          <strong>Country-wide Reach</strong>
          <span>Open to students from every province.</span>
        </div>
      </div>
    </section>

    <section className="aust-section aust-section--deep" id="virtual">
      <div className="aust-info-split aust-info-split--deep">
        <div>
          <div className="aust-section__eyebrow" style={{ textAlign: 'left', color: '#f6b31a' }}>Virtual Classroom</div>
          <h2 className="aust-section__title" style={{ textAlign: 'left', color: '#fff', maxWidth: 'none' }}>
            A complete digital campus in one platform
          </h2>
          <p className="aust-info-paragraph" style={{ color: 'rgba(255,255,255,0.82)' }}>
            The AUST ODL learning environment brings course content, lectures, academic
            communication, assessments and results into a single connected experience.
            Login once and find everything in its place.
          </p>
        </div>
        <div className="aust-lms-grid">
          {lmsFeatures.map((f) => (
            <div key={f.title} className="aust-lms-feature">
              <span className="ic"><i className={`fas ${f.icon}`} /></span>
              <strong>{f.title}</strong>
              <small>{f.text}</small>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="aust-section" id="exams">
      <div className="aust-section__eyebrow">Online Examinations</div>
      <h2 className="aust-section__title">Sit your exams from home</h2>
      <p className="aust-section__sub">
        Secure proctoring, randomised question banks and same-day result publication.
        No travelling for hours to an exam centre.
      </p>
      <div className="aust-why-grid aust-stagger">
        <div className="aust-why-card aust-slide-up">
          <div className="ic"><i className="fas fa-shield-halved" /></div>
          <h4>Secure Proctoring</h4>
          <p>Online ID verification and webcam-based monitoring keep examinations fair for everyone.</p>
        </div>
        <div className="aust-why-card aust-slide-up">
          <div className="ic"><i className="fas fa-shuffle" /></div>
          <h4>Randomised Questions</h4>
          <p>Every student gets a unique paper drawn from a moderated question bank.</p>
        </div>
        <div className="aust-why-card aust-slide-up">
          <div className="ic"><i className="fas fa-bolt" /></div>
          <h4>Fast Results</h4>
          <p>Most objective papers are graded within the same day so you don't wait weeks.</p>
        </div>
      </div>
    </section>

    <section className="aust-section" id="library">
      <div className="aust-info-split">
        <div>
          <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>Digital Library</div>
          <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>Resources, on demand</h2>
          <p className="aust-info-paragraph">
            Browse course packs, recommended reading, research databases and reference
            material — all from your dashboard. The library expands every semester as
            new courses come online.
          </p>
          <ul className="aust-bullet-list">
            <li><i className="fas fa-circle-check" /> Course packs &amp; lecture notes</li>
            <li><i className="fas fa-circle-check" /> Open-access journals</li>
            <li><i className="fas fa-circle-check" /> Recommended textbooks</li>
            <li><i className="fas fa-circle-check" /> Reference databases</li>
          </ul>
        </div>
        <div>
          <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>Student Portal</div>
          <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>Everything in one place</h2>
          <p className="aust-info-paragraph">
            From the moment you register, your student portal is your home base —
            application tracking, fee receipts, exam schedules, roll number, results
            and notifications all live together in a calm dashboard.
          </p>
          <ul className="aust-bullet-list">
            <li><i className="fas fa-circle-check" /> Live application status</li>
            <li><i className="fas fa-circle-check" /> Fee history &amp; receipts</li>
            <li><i className="fas fa-circle-check" /> Roll number &amp; enrollment record</li>
            <li><i className="fas fa-circle-check" /> Notifications &amp; alerts</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="aust-section">
      <div className="aust-cta-banner">
        <h2>Step into the learning portal</h2>
        <p>Already enrolled? Continue your course from where you left off.</p>
        <div className="aust-hero__cta">
          <Link to="/lms" className="aust-btn-hero primary"><i className="fas fa-chalkboard-user" /> Open LMS</Link>
          <Link to="/register" className="aust-btn-hero outline"><i className="fas fa-rocket" /> Apply Now</Link>
        </div>
      </div>
    </section>

    <SiteFooter />
  </div>
);

export default ODL;
