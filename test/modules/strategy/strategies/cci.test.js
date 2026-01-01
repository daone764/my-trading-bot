const assert = require('assert');
const CCI = require('../../../../src/modules/strategy/strategies/cci');

describe('#CCI strategy', () => {
  it('should give a long signal', () => {
    const strategy = new CCI();
    const mockPeriod = createMockIndicatorPeriod(
      [101, 102, 103, 104, 105, 106, 107, 108, -151, -101, -99, 0],
      [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]
    );
    
    const result = strategy.period(mockPeriod);
    assert.strictEqual(result.getSignal(), 'long');
    assert.strictEqual(result.getDebug()['trigger swing value'], -151);
  });

  it('should give a short signal', () => {
    const strategy = new CCI();
    const mockPeriod = createMockIndicatorPeriod(
      [-101, -102, -103, -104, -105, -106, -107, -108, 151, 101, 99, 0],
      [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      [99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88]
    );
    
    const result = strategy.period(mockPeriod);
    assert.strictEqual(result.getSignal(), 'short');
    assert.strictEqual(result.getDebug()['trigger swing value'], 151);
  });

  it('should give a close long signal', () => {
    const strategy = new CCI();
    const mockPeriod = createMockIndicatorPeriod(
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 101, 99, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      'long'
    );
    
    const result = strategy.period(mockPeriod);
    assert.strictEqual(result.getSignal(), 'close');
  });

  it('should give a close short signal', () => {
    const strategy = new CCI();
    const mockPeriod = createMockIndicatorPeriod(
      [1, 1, 1, 1, 1, 1, 1, 1, 1, -101, -99, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      'short'
    );
    
    const result = strategy.period(mockPeriod);
    assert.strictEqual(result.getSignal(), 'close');
  });

  it('should not give a signal if trend filter fails for long', () => {
    const strategy = new CCI();
    const mockPeriod = createMockIndicatorPeriod(
      [101, 102, 103, 104, 105, 106, 107, 108, -151, -101, -99, 0],
      [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      [99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88]
    );
    
    const result = strategy.period(mockPeriod);
    assert.strictEqual(result.getSignal(), undefined);
  });

  it('should not give a signal if trend filter fails for short', () => {
    const strategy = new CCI();
    const mockPeriod = createMockIndicatorPeriod(
      [-101, -102, -103, -104, -105, -106, -107, -108, 151, 101, 99, 0],
      [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]
    );
    
    const result = strategy.period(mockPeriod);
    assert.strictEqual(result.getSignal(), undefined);
  });

  it('should not give a signal if cci swing is not deep enough', () => {
    const strategy = new CCI();
    const mockPeriod = createMockIndicatorPeriod(
      [101, 102, 103, 104, 105, 106, 107, 108, -149, -101, -99, 0],
      [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]
    );
    
    const result = strategy.period(mockPeriod);
    assert.strictEqual(result.getSignal(), undefined);
  });

  it('should not reopen long position', () => {
    const strategy = new CCI();
    const mockPeriod = createMockIndicatorPeriod(
      [101, 102, 103, 104, 105, 106, 107, 108, -151, -101, -99, 0],
      [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112],
      'long'
    );
    
    const result = strategy.period(mockPeriod);
    assert.strictEqual(result.getSignal(), undefined);
  });

  it('should not reopen short position', () => {
    const strategy = new CCI();
    const mockPeriod = createMockIndicatorPeriod(
      [-101, -102, -103, -104, -105, -106, -107, -108, 151, 101, 99, 0],
      [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      [99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88],
      'short'
    );
    
    const result = strategy.period(mockPeriod);
    assert.strictEqual(result.getSignal(), undefined);
  });
});

function createMockIndicatorPeriod(cci, ema200, prices, lastSignal = undefined) {
  return {
    getIndicator: (name) => {
      if (name === 'cci') return cci;
      if (name === 'ema200') return ema200;
      return [];
    },
    getPrice: () => prices[prices.length - 2],
    getLookbacks: () => prices.map(p => ({ close: p })),
    getLastSignal: () => lastSignal
  };
}
