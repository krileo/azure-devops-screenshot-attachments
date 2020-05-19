const { UnitTest } = require('node-trx');
const path = require('path');

module.exports = testToTrx;

/**
 * Transform mocha test to trx obj
 *
 * @param test
 * @param computerName
 * @param options The reporter options.
 * @returns {Object}
 */
function testToTrx(test, computerName, cwd, options, executionId) {
	const safeCwd = cwd || '';
	return {
		test: new UnitTest({
			name: test.fullTitle(),
			methodCodeBase: test.file ? path.relative(safeCwd, test.file) : 'none',
			methodName: 'none',
			methodClassName: 'none',
		}),
		computerName,
		outcome: formatOutcome(test, options),
		duration: formatDuration(test.duration || 0),
		startTime: test.start ? test.start.toISOString() : '', // '2010-11-16T08:48:29.9072393-08:00',
		endTime: test.end ? test.end.toISOString() : '', // '2010-11-16T08:49:16.9694381-08:00'
		errorMessage: test.err ? test.err.message : '',
		errorStacktrace: test.err ? test.err.stack : '',
		executionId,
		resultFiles: test.screenshot ? [{
			path: "" + test.screenshot,
		}] : [],
	};
}

/**
 * Transform mocha test duration to trx format
 *
 * input     | output
 * ---------------------
 * 2         | '00:00:0.002'
 *
 * @param milliseconds
 * @returns {string}
 */
function formatDuration(milliseconds) {
	// we get duration ISO string
	const duration = (new Date(milliseconds)).toISOString();
	// we return time part only and remove Z char
	return duration.substring(duration.indexOf('T') + 1).replace('Z', '');
}

/**
 * Transform mocha test result to trx outcome.
 *
 * Tests may have timed out, resulting in outcome 'Timeout'.
 * Tests may be pending as indicated by the test itself or their parent suite, resulting in outcome 'Pending'.
 * Unless, when the option `treatPendingAsNotExecuted` is true, the outcome is 'NotExecuted' instead of 'Pending'.
 * When not pending, the Mocha test state is converted as follows:
 *
 * State     | TRX outcome
 * --------------------------
 * 'passed'  | 'Passed'
 * 'failed'  | 'Failed'
 * undefined | 'Inconclusive'
 *
 * @param test
 * @param options Reporter options, including treatPendingAsNotExecuted.
 * @returns {string}
 */
function formatOutcome(test, opts) {
	const options = opts || {};
	if (test.timedOut === true) {
		return 'Timeout';
	}
	if (test.pending === true) {
		if (test.err) {
			return 'Failed';
		}

		return options.treatPendingAsNotExecuted === true ? 'NotExecuted' : 'Pending';
	}
	switch (test.state) {
		case 'passed':
		case 'failed':
			return test.state.charAt(0).toUpperCase() + test.state.slice(1);
		default:
			return 'Inconclusive';
	}
}
