class MockProviderA {
  async send(email) {
    if (Math.random() < 0.7) throw new Error('ProviderA failed');
    return { success: true, provider: 'A' };
  }
}

class MockProviderB {
  async send(email) {
    if (Math.random() < 0.3) throw new Error('ProviderB failed');
    return { success: true, provider: 'B' };
  }
}

module.exports = { MockProviderA, MockProviderB };
