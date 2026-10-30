// Accessibility-only lint, run in CI (npm run lint:a11y). The general `npm run lint` still carries
// older style findings; this one is kept at zero so accessibility cannot regress.
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tsParser from '@typescript-eslint/parser'
import nextPlugin from '@next/eslint-plugin-next'

export default [
  {
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    // the @next plugin is registered only so existing eslint-disable comments for its rules are understood
    plugins: { 'jsx-a11y': jsxA11y, '@next/next': nextPlugin },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // <Switch> is a real control; <Field> wires its own label.
      'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['Switch'], depth: 4 }],
      // Moving focus to the one field of the step the user just chose (the PIN screens, "Edit" on a note) helps
      // more than it harms, so autoFocus is allowed deliberately.
      'jsx-a11y/no-autofocus': 'off',
      // Browser pop-ups can be blocked silently and cannot be announced properly: use <Alert> and useConfirm().
      'no-restricted-globals': ['error',
        { name: 'alert', message: 'Use <Alert> (components/ui/Alert) instead of alert().' },
        { name: 'confirm', message: 'Use useConfirm() (components/ui/ConfirmDialog) instead of confirm().' },
        { name: 'prompt', message: 'Use a form field instead of prompt().' },
      ],
    },
  },
]
