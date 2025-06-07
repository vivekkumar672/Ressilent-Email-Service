const { MockProviderA, MockProviderB } = require('./mockProviders');
const { wait, generateEmailKey } = require('./utils');

class EmailService {
  constructor() {
    this.providers = [new MockProviderA(), new MockProviderB()];
    this.sentEmails = new Set(); // Idempotency
    this.statusLog = []; // Status tracking
    this.rateLimit = { tokens: 5, interval: 10000, lastRefill: Date.now() }; // Token bucket
    this.circuitBreaker = { failureCount: 0, threshold: 5, cooldown: 15000, lastFailure: null };
  }

  _refillTokens() {
    const now = Date.now();
    if (now - this.rateLimit.lastRefill > this.rateLimit.interval) {
      this.rateLimit.tokens = 5;
      this.rateLimit.lastRefill = now;
    }
  }

  _consumeToken() {
    this._refillTokens();
    if (this.rateLimit.tokens <= 0) throw new Error('Rate limit exceeded');
    this.rateLimit.tokens--;
  }

  async _trySendWithRetries(provider, email, retries = 3) {
    let delay = 500;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await provider.send(email);
      } catch (error) {
        if (attempt === retries) throw error;
        await wait(delay);
        delay *= 2; // Exponential backoff
      }
    }
  }

  _isCircuitOpen() {
    if (!this.circuitBreaker.lastFailure) return false;
    return (Date.now() - this.circuitBreaker.lastFailure) < this.circuitBreaker.cooldown;
  }

  async sendEmail(email) {
    const key = generateEmailKey(email);

    if (this.sentEmails.has(key)) {
      return { status: 'skipped', reason: 'duplicate', email };
    }

    if (this._isCircuitOpen()) {
      this.statusLog.push({ email, status: 'failed', reason: 'circuit open' });
      return { status: 'failed', reason: 'circuit open' };
    }

    try {
      this._consumeToken();
    } catch (err) {
      this.statusLog.push({ email, status: 'rate_limited' });
      return { status: 'rate_limited' };
    }

    for (let provider of this.providers) {
      try {
        const result = await this._trySendWithRetries(provider, email);
        this.sentEmails.add(key);
        this.statusLog.push({ email, status: 'success', provider: result.provider });
        this.circuitBreaker.failureCount = 0; // reset
        return { status: 'success', provider: result.provider };
      } catch (error) {
        console.log(`[WARN] Provider failed: ${error.message}`);
        this.circuitBreaker.failureCount++;
        if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
          this.circuitBreaker.lastFailure = Date.now();
        }
      }
    }

    this.statusLog.push({ email, status: 'failed', reason: 'all providers failed' });
    return { status: 'failed', reason: 'all providers failed' };
  }

  getStatusLog() {
    return this.statusLog;
  }
}

module.exports = EmailService;
