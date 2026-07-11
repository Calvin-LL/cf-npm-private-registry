export default {
  plugins: ["prettier-plugin-astro", "@ianvs/prettier-plugin-sort-imports"],
  importOrder: ["<BUILTIN_MODULES>", "<THIRD_PARTY_MODULES>", "@/*", "^[.]"],
};
