import React from "react";

export default function Home() {
  return (
    <section style={{ padding: '3rem 1rem', maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
      <h2 style={{ color: 'var(--primary-green)', fontSize: '2.2rem', marginBottom: '1rem' }}>
        Welcome to Gilead International Group of Schools
      </h2>
      <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
        Empowering students with <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>Knowledge and Power</span> for a brighter future.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
        <div style={{ background: 'var(--primary-green)', color: 'white', padding: '1.5rem', borderRadius: 12, maxWidth: 600 }}>
          <h3>Our Mission</h3>
          <p>
            To nurture academic excellence, character, and global citizenship in every learner through quality education and holistic development.
          </p>
        </div>
        <div style={{ background: 'var(--accent-green)', color: 'white', padding: '1.5rem', borderRadius: 12, maxWidth: 600 }}>
          <h3>Why Choose Us?</h3>
          <ul style={{ textAlign: 'left', margin: 0, paddingLeft: '1.2rem' }}>
            <li>Experienced and passionate educators</li>
            <li>Modern facilities and resources</li>
            <li>Inclusive and supportive environment</li>
            <li>Focus on academic and personal growth</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
