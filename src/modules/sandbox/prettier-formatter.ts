export type PrettierTargetLanguage = "html" | "css" | "javascript";

export async function formatCodeWithPrettier(
  code: string,
  language: PrettierTargetLanguage,
): Promise<string> {
  const prettierModule = await import("prettier/standalone");
  const prettier = prettierModule.default ?? prettierModule;

  if (language === "html") {
    const [htmlPluginModule, postcssPluginModule, babelPluginModule, estreePluginModule] =
      await Promise.all([
        import("prettier/plugins/html"),
        import("prettier/plugins/postcss"),
        import("prettier/plugins/babel"),
        import("prettier/plugins/estree"),
      ]);

    return prettier.format(code, {
      parser: "html",
      plugins: [
        htmlPluginModule.default ?? htmlPluginModule,
        postcssPluginModule.default ?? postcssPluginModule,
        babelPluginModule.default ?? babelPluginModule,
        estreePluginModule.default ?? estreePluginModule,
      ],
      tabWidth: 2,
      printWidth: 90,
      singleQuote: false,
    });
  }

  if (language === "css") {
    const postcssPluginModule = await import("prettier/plugins/postcss");
    return prettier.format(code, {
      parser: "css",
      plugins: [postcssPluginModule.default ?? postcssPluginModule],
      tabWidth: 2,
      printWidth: 90,
    });
  }

  const [babelPluginModule, estreePluginModule] = await Promise.all([
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
  ]);

  return prettier.format(code, {
    parser: "babel",
    plugins: [
      babelPluginModule.default ?? babelPluginModule,
      estreePluginModule.default ?? estreePluginModule,
    ],
    tabWidth: 2,
    printWidth: 90,
    semi: true,
    singleQuote: false,
  });
}
