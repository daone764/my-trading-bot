You are an expert Node.js testing engineer working inside the repository:
https://github.com/daone764/my-trading-bot

Your task is strictly limited: add thorough testing for the new candle_reversal_scored strategy without modifying core bot logic, strategies, or execution code. Use only existing dependencies (e.g., Jest/Mocha if in test/, tulind/technicalindicators for indicators). DO NOT add new dependencies. DO NOT run live trades. DO NOT refactor existing code.

OBJECTIVE
Create a comprehensive test suite to validate the candle_reversal_scored strategy, including unit tests for patterns/scoring, integration tests for signals, backtests on historical data, and simulated paper trading. Output test results summaries and identify any bugs/flaws.

FILES TO CREATE/MODIFY
- Create: test/strategies/candle_reversal_scored.test.js (unit/integration tests)
- Create: test/backtest/candle_reversal_scored_backtest.js (backtest runner script)
- Modify: NONE — all tests must be isolated and mock dependencies (e.g., mock candles, indicators via sinon or built-in mocks)

REQUIREMENTS

1. Unit Tests (for detectPattern and scoring)
- Test each bullish/bearish pattern with exact math from the strategy (body, range, wicks).
- Positive cases: Provide candle arrays that match definitions exactly → assert detected name, direction, strength.
- Negative cases: Slight deviations (e.g., body < 1.1 * prevBody for engulfing) → assert 'None'.
- Edge cases: Zero range/body, incomplete 3-candle patterns, insufficient candles (<210).
- Scoring: Test each component (pattern, CCI, trend, extension, vol) with mocked values → assert finalScore, rejections if <65 or pattern<25.

2. Integration Tests (for period() signal generation)
- Mock indicatorPeriod with sample candles/indicators.
- Test long/short signals: High-score bullish → 'long' signal with correct SL/TP.
- Rejections: Low score, position open, shorting disabled.
- Logging: Assert console logs match expected format.

3. Backtesting
- Use existing backtest setup: Load historical candles from bot.db (or mock with sample data if db absent).
- Script to run backtest on BTC-USD/ETH-USD for last 1 year (or available data) at 15m interval.
- Config: Paper mode, candle_reversal_scored active, allowShort=false initially.
- Metrics: Calculate after run — win rate (profitable trades %), max drawdown (%), total return (%), Sharpe ratio (assume risk-free=0), number of trades.
- Edge scenarios: Test in bull (e.g., 2024 BTC rally), bear (2022 crash), choppy (sideways) periods.

4. Paper Trading Simulation
- Script to simulate 1-2 weeks of recent market data (fetch via CCXT or mock).
- Run in paper mode: Track virtual portfolio, entries/exits, P&L.
- Assert no overtrading (one position at a time), proper SL/TP hits.
- Volatility tests: Simulate high ATR spikes, low volatility (reject if volScore=0).

5. Test Framework
- Use existing (Jest/Mocha) — if none, use Node's assert.
- Mocks: Use sinon for console.log, indicator mocks.
- Coverage: Aim for 80%+ on strategy logic.
- Run command: Integrate with 'npm test' or provide 'node test/backtest/candle_reversal_scored_backtest.js'.

6. Safeguards
- All tests in paper/mock mode — log warnings if config suggests live.
- Fail loudly on missing data (e.g., <210 candles).
- No real API calls in tests — mock CCXT.

7. Reporting
- After tests, console output summary: Passed/Failed counts, metrics from backtest/paper, any bugs (e.g., "False positive engulfing detected").
- If flaws found, suggest fixes as comments ONLY — do not apply.

ABSOLUTE RULES
- NEVER modify candle_reversal_scored.js or other strategies.
- NEVER loosen test assertions.
- NEVER risk live trades — force paper mode.
- NEVER assume data — mock or skip if absent.

Deliverables
- Complete candle_reversal_scored.test.js
- Complete candle_reversal_scored_backtest.js
- Instructions: How to run (e.g., npm test; node test/backtest/... --symbol=BTC-USD --period=15m)
- Sample run output in comments.

Now implement the files and run a sample test locally to verify.