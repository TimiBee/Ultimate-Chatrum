"use client";

export default function GalleryPage() {
  return (
    <section style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <h2>Gallery</h2>
      <p>
        Explore moments from our school events, activities, and achievements. (Gallery coming soon)
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        {/* Image placeholders */}
        <div style={{ width: 200, height: 150, background: 'var(--accent-green)', borderRadius: 8, opacity: 0.2 }} />
        <div style={{ width: 200, height: 150, background: 'var(--accent-green)', borderRadius: 8, opacity: 0.2 }} />
        <div style={{ width: 200, height: 150, background: 'var(--accent-green)', borderRadius: 8, opacity: 0.2 }} />
      </div>
    </section>
  );
} 