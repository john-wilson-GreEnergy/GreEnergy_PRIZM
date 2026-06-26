export const SITE_HEALTH_THRESHOLDS = {
  voltageVdc: {
    lowAlarmMax: 1099,
    lowWarningMin: 1100,
    lowWarningMax: 1250,
    idealMin: 1251,
    idealMax: 1399,
    highWarningMin: 1400,
    highWarningMax: 1449,
    highAlarmMin: 1450
  },
  temperatureC: {
    lowAlarmMax: 10,
    lowWarningMin: 10,
    lowWarningMax: 20,
    idealMin: 20,
    idealMax: 40,
    highWarningMin: 40,
    highWarningMax: 50,
    highAlarmMin: 50
  }
};
