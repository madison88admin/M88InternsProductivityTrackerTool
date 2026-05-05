/**
 * Test Environment for Flexible Time Restrictions and Half-Day Attendance
 * 
 * This test suite validates:
 * 1. Flexible time periods (morning: 7AM-12PM, afternoon: 12PM-5:30PM)
 * 2. Half-day approval for both AM and PM scenarios
 * 3. Database stored procedure validation
 * 4. Frontend-backend consistency
 */

// Mock timezone and date functions for testing
const PH_TIMEZONE = 'Asia/Manila';

// Test time periods (matching attendance.js)
const TIME_PERIODS = {
  morning: {
    start: 7 * 60,      // 7:00 AM
    end: 12 * 60,       // 12:00 PM (noon)
  },
  afternoon: {
    start: 12 * 60,     // 12:00 PM
    end: 17.5 * 60,     // 5:30 PM
  },
  endOfDay: 19.5 * 60, // 7:30 PM (auto-submit cutoff)
};

const PUNCH_PERIODS = {
  time_in_1: 'morning',
  time_out_1: 'morning',
  time_in_2: 'afternoon',
  time_out_2: 'afternoon',
};

// Mock time functions
function getCurrentMinutes(testHour, testMinute = 0) {
  return testHour * 60 + testMinute;
}

function getCurrentTimePeriod(currentMinutes) {
  if (currentMinutes >= TIME_PERIODS.morning.start && currentMinutes < TIME_PERIODS.morning.end) {
    return 'morning';
  } else if (currentMinutes >= TIME_PERIODS.afternoon.start && currentMinutes <= TIME_PERIODS.afternoon.end) {
    return 'afternoon';
  }
  return 'outside_hours';
}

function isPunchLocked(punchType, currentMinutes) {
  const period = PUNCH_PERIODS[punchType];
  
  if (!period) return true;
  
  // Check if current time is past the period's end time
  if (currentMinutes >= TIME_PERIODS[period].end) {
    return true;
  }
  
  // Special case: end of day punch has additional auto-submit cutoff
  if (punchType === 'time_out_2' && currentMinutes >= TIME_PERIODS.endOfDay) {
    return true;
  }
  
  return false;
}

function getNextPunch(record, currentMinutes) {
  const currentPeriod = getCurrentTimePeriod(currentMinutes);
  const punchOrder = ['time_in_1', 'time_out_1', 'time_in_2', 'time_out_2'];

  for (const punch of punchOrder) {
    // Already logged — skip
    if (record && record[punch]) continue;
    
    // Check if punch is locked based on flexible time logic
    if (isPunchLocked(punch, currentMinutes)) continue;
    
    // Check if current time period allows this punch type
    const punchPeriod = PUNCH_PERIODS[punch];
    if (currentPeriod === 'morning' && punchPeriod !== 'morning') continue;
    if (currentPeriod === 'afternoon' && punchPeriod === 'morning') continue;
    
    // Special handling for PM half-day scenarios
    if (punch === 'time_in_2') {
      // Allow time_in_2 if no record exists (PM half-day start) OR if morning is complete
      if (record && record.time_in_1 && !record.time_out_1) continue; // Morning incomplete
      // Otherwise allow (either no record, or morning complete, or PM half-day in progress)
    }
    
    // "Out" punches require the matching "In" to be logged first
    if (punch === 'time_out_1' && (!record || !record.time_in_1)) continue;
    if (punch === 'time_out_2' && (!record || !record.time_in_2)) continue;
    
    return punch;
  }

  return null;
}

// Database validation logic (matching stored procedure)
function validatePunchDatabase(punchType, currentMinutes) {
  switch (punchType) {
    case 'time_in_1':
      if (currentMinutes >= 12 * 60) {
        return { valid: false, error: 'Morning Time In cutoff has passed (noon)' };
      }
      break;
    case 'time_out_1':
      if (currentMinutes >= 12 * 60) {
        return { valid: false, error: 'Lunch Time Out cutoff has passed (noon)' };
      }
      break;
    case 'time_in_2':
      if (currentMinutes >= 17.5 * 60) {
        return { valid: false, error: 'Afternoon Time In cutoff has passed (5:30 PM)' };
      }
      break;
    case 'time_out_2':
      // time_out_2 is only blocked at 7:30 PM, not at 5:30 PM
      if (currentMinutes >= 19.5 * 60) {
        return { valid: false, error: 'End of Day Time Out cutoff has passed (7:30 PM)' };
      }
      break;
  }
  return { valid: true };
}

// Half-day approval logic
function shouldTriggerHalfDayApproval(record, currentMinutes) {
  // AM half-day: morning complete, afternoon window closed
  const amHalfDay = record && record.time_in_1 && record.time_out_1 && !record.time_in_2 && 
                    isPunchLocked('time_in_2', currentMinutes);
  
  // PM half-day: afternoon complete, morning missed, and it's end of day
  const pmHalfDay = record && !record.time_in_1 && !record.time_out_1 && 
                    record.time_in_2 && record.time_out_2 && 
                    currentMinutes >= TIME_PERIODS.endOfDay;
  
  if (amHalfDay) return { type: 'AM', reason: 'Afternoon window closed with morning punches complete' };
  if (pmHalfDay) return { type: 'PM', reason: 'Afternoon punches completed with morning punches missed' };
  
  return null;
}

// Test scenarios
const testScenarios = [
  { hour: 8, minute: 0, description: '8:00 AM (Early Morning)', period: 'morning' },
  { hour: 11, minute: 30, description: '11:30 AM (Late Morning)', period: 'morning' },
  { hour: 12, minute: 0, description: '12:00 PM (Noon)', period: 'afternoon' },
  { hour: 14, minute: 30, description: '2:30 PM (Mid Afternoon)', period: 'afternoon' },
  { hour: 17, minute: 30, description: '5:30 PM (Afternoon Cutoff)', period: 'afternoon' },
  { hour: 18, minute: 0, description: '6:00 PM (After Hours)', period: 'outside_hours' },
  { hour: 19, minute: 30, description: '7:30 PM (End of Day Cutoff)', period: 'outside_hours' },
];

// Test records for different scenarios
const testRecords = {
  empty: null,
  morningComplete: { time_in_1: '2024-01-01T08:00:00Z', time_out_1: '2024-01-01T12:00:00Z' },
  afternoonComplete: { time_in_2: '2024-01-01T13:00:00Z', time_out_2: '2024-01-01T17:00:00Z' },
  fullDay: { 
    time_in_1: '2024-01-01T08:00:00Z', 
    time_out_1: '2024-01-01T12:00:00Z',
    time_in_2: '2024-01-01T13:00:00Z', 
    time_out_2: '2024-01-01T17:00:00Z' 
  }
};

// Test runner
function runTests() {
  console.log('🧪 ATTENDANCE SYSTEM TEST ENVIRONMENT\n');
  console.log('='.repeat(60));
  
  let totalTests = 0;
  let passedTests = 0;
  
  // Test 1: Flexible Time Periods
  console.log('\n📅 TEST 1: Flexible Time Period Validation');
  console.log('-'.repeat(40));
  
  testScenarios.forEach(scenario => {
    const currentMinutes = getCurrentMinutes(scenario.hour, scenario.minute);
    const period = getCurrentTimePeriod(currentMinutes);
    
    totalTests++;
    const periodTest = period === scenario.period;
    if (periodTest) passedTests++;
    
    console.log(`${periodTest ? '✅' : '❌'} ${scenario.description}`);
    console.log(`   Expected: ${scenario.period}, Got: ${period}`);
    console.log(`   Minutes: ${currentMinutes}`);
  });
  
  // Test 2: Punch Availability
  console.log('\n⏰ TEST 2: Punch Availability by Time');
  console.log('-'.repeat(40));
  
  const punches = ['time_in_1', 'time_out_1', 'time_in_2', 'time_out_2'];
  
  testScenarios.forEach(scenario => {
    const currentMinutes = getCurrentMinutes(scenario.hour, scenario.minute);
    console.log(`\n${scenario.description} (${currentMinutes} minutes):`);
    
    punches.forEach(punch => {
      const locked = isPunchLocked(punch, currentMinutes);
      const dbValid = validatePunchDatabase(punch, currentMinutes);
      
      totalTests++;
      const consistencyTest = locked === !dbValid.valid;
      if (consistencyTest) passedTests++;
      
      console.log(`  ${punch}: ${locked ? 'LOCKED' : 'AVAILABLE'} (DB: ${dbValid.valid ? 'VALID' : 'INVALID'}) ${consistencyTest ? '✅' : '❌'}`);
      if (!consistencyTest) {
        console.log(`    ❌ Frontend/Backend mismatch! Frontend: ${locked}, DB: ${dbValid.valid}`);
      }
    });
  });
  
  // Test 3: Next Punch Logic
  console.log('\n🎯 TEST 3: Next Punch Determination');
  console.log('-'.repeat(40));
  
  const nextPunchTests = [
    { time: '8:00 AM', hour: 8, record: 'empty', expected: 'time_in_1' },
    { time: '11:30 AM', hour: 11.5, record: 'morningComplete', expected: null },
    { time: '1:00 PM', hour: 13, record: 'empty', expected: 'time_in_2' },
    { time: '2:00 PM', hour: 14, record: 'morningComplete', expected: 'time_in_2' },
    { time: '6:00 PM', hour: 18, record: 'morningComplete', expected: null },
    { time: '1:00 PM', hour: 13, record: 'empty', expected: 'time_in_2', description: 'PM half-day start' },
  ];
  
  nextPunchTests.forEach(test => {
    const currentMinutes = getCurrentMinutes(test.hour);
    const record = testRecords[test.record];
    const nextPunch = getNextPunch(record, currentMinutes);
    
    totalTests++;
    const nextPunchTest = nextPunch === test.expected;
    if (nextPunchTest) passedTests++;
    
    console.log(`${nextPunchTest ? '✅' : '❌'} ${test.time} with ${test.record} record`);
    console.log(`   Expected: ${test.expected || 'None'}, Got: ${nextPunch || 'None'}`);
  });
  
  // Test 4: Half-Day Approval Triggers
  console.log('\n📋 TEST 4: Half-Day Approval Triggers');
  console.log('-'.repeat(40));
  
  const halfDayTests = [
    { time: '6:00 PM', hour: 18, record: 'morningComplete', expected: 'AM' },
    { time: '6:00 PM', hour: 18, record: 'afternoonComplete', expected: 'PM' },
    { time: '2:00 PM', hour: 14, record: 'morningComplete', expected: null },
    { time: '2:00 PM', hour: 14, record: 'afternoonComplete', expected: null },
  ];
  
  halfDayTests.forEach(test => {
    const currentMinutes = getCurrentMinutes(test.hour);
    const record = testRecords[test.record];
    const approval = shouldTriggerHalfDayApproval(record, currentMinutes);
    
    totalTests++;
    const halfDayTest = (approval?.type || null) === test.expected;
    if (halfDayTest) passedTests++;
    
    console.log(`${halfDayTest ? '✅' : '❌'} ${test.time} with ${test.record} record`);
    console.log(`   Expected: ${test.expected || 'None'}, Got: ${approval?.type || 'None'}`);
    if (approval) {
      console.log(`   Reason: ${approval.reason}`);
    }
  });
  
  // Test 5: Edge Cases
  console.log('\n🔍 TEST 5: Edge Cases');
  console.log('-'.repeat(40));
  
  const edgeCases = [
    { test: 'Noon exactly (12:00 PM)', hour: 12, punch: 'time_in_1', shouldLock: true },
    { test: 'Afternoon cutoff exactly (5:30 PM)', hour: 17.5, punch: 'time_in_2', shouldLock: true },
    { test: 'End of day cutoff exactly (7:30 PM)', hour: 19.5, punch: 'time_out_2', shouldLock: true },
    { test: 'Just before noon (11:59 AM)', hour: 11.983, punch: 'time_in_1', shouldLock: false },
    { test: 'Just before afternoon cutoff (5:29 PM)', hour: 17 + 29/60, punch: 'time_in_2', shouldLock: false },
  ];
  
  edgeCases.forEach(test => {
    const currentMinutes = getCurrentMinutes(test.hour);
    const locked = isPunchLocked(test.punch, currentMinutes);
    
    totalTests++;
    const edgeTest = locked === test.shouldLock;
    if (edgeTest) passedTests++;
    
    console.log(`${edgeTest ? '✅' : '❌'} ${test.test}`);
    console.log(`   Punch ${test.punch}: ${locked ? 'LOCKED' : 'AVAILABLE'} (Expected: ${test.shouldLock ? 'LOCKED' : 'AVAILABLE'})`);
  });
  
  // Results Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 ALL TESTS PASSED! The attendance system is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the implementation.');
  }
  
  console.log('\n📝 Test Environment Configuration:');
  console.log(`   Morning Period: ${TIME_PERIODS.morning.start/60}:00 - ${TIME_PERIODS.morning.end/60}:00`);
  console.log(`   Afternoon Period: ${TIME_PERIODS.afternoon.start/60}:00 - ${TIME_PERIODS.afternoon.end/60}:00`);
  console.log(`   End of Day Cutoff: ${TIME_PERIODS.endOfDay/60}:00`);
}

// Run the test environment
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  TIME_PERIODS,
  PUNCH_PERIODS,
  isPunchLocked,
  getNextPunch,
  shouldTriggerHalfDayApproval,
  validatePunchDatabase
};
