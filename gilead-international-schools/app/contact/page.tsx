"use client";

export default function ContactPage() {
  return (
    <section style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <h2>Contact Us</h2>
      <p>
        For inquiries, please fill out the form below or reach us at our office.
      </p>
      <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
        <input type="text" placeholder="Your Name" required style={{ padding: '0.5rem' }} />
        <input type="email" placeholder="Your Email" required style={{ padding: '0.5rem' }} />
        <textarea placeholder="Your Message" required style={{ padding: '0.5rem' }} rows={4} />
        <button type="submit" style={{ background: 'var(--primary-green)', color: 'white', padding: '0.75rem', border: 'none', borderRadius: 4, fontWeight: 'bold' }}>
          Send Message
        </button>
      </form>
    </section>
  );
} 