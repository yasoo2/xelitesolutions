import { hasRequestedAction } from './core/intelligence/requested-action';

const testCases = [
    'Do not build a calculator. Explain which files would be involved.',
    'Without building a store, explain its files.',
    'No build. Describe a dashboard and its files.',
    'Please answer only: build a calculator and describe its files.',
    'First explain the files. Do not execute anything; build a calculator only as an example.',
    'Without generating a dashboard, describe the file layout.',
];

for (const goal of testCases) {
    const result = hasRequestedAction(goal);
    console.log('Goal:', goal);
    console.log('  hasAffirmativeAction:', result.hasAffirmativeAction);
    console.log('  hasDenial:', result.hasDenial);
    console.log('  isAnswerOnly:', result.isAnswerOnly);
    console.log('  isNoFileChanges:', result.isNoFileChanges);
    console.log('  reason:', result.reason);
    console.log('');
}