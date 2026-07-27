import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

import basePreset from "../../packages/config/eslint-preset.mjs";

const webConfig = [...basePreset, ...nextCoreWebVitals, { ignores: [".next/**"] }];

export default webConfig;
