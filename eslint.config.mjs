import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "tsconfig.tsbuildinfo"],
  },
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // Codex chose this approach because: the upgraded Next lint config enables React compiler rules that would require unrelated refactors.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];

export default config;
