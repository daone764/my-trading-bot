
You are a senior quantitative trading engineer working on my Node.js cryptocurrency trading bot.

Repository context:
- The bot uses modular strategy files (example: indicators/cci.js).
- Signals are created using SignalResult.createSignal(type, debug).
- Indicators are built using indicatorBuilder.add().
- The bot supports backtesting and paper trading.
- Last signal state is available via indicatorPeriod.getLastSignal().

Objective:
Implement, validate, and automatically test a refactored CCI-based strategy that actually produces trades and follows proven momentum + trend principles.

----------------------------------------------------------------
STRATEGY SPECIFICATION (MUST IMPLEMENT EXACTLY)
----------------------------------------------------------------

Indicators:
- CCI(period)
- EMA(200)

Trend Filter:
- Longs allowed only if price > EMA200
- Shorts allowed only if price < EMA200

ENTRY LOGIC:
- LONG:
  - Previous CCI < -100
  - Current CCI > -100 (cross upward)
  - Lowest CCI in last 10 closed candles <= -150
  - Trend filter satisfied

- SHORT:
  - Previous CCI > +100
  - Current CCI < +100 (cross downward)
  - Highest CCI in last 10 closed candles >= +150
  - Trend filter satisfied

EXIT LOGIC:
- Exit LONG when:
  - Previous CCI > +100 AND current CCI < +100

- Exit SHORT when:
  - Previous CCI < -100 AND current CCI > -100

General Rules:
- Always ignore the currently forming candle
- Never open a new position in the same direction as the lastSignal
- Return SignalResult.createEmptySignal() if no action is taken

----------------------------------------------------------------
IMPLEMENTATION TASKS
----------------------------------------------------------------

1. Refactor indicators/cci.js:
   - Remove SMA200 usage
   - Use EMA200 exclusively as the trend filter
   - Simplify logic for clarity and determinism
   - Ensure debug output includes:
     - price
     - cci
     - ema200
     - trigger swing value

2. Defensive coding:
   - Guard against insufficient indicator history
   - Avoid slicing arrays inside loops
   - Ensure no undefined array access
   - Ensure async method returns deterministically

3. Automated tests (REQUIRED):
   Create unit tests that:
   - Simulate synthetic CCI arrays that cross thresholds
   - Confirm long and short entries are generated
   - Confirm exits trigger correctly
   - Confirm no signals fire when trend filter fails

4. Backtest validation:
   - Run backtests on at least one crypto pair
   - Confirm:
     - Trades are being opened
     - Both long and short signals occur
     - Win rate > 35%
     - No zero-trade backtests

5. Logging:
   - Add temporary logs (behind a debug flag) to print:
     - Entry reason
     - Exit reason
     - CCI swing value used for confirmation

----------------------------------------------------------------
DELIVERABLES
----------------------------------------------------------------

- Updated indicators/cci.js file
- Test file(s) verifying signal generation
- Summary of:
  - Trade count
  - Win rate
  - Any assumptions or edge cases

IMPORTANT:
- Do NOT invent new indicators
- Do NOT change signal API contracts
- Do NOT simplify rules
- Follow the strategy rules exactly as written

Execute all steps autonomously and ensure the bot generates real trades in backtesting.
```

---


