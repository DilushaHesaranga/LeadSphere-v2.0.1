import { useAuth } from '../auth/AuthContext.jsx'
import { Brand } from '../components/Brand.jsx'
import { Icon } from '../components/Icons.jsx'
import { benefits, features, steps } from '../config/landingContent.js'
import { consoleDestination } from '../utils/access.js'
import { navigate } from '../utils/router.js'

export function LandingPage() {
  const { session, loading } = useAuth()
  const goToConsole = () => navigate(consoleDestination(session))

  return (
    <div className="site-shell">
      <header className="site-header">
        <a href="/" className="brand-link"><Brand /></a>
        <nav className="site-nav" aria-label="Primary navigation">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#benefits">Benefits</a>
        </nav>
        <button className="button button-dark header-cta" onClick={goToConsole} disabled={loading}>
          Go to Console <Icon name="arrow" size={17} />
        </button>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-glow" aria-hidden="true" />
          <div className="hero-copy">
            <span className="eyebrow"><span className="status-dot" /> Built for focused revenue teams</span>
            <h1>Turn every customer opportunity into forward motion.</h1>
            <p>LeadSphere brings leads, customers, deals, and team activity into one clear CRM workspace—so your people can work with context and confidence.</p>
            <div className="hero-actions">
              <button className="button button-primary button-large" onClick={goToConsole} disabled={loading}>
                Go to Console <Icon name="arrow" />
              </button>
              <a className="text-link" href="#features">Explore the platform</a>
            </div>
          </div>
          <div className="hero-product" aria-label="LeadSphere console preview">
            <div className="preview-window">
              <div className="preview-sidebar">
                <Brand compact />
                <span className="preview-nav active" />
                <span className="preview-nav" />
                <span className="preview-nav short" />
              </div>
              <div className="preview-content">
                <div className="preview-top"><span /><span /></div>
                <div className="preview-heading"><span /><span /></div>
                <div className="preview-metrics">
                  <div><small>Open leads</small><strong>24</strong><em>Focused</em></div>
                  <div><small>Active deals</small><strong>12</strong><em>Moving</em></div>
                  <div><small>Next actions</small><strong>08</strong><em>Today</em></div>
                </div>
                <div className="preview-grid">
                  <div className="preview-chart"><span className="chart-line" /></div>
                  <div className="preview-list">{[1,2,3,4].map((item) => <span key={item}><i /> <b /></span>)}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section section-intro">
          <span className="section-kicker">One connected workspace</span>
          <h2>A CRM that keeps the whole customer journey in view.</h2>
          <p>Replace scattered updates and uncertain handoffs with a shared operating picture for the teams building customer relationships.</p>
        </section>

        <section className="section" id="features">
          <div className="section-heading split-heading">
            <div><span className="section-kicker">Capabilities</span><h2>Everything your team needs to stay aligned.</h2></div>
            <p>Start with the core CRM workflow and expand LeadSphere as your operating model grows.</p>
          </div>
          <div className="feature-grid">
            {features.map((feature, index) => (
              <article className={`feature-card ${index === 0 ? 'feature-card-accent' : ''}`} key={feature.title}>
                <span className="feature-icon"><Icon name={feature.icon} size={22} /></span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section process-section" id="how-it-works">
          <div className="section-heading"><span className="section-kicker light">How it works</span><h2>From first signal to lasting customer value.</h2></div>
          <div className="steps-grid">
            {steps.map((step) => <article key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.description}</p></article>)}
          </div>
        </section>

        <section className="section benefits-section" id="benefits">
          <div className="benefit-visual" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="benefit-core">LS</div></div>
          <div className="benefit-copy">
            <span className="section-kicker">Why LeadSphere</span>
            <h2>More clarity for every role around the customer.</h2>
            <p>LeadSphere makes the right information visible to the right people, while role-based controls protect what should remain private.</p>
            <ul className="check-list">{benefits.map((benefit) => <li key={benefit}><Icon name="check" size={17}/>{benefit}</li>)}</ul>
          </div>
        </section>

        <section className="cta-section">
          <span className="section-kicker light">Ready when your team is</span>
          <h2>Build stronger customer momentum with LeadSphere.</h2>
          <p>Enter the console to manage your CRM workspace or sign in to continue where you left off.</p>
          <button className="button button-light button-large" onClick={goToConsole} disabled={loading}>Go to Console <Icon name="arrow" /></button>
        </section>
      </main>

      <footer className="site-footer">
        <Brand />
        <p>One place for leads, customers, deals, and the teams behind them.</p>
        <span>© {new Date().getFullYear()} LeadSphere</span>
      </footer>
    </div>
  )
}
