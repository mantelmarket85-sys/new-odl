import React, { useEffect, useState, useLayoutEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import api from '../utils/api';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import ParticleField from '../components/landing/ParticleField';
import CountUp from '../components/landing/CountUp';
import { courseScheme, whyChooseUs, alumni, stats } from '../data/courseScheme';
import '../styles/landing.css';

const dashHref = (user) => {
  if (!user) return '/login';
  if (user.role === 'director_admissions' || user.role === 'admin') return '/admin';
  if (user.role === 'coordinator') return '/coordinator';
  return '/dashboard';
};

const SemesterRing = () => (
  <>
    <svg viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="46" stroke="rgba(29,93,209,0.18)" strokeWidth="1.6" strokeDasharray="3 6" />
    </svg>
    <svg viewBox="0 0 100 100" fill="none" className="rev">
      <circle cx="50" cy="50" r="38" stroke="rgba(56,189,248,0.30)" strokeWidth="1.4" strokeDasharray="2 8" />
    </svg>
  </>
);

const lmsFeatures = [
  ['Live & recorded classes', 'Attend sessions or revisit lectures on demand.', 'fa-video'],
  ['Digital library',         'Access reading material, references and academic resources.', 'fa-book-open-reader'],
  ['Assessment portal',       'Submit assignments, quizzes and examination tasks online.', 'fa-file-pen'],
  ['Progress dashboard',      'Track grades, attendance, deadlines and course milestones.', 'fa-chart-line'],
];

const admissionSteps = [
  ['Create Account',    'Register through the online admission portal.', 'fa-user-plus'],
  ['Select Program',    'Choose your Associate Degree in Computer Science (ADCS) pathway.', 'fa-graduation-cap'],
  ['Upload Documents',  'Submit academic records and identification.',   'fa-file-arrow-up'],
  ['Confirm Admission', 'Receive review updates and complete enrollment.', 'fa-circle-check'],
];

const newsPreview = [
  { date: '2026-05-11', display: 'May 11, 2026', title: 'Spring online orientation released', text: 'Orientation sessions, portal setup and faculty introductions are now live.', tag: 'Orientation' },
  { date: '2026-05-04', display: 'May 4, 2026',  title: 'Digital library access expanded',     text: 'New journals, course packs and research databases for enrolled students.', tag: 'Library' },
  { date: '2026-04-28', display: 'Apr 28, 2026', title: 'Admissions open for ODL pathways',    text: 'Applications are being accepted for the Associate Degree in Computer Science (ADCS).', tag: 'Admissions' },
];

const faqPreview = [
  { q: 'Who is eligible to apply?', a: 'Intermediate (FA/FSc/ICS/I.Com/DAE) with at least 45% aggregate marks. Students from all provinces are welcome.' },
  { q: 'Can I apply if my FSc result is not yet declared?', a: 'Yes. Apply as "Result Awaited" using your Part-I marks and update your full FSc result later from your dashboard.' },
  { q: 'How is merit calculated?', a: 'A transparent weighted score combining academic record, interview marks and admission-cycle weights. The breakdown is shown in your dashboard.' },
];

const Landing = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    api.get('/admission-cycle/active')
      .then((r) => setCycle(r.data.cycle))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Defense-in-depth: ensure landing page ALWAYS opens from the top, even if
  // the global ScrollToTop wrapper doesn't fire (e.g. on hard reload).
  useLayoutEffect(() => {
    // Disable browser's automatic scroll restoration on this page
    if ('scrollRestoration' in window.history) {
      const prev = window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
      window.scrollTo(0, 0);
      return () => { window.history.scrollRestoration = prev; };
    }
    window.scrollTo(0, 0);
  }, []);



  return (
    <div className="aust-page">
      <SiteNav />

      {/* ===================== HERO (PRESERVED) ===================== */}
      <section className="aust-hero">
        <ParticleField count={36} />
        <div className="aust-hero__inner aust-fade-in">
            {!loading && cycle && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              marginTop: '1.6rem',
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.20)',
              padding: '8px 18px', borderRadius: 999,
              fontSize: '0.86rem', color: '#fff',
              backdropFilter: 'blur(8px)',
            }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: cycle.isOpen ? '#22c55e' : '#ef4444',
                boxShadow: cycle.isOpen
                  ? '0 0 0 3px rgba(34,197,94,0.25)'
                  : '0 0 0 3px rgba(239,68,68,0.25)',
              }} />
              <strong>{cycle.isOpen ? 'Admissions Open' : 'Admissions Closed'}</strong>
              <span style={{ opacity: .7 }}>·</span>
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>{cycle.title}</span>
            </div>
          )}
          <h1>
            Education is your right,<br />
            <span className="accent">Any Time </span>, <em></em> Anywhere.
          </h1>
          <p className="aust-hero__sub">
            Experience a connected digital learning environment designed to support students through every stage of their academic journey.
          </p>
          <div className="aust-hero__cta">
            {user ? (
              <Link to={dashHref(user)} className="aust-btn-hero primary">
                <i className="fas fa-gauge-high" /> Open Dashboard
              </Link>
            ) : (
              <>
                <Link to="/register" className="aust-btn-hero primary">
                  <i className="fas fa-rocket" /> Apply Now
                </Link>
                <Link to="/course-scheme" className="aust-btn-hero outline">
                  <i className="fas fa-book-open" /> Explore Courses
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ===================== INTRO STRIP (NEW — merged from AUST RJ) ===================== */}
      <section className="aust-intro-strip">
        <div className="aust-intro-strip__grid">
          <div>
            <div className="aust-section__eyebrow">Modern ODL Education</div>
            <h2>Flexible diploma, certification and associate degree learning backed by AUST.</h2>
          </div>
          <p>
            AUST ODL connects motivated learners with guided digital classrooms,
            academic mentoring, structured assessments and practical short-cycle
            programs designed for students who need quality education beyond the
            campus boundary.
          </p>
        </div>
      </section>

      {/* ===================== STATS (PRESERVED) ===================== */}
      <section className="aust-section" id="stats">
        <div className="aust-section__eyebrow">By the Numbers</div>
        <h2 className="aust-section__title">A growing community of online learners</h2>
        <p className="aust-section__sub">
          Real students from every corner of Pakistan, learning together from home.
        </p>
        <div className="aust-stats aust-stagger">
          {stats.map((s) => (
            <div key={s.label} className="aust-stat-card aust-slide-up">
              <div className="ic"><i className={`fas ${s.icon}`} /></div>
              <div className="num">
                <CountUp value={s.num} suffix={s.suffix} duration={1800} />
              </div>
              <div className="lbl">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== QUICK LINKS (PRESERVED) ===================== */}
      <section className="aust-section" id="explore">
        <div className="aust-section__eyebrow">Explore the Portal</div>
        <h2 className="aust-section__title">Everything in one calm place</h2>
        <p className="aust-section__sub">
          Apply for admission, browse the scheme of study, hear from alumni and step
          into the learning portal — all from a single, friendly home.
        </p>
        <div className="aust-quicklinks aust-stagger">
          <Link to="/course-scheme" className="aust-quick-card aust-slide-up">
            <div className="ic"><i className="fas fa-graduation-cap" /></div>
            <h5>Scheme of Study</h5>
            <p>Four semesters of Associate Degree in Computer Science, mapped out course by course.</p>
            <span className="arrow">View scheme <i className="fas fa-arrow-right" /></span>
          </Link>
          <Link to="/why-choose-us" className="aust-quick-card aust-slide-up">
            <div className="ic"><i className="fas fa-stars" /></div>
            <h5>Why Choose AUST</h5>
            <p>Six reasons learners pick AUST for their online journey, in plain words.</p>
            <span className="arrow">See reasons <i className="fas fa-arrow-right" /></span>
          </Link>
          <Link to="/alumni" className="aust-quick-card aust-slide-up">
            <div className="ic"><i className="fas fa-user-tie" /></div>
            <h5>Alumni Stories</h5>
            <p>Voices from graduates already working as devs, analysts and IT officers.</p>
            <span className="arrow">Read stories <i className="fas fa-arrow-right" /></span>
          </Link>
          <Link to={user ? dashHref(user) : '/register'} className="aust-quick-card aust-slide-up">
            <div className="ic"><i className="fas fa-rocket" /></div>
            <h5>{user ? 'Your Dashboard' : 'Apply Now'}</h5>
            <p>{user ? 'Pick up where you left off and continue your application.' : 'Set up an account in under a minute and submit your application.'}</p>
            <span className="arrow">{user ? 'Open dashboard' : 'Get started'} <i className="fas fa-arrow-right" /></span>
          </Link>
        </div>
      </section>

      {/* ===================== COURSE SCHEME (PRESERVED) ===================== */}
      <section className="aust-section" id="scheme">
        <div className="aust-section__eyebrow">Scheme of Study</div>
        <h2 className="aust-section__title">Four semesters, gently paced</h2>
        <p className="aust-section__sub">
          The Associate Degree in Computer Science program is split across two academic years.
          Hover any card to see it lift, breathe and bring its courses forward.
        </p>
        <div className="aust-scheme-wrap aust-stagger">
          {courseScheme.map((s) => (
            <article key={s.sem} className="aust-sem-card aust-slide-up">
              <div className="aust-sem-card__ring">
                <SemesterRing />
                <div className="aust-sem-card__num">{s.sem}</div>
              </div>
              <h3 className="aust-sem-card__title">{s.title}</h3>
              <div
                className="aust-sem-card__hint"
                dangerouslySetInnerHTML={{ __html: s.hint }}
              />
              <ul className="aust-sem-card__list">
                {s.courses.map((c) => (
                  <li key={c.name}>
                    <span className="ic"><i className={`fas ${c.icon}`} /></span>
                    <span>{c.name}</span>
                    <span className="credits">{c.credits}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <Link to="/course-scheme" className="aust-btn-hero primary" style={{ background: 'linear-gradient(135deg, #0b3c8c, #1d5dd1)' }}>
            View full scheme of study <i className="fas fa-arrow-right" />
          </Link>
        </div>
      </section>

      {/* ===================== WHY CHOOSE US (PRESERVED) ===================== */}
      <section className="aust-section" id="why">
        <div className="aust-section__eyebrow">Why Choose AUST</div>
        <h2 className="aust-section__title">Built around how you actually study</h2>
        <p className="aust-section__sub">
          Honest, practical reasons our students keep choosing us — no buzzwords.
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

      {/* ===================== ODL / LMS FEATURES (NEW — merged) ===================== */}
      <section className="aust-section--deep" id="odl-preview">
        <div className="aust-info-split aust-info-split--deep">
          <div>
            <div className="aust-section__eyebrow" style={{ textAlign: 'left', color: '#f6b31a' }}>Learning Management System</div>
            <h2 className="aust-section__title" style={{ textAlign: 'left', color: '#fff', maxWidth: 'none' }}>
              A complete digital campus in one platform
            </h2>
            <p className="aust-info-paragraph" style={{ color: 'rgba(255,255,255,0.82)' }}>
              The AUST ODL learning environment brings course content, lectures,
              academic communication, assessments and results into a single connected
              experience.
            </p>
            <div style={{ marginTop: '1rem' }}>
              <Link to="/odl" className="aust-btn-hero outline" style={{ background: 'rgba(255,255,255,0.12)' }}>
                <i className="fas fa-arrow-right" /> Explore ODL
              </Link>
            </div>
          </div>
          <div className="aust-lms-grid">
            {lmsFeatures.map(([title, text, icon]) => (
              <div key={title} className="aust-lms-feature">
                <span className="ic"><i className={`fas ${icon}`} /></span>
                <strong>{title}</strong>
                <small>{text}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== ADMISSION PROCESS (NEW — merged) ===================== */}
      <section className="aust-section" id="admission-preview">
        <div className="aust-section__eyebrow">Admission Process</div>
        <h2 className="aust-section__title">Apply online in four clear steps</h2>
        <p className="aust-section__sub">
          From registration to enrollment — your full admission journey on one screen.
        </p>
        <div className="aust-process-grid aust-stagger">
          {admissionSteps.map(([title, text, icon], i) => (
            <article key={title} className="aust-process-card aust-slide-up">
              <div className="aust-process-card__num">0{i + 1}</div>
              <div className="aust-process-card__ic"><i className={`fas ${icon}`} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link to="/admissions" className="aust-btn-hero primary">
            See full admission process <i className="fas fa-arrow-right" />
          </Link>
        </div>
      </section>

      {/* ===================== ALUMNI / TESTIMONIALS (PRESERVED) ===================== */}
      <section className="aust-section" id="alumni">
        <div className="aust-section__eyebrow">Alumni Voices</div>
        <h2 className="aust-section__title">Real stories from real graduates</h2>
        <p className="aust-section__sub">
          Hover the track to pause it. These are the students who walked the
          same path you are about to start.
        </p>
        <div className="aust-alumni-track-wrap">
          <div className="aust-alumni-track">
            {[...alumni, ...alumni].map((a, i) => (
              <article key={`${a.name}-${i}`} className="aust-alumni-card">
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
      </section>

      {/* ===================== NEWS PREVIEW (NEW — merged) ===================== */}
      <section className="aust-section" id="news-preview">
        <div className="aust-section__eyebrow">Latest News &amp; Announcements</div>
        <h2 className="aust-section__title">Stay connected with AUST ODL</h2>
        <p className="aust-section__sub">
          Quick updates from the admissions office, academic departments and the LMS team.
        </p>
        <div className="aust-news-preview aust-stagger">
          {newsPreview.map((n) => (
            <article key={n.title} className="aust-news-card aust-slide-up">
              <div className="aust-news-card__head">
                <time dateTime={n.date}>{n.display}</time>
                <span className="aust-news-card__tag">{n.tag}</span>
              </div>
              <h3>{n.title}</h3>
              <p>{n.text}</p>
              <Link to="/news" className="aust-news-card__read">Read more <i className="fas fa-arrow-right" /></Link>
            </article>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link to="/news" className="aust-btn-hero outline" style={{ color: '#0b3c8c', borderColor: '#0b3c8c', background: '#fff' }}>
            All news &amp; events <i className="fas fa-arrow-right" />
          </Link>
        </div>
      </section>

      {/* ===================== FAQ PREVIEW (NEW — merged) ===================== */}
      <section className="aust-section" id="faq-preview">
        <div className="aust-section__eyebrow">Frequently Asked</div>
        <h2 className="aust-section__title">Quick answers, before you apply</h2>
        <p className="aust-section__sub">
          A short list of the questions students ask most often — full list on our FAQ page.
        </p>
        <div className="aust-faq-preview">
          {faqPreview.map((f, i) => (
            <button
              type="button"
              key={f.q}
              className={`aust-faq-item${openFaq === i ? ' is-open' : ''}`}
              onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
              aria-expanded={openFaq === i}
            >
              <span className="aust-faq-item__q">
                <i className="fas fa-circle-question" /> {f.q}
                <i className={`fas fa-chevron-${openFaq === i ? 'up' : 'down'} aust-faq-item__caret`} />
              </span>
              {openFaq === i && <span className="aust-faq-item__a">{f.a}</span>}
            </button>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link to="/faq" className="aust-btn-hero outline" style={{ color: '#0b3c8c', borderColor: '#0b3c8c', background: '#fff' }}>
            View all FAQs <i className="fas fa-arrow-right" />
          </Link>
        </div>
      </section>

      {/* ===================== CTA BANNER (PRESERVED) ===================== */}
      {!user && (
        <section className="aust-section">
          <div className="aust-cta-banner">
            <h2>Ready to start your AUST journey?</h2>
            <p>
              Create your student account in under a minute. Submit your
              application, track its progress, and get your roll number when you
              are accepted. We will be here every step.
            </p>
            <div className="aust-hero__cta">
              <Link to="/register" className="aust-btn-hero primary">
                <i className="fas fa-user-plus" /> Create Account
              </Link>
              <Link to="/login" className="aust-btn-hero outline">
                <i className="fas fa-arrow-right-to-bracket" /> Sign In
              </Link>
            </div>
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  );
};

export default Landing;
