import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import '../styles/landing.css';

const Contact = () => {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Frontend-only — open mail client with the composed message.
    const body = `Name: ${form.name}%0AEmail: ${form.email}%0A%0A${encodeURIComponent(form.message)}`;
    window.location.href = `mailto:director@aust.edu.pk?subject=${encodeURIComponent(form.subject || 'Website enquiry')}&body=${body}`;
    setSent(true);
  };

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="aust-page">
      <SiteNav />

      <section className="aust-subhero">
        <span className="aust-subhero__crumb"><Link to="/">Home</Link> <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }} /> Contact</span>
        <h1>Contact &amp; Help Desk</h1>
        <p>We are here to help with admissions, fees, LMS issues or anything else about AUST ODL.</p>
      </section>

      <section className="aust-section">
        <div className="aust-contact-grid">
          <div className="aust-contact-info">
            <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>Reach Us</div>
            <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>Multiple ways to get in touch</h2>
            <p className="aust-info-paragraph">
              Whether you are an applicant, a current student, or a guardian — pick the
              channel that suits you best. Office hours are <strong>Monday–Friday, 9am–4pm PKT</strong>.
            </p>

            <ul className="aust-contact-list">
              <li>
                <span className="ic"><i className="fas fa-location-dot" /></span>
                <div>
                  <strong>Campus Address</strong>
                  <span>Havelian, Abbottabad, Khyber Pakhtunkhwa, Pakistan</span>
                </div>
              </li>
              <li>
                <span className="ic"><i className="fas fa-envelope" /></span>
                <div>
                  <strong>Director Admissions</strong>
                  <a href="mailto:director@aust.edu.pk">director@aust.edu.pk</a>
                </div>
              </li>
              <li>
                <span className="ic"><i className="fas fa-envelope-open" /></span>
                <div>
                  <strong>Coordinator</strong>
                  <a href="mailto:coordinator@aust.edu.pk">coordinator@aust.edu.pk</a>
                </div>
              </li>
              <li>
                <span className="ic"><i className="fas fa-phone" /></span>
                <div>
                  <strong>Phone</strong>
                  <a href="tel:+92992123456">+92 992 123456</a>
                </div>
              </li>
              <li>
                <span className="ic"><i className="fas fa-clock" /></span>
                <div>
                  <strong>Office Hours</strong>
                  <span>Mon – Fri · 9:00 am – 4:00 pm PKT</span>
                </div>
              </li>
            </ul>
          </div>

          <form className="aust-contact-form" onSubmit={handleSubmit}>
            <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>Send a Message</div>
            <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>How can we help?</h2>

            {sent && (
              <div className="aust-contact-form__ok">
                <i className="fas fa-circle-check" /> Your mail client should have opened. If not, please email <a href="mailto:director@aust.edu.pk">director@aust.edu.pk</a> directly.
              </div>
            )}

            <label>
              <span>Your Name</span>
              <input type="text" required value={form.name} onChange={update('name')} placeholder="Full name" />
            </label>
            <label>
              <span>Email Address</span>
              <input type="email" required value={form.email} onChange={update('email')} placeholder="you@example.com" />
            </label>
            <label>
              <span>Subject</span>
              <input type="text" required value={form.subject} onChange={update('subject')} placeholder="Admissions / LMS / Fee …" />
            </label>
            <label>
              <span>Message</span>
              <textarea rows={6} required value={form.message} onChange={update('message')} placeholder="Tell us how we can help…" />
            </label>
            <button type="submit" className="aust-btn-hero primary" style={{ alignSelf: 'flex-start' }}>
              <i className="fas fa-paper-plane" /> Send Message
            </button>
          </form>
        </div>
      </section>

      <section className="aust-section">
        <div className="aust-section__eyebrow">Quick Help</div>
        <h2 className="aust-section__title">Common topics</h2>
        <p className="aust-section__sub">Most students get their answers from these links faster than email.</p>
        <div className="aust-quicklinks aust-stagger">
          <Link to="/admissions" className="aust-quick-card aust-slide-up">
            <div className="ic"><i className="fas fa-list-check" /></div>
            <h5>Admission Process</h5>
            <p>The six clear steps from registration to roll number.</p>
            <span className="arrow">See process <i className="fas fa-arrow-right" /></span>
          </Link>
          <Link to="/fee-structure" className="aust-quick-card aust-slide-up">
            <div className="ic"><i className="fas fa-money-bill-wave" /></div>
            <h5>Fee Structure</h5>
            <p>Application, admission and semester fee breakdown.</p>
            <span className="arrow">View fees <i className="fas fa-arrow-right" /></span>
          </Link>
          <Link to="/faq" className="aust-quick-card aust-slide-up">
            <div className="ic"><i className="fas fa-circle-question" /></div>
            <h5>FAQs</h5>
            <p>Quick answers to the most common questions.</p>
            <span className="arrow">Browse FAQ <i className="fas fa-arrow-right" /></span>
          </Link>
          <Link to="/downloads" className="aust-quick-card aust-slide-up">
            <div className="ic"><i className="fas fa-download" /></div>
            <h5>Downloads</h5>
            <p>Prospectus, forms and student guides.</p>
            <span className="arrow">Download <i className="fas fa-arrow-right" /></span>
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export default Contact;
