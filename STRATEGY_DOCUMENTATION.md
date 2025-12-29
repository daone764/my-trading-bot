# Unified MACD + CCI Trading Strategy

## Implementation Status: ✅ COMPLETE

**Strategy File:** `src/modules/strategy/strategies/unified_macd_cci.js`  
**Instance Config:** `instance.paper.btc.js`  
**Last Updated:** December 29, 2025

---

## Overview

This is a **unified dual-timeframe strategy** that combines:
- **MACD (1h)** for regime detection (trend direction)
- **CCI (15m)** for precise entry timing
- **ATR (15m)** for dynamic stop-loss and volatility filtering

The strategy only trades in the direction of the higher-timeframe trend, using oversold/overbought conditions on the lower timeframe for entries.

---

## Strategy Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     UNIFIED MACD + CCI                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              1-HOUR REGIME DETECTION                     │   │
│  │                                                          │   │
│  │  LONG regime:  HMA(9) >= SMA(200) AND MACD histogram > 0│   │
│  │  SHORT regime: HMA(9) < SMA(200) AND MACD histogram < 0 │   │
│  │  NONE regime:  Otherwise (conflicting signals)          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              15-MINUTE ENTRY TIMING                      │   │
│  │                                                          │   │
│  │  LONG entry:  CCI drops below -150, crosses up thru -100│   │
│  │  SHORT entry: CCI rises above +150, crosses down thru +100  │
│  │  + ATR volatility filter: ATR < ATR_SMA * 1.5           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              RISK MANAGEMENT                             │   │
│  │                                                          │   │
│  │  Stop Loss: Entry ± (ATR * 1.8)                         │   │
│  │  TP1: Entry ± 1R (close 50%, move stop to breakeven)    │   │
│  │  TP2: Entry ± 2.5R (close remainder)                    │   │
│  │  Max Position: 1% account risk                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Regime Detection (1-Hour MACD)

The 1-hour timeframe determines the **trading regime** - whether we should be looking for longs, shorts, or staying flat.

### Indicators Used
| Indicator | Period | Purpose |
|-----------|--------|---------|
| MACD | 12/26/9 EMA | Momentum measurement via histogram |
| HMA | 9 | Hull Moving Average for responsive trend |
| SMA | 200 | Long-term trend baseline |

### Regime Rules

```javascript
// LONG REGIME (bullish bias)
if (HMA(9) >= SMA(200) && MACD.histogram > 0) {
    regime = 'long';
}

// SHORT REGIME (bearish bias)  
if (HMA(9) < SMA(200) && MACD.histogram < 0) {
    regime = 'short';
}

// NO REGIME (conflicting signals - stay flat)
otherwise {
    regime = 'none';
}
```

### Regime Flip Rule
**CRITICAL:** If regime changes while in a position, **immediately close** the position.

---

## Entry Timing (15-Minute CCI)

Once regime is established, the 15-minute timeframe provides precise entry timing using CCI extremes.

### Indicators Used
| Indicator | Period | Purpose |
|-----------|--------|---------|
| CCI | 20 | Commodity Channel Index for overbought/oversold |
| ATR | 14 | Average True Range for volatility & stops |
| ATR SMA | 20 | Baseline ATR for volatility filtering |

### Entry Conditions

#### LONG Entry (in LONG regime only)
```
1. CCI must have dropped below -150 (extreme oversold)
2. CCI must then cross UP through -100
3. ATR < ATR_SMA * 1.5 (volatility filter)
```

```
CCI Chart:
    +150 ─────────────────────────────────────
    +100 ─────────────────────────────────────
       0 ─────────────────────────────────────
    -100 ────────────────────────╱───────────── ← Entry trigger (cross up)
    -150 ──────────────╲________╱──────────────  
                        ↑ Must reach here first
```

#### SHORT Entry (in SHORT regime only)
```
1. CCI must have risen above +150 (extreme overbought)
2. CCI must then cross DOWN through +100
3. ATR < ATR_SMA * 1.5 (volatility filter)
```

---

## Risk Management

### Position Sizing
```
Position Size = (Account Balance * 1%) / Stop Distance
```

This ensures maximum 1% account risk per trade.

### Stop Loss
```
LONG:  Stop = Entry Price - (ATR * 1.8)
SHORT: Stop = Entry Price + (ATR * 1.8)
```

### Take Profit Levels

| Level | Distance | Action |
|-------|----------|--------|
| TP1 | 1R (1.0 × stop distance) | Close 50%, move stop to breakeven |
| TP2 | 2.5R (2.5 × stop distance) | Close remaining 50% |

### Example (LONG @ $100,000, ATR = $500)
```
Entry:    $100,000
Stop:     $100,000 - ($500 * 1.8) = $99,100  (Risk = $900)
TP1:      $100,000 + $900 = $100,900         (1R)
TP2:      $100,000 + ($900 * 2.5) = $102,250 (2.5R)
```

---

## Exit Conditions (Priority Order)

| Priority | Condition | Action |
|----------|-----------|--------|
| 1 | Price hits stop loss | Close + trigger cooldown |
| 2 | Price hits TP2 | Close full position |
| 3 | Regime flips | Immediate close |
| 4 | MACD histogram sign flips | Close position |
| 5 | Max bars (40) exceeded | Close position |

---

## Additional Safeguards

### Cooldown After Loss
After a stop-loss exit, the strategy waits **3 bars** before allowing new entries.

### Single Position Rule
Only one position can be open at a time. No pyramiding or averaging.

### Volatility Filter
Entries are blocked when ATR > ATR_SMA × 1.5, preventing trades during unusually volatile conditions.

### No Repainting
All indicators use completed candles only (slice -2 removes incomplete candle).

---

## Configuration Parameters

```javascript
{
  // Timeframe
  period: '15m',           // Primary candle subscription
  
  // MACD (1h regime)
  macd_fast: 12,
  macd_slow: 26,
  macd_signal: 9,
  hma_length: 9,
  
  // CCI (15m entry)
  cci_length: 20,
  atr_length: 14,
  
  // Risk (hardcoded in strategy)
  CCI_EXTREME_THRESHOLD: 150,
  CCI_ENTRY_THRESHOLD: 100,
  ATR_STOP_MULTIPLIER: 1.8,
  ATR_VOLATILITY_FILTER: 1.5,
  TP1_R_MULTIPLE: 1.0,
  TP2_R_MULTIPLE: 2.5,
  MAX_BARS_IN_TRADE: 40,
  COOLDOWN_BARS_AFTER_LOSS: 3,
  ACCOUNT_RISK_PERCENT: 0.01
}
```

---

## Instance Configuration

```javascript
// instance.paper.btc.js
c.symbols.push({
  symbol: 'BTC-USD',
  periods: ['1m', '15m', '1h'],
  exchange: 'coinbase',
  state: 'watch',  // Change to 'trade' for live
  strategies: [
    { 
      strategy: 'unified_macd_cci', 
      options: { period: '15m' } 
    }
  ]
});
```

---

## Signal Debug Output

Each signal includes detailed debug information:

```javascript
{
  regime: 'long',              // Current regime
  macd_histogram: 0.0012,      // MACD histogram value
  hma_vs_sma: 150.5,           // HMA - SMA200 difference
  cci: -95,                    // Current CCI value
  atr: 450,                    // Current ATR
  atr_sma: 400,                // ATR moving average
  price: 100500,               // Current price
  position_side: 'long',       // Open position side
  entry_price: 100000,         // Entry price
  stop_loss: 99190,            // Current stop level
  tp1: 100810,                 // TP1 level
  tp2: 102025,                 // TP2 level
  tp1_hit: false,              // Whether TP1 triggered
  bars_in_trade: 5,            // Bars since entry
  exit_reason: null            // Reason for exit (if any)
}
```

---

## Comparison: Old vs New Strategy

| Aspect | Old (Independent) | New (Unified) |
|--------|-------------------|---------------|
| Entry logic | CCI OR MACD signals independently | CCI only when MACD confirms regime |
| Stop loss | None | ATR × 1.8 |
| Take profit | None | 1R (50%) + 2.5R (50%) |
| Position sizing | Fixed | Risk-based (1% account) |
| Cooldown | None | 3 bars after loss |
| Volatility filter | None | ATR < ATR_SMA × 1.5 |
| Max trade duration | None | 40 bars |
| Regime awareness | None | Full (closes on flip) |

---

*Document updated after strategy implementation - December 29, 2025*
- Must compile and run

DO NOT:
- Optimize parameters
- Add new indicators
- Remove risk controls

If something is unclear, infer the most conservative, capital-preserving behavior.
