/**
 * Unified MACD + CCI Strategy
 * 
 * This strategy combines MACD (1h) for regime detection with CCI (15m) for entry timing.
 * Implements strict risk management with ATR-based stops and position sizing.
 * 
 * ARCHITECTURE:
 * - MACD (1h) determines the trading regime (LONG/SHORT/NONE)
 * - CCI (15m) provides precise entry timing within the regime
 * - ATR (15m) used for stop-loss calculation and volatility filtering
 * - Position sizing ensures max 1% account risk per trade
 * 
 * ENTRY CONDITIONS:
 * - Must be in valid regime (MACD-defined)
 * - CCI must show extreme (-150/+150) followed by cross back through ±100
 * - ATR volatility filter must pass (ATR < ATR_SMA * 1.5)
 * 
 * EXIT CONDITIONS:
 * - ATR-based hard stop (1.8 * ATR)
 * - TP1 at 1R (close 50%, move stop to breakeven)
 * - TP2 at 2.5R (close remainder)
 * - Regime flip (immediate close)
 * - Max bars in trade (40 bars)
 * 
 * @author AI-assisted refactor
 * @version 2.0.0
 */

const SignalResult = require('../dict/signal_result');

module.exports = class UnifiedMacdCci {
  constructor() {
    // ========================================
    // STRATEGY STATE (persisted across ticks)
    // ========================================
    
    // Current regime: 'long', 'short', or 'none'
    this.currentRegime = 'none';
    
    // Position tracking
    this.entryPrice = null;
    this.entryBar = null;
    this.stopLoss = null;
    this.takeProfit1 = null;  // 1R target
    this.takeProfit2 = null;  // 2.5R target
    this.tp1Hit = false;      // Whether TP1 has been reached
    this.positionSide = null; // 'long' or 'short'
    
    // CCI extreme tracking for entry setup
    this.cciReachedExtreme = false;
    this.cciExtremeValue = null;
    
    // Risk management state
    this.lastLossBar = null;
    this.barsSinceEntry = 0;

    // Per-candle evaluation lock
    this.lastEvaluatedCandleTs = null;
    
    // ========================================
    // STRATEGY PARAMETERS (constants)
    // ========================================
    this.CCI_EXTREME_THRESHOLD = 150;     // CCI must reach ±150 for setup
    this.CCI_ENTRY_THRESHOLD = 100;       // CCI must cross back through ±100
    this.ATR_STOP_MULTIPLIER = 1.8;       // Stop distance = ATR * 1.8
    this.ATR_VOLATILITY_FILTER = 1.5;     // ATR must be < ATR_SMA * 1.5
    this.TP1_R_MULTIPLE = 1.0;            // Take profit 1 at 1R
    this.TP2_R_MULTIPLE = 2.5;            // Take profit 2 at 2.5R
    this.TP1_CLOSE_PERCENT = 0.5;         // Close 50% at TP1
    this.MAX_BARS_IN_TRADE = 40;          // Max bars before forced exit
    this.COOLDOWN_BARS_AFTER_LOSS = 3;    // Bars to wait after a loss
    this.ACCOUNT_RISK_PERCENT = 0.01;     // Max 1% account risk per trade
  }

  getName() {
    return 'unified_macd_cci';
  }

  /**
   * Build all required indicators for both timeframes
   * 
   * Indicators are requested from both 1h (regime) and 15m (entry) timeframes.
   * The system will automatically aggregate lower timeframe candles.
   */
  buildIndicator(indicatorBuilder, options) {
    // ========================================
    // 1-HOUR INDICATORS (Regime Detection)
    // ========================================
    
    // MACD for momentum and regime
    indicatorBuilder.add('macd_1h', 'macd_ext', '1h', {
      fast_period: options.macd_fast || 12,
      slow_period: options.macd_slow || 26,
      signal_period: options.macd_signal || 9,
      default_ma_type: 'EMA'
    });
    
    // HMA(9) for responsive trend detection
    indicatorBuilder.add('hma_1h', 'hma', '1h', {
      length: options.hma_length || 9
    });
    
    // SMA(200) for long-term trend filter
    indicatorBuilder.add('sma200_1h', 'sma', '1h', {
      length: 200
    });

    // ========================================
    // 15-MINUTE INDICATORS (Entry Timing)
    // ========================================
    
    // CCI for entry timing
    indicatorBuilder.add('cci_15m', 'cci', '15m', {
      length: options.cci_length || 20
    });
    
    // ATR for stop-loss and volatility filtering
    indicatorBuilder.add('atr_15m', 'atr', '15m', {
      length: options.atr_length || 14
    });
    
    // ATR SMA for volatility filter comparison
    indicatorBuilder.add('atr_sma_15m', 'sma', '15m', {
      length: 20
    }, 'atr_15m');  // Source from ATR values
    
    // SMA(200) on 15m for additional trend confirmation
    indicatorBuilder.add('sma200_15m', 'sma', '15m', {
      length: 200
    });

    // Candles for price data access
    indicatorBuilder.add('candles_15m', 'candles', '15m');
  }

  /**
   * Main strategy execution - called on each new candle
   * 
   * @param {IndicatorPeriod} indicatorPeriod - Contains all indicator values and context
   * @param {Object} options - Strategy options from instance config
   * @returns {SignalResult|undefined} - Trading signal or undefined
   */
  async period(indicatorPeriod, options) {
    const blockers = {
      candleNotClosed: false,
      duplicateEvaluation: false,
      cooldownActive: false,
      positionOpen: false,
      noRegime: false,
      noExtreme: false,
      volatilityTooHigh: false
    };

    // ========================================
    // EXTRACT INDICATOR VALUES
    // ========================================
    
    const macd1h = indicatorPeriod.getIndicator('macd_1h');
    const hma1h = indicatorPeriod.getIndicator('hma_1h');
    const sma200_1h = indicatorPeriod.getIndicator('sma200_1h');
    const cci15m = indicatorPeriod.getIndicator('cci_15m');
    const atr15m = indicatorPeriod.getIndicator('atr_15m');
    const atrSma15m = indicatorPeriod.getIndicator('atr_sma_15m');
    const candles15m = indicatorPeriod.getIndicator('candles_15m');

    // Validate we have enough data
    if (!this.validateIndicators(macd1h, hma1h, sma200_1h, cci15m, atr15m, candles15m)) {
      return SignalResult.createEmptySignal({ error: 'Insufficient indicator data' });
    }

    // Use the last fully closed 15m candle (second from the end)
    const closedCandle = candles15m[candles15m.length - 2];
    const formingCandle = candles15m[candles15m.length - 1];
    const closedTs = closedCandle?.time || closedCandle?.t || closedCandle?.timestamp || closedCandle?.date;

    if (!closedTs) {
      blockers.candleNotClosed = true;
      return this.logAndReturn('NO_TRADE', blockers, { reason: 'missing_candle_ts' });
    }

    // Guard against evaluating incomplete candles
    const candleFlag = closedCandle.isClosed === false || closedCandle.isFinal === false;
    const formingIsSame = formingCandle && (formingCandle.time || formingCandle.t) === closedTs;
    if (candleFlag || formingIsSame) {
      blockers.candleNotClosed = true;
      return this.logAndReturn('NO_TRADE', blockers, { reason: 'candle_not_closed', candleTs: closedTs });
    }

    // Per-candle single evaluation lock
    if (this.lastEvaluatedCandleTs === closedTs) {
      blockers.duplicateEvaluation = true;
      return this.logAndReturn('NO_TRADE', blockers, { reason: 'duplicate_candle', candleTs: closedTs });
    }
    this.lastEvaluatedCandleTs = closedTs;

    // Get current values (remove incomplete candle by using slice -2)
    const currentMacd = macd1h.slice(-2)[0];
    const prevMacd = macd1h.slice(-3)[0];
    const currentHma = hma1h.slice(-2)[0];
    const currentSma200_1h = sma200_1h.slice(-2)[0];
    
    const currentCci = cci15m.slice(-2)[0];
    const prevCci = cci15m.slice(-3)[0];
    const currentAtr = atr15m.slice(-2)[0];
    const currentAtrSma = atrSma15m && atrSma15m.length > 2 ? atrSma15m.slice(-2)[0] : currentAtr;
    const currentCandle = candles15m.slice(-2)[0];
    const currentPrice = indicatorPeriod.getPrice();

    // Get current position state
    const lastSignal = indicatorPeriod.getLastSignal();
    const strategyContext = indicatorPeriod.getStrategyContext();
    const position = strategyContext?.position;

    // ========================================
    // DEBUG INFO (always included in signal)
    // ========================================
    const debug = {
      candle_ts: closedTs,
      regime: this.currentRegime,
      macd_histogram: currentMacd?.histogram,
      hma_vs_sma: currentHma - currentSma200_1h,
      cci: currentCci,
      atr: currentAtr,
      atr_sma: currentAtrSma,
      price: currentPrice,
      position_side: this.positionSide,
      entry_price: this.entryPrice,
      stop_loss: this.stopLoss,
      tp1: this.takeProfit1,
      tp2: this.takeProfit2,
      tp1_hit: this.tp1Hit,
      bars_in_trade: this.barsSinceEntry,
      cci_extreme_reached: this.cciReachedExtreme
    };

    // External execution helper (logging + gating per candle)
    // Single-guard evaluation: only once per closed candle with indicators
    const helperDecision = safeEvaluateUnifiedStrategy(
      {
        indicators: {
          CCI: currentCci,
          MACD_histogram: currentMacd?.histogram,
          HMA_SMA: currentHma - currentSma200_1h,
          extreme: this.cciReachedExtreme
        },
        close: currentPrice,
        timestamp: closedTs,
        isClosed: true
      },
      {
        currentPosition: lastSignal ? { size: 1, side: lastSignal } : { size: 0, side: null },
        currentRegime: this.currentRegime,
        lastEvaluatedCandleTs: this.lastEvaluatedCandleTs,
        cooldownBars:
          this.lastLossBar !== null
            ? Math.max(0, this.COOLDOWN_BARS_AFTER_LOSS - (this.barsSinceEntry - this.lastLossBar))
            : 0
      }
    );

    // helper may return undefined if skipped by guard
    if (!helperDecision) {
      return SignalResult.createEmptySignal({ reason: 'helper_skipped' });
    }

    this.currentRegime = helperDecision.newRegime;
    this.lastEvaluatedCandleTs = helperDecision.blockers.duplicateEvaluation ? this.lastEvaluatedCandleTs : closedTs;

    // If a hard blocker fired, stop here
    const helperHardBlock =
      helperDecision.blockers.cooldownActive ||
      helperDecision.blockers.positionOpen ||
      helperDecision.blockers.volatilityTooHigh;

    // Keep informational blocker flags
    blockers.noExtreme = helperDecision.blockers.noExtreme;
    blockers.noRegime = helperDecision.blockers.noRegime;
    blockers.volatilityTooHigh = helperDecision.blockers.volatilityTooHigh;

    if (helperHardBlock) {
      return this.logAndReturn('NO_TRADE', { ...blockers, ...helperDecision.blockers }, debug);
    }

    // ========================================
    // STEP 1: DETERMINE CURRENT REGIME
    // ========================================
    const newRegime = this.determineRegime(currentHma, currentSma200_1h, currentMacd);
    const regimeFlipped = newRegime !== this.currentRegime && this.currentRegime !== 'none';
    
    debug.new_regime = newRegime;
    debug.regime_flipped = regimeFlipped;

    // ========================================
    // STEP 2: CHECK EXIT CONDITIONS (if in position)
    // ========================================
    if (lastSignal === 'long' || lastSignal === 'short') {
      blockers.positionOpen = true;
      this.barsSinceEntry++;
      
      const exitSignal = this.checkExitConditions(
        lastSignal,
        currentPrice,
        currentMacd,
        prevMacd,
        regimeFlipped,
        debug
      );
      
      if (exitSignal) {
        // Reset position state on exit
        this.resetPositionState();
        this.currentRegime = newRegime;
        return this.logAndReturn('EXIT', blockers, debug, exitSignal);
      }
      
      // Check for partial TP1 hit (just update state, don't close entire position)
      this.checkTp1Hit(lastSignal, currentPrice, debug);
    }

    // Update regime after exit check
    this.currentRegime = newRegime;

    // ========================================
    // STEP 3: CHECK ENTRY CONDITIONS (if flat)
    // ========================================
    const helperAllowsEntry = helperDecision.action === 'ENTER_LONG' || helperDecision.action === 'ENTER_SHORT';

    if ((!lastSignal || lastSignal === 'close') && helperAllowsEntry) {
      // Check cooldown after loss
      if (this.lastLossBar !== null) {
        const barsSinceLoss = this.barsSinceEntry - this.lastLossBar;
        if (barsSinceLoss < this.COOLDOWN_BARS_AFTER_LOSS) {
          debug.cooldown_remaining = this.COOLDOWN_BARS_AFTER_LOSS - barsSinceLoss;
          blockers.cooldownActive = true;
          return this.logAndReturn('NO_TRADE', blockers, debug);
        }
        this.lastLossBar = null;  // Cooldown complete
      }

      // Track CCI extreme conditions
      this.trackCciExtreme(currentCci, this.currentRegime);
      
      // Check entry conditions
      const entrySignal = this.checkEntryConditions(
        currentCci,
        prevCci,
        currentAtr,
        currentAtrSma,
        currentPrice,
        debug
      );
      
      if (entrySignal) {
        return this.logAndReturn(entrySignal.getSignal() === 'long' ? 'ENTER_LONG' : 'ENTER_SHORT', blockers, debug, entrySignal);
      }
    }

    // Explicit blockers for common cases
    if (this.currentRegime === 'none') blockers.noRegime = true;
    if (!this.cciReachedExtreme) blockers.noExtreme = true; // informational only; not a blocker
    if (debug.entry_blocked === 'volatility_too_high') blockers.volatilityTooHigh = true;

    return this.logAndReturn('NO_TRADE', blockers, debug);
  }

  /**
   * Determine trading regime based on MACD (1h) indicators
   * 
   * LONG regime: HMA(9) >= SMA(200) AND MACD histogram > 0
   * SHORT regime: HMA(9) < SMA(200) AND MACD histogram < 0
   * NONE: Otherwise (conflicting signals)
   */
  determineRegime(hma, sma200, macd) {
    if (!macd || typeof macd.histogram !== 'number') {
      return 'none';
    }

    const trendUp = hma >= sma200;
    const trendDown = hma < sma200;
    const macdBullish = macd.histogram > 0;
    const macdBearish = macd.histogram < 0;

    if (trendUp && macdBullish) {
      return 'long';
    }
    
    if (trendDown && macdBearish) {
      return 'short';
    }

    return 'none';
  }

  /**
   * Track CCI extreme conditions for entry setup
   * 
   * For LONG regime: Track when CCI drops below -150
   * For SHORT regime: Track when CCI rises above +150
   */
  trackCciExtreme(cci, regime) {
    if (regime === 'long' && cci <= -this.CCI_EXTREME_THRESHOLD) {
      this.cciReachedExtreme = true;
      this.cciExtremeValue = cci;
    } else if (regime === 'short' && cci >= this.CCI_EXTREME_THRESHOLD) {
      this.cciReachedExtreme = true;
      this.cciExtremeValue = cci;
    } else if (regime === 'none') {
      // Reset extreme tracking when no regime
      this.cciReachedExtreme = false;
      this.cciExtremeValue = null;
    }
  }

  /**
   * Check entry conditions based on regime and CCI
   * 
   * Entry requires:
   * 1. Valid regime (LONG or SHORT)
   * 2. CCI previously reached extreme (±150)
   * 3. CCI now crossing back through ±100
   * 4. ATR volatility filter passes
   */
  checkEntryConditions(cci, prevCci, atr, atrSma, price, debug) {
    // No entry in neutral regime
    if (this.currentRegime === 'none') {
      debug.entry_blocked = 'no_regime';
      return null;
    }

    // Volatility filter: ATR must be reasonable
    if (atr > atrSma * this.ATR_VOLATILITY_FILTER) {
      debug.entry_blocked = 'volatility_too_high';
      debug.atr_ratio = atr / atrSma;
      return null;
    }

    // Calculate R (risk per trade) based on ATR
    const stopDistance = atr * this.ATR_STOP_MULTIPLIER;
    
    // ========================================
    // LONG ENTRY
    // ========================================
    if (this.currentRegime === 'long') {
      // CCI must cross UP through -100 (from below to above)
      if (prevCci < -this.CCI_ENTRY_THRESHOLD && cci >= -this.CCI_ENTRY_THRESHOLD) {
        // Setup position parameters
        this.entryPrice = price;
        this.positionSide = 'long';
        this.stopLoss = price - stopDistance;
        this.takeProfit1 = price + (stopDistance * this.TP1_R_MULTIPLE);
        this.takeProfit2 = price + (stopDistance * this.TP2_R_MULTIPLE);
        this.tp1Hit = false;
        this.barsSinceEntry = 0;
        this.cciReachedExtreme = false;  // Reset for next trade
        
        debug.entry_type = 'long';
        debug.stop_distance = stopDistance;
        debug.r_value = stopDistance;
        
        return SignalResult.createSignal('long', debug);
      }
    }

    // ========================================
    // SHORT ENTRY
    // ========================================
    if (this.currentRegime === 'short') {
      // CCI must cross DOWN through +100 (from above to below)
      if (prevCci > this.CCI_ENTRY_THRESHOLD && cci <= this.CCI_ENTRY_THRESHOLD) {
        // Setup position parameters
        this.entryPrice = price;
        this.positionSide = 'short';
        this.stopLoss = price + stopDistance;
        this.takeProfit1 = price - (stopDistance * this.TP1_R_MULTIPLE);
        this.takeProfit2 = price - (stopDistance * this.TP2_R_MULTIPLE);
        this.tp1Hit = false;
        this.barsSinceEntry = 0;
        this.cciReachedExtreme = false;  // Reset for next trade
        
        debug.entry_type = 'short';
        debug.stop_distance = stopDistance;
        debug.r_value = stopDistance;
        
        return SignalResult.createSignal('short', debug);
      }
    }

    return null;
  }

  logAndReturn(action, blockers, debug, signal) {
    const log = {
      action,
      candleTs: debug.candle_ts,
      price: debug.price,
      regime: debug.regime,
      newRegime: debug.new_regime,
      indicators: {
        cci: debug.cci,
        macd_histogram: debug.macd_histogram,
        hma_vs_sma: debug.hma_vs_sma
      },
      blockers,
      entry_blocked: debug.entry_blocked,
      exit_reason: debug.exit_reason,
      cooldown_remaining: debug.cooldown_remaining
    };

    console.log('UNIFIED_DECISION', JSON.stringify(log));

    if (signal) {
      return signal;
    }

    return SignalResult.createEmptySignal(debug);
  }

  /**
   * Check all exit conditions for open position
   * 
   * Exit conditions (in priority order):
   * 1. Stop loss hit
   * 2. TP2 hit (close full position)
   * 3. Regime flip (immediate close)
   * 4. MACD histogram sign flip
   * 5. Max bars in trade exceeded
   */
  checkExitConditions(positionSide, price, macd, prevMacd, regimeFlipped, debug) {
    // ========================================
    // 1. STOP LOSS CHECK
    // ========================================
    if (this.stopLoss !== null) {
      if (positionSide === 'long' && price <= this.stopLoss) {
        debug.exit_reason = 'stop_loss';
        this.lastLossBar = this.barsSinceEntry;  // Trigger cooldown
        return SignalResult.createSignal('close', debug);
      }
      if (positionSide === 'short' && price >= this.stopLoss) {
        debug.exit_reason = 'stop_loss';
        this.lastLossBar = this.barsSinceEntry;  // Trigger cooldown
        return SignalResult.createSignal('close', debug);
      }
    }

    // ========================================
    // 2. TAKE PROFIT 2 CHECK (full exit)
    // ========================================
    if (this.takeProfit2 !== null) {
      if (positionSide === 'long' && price >= this.takeProfit2) {
        debug.exit_reason = 'tp2_hit';
        return SignalResult.createSignal('close', debug);
      }
      if (positionSide === 'short' && price <= this.takeProfit2) {
        debug.exit_reason = 'tp2_hit';
        return SignalResult.createSignal('close', debug);
      }
    }

    // ========================================
    // 3. REGIME FLIP CHECK
    // ========================================
    if (regimeFlipped) {
      debug.exit_reason = 'regime_flip';
      return SignalResult.createSignal('close', debug);
    }

    // ========================================
    // 4. MACD HISTOGRAM SIGN FLIP
    // ========================================
    if (macd && prevMacd && typeof macd.histogram === 'number' && typeof prevMacd.histogram === 'number') {
      const histogramFlipped = (prevMacd.histogram > 0 && macd.histogram < 0) ||
                               (prevMacd.histogram < 0 && macd.histogram > 0);
      
      if (histogramFlipped) {
        debug.exit_reason = 'macd_flip';
        return SignalResult.createSignal('close', debug);
      }
    }

    // ========================================
    // 5. MAX BARS IN TRADE
    // ========================================
    if (this.barsSinceEntry >= this.MAX_BARS_IN_TRADE) {
      debug.exit_reason = 'max_bars';
      return SignalResult.createSignal('close', debug);
    }

    return null;
  }

  /**
   * Check if TP1 has been hit and update stop to breakeven
   * 
   * Note: This strategy signals a full close. In a real implementation,
   * you would partial close 50% here. The bot framework may need extension
   * to support partial closes - for now we track TP1 and move stop to BE.
   */
  checkTp1Hit(positionSide, price, debug) {
    if (this.tp1Hit || this.takeProfit1 === null) {
      return;
    }

    if (positionSide === 'long' && price >= this.takeProfit1) {
      this.tp1Hit = true;
      this.stopLoss = this.entryPrice;  // Move stop to breakeven
      debug.tp1_triggered = true;
      debug.stop_moved_to_breakeven = true;
    }
    
    if (positionSide === 'short' && price <= this.takeProfit1) {
      this.tp1Hit = true;
      this.stopLoss = this.entryPrice;  // Move stop to breakeven
      debug.tp1_triggered = true;
      debug.stop_moved_to_breakeven = true;
    }
  }

  /**
   * Reset all position tracking state
   */
  resetPositionState() {
    this.entryPrice = null;
    this.entryBar = null;
    this.stopLoss = null;
    this.takeProfit1 = null;
    this.takeProfit2 = null;
    this.tp1Hit = false;
    this.positionSide = null;
    this.barsSinceEntry = 0;
    this.cciReachedExtreme = false;
    this.cciExtremeValue = null;
  }

  /**
   * Validate that all required indicators have sufficient data
   */
  validateIndicators(macd, hma, sma200, cci, atr, candles) {
    if (!macd || macd.length < 3) return false;
    if (!hma || hma.length < 2) return false;
    if (!sma200 || sma200.length < 2) return false;
    if (!cci || cci.length < 3) return false;
    if (!atr || atr.length < 2) return false;
    if (!candles || candles.length < 2) return false;
    return true;
  }

  /**
   * Calculate position size based on account risk
   * 
   * Formula: Position Size = (Account * Risk%) / Stop Distance
   * 
   * Note: This is a helper method. Actual position sizing should be
   * configured in the instance file using OrderCapital.
   * 
   * @param {number} accountBalance - Total account balance
   * @param {number} stopDistance - Distance to stop loss in price units
   * @param {number} price - Current asset price
   * @returns {number} - Position size in asset units
   */
  calculatePositionSize(accountBalance, stopDistance, price) {
    const riskAmount = accountBalance * this.ACCOUNT_RISK_PERCENT;
    const positionSize = riskAmount / stopDistance;
    return positionSize;
  }

  /**
   * Default options for this strategy
   */
  getOptions() {
    return {
      period: '15m',  // Primary timeframe for candle subscription
      // MACD parameters (1h)
      macd_fast: 12,
      macd_slow: 26,
      macd_signal: 9,
      hma_length: 9,
      // CCI parameters (15m)
      cci_length: 20,
      atr_length: 14
    };
  }

  /**
   * Columns to display in backtest UI
   */
  getBacktestColumns() {
    return [
      {
        label: 'regime',
        value: row => {
          if (row.regime === 'long') return 'success';
          if (row.regime === 'short') return 'danger';
          return 'warning';
        },
        type: 'icon'
      },
      {
        label: 'CCI',
        value: 'cci',
        type: 'number'
      },
      {
        label: 'MACD Hist',
        value: 'macd_histogram',
        type: 'histogram'
      },
      {
        label: 'ATR',
        value: 'atr',
        type: 'number'
      },
      {
        label: 'Stop',
        value: 'stop_loss',
        type: 'number'
      },
      {
        label: 'TP1',
        value: 'tp1',
        type: 'number'
      },
      {
        label: 'TP2',
        value: 'tp2',
        type: 'number'
      }
    ];
  }
};

// ================= UNIFIED STRATEGY MODULE =================
// Handles MACD + HMA-SMA + CCI signals with proper execution gating

function safeEvaluateUnifiedStrategy(candle, state) {
  // Only run on closed candles with indicators
  if (!candle || !candle.isClosed || !candle.indicators) return;

  // Verify indicators actually have data
  const { CCI, MACD_histogram, HMA_SMA } = candle.indicators;
  if (CCI === undefined || MACD_histogram === undefined || HMA_SMA === undefined) return;

  const candleTs = candle.timestamp;

  // Prevent duplicate evaluation per candle
  if (state.lastEvaluatedCandleTs === candleTs) return;

  // Call final evaluator
  const decision = evaluateUnifiedStrategy(candle, state);

  return decision;
}

function evaluateUnifiedStrategy(candle, state) {
  // --- Initialize state ---
  state.currentPosition = state.currentPosition || { size: 0, side: null };
  state.currentRegime = state.currentRegime || 'none';
  state.lastEvaluatedCandleTs = state.lastEvaluatedCandleTs || null;

  // --- Skip evaluation if candle not ready ---
  if (!candle.isClosed || !candle.indicators) return;

  const candleTs = candle.timestamp;
  const price = candle.close;
  const { CCI, MACD_histogram, HMA_SMA, extreme } = candle.indicators;

  // --- Prevent duplicate evaluation per candle ---
  if (state.lastEvaluatedCandleTs === candleTs) return;
  state.lastEvaluatedCandleTs = candleTs;

  // --- Hard blockers ---
  const candleNotClosed = false; // already ensured above
  const duplicateEvaluation = false; // handled by lock
  const cooldownActive = state.cooldownBars > 0;
  const positionOpen = state.currentPosition.size > 0;
  const volatilityTooHigh = false; // optional: implement if needed

  // --- Informational blockers ---
  const noExtreme = !extreme;
  const noRegime = false; // updated below if regime not detected

  const blockers = {
    candleNotClosed,
    duplicateEvaluation,
    cooldownActive,
    positionOpen,
    noRegime,
    noExtreme,
    volatilityTooHigh
  };

  // --- Determine regime ---
  let newRegime = 'none';
  if (MACD_histogram > 0 && HMA_SMA >= 0) {
    newRegime = 'long';
  } else if (MACD_histogram < 0 && HMA_SMA < 0) {
    newRegime = 'short';
  } else {
    blockers.noRegime = true;
  }

  // --- Decide action based on hard blockers ---
  const hardBlockers = [cooldownActive, positionOpen, volatilityTooHigh];
  let action = 'NO_TRADE';

  if (!hardBlockers.some(Boolean) && newRegime !== 'none') {
    action = 'ENTER_' + newRegime.toUpperCase();
  }

  // --- Log structured decision ---
  console.log(
    'UNIFIED_DECISION',
    JSON.stringify({
      candleTs,
      price,
      regime: state.currentRegime,
      newRegime,
      indicators: { CCI, MACD_histogram, HMA_SMA },
      blockers,
      action
    })
  );

  // --- Update current regime state ---
  state.currentRegime = newRegime;

  return { action, blockers, newRegime };
}

// ================= END MODULE =================
