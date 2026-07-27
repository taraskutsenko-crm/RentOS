import basePreset from "../../packages/config/eslint-preset.mjs";

const apiConfig = [
  ...basePreset,
  {
    rules: {
      // NestJS's constructor-parameter dependency injection relies on
      // emitDecoratorMetadata, which requires these classes to remain
      // *value* imports even though they're only referenced in type
      // position syntactically — consistent-type-imports can't tell the
      // difference and would break DI at runtime if auto-fixed.
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];

export default apiConfig;
