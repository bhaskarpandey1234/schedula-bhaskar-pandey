import { globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // Server-action forms deliberately restore submitted values after a failed response.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
