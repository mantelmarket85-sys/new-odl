import React from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import '../styles/landing.css';

const news = [
  { date: '2026-05-11', display: 'May 11, 2026', title: 'Spring online orientation schedule released', text: 'New students can now view orientation sessions, portal setup guidance, and faculty introduction timings.', tag: 'Orientation' },
  { date: '2026-05-04', display: 'May 4, 2026',  title: 'Digital library access expanded',           text: 'Additional journals, course packs and research databases are available for enrolled ODL students.', tag: 'Library' },
  { date: '2026-04-28', display: 'Apr 28, 2026', title: 'Admissions open for ODL pathways',          text: 'Applications are being accepted for the Associate Degree in Computer Science (ADCS) program.', tag: 'Admissions' },
  { date: '2026-04-15', display: 'Apr 15, 2026', title: 'New LMS dashboard preview rolls out',       text: 'Updated student dashboard with live application status and faster notifications.', tag: 'Platform' },
  { date: '2026-04-02', display: 'Apr 2, 2026',  title: 'Online Bank Payment Gateway now live',      text: 'Students can pay processing and admission fees securely online through the bank payment gateway.', tag: 'Payments' },
  { date: '2026-03-20', display: 'Mar 20, 2026', title: 'Faculty office hours updated',              text: 'Revised weekly office hours posted in the LMS for every ADCS instructor.', tag: 'Academics' },
];

const notices = [
  { date: 'May 10, 2026', title: 'Mid-term examination schedule', text: 'Mid-term dates for Spring 2026 published. Check your LMS for paper-wise slots.' },
  { date: 'May 5, 2026',  title: 'Fee deadline reminder',         text: 'Last date to deposit admission fee for newly selected candidates is May 28, 2026.' },
  { date: 'Apr 25, 2026', title: 'Result Awaited submissions',    text: 'Students applying with Part-I result can update full FSc result from their dashboard.' },
];

const News = () => (
  <div className="aust-page">
    <SiteNav />

    <section className="aust-subhero">
      <span className="aust-subhero__crumb"><Link to="/">Home</Link> <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }} /> News &amp; Events</span>
      <h1>News, Events &amp; Notices</h1>
      <p>Stay connected with AUST ODL — announcements, deadlines and academic updates.</p>
    </section>

    <section className="aust-section">
      <div className="aust-section__eyebrow">Latest News</div>
      <h2 className="aust-section__title">Recent announcements</h2>
      <p className="aust-section__sub">News from the admissions office, academic departments and the ODL platform.</p>
      <div className="aust-news-grid aust-stagger">
        {news.map((n) => (
          <article key={n.title} className="aust-news-card aust-slide-up">
            <div className="aust-news-card__head">
              <time dateTime={n.date}>{n.display}</time>
              <span className="aust-news-card__tag">{n.tag}</span>
            </div>
            <h3>{n.title}</h3>
            <p>{n.text}</p>
            <span className="aust-news-card__read">Read more <i className="fas fa-arrow-right" /></span>
          </article>
        ))}
      </div>
    </section>

    <section className="aust-section" id="notices">
      <div className="aust-section__eyebrow">Notices</div>
      <h2 className="aust-section__title">Important notifications</h2>
      <p className="aust-section__sub">Time-sensitive academic and admissions notifications.</p>
      <div className="aust-notice-list">
        {notices.map((n) => (
          <div key={n.title} className="aust-notice-row">
            <div className="aust-notice-row__date">
              <i className="fas fa-bullhorn" />
              <span>{n.date}</span>
            </div>
            <div className="aust-notice-row__body">
              <strong>{n.title}</strong>
              <p>{n.text}</p>
            </div>
            <Link to="#" className="aust-notice-row__link" aria-label="Read full notice"><i className="fas fa-arrow-right" /></Link>
          </div>
        ))}
      </div>
    </section>

    <SiteFooter />
  </div>
);

export default News;
