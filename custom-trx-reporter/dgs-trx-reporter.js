const fs = require('fs-extra');
const path = require('path');
const mkdirp = require('mkdirp')
const { reporters } = require('mocha');
const { TestRun } = require('node-trx');
const { v4: uuidv4 } = require('uuid');
const glob = require("glob")
const os = require('os');
const testToTrx = require('./dgs-trx-reporter-test-to-trx');

const computerName = os.hostname();
const userName = os.userInfo().username;

module.exports = DgsTrxReporter;

/**
 * Mocha Trx Reporter
 *
 * @api public
 * @param {Runner} runner
 */
function DgsTrxReporter(runner, options) {
	reporters.Base.call(this, runner, options);

	const self = this;
	const tests = new Set();
	const cwd = process.cwd();
	let failedHook = null;

	runner.on('test', (test) => {
		test.start = new Date();
	});

	runner.on('test end', (test) => {
		test.end = new Date();
		tests.add(test);
	});

	runner.on('fail', (failed) => {
		if (failed.type === 'hook') {
			failedHook = failed;
		}
	});

	runner.on('suite end', (suite) => {
		if (failedHook && failedHook.parent === suite) {
			// Handle tests that couldn't be run due to a failed hook
			suite.eachTest((test) => {
				if (test.isPending() || !test.state) {
					test.err = {
						message: `Not executed due to ${failedHook.title} on "${failedHook.parent.fullTitle()}"`,
						stack: failedHook.err.stack,
					};

					if (!test.state) {
						test.state = 'failed';
					}

					tests.add(test);
				}
			});

			failedHook = null;
		}
	});

	runner.on('end', () => {
		const testResults = {
			stats: self.stats,
			tests: [...tests.values()],
		};

		runner.testResults = testResults;

		const now = (new Date()).toISOString();
		const testRunName = `${userName}@${computerName} ${now.substring(0, now.indexOf('.')).replace('T', ' ')}`;

		const executionId = uuidv4();
		const inputscreenshotpath = path.join(cwd, options.reporterOptions.inputscreenshotpath);
		const outputscreenshotfolder = options.reporterOptions.outputscreenshotfolder;
		const targetscreenshotpath = path.join(cwd, options.reporterOptions.outputpath, outputscreenshotfolder, "In", executionId);
		const targetreportfilename = path.join(cwd, options.reporterOptions.outputpath, executionId + ".trx");

		process.stdout.write(`DEBUG -> End called - executionId: "${executionId}", inputscreenshotpath: "${inputscreenshotpath}, outputscreenshotfolder: ${outputscreenshotfolder}, targetscreenshotpath: ${targetscreenshotpath}\r\n`);

		process.stdout.write(`DEBUG -> Creating directory for screenshots "${targetscreenshotpath}"\r\n`);

		try {
			mkdirp.sync(targetscreenshotpath);
		} catch (err) {
			process.stdout.write(`DEBUG -> Error creating directory for screenshots "${targetscreenshotpath}", Err: ${err}\r\n`);
		}

		const run = new TestRun({
			name: testRunName,
			runUser: userName,
			settings: {
				name: 'default',
			},
			times: {
				creation: now,
				queuing: now,
				start: testResults.stats.start.toISOString(),
				finish: testResults.stats.end.toISOString(),
			},
			deployment: {
				runDeploymentRoot: outputscreenshotfolder,
			},
		});

		const reporterOptions = options.reporterOptions || {};
		let excludedPendingCount = 0;

		// Search for a screenshots
		let searchPath = inputscreenshotpath.replace(/\\/g, '/') + "**/*.png"

		glob(searchPath, function (err, files) {

			if (err) {
				process.stdout.write(`DEBUG -> Glob search failed "${JSON.stringify(err)}"\r\n`);

				return;
			}

			process.stdout.write(`DEBUG -> Files found "${JSON.stringify(files)}"\r\n`);

			testResults.tests.forEach((test) => {
				if (test.isPending() && reporterOptions.excludePending === true) {
					excludedPendingCount += 1;
					return;
				}

				if (test.isFailed()) {
					// Search for a screenshots
					process.stdout.write(`DEBUG -> Found failing test "${test.title}"\r\n`);

					var filenameEndsWith = test.title + " (failed).png";
					var screenshotFilename = path.normalize(files.find(filename => filename.endsWith(filenameEndsWith)));

					if (screenshotFilename) {
						process.stdout.write(`DEBUG -> Found screenshot "${screenshotFilename}"\r\n`);

						var screenshotBasename = path.basename(screenshotFilename);

						var targetScreenshotFilename = path.join(targetscreenshotpath, screenshotBasename);

						test.screenshot = screenshotBasename;

						process.stdout.write(`DEBUG -> Copying screenshot from "${screenshotFilename}" to "${targetScreenshotFilename}"\r\n`);
						try {
							fs.copyFileSync(screenshotFilename, targetScreenshotFilename);
						} catch (err) {
							process.stdout.write(`DEBUG -> Error copying screenshot from "${screenshotFilename}" to "${targetScreenshotFilename}", Err: "${err}"\r\n`);
						}
					} else {
						process.stdout.write(`DEBUG -> No screenshot found ending with "${filenameEndsWith}"\r\n`);
					}
				}

				run.addResult(testToTrx(test, computerName, cwd, reporterOptions, executionId));
			});

			if (reporterOptions.warnExcludedPending === true && excludedPendingCount > 0) {
				// eslint-disable-next-line no-console
				console.warn(
					`##[warning]${excludedPendingCount === 1
						? 'Excluded 1 test because it is marked as Pending.'
						: `Excluded ${excludedPendingCount} tests because they are marked as Pending.`}`
				);
			}

			process.stdout.write(`DEBUG -> Writing test report to "${targetreportfilename}"\r\n`);

			fs.outputFile(targetreportfilename, run.toXml(), function (err) {
				if (err) {
					process.stdout.write(`DEBUG -> Error writing report "${JSON.stringify(err)}"\r\n`);
				}
			});
		})
	});
}
