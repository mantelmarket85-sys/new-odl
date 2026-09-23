import React from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import '../styles/landing.css';

const files = [
  {
    name: 'AUST ODL Prospectus 2026',
    size: '4.2 MB',
    type: 'PDF',
    desc: 'Complete program details, fees and admission criteria.',
    icon: 'fa-file-pdf',
    file: '/downloads/aust-odl-prospectus-2026.pdf',
  },
  {
    name: 'Admission Application Form',
    size: '120 KB',
    type: 'PDF',
    desc: 'Printable application form for offline reference.',
    icon: 'fa-file-pdf',
    file: '/downloads/admission-application-form.pdf',
  },
  {
    name: 'Fee Deposit Slip Template',
    size: '90 KB',
    type: 'PDF',
    desc: 'Bank deposit slip you can print and use at any branch.',
    icon: 'fa-file-pdf',
    file: '/downloads/fee-deposit-slip-template.pdf',
  },
  {
    name: 'ADCS Scheme of Study',
    size: '210 KB',
    type: 'PDF',
    desc: 'Semester-wise course plan with credit hours.',
    icon: 'fa-file-pdf',
    file: '/downloads/adp-cs-scheme-of-study.pdf',
  },
  {
    name: 'Student Handbook',
    size: '1.8 MB',
    type: 'PDF',
    desc: 'Academic regulations, conduct and student services.',
    icon: 'fa-book',
    file: '/downloads/student-handbook.pdf',
  },
  {
    name: 'LMS Quick-Start Guide',
    size: '780 KB',
    type: 'PDF',
    desc: 'How to access lectures, library and submit assignments.',
    icon: 'fa-file-pdf',
    file: '/downloads/lms-quick-start-guide.pdf',
  },
  {
    name: 'Online Examination Guidelines',
    size: '560 KB',
    type: 'PDF',
    desc: 'Rules and best practices for proctored online exams.',
    icon: 'fa-file-pdf',
    file: '/downloads/online-examination-guidelines.pdf',
  },
  {
    name: 'Online Payment Guide',
    size: '320 KB',
    type: 'PDF',
    desc: 'Step-by-step online fee payment instructions (Bank Payment Gateway).',
    icon: 'fa-file-pdf',
    file: '/downloads/online-payment-guide.pdf',
  },
];

const Downloads = () => (
  <div className="aust-page">
    <SiteNav />

    <section className="aust-subhero">
      <span className="aust-subhero__crumb">
        <Link to="/">Home</Link> <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }} /> Downloads
      </span>
      <h1>Downloads</h1>
      <p>Prospectus, forms, guides and reference documents for AUST ODL students and applicants.</p>
    </section>

    <section className="aust-section">
      <div className="aust-section__eyebrow">Resource Library</div>
      <h2 className="aust-section__title">Forms, guides &amp; prospectus</h2>
      <p className="aust-section__sub">All the documents you need before, during and after admission — in one place.</p>
      <div className="aust-download-grid aust-stagger">
        {files.map((f) => {
          // Suggest a clean filename based on the document title
          const downloadName = f.file.split('/').pop();
          return (
            <article key={f.name} className="aust-download-card aust-slide-up">
              <div className="aust-download-card__ic"><i className={`fas ${f.icon}`} /></div>
              <div className="aust-download-card__body">
                <h3>{f.name}</h3>
                <p>{f.desc}</p>
                <div className="aust-download-card__meta">
                  <span><i className="fas fa-file" /> {f.type}</span>
                  <span><i className="fas fa-database" /> {f.size}</span>
                </div>
              </div>
              <a
                href={f.file}
                download={downloadName}
                target="_blank"
                rel="noopener noreferrer"
                className="aust-download-card__btn"
                aria-label={`Download ${f.name}`}
              >
                <i className="fas fa-download" /> Download
              </a>
            </article>
          );
        })}
      </div>

      <p className="aust-section__sub" style={{ marginTop: '2rem', fontSize: '0.85rem', opacity: 0.7 }}>
        <i className="fas fa-info-circle" /> These are placeholder documents. Official versions will be published as they become available.
      </p>
    </section>

    <SiteFooter />
  </div>
);

export default Downloads;
