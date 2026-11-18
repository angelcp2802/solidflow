'use strict';
if (process.platform !== 'win32') throw new Error('The embedded-part native close workflow requires Windows.');
require('./desktop-pattern-ui.cjs').runScenario('assembly-embedded-part-transitions');
