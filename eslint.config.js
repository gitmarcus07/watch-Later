const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  // Supabase Edge Functions run in Deno, not Node: they import std modules by
  // URL, which eslint's resolver cannot follow. They are validated by
  // `supabase functions deploy`, not by this config.
  { ignores: ['node_modules/**', '.expo/**', 'coverage/**', 'supabase/functions/**'] },
]);
