/**
 * DCA Scheduler
 * Manages weekly execution schedule using cron
 */

const cron = require('node-cron');
const DcaLogger = require('./logger');

class DcaScheduler {
  constructor(dcaStrategy, config = {}) {
    this.dcaStrategy = dcaStrategy;
    this.schedule = config.schedule || process.env.DCA_SCHEDULE || '0 9 * * 1'; // Default: Monday 9 AM
    this.logger = new DcaLogger(config);
    this.task = null;
    this.isRunning = false;
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.isRunning) {
      this.logger.warn('Scheduler is already running');
      return;
    }

    // Validate cron expression
    if (!cron.validate(this.schedule)) {
      throw new Error(`Invalid cron schedule: ${this.schedule}`);
    }

    this.logger.info('Starting DCA scheduler', {
      schedule: this.schedule,
      description: this.getScheduleDescription()
    });

    this.task = cron.schedule(this.schedule, async () => {
      await this.executeScheduledDca();
    });

    this.isRunning = true;
    this.logger.info('DCA scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.isRunning) {
      this.logger.warn('Scheduler is not running');
      return;
    }

    if (this.task) {
      this.task.stop();
      this.task = null;
    }

    this.isRunning = false;
    this.logger.info('DCA scheduler stopped');
  }

  /**
   * Execute scheduled DCA
   */
  async executeScheduledDca() {
    this.logger.info('Scheduled DCA execution triggered');

    try {
      const result = await this.dcaStrategy.execute();
      this.logger.info('Scheduled DCA execution completed successfully', {
        tradesExecuted: result.summary.tradesExecuted,
        totalExecuted: result.summary.totalExecuted
      });
    } catch (error) {
      this.logger.error('Scheduled DCA execution failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Execute DCA immediately (manual trigger)
   */
  async executeNow() {
    this.logger.info('Manual DCA execution triggered');
    return await this.dcaStrategy.execute();
  }

  /**
   * Get human-readable schedule description
   */
  getScheduleDescription() {
    const scheduleDescriptions = {
      '0 9 * * 1': 'Every Monday at 9:00 AM',
      '0 0 * * 0': 'Every Sunday at midnight',
      '0 12 * * 3': 'Every Wednesday at noon',
      '0 9 * * 5': 'Every Friday at 9:00 AM'
    };

    return scheduleDescriptions[this.schedule] || this.schedule;
  }

  /**
   * Get next execution time
   */
  getNextExecution() {
    if (!this.isRunning || !this.task) {
      return null;
    }

    // node-cron doesn't provide direct access to next execution
    // This is a simplified version
    return 'See schedule: ' + this.getScheduleDescription();
  }
}

module.exports = DcaScheduler;
