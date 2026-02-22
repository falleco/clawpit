module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
      ],
    ],
  },
  ignores: [
    (message) => message.startsWith('Merge '),
    (message) => message.startsWith('Revert "'),
    (message) => /^(fixup|squash)!/.test(message),
  ],
};
