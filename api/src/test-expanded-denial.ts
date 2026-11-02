import { hasRequestedAction } from './core/intelligence/requested-action';

const testCases = [
    'Build a dashboard. Do not execute anything.',
    'Create a calculator without executing anything.',
    'First review the files. Do not create a store.',
    'Please answer only: explain how to build a calculator; note the word "files".',
    'الرد فقط بدون تنفيذ. Explain the files for a dashboard.',
    'Explain the files first. Without building a dashboard, describe the layout.',
    'Build a calculator. Do not create a database.',
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