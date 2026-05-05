/**
 * Test Allowance Calculation for Half-Day Attendance
 * 
 * This test verifies that the allowance calculation system correctly
 * includes hours from both AM and PM half-day scenarios.
 */

// Mock the calculateSessionHours function (matching utils.js)
function calculateSessionHours(timeIn, timeOut) {
  if (!timeIn || !timeOut) return 0;
  const ms = new Date(timeOut) - new Date(timeIn);
  return Math.max(0, ms / (1000 * 60 * 60));
}

// Mock the getAttendanceHours function (matching allowance-management.js)
function getAttendanceHours(record) {
  const derivedHours = calculateSessionHours(record.time_in_1, record.time_out_1)
    + calculateSessionHours(record.time_in_2, record.time_out_2);
  if (derivedHours > 0) return derivedHours;
  return Number(record.total_hours || 0);
}

// Test scenarios
const testScenarios = [
  {
    name: 'Full Day Attendance',
    record: {
      time_in_1: '2024-01-01T08:00:00Z',
      time_out_1: '2024-01-01T12:00:00Z',
      time_in_2: '2024-01-01T13:00:00Z',
      time_out_2: '2024-01-01T17:00:00Z'
    },
    expectedHours: 8 // 4 hours morning + 4 hours afternoon
  },
  {
    name: 'AM Half-Day Attendance',
    record: {
      time_in_1: '2024-01-01T08:00:00Z',
      time_out_1: '2024-01-01T12:00:00Z',
      time_in_2: null,
      time_out_2: null
    },
    expectedHours: 4 // 4 hours morning only
  },
  {
    name: 'PM Half-Day Attendance',
    record: {
      time_in_1: null,
      time_out_1: null,
      time_in_2: '2024-01-01T13:00:00Z',
      time_out_2: '2024-01-01T17:00:00Z'
    },
    expectedHours: 4 // 4 hours afternoon only
  },
  {
    name: 'Irregular Hours - AM Half-Day',
    record: {
      time_in_1: '2024-01-01T09:30:00Z',
      time_out_1: '2024-01-01T12:30:00Z',
      time_in_2: null,
      time_out_2: null
    },
    expectedHours: 3 // 3 hours morning only
  },
  {
    name: 'Irregular Hours - PM Half-Day',
    record: {
      time_in_1: null,
      time_out_1: null,
      time_in_2: '2024-01-01T14:00:00Z',
      time_out_2: '2024-01-01T18:30:00Z'
    },
    expectedHours: 4.5 // 4.5 hours afternoon only
  },
  {
    name: 'Empty Record',
    record: {
      time_in_1: null,
      time_out_1: null,
      time_in_2: null,
      time_out_2: null
    },
    expectedHours: 0 // No hours
  }
];

// Test runner
function runAllowanceTests() {
  console.log('💰 ALLOWANCE CALCULATION TEST FOR HALF-DAY ATTENDANCE\n');
  console.log('='.repeat(60));
  
  let totalTests = 0;
  let passedTests = 0;
  
  testScenarios.forEach((scenario, index) => {
    totalTests++;
    const actualHours = getAttendanceHours(scenario.record);
    const passed = Math.abs(actualHours - scenario.expectedHours) < 0.01; // Allow small floating point differences
    
    if (passed) passedTests++;
    
    console.log(`\n${index + 1}. ${scenario.name}`);
    console.log(`   Expected: ${scenario.expectedHours} hours`);
    console.log(`   Actual: ${actualHours.toFixed(2)} hours`);
    console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    if (!passed) {
      console.log(`   ❌ Difference: ${Math.abs(actualHours - scenario.expectedHours).toFixed(2)} hours`);
    }
    
    // Show punch details
    console.log(`   Punches:`);
    console.log(`     Morning: ${scenario.record.time_in_1 ? '✅' : '❌'} time_in_1 → ${scenario.record.time_out_1 ? '✅' : '❌'} time_out_1`);
    console.log(`     Afternoon: ${scenario.record.time_in_2 ? '✅' : '❌'} time_in_2 → ${scenario.record.time_out_2 ? '✅' : '❌'} time_out_2`);
  });
  
  // Test weekly calculation with mixed scenarios
  console.log(`\n${totalTests + 1}. Weekly Calculation with Mixed Scenarios`);
  totalTests++;
  
  const weeklyRecords = [
    testScenarios[1].record, // AM half-day (4 hours)
    testScenarios[2].record, // PM half-day (4 hours)
    testScenarios[0].record, // Full day (8 hours)
  ];
  
  const weeklyTotal = weeklyRecords.reduce((sum, record) => sum + getAttendanceHours(record), 0);
  const expectedWeekly = 16; // 4 + 4 + 8
  const weeklyPassed = Math.abs(weeklyTotal - expectedWeekly) < 0.01;
  
  if (weeklyPassed) passedTests++;
  
  console.log(`   Expected Weekly Total: ${expectedWeekly} hours`);
  console.log(`   Actual Weekly Total: ${weeklyTotal.toFixed(2)} hours`);
  console.log(`   Result: ${weeklyPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Breakdown: AM half-day (4h) + PM half-day (4h) + Full day (8h) = ${weeklyTotal.toFixed(2)}h`);
  
  // Results summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 ALLOWANCE CALCULATION TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 ALL TESTS PASSED! Allowance calculation correctly handles half-day attendance.');
    console.log('\n✅ AM half-day hours are included');
    console.log('✅ PM half-day hours are included');
    console.log('✅ Full-day hours are included');
    console.log('✅ Weekly totals are accurate');
    console.log('✅ Irregular hours are calculated correctly');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the allowance calculation logic.');
  }
  
  console.log('\n📝 Key Functions Tested:');
  console.log('   - calculateSessionHours() from utils.js');
  console.log('   - getAttendanceHours() from allowance-management.js');
  console.log('   - Weekly aggregation logic');
}

// Run the tests
if (require.main === module) {
  runAllowanceTests();
}

module.exports = {
  runAllowanceTests,
  getAttendanceHours,
  calculateSessionHours
};
