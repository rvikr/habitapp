import expoConfig from "eslint-config-expo/flat.js";
import prettierConfig from "eslint-config-prettier";

export default [
  ...expoConfig,
  prettierConfig,
  {
    ignores: [
      "node_modules/**",
      ".worktrees/**",
      "dist/**",
      ".expo/**",
      ".next/**",
      "build/**",
      "out/**",
      "website/**",
      "supabase/functions/**",
      "scripts/**",
      "plugins/**",
      "public/**",
      "assets/**",
    ],
  },
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "warn",
      "import/no-unresolved": "off",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
